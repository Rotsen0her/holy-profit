// Datos estáticos del juego (generados por scripts/build-data.mjs) y constantes de ciudades.

export type Activity = 'craft' | 'refine' | 'cook' | 'alchemy';

export interface Recipe {
  id: string; // ID de mercado del producto (T6_2H_BOW@1)
  act: Activity;
  cat: string;
  sub: string;
  bk: string; // clave de bono de ciudad
  t: number; // tier
  e: number; // encantamiento
  a: number; // unidades producidas por receta
  f: number; // foco base por receta
  s: number; // plata fija de la receta
  v: number; // valor de item de la receta (base de la tarifa de estación)
  r: [string, number, 0 | 1][]; // [recurso, cantidad, retornable]
}

export interface GameData {
  generated: string;
  names: Record<string, [string, string]>;
  recipes: Recipe[];
}

let cache: Promise<GameData> | null = null;

export function loadGameData(): Promise<GameData> {
  cache ??= fetch(`${import.meta.env.BASE_URL}data/items.json`).then((r) => {
    if (!r.ok) throw new Error(`No se pudo cargar items.json (${r.status})`);
    return r.json();
  });
  return cache;
}

export const CRAFT_CITIES = ['Bridgewatch', 'Martlock', 'Lymhurst', 'Fort Sterling', 'Thetford', 'Caerleon', 'Brecilien'] as const;
export const BLACK_MARKET = 'Black Market';
export const MARKETS = [...CRAFT_CITIES, BLACK_MARKET] as const;
export type City = (typeof CRAFT_CITIES)[number];
export type Market = (typeof MARKETS)[number];

export const CITY_COLORS: Record<Market, string> = {
  Bridgewatch: '#e07a1f',
  Martlock: '#2f7fd8',
  Lymhurst: '#4caf3a',
  'Fort Sterling': '#8f9bb3',
  Thetford: '#9b4fd1',
  Caerleon: '#d63a3a',
  Brecilien: '#2bb3a3',
  'Black Market': '#3a3a3a',
};

// Bonos de producción por ciudad (wiki oficial, plantilla "City bonuses").
// Crafteo especializado: +15 %, refinado especializado: +40 %, base de ciudad real: +18 %.
const CITY_BONUS: Record<City, string[]> = {
  Martlock: ['axe', 'quarterstaff', 'froststaff', 'plate_shoes', 'offhands', 'refine:hide'],
  Bridgewatch: ['crossbow', 'dagger', 'cursestaff', 'plate_armor', 'cloth_shoes', 'refine:rock'],
  Lymhurst: ['sword', 'bow', 'arcanestaff', 'leather_helmet', 'leather_shoes', 'refine:fiber'],
  'Fort Sterling': ['hammer', 'spear', 'holystaff', 'plate_helmet', 'cloth_armor', 'refine:wood'],
  Thetford: ['mace', 'naturestaff', 'firestaff', 'leather_armor', 'cloth_helmet', 'refine:ore'],
  Caerleon: ['knuckles', 'shapeshifterstaff', 'gathering', 'food'],
  Brecilien: ['capes', 'bags', 'potions'],
};

export const BASE_CITY_BONUS = 18;
export const FOCUS_BONUS = 59;

export function cityBonus(city: City, bk: string): number {
  if (!CITY_BONUS[city].includes(bk)) return 0;
  return bk.startsWith('refine:') ? 40 : 15;
}

export function bonusCities(bk: string): City[] {
  return CRAFT_CITIES.filter((c) => CITY_BONUS[c].includes(bk));
}

export const iconUrl = (id: string, quality = 1, size = 64) =>
  `https://render.albiononline.com/v1/item/${encodeURIComponent(id)}.png?size=${size}&quality=${quality}`;
