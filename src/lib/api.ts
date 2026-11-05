// Cliente del Albion Online Data Project con control de límites y caché en memoria.
// Límites oficiales: 100 peticiones/min y 300 peticiones/5 min por IP. Se deja margen.
import { MARKETS } from './data';

export type Server = 'west' | 'europe' | 'east';
export const SERVERS: Record<Server, string> = {
  west: 'https://west.albion-online-data.com',
  europe: 'https://europe.albion-online-data.com',
  east: 'https://east.albion-online-data.com',
};

export interface CurrentPrice {
  item_id: string;
  city: string;
  quality: number;
  sell_price_min: number;
  sell_price_min_date: string;
  buy_price_max: number;
  buy_price_max_date: string;
}

export interface HistoryEntry {
  location: string;
  item_id: string;
  quality: number;
  data: { item_count: number; avg_price: number; timestamp: string }[];
}

const LIMIT_1M = 90;
const LIMIT_5M = 280;
const MAX_URL = 3800;
const TTL_PRICES = 5 * 60_000;
const TTL_HISTORY = 30 * 60_000;

const sent: number[] = [];
const cache = new Map<string, { at: number; data: unknown }>();
let status: (msg: string | null) => void = () => {};

export function onApiStatus(fn: (msg: string | null) => void) {
  status = fn;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function throttle() {
  for (;;) {
    const now = Date.now();
    while (sent.length && now - sent[0] > 300_000) sent.shift();
    const lastMin = sent.filter((t) => now - t < 60_000);
    let wait = 0;
    if (lastMin.length >= LIMIT_1M) wait = 60_000 - (now - lastMin[0]);
    if (sent.length >= LIMIT_5M) wait = Math.max(wait, 300_000 - (now - sent[0]));
    if (wait <= 0) break;
    status(`Esperando el límite del API… ${Math.ceil(wait / 1000)} s`);
    await sleep(Math.min(wait, 1000));
  }
  sent.push(Date.now());
}

async function getJson<T>(url: string, ttl: number): Promise<T> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < ttl) return hit.data as T;
  for (let attempt = 0; attempt < 3; attempt++) {
    await throttle();
    const res = await fetch(url);
    if (res.status === 429) {
      // El navegador no puede leer RateLimit-Reset (cabecera no expuesta): se espera un minuto completo.
      for (let s = 60; s > 0; s--) {
        status(`El API pidió esperar (429)… ${s} s`);
        await sleep(1000);
      }
      continue;
    }
    if (!res.ok) throw new Error(`API ${res.status}: ${url}`);
    const data = (await res.json()) as T;
    cache.set(url, { at: Date.now(), data });
    return data;
  }
  throw new Error('El API sigue limitando las peticiones. Intenta de nuevo en unos minutos.');
}

// Divide la lista de items para que cada URL quede por debajo del límite de 4096 caracteres.
function chunk(ids: string[], prefix: string, suffix: string): string[] {
  const urls: string[] = [];
  let cur: string[] = [];
  const build = (list: string[]) => `${prefix}${list.map(encodeURIComponent).join(',')}${suffix}`;
  for (const id of ids) {
    if (cur.length && build([...cur, id]).length > MAX_URL) {
      urls.push(build(cur));
      cur = [];
    }
    cur.push(id);
  }
  if (cur.length) urls.push(build(cur));
  return urls;
}

const locs = `locations=${MARKETS.map(encodeURIComponent).join(',')}`;

async function runAll<T>(urls: string[], ttl: number, label: string): Promise<T[]> {
  const out: T[] = [];
  let done = 0;
  for (const url of urls) {
    status(`${label} (${++done}/${urls.length})…`);
    out.push(...(await getJson<T[]>(url, ttl)));
  }
  return out;
}

export async function fetchCurrent(server: Server, ids: string[], qualities: number[]): Promise<CurrentPrice[]> {
  const unique = [...new Set(ids)];
  const urls = chunk(unique, `${SERVERS[server]}/api/v2/stats/prices/`, `.json?${locs}&qualities=${qualities.join(',')}`);
  return runAll<CurrentPrice>(urls, TTL_PRICES, 'Precios actuales');
}

export async function fetchHistory(server: Server, ids: string[], qualities: number[]): Promise<HistoryEntry[]> {
  const unique = [...new Set(ids)];
  const urls = chunk(unique, `${SERVERS[server]}/api/v2/stats/history/`, `.json?${locs}&time-scale=24&qualities=${qualities.join(',')}`);
  return runAll<HistoryEntry>(urls, TTL_HISTORY, 'Historial de ventas');
}

export function apiDone() {
  status(null);
}
