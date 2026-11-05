// Cálculo de rentabilidad de producción (crafteo, refinado, cocina, alquimia) y de flipping.
import { BASE_CITY_BONUS, BLACK_MARKET, CRAFT_CITIES, FOCUS_BONUS, MARKETS, cityBonus, type City, type Market, type Recipe } from './data';
import { bookKey, buyPrice, sellQuote, type Book, type Picked, type SellQuote } from './prices';
import { focusEfficiency, type Settings } from './settings';

export interface MatOption extends Picked {
  city: City;
  vol: number;
}

export interface MatLine {
  id: string;
  count: number;
  returnable: boolean;
  chosen: MatOption | null;
  options: MatOption[];
}

export interface CraftCity {
  city: City;
  bonus: number;
  rrr: number;
  cost: number; // coste por receta (materiales tras retorno + tarifa de estación)
  fee: number;
}

export interface SellOption extends SellQuote {
  market: Market;
  vol: number;
  enoughVolume: boolean;
}

export interface ProdResult {
  recipe: Recipe;
  mats: MatLine[];
  missing: string[];
  craftCities: CraftCity[];
  craft: CraftCity | null;
  sells: SellOption[];
  sell: SellOption | null;
  costPerCraft: number | null;
  unitCost: number | null;
  unitNet: number | null;
  profitUnit: number | null;
  profitCraft: number | null;
  margin: number | null;
  focusCost: number;
  silverPerFocus: number | null;
}

export const rrrFromBonus = (bonus: number) => 1 - 1 / (1 + bonus / 100);

export function productionBonus(city: City, bk: string, s: Settings, focus = s.useFocus) {
  return BASE_CITY_BONUS + cityBonus(city, bk) + (focus ? FOCUS_BONUS : 0) + s.dailyBonus;
}

function craftCost(recipe: Recipe, mats: MatLine[], city: City, s: Settings, focus: boolean): CraftCity {
  const bonus = productionBonus(city, recipe.bk, s, focus);
  const rrr = rrrFromBonus(bonus);
  let cost = recipe.s;
  for (const m of mats) {
    const p = m.chosen?.price ?? 0;
    cost += m.count * p * (m.returnable ? 1 - rrr : 1);
  }
  const fee = (recipe.v * 0.1125 * s.stationFee[city]) / 100;
  return { city, bonus, rrr, cost: cost + fee, fee };
}

export function calcProduction(recipe: Recipe, book: Book, s: Settings): ProdResult {
  const mats: MatLine[] = recipe.r.map(([id, count, ret]) => {
    const stats = book.get(bookKey(id, 1)) ?? {};
    const options: MatOption[] = [];
    for (const city of CRAFT_CITIES) {
      const st = stats[city];
      const p = buyPrice(st, s);
      if (p) options.push({ ...p, city, vol: st?.vol ?? 0 });
    }
    options.sort((a, b) => a.price - b.price);
    const pool = s.buyFrom === 'best' ? options : options.filter((o) => o.city === s.buyFrom);
    return { id, count, returnable: ret === 1, chosen: pool[0] ?? null, options };
  });
  const missing = mats.filter((m) => !m.chosen).map((m) => m.id);

  const craftCities = CRAFT_CITIES.map((c) => craftCost(recipe, mats, c, s, s.useFocus)).sort((a, b) => a.cost - b.cost);
  const craft = missing.length ? null : s.craftIn === 'best' ? craftCities[0] : craftCities.find((c) => c.city === s.craftIn)!;

  const stats = book.get(bookKey(recipe.id, s.quality)) ?? {};
  const sells: SellOption[] = [];
  for (const market of MARKETS) {
    if (market === BLACK_MARKET && !s.includeBM) continue;
    const st = stats[market];
    const q = sellQuote(st, market, s);
    if (q) sells.push({ ...q, market, vol: st?.vol ?? 0, enoughVolume: (st?.vol ?? 0) >= s.minVolume });
  }
  sells.sort((a, b) => Number(b.enoughVolume) - Number(a.enoughVolume) || b.price - a.price);
  const sell = sells[0] ?? null;

  const focusCost = recipe.f * Math.pow(0.5, focusEfficiency(s) / 10000);
  let silverPerFocus: number | null = null;
  if (craft && focusCost > 0) {
    const noFocus = craftCost(recipe, mats, craft.city, s, false).cost;
    const withFocus = craftCost(recipe, mats, craft.city, s, true).cost;
    silverPerFocus = (noFocus - withFocus) / focusCost;
  }

  const costPerCraft = craft?.cost ?? null;
  const unitCost = costPerCraft != null ? costPerCraft / recipe.a : null;
  const unitNet = sell?.price ?? null;
  const profitUnit = unitCost != null && unitNet != null ? unitNet - unitCost : null;
  return {
    recipe, mats, missing, craftCities, craft, sells, sell,
    costPerCraft, unitCost, unitNet, profitUnit,
    profitCraft: profitUnit != null ? profitUnit * recipe.a : null,
    margin: profitUnit != null && unitCost ? profitUnit / unitCost : null,
    focusCost, silverPerFocus,
  };
}

export interface FlipRoute {
  from: City;
  to: Market;
  buy: number;
  buyVwap: number | null;
  sell: SellQuote;
  volTo: number;
  profit: number;
  roi: number;
  suspicious: boolean; // compra muy por debajo del histórico: puede ser un único listado
}

export interface FlipResult {
  id: string;
  best: FlipRoute | null;
  routes: FlipRoute[];
}

export function calcFlips(id: string, quality: number, book: Book, s: Settings): FlipResult {
  const stats = book.get(bookKey(id, quality)) ?? {};
  const routes: FlipRoute[] = [];
  for (const from of CRAFT_CITIES) {
    const src = stats[from];
    if (!src?.sellMin) continue;
    for (const to of MARKETS) {
      if (to === from || (to === BLACK_MARKET && !s.includeBM)) continue;
      const dst = stats[to];
      const sell = sellQuote(dst, to, s);
      if (!sell || (dst?.vol ?? 0) < s.minVolume) continue;
      const profit = sell.price - src.sellMin;
      routes.push({
        from, to, buy: src.sellMin, buyVwap: src.vwap, sell, volTo: dst!.vol, profit,
        roi: profit / src.sellMin,
        suspicious: src.vwap != null && src.sellMin < src.vwap * (1 - s.outlierPct / 100),
      });
    }
  }
  routes.sort((a, b) => b.profit - a.profit);
  return { id, best: routes[0] ?? null, routes };
}
