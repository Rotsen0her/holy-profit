// Convierte las respuestas del API en estadísticas por item y mercado, y elige precios
// resistentes a outliers: el precio actual solo se usa si está cerca del promedio histórico.
import type { CurrentPrice, HistoryEntry } from './api';
import { BLACK_MARKET, MARKETS, type Market } from './data';
import { SETUP_FEE, salesTax, type Settings } from './settings';

export interface MarketStat {
  vwap: number | null; // promedio ponderado por volumen del historial
  vol: number; // unidades vendidas por día (promedio)
  sellMin: number | null; // orden de venta más barata (si es reciente)
  buyMax: number | null; // orden de compra más alta (si es reciente)
  sellAge: number | null; // horas
  buyAge: number | null;
}

// Indicador de cómo se obtuvo el precio usado en el cálculo
export type PriceFlag = 'ok' | 'outlier' | 'hist' | 'nohist';

export interface Picked {
  price: number;
  flag: PriceFlag;
  current: number | null;
}

export type Book = Map<string, Partial<Record<Market, MarketStat>>>;

export const bookKey = (id: string, quality: number) => `${id}|${quality}`;

const hoursSince = (iso: string) => (Date.now() - Date.parse(iso.endsWith('Z') ? iso : iso + 'Z')) / 3_600_000;
const validDate = (iso: string) => !iso.startsWith('0001');

interface DayPoint {
  price: number;
  count: number;
}

function weightedMedian(pts: DayPoint[]): number {
  const sorted = [...pts].sort((a, b) => a.price - b.price);
  const half = sorted.reduce((s, p) => s + p.count, 0) / 2;
  let run = 0;
  for (const p of sorted) {
    run += p.count;
    if (run >= half) return p.price;
  }
  return sorted[sorted.length - 1].price;
}

// Promedio ponderado por volumen descartando días cuyo precio medio se aleja demasiado de la mediana
// (p. ej. un día con 13 ventas a 1,9 m cuando lo normal son 55 k).
function robustAverage(pts: DayPoint[], s: Settings): { vwap: number | null; count: number } {
  if (!pts.length) return { vwap: null, count: 0 };
  const median = weightedMedian(pts);
  const band = Math.max(0.5, (2 * s.outlierPct) / 100);
  const kept = pts.filter((p) => Math.abs(p.price / median - 1) <= band);
  const n = kept.reduce((a, p) => a + p.count, 0);
  return { vwap: n ? kept.reduce((a, p) => a + p.price * p.count, 0) / n : median, count: n };
}

function empty(): MarketStat {
  return { vwap: null, vol: 0, sellMin: null, buyMax: null, sellAge: null, buyAge: null };
}

export function buildBook(current: CurrentPrice[], history: HistoryEntry[], s: Settings, quality: (id: string) => number): Book {
  const book: Book = new Map();
  const get = (id: string, q: number, m: string) => {
    if (!(MARKETS as readonly string[]).includes(m)) return null;
    const k = bookKey(id, q);
    let e = book.get(k);
    if (!e) book.set(k, (e = {}));
    return (e[m as Market] ??= empty());
  };

  const since = Date.now() - s.historyDays * 86_400_000;
  const acc = new Map<MarketStat, DayPoint[]>();
  for (const h of history) {
    if (h.quality !== quality(h.item_id)) continue;
    const st = get(h.item_id, h.quality, h.location);
    if (!st) continue;
    const pts = acc.get(st) ?? [];
    for (const d of h.data) {
      if (Date.parse(d.timestamp + 'Z') < since || d.item_count <= 0 || d.avg_price <= 0) continue;
      pts.push({ price: d.avg_price, count: d.item_count });
    }
    acc.set(st, pts);
  }
  for (const [st, pts] of acc) {
    const { vwap, count } = robustAverage(pts, s);
    st.vwap = vwap;
    st.vol = count / s.historyDays;
  }

  for (const p of current) {
    if (p.quality !== quality(p.item_id)) continue;
    const st = get(p.item_id, p.quality, p.city);
    if (!st) continue;
    if (p.sell_price_min > 0 && validDate(p.sell_price_min_date)) {
      const age = hoursSince(p.sell_price_min_date);
      if (age <= s.maxAgeHours) {
        st.sellMin = p.sell_price_min;
        st.sellAge = age;
      }
    }
    if (p.buy_price_max > 0 && validDate(p.buy_price_max_date)) {
      const age = hoursSince(p.buy_price_max_date);
      if (age <= s.maxAgeHours) {
        st.buyMax = p.buy_price_max;
        st.buyAge = age;
      }
    }
  }
  return book;
}

// Cómo resolver un precio actual que se aleja del histórico:
// 'hist' usa el histórico (órdenes), 'low' el menor de ambos (venta instantánea), 'high' el mayor (compra instantánea).
type Resolve = 'hist' | 'low' | 'high';

// Usa el precio actual si no se aleja más de outlierPct del histórico; si se aleja, usa el valor conservador.
export function pickPrice(current: number | null, vwap: number | null, s: Settings, resolve: Resolve = 'hist'): Picked | null {
  const th = s.outlierPct / 100;
  if (current != null && vwap != null) {
    if (Math.abs(current / vwap - 1) > th) {
      const price = resolve === 'low' ? Math.min(current, vwap) : resolve === 'high' ? Math.max(current, vwap) : vwap;
      return { price, flag: 'outlier', current };
    }
    return { price: current, flag: 'ok', current };
  }
  if (vwap != null) return { price: vwap, flag: 'hist', current: null };
  if (current != null) return { price: current, flag: 'nohist', current };
  return null;
}

// Coste de adquirir 1 unidad en un mercado según el modo de compra.
export function buyPrice(st: MarketStat | undefined, s: Settings): Picked | null {
  if (!st) return null;
  const order = s.buyMode === 'order';
  const p = pickPrice(order ? st.buyMax : st.sellMin, st.vwap, s, order ? 'hist' : 'high');
  if (!p) return null;
  return s.buyMode === 'order' ? { ...p, price: p.price * (1 + SETUP_FEE) } : p;
}

export interface SellQuote extends Picked {
  gross: number;
}

// Plata neta recibida por vender 1 unidad. El Black Market solo compra con órdenes de compra.
export function sellQuote(st: MarketStat | undefined, market: Market, s: Settings): SellQuote | null {
  if (!st) return null;
  const instant = market === BLACK_MARKET || s.sellMode === 'instant';
  const p = pickPrice(instant ? st.buyMax : st.sellMin, st.vwap, s, instant ? 'low' : 'hist');
  if (!p) return null;
  const fee = salesTax(s) + (instant ? 0 : SETUP_FEE);
  return { ...p, gross: p.price, price: p.price * (1 - fee) };
}
