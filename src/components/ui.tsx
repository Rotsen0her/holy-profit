import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { CITY_COLORS, iconUrl, type GameData, type Market } from '../lib/data';
import type { PriceFlag } from '../lib/prices';
import type { Settings } from '../lib/settings';

export interface AppCtx {
  settings: Settings;
  update: (p: Partial<Settings>) => void;
  reset: () => void; // restablece los ajustes de la sección actual
  data: GameData;
  name: (id: string) => string;
  tr: (key: string, vars?: Record<string, string | number>) => string;
}

export const Ctx = createContext<AppCtx>(null!);
export const useApp = () => useContext(Ctx);

export function Panel({ title, right, children, className = '' }: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`panel ${className}`}>
      {title && (
        <header className="panel-head">
          <h2>{title}</h2>
          {right}
        </header>
      )}
      <div className="panel-body">{children}</div>
    </section>
  );
}

export interface Opt {
  value: string;
  label: string;
}

export function PillSelect({ label, value, options, onChange }: { label: string; value: string; options: Opt[]; onChange: (v: string) => void }) {
  return (
    <label className="pill" title={label}>
      <span className="pill-label">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ItemIcon({ id, quality = 1, size = 56 }: { id: string; quality?: number; size?: number }) {
  return <img className="item-icon" src={iconUrl(id, quality)} width={size} height={size} alt="" loading="lazy" />;
}

export function CityTag({ market, extra }: { market: Market; extra?: ReactNode }) {
  return (
    <span className="city-tag" style={{ ['--city' as string]: CITY_COLORS[market] }}>
      <i />
      {market}
      {extra && <small>{extra}</small>}
    </span>
  );
}

const FLAG_KEY: Record<PriceFlag, string> = { ok: 'flagOk', outlier: 'flagOutlier', hist: 'flagHist', nohist: 'flagNohist' };

export function Flag({ flag, current }: { flag: PriceFlag; current?: number | null }) {
  const { tr } = useApp();
  const label = tr(FLAG_KEY[flag], { cur: current != null ? Math.round(current).toLocaleString('es-ES') : '' });
  return <span className={`flag flag-${flag}`} title={label} aria-label={label} />;
}

export function Modal({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const { tr } = useApp();
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="close-btn" onClick={onClose} aria-label={tr('close')}>
          ✕
        </button>
        {children}
      </div>
    </div>
  );
}

export function Silver({ value, signed }: { value: number | null; signed?: boolean }) {
  if (value == null || !isFinite(value)) return <span className="muted">—</span>;
  const cls = signed ? (value >= 0 ? 'pos' : 'neg') : '';
  const abs = Math.abs(value);
  const txt = abs >= 1e6 ? `${(value / 1e6).toFixed(2)} m` : abs >= 1e4 ? `${(value / 1e3).toFixed(1)} k` : Math.round(value).toLocaleString('es-ES');
  return (
    <span className={`silver ${cls}`}>
      <b className="coin" />
      {signed && value > 0 ? '+' : ''}
      {txt}
    </span>
  );
}

export type SortDir = 1 | -1;

export function Th({ k, sort, setSort, children, className }: { k: string; sort: [string, SortDir]; setSort: (s: [string, SortDir]) => void; children: ReactNode; className?: string }) {
  const active = sort[0] === k;
  return (
    <th className={className}>
      <button className={`th-pill ${active ? 'active' : ''}`} onClick={() => setSort([k, active ? ((-sort[1]) as SortDir) : -1])}>
        {children}
        <span className="arrow">{active ? (sort[1] === -1 ? '▼' : '▲') : '◆'}</span>
      </button>
    </th>
  );
}

// Ordena con los valores nulos siempre al final
export function sortBy<T>(rows: T[], get: (r: T) => number | string | null, dir: SortDir): T[] {
  return [...rows].sort((a, b) => {
    const x = get(a);
    const y = get(b);
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    return (x < y ? -1 : x > y ? 1 : 0) * dir;
  });
}
