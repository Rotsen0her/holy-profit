import { useEffect, useState } from 'react';
import type { Server } from './api';
import { CRAFT_CITIES, type City } from './data';

export type Lang = 'es' | 'en';

export interface Settings {
  server: Server;
  lang: Lang;
  premium: boolean;
  useFocus: boolean;
  mastery: number; // nivel de maestría de la categoría (0-100)
  spec: number; // nivel de especialización del item (0-100)
  fceOverride: number | null; // eficiencia de foco directa, si el usuario la conoce
  stationFee: Record<City, number>; // tarifa de uso por cada 100 de nutrición
  dailyBonus: 0 | 10 | 20;
  historyDays: number;
  minVolume: number; // ventas diarias mínimas para considerar un mercado de venta
  outlierPct: number; // desviación máxima del precio actual frente al histórico
  maxAgeHours: number; // antigüedad máxima de un precio actual
  buyMode: 'instant' | 'order';
  sellMode: 'order' | 'instant';
  buyFrom: 'best' | City;
  craftIn: 'best' | City;
  includeBM: boolean;
  quality: number;
}

export const DEFAULT_SETTINGS: Settings = {
  server: 'west',
  lang: 'es',
  premium: true,
  useFocus: false,
  mastery: 0,
  spec: 0,
  fceOverride: null,
  stationFee: Object.fromEntries(CRAFT_CITIES.map((c) => [c, 400])) as Record<City, number>,
  dailyBonus: 0,
  historyDays: 7,
  minVolume: 3,
  outlierPct: 35,
  maxAgeHours: 24,
  buyMode: 'instant',
  sellMode: 'order',
  buyFrom: 'best',
  craftIn: 'best',
  includeBM: true,
  quality: 1,
};

const KEY = 'holy-profit:settings';

function read(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      return { ...DEFAULT_SETTINGS, ...s, stationFee: { ...DEFAULT_SETTINGS.stationFee, ...s.stationFee } };
    }
  } catch {
    /* almacenamiento no disponible */
  }
  return DEFAULT_SETTINGS;
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(read);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(settings));
    } catch {
      /* almacenamiento no disponible */
    }
  }, [settings]);
  const update = (patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch }));
  return [settings, update, () => setSettings(DEFAULT_SETTINGS)] as const;
}

// Eficiencia de foco aproximada: 30 por nivel de maestría y 250 por nivel de especialización del item.
export function focusEfficiency(s: Settings): number {
  return s.fceOverride ?? s.mastery * 30 + s.spec * 250;
}

export const salesTax = (s: Settings) => (s.premium ? 0.04 : 0.08);
export const SETUP_FEE = 0.025;
