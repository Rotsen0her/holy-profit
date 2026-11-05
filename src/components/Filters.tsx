import { useMemo, useState } from 'react';
import type { Recipe } from '../lib/data';
import { catLabel, QUALITIES } from '../lib/i18n';
import { roman } from '../lib/format';
import { ItemIcon, PillSelect, useApp } from './ui';

export interface FilterState {
  cat: string;
  sub: string;
  tier: string;
  ench: string;
  q: string;
  family: string; // familia elegida en la vista previa (mismo objeto en todos los niveles y encantamientos)
  familyLabel: string;
}

const uniq = <T,>(xs: T[]) => [...new Set(xs)];

const CAT_ORDER = ['weapons', 'armors', 'head', 'shoes', 'offhands', 'capes', 'bags', 'mounts', 'gathering', 'food', 'ingredients'];
const catRank = (c: string) => (CAT_ORDER.includes(c) ? CAT_ORDER.indexOf(c) : CAT_ORDER.length);

// T6_2H_BOW_KEEPER@2 -> 2H_BOW_KEEPER ; T5_PLANKS_LEVEL1@1 -> PLANKS
export const familyKey = (id: string) => id.replace(/^T\d+_/, '').replace(/@\d+$/, '').replace(/_LEVEL\d+$/, '');

// Búsqueda sin tildes ni mayúsculas, todas las palabras deben aparecer
const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Filtros estilo mercado del juego: Buscar · Categoría · Tipo · Nivel · Encantamiento · Calidad
export function useRecipeFilters(recipes: Recipe[]) {
  const cats = useMemo(() => uniq(recipes.map((r) => r.cat)).sort((a, b) => catRank(a) - catRank(b)), [recipes]);
  const [f, setF] = useState<FilterState>({ cat: cats[0] ?? '', sub: '', tier: '', ench: '', q: '', family: '', familyLabel: '' });
  const cat = cats.includes(f.cat) ? f.cat : cats[0] ?? '';
  const inCat = useMemo(() => recipes.filter((r) => r.cat === cat), [recipes, cat]);
  // Al buscar por texto o familia se ignoran categoría y tipo: se busca en toda la actividad
  const global = f.q.trim() !== '' || f.family !== '';
  const pool = global ? recipes : inCat;
  const subs = useMemo(() => uniq(inCat.map((r) => r.sub)), [inCat]);
  const tiers = useMemo(() => uniq(pool.map((r) => r.t)).sort((a, b) => a - b), [pool]);
  const enchs = useMemo(() => uniq(pool.map((r) => r.e)).sort((a, b) => a - b), [pool]);
  return { f: { ...f, cat }, setF: (p: Partial<FilterState>) => setF((s) => ({ ...s, ...p })), cats, subs, tiers, enchs, pool, global };
}

export function applyFilters(state: ReturnType<typeof useRecipeFilters>, name: (id: string) => string) {
  const { f, pool, global } = state;
  const words = normalize(f.q).split(/\s+/).filter(Boolean);
  return pool.filter((r) => {
    if (!global && f.sub && r.sub !== f.sub) return false;
    if (f.tier && r.t !== Number(f.tier)) return false;
    if (f.ench && r.e !== Number(f.ench)) return false;
    if (f.family && familyKey(r.id) !== f.family) return false;
    if (!words.length) return true;
    const hay = normalize(`${name(r.id)} ${r.id}`);
    return words.every((w) => hay.includes(w));
  });
}

export function FilterBar({ state, showQuality }: { state: ReturnType<typeof useRecipeFilters>; showQuality: boolean }) {
  const { settings, update, tr } = useApp();
  const { f, setF, cats, subs, tiers, enchs, global } = state;
  const lang = settings.lang;
  return (
    <div className="filter-bar">
      <label className="pill search">
        <input value={f.q} placeholder={tr('search')} onChange={(e) => setF({ q: e.target.value })} />
        {f.q && (
          <button className="pill-reset" onClick={() => setF({ q: '' })} aria-label="reset">
            ⟲
          </button>
        )}
      </label>
      {f.family && (
        <button className="family-chip" onClick={() => setF({ family: '', familyLabel: '' })} title={tr('clearFamily')}>
          {tr('family')}: {f.familyLabel} <span>✕</span>
        </button>
      )}
      {cats.length > 1 && !global && (
        <PillSelect label={tr('category')} value={f.cat} onChange={(v) => setF({ cat: v, sub: '', tier: '', ench: '' })} options={cats.map((c) => ({ value: c, label: catLabel(lang, c) }))} />
      )}
      {subs.length > 1 && !global && (
        <PillSelect label={tr('type')} value={f.sub} onChange={(v) => setF({ sub: v })} options={[{ value: '', label: `${tr('type')}: ${tr('all')}` }, ...subs.map((s) => ({ value: s, label: catLabel(lang, s) }))]} />
      )}
      <PillSelect label={tr('tier')} value={f.tier} onChange={(v) => setF({ tier: v })} options={[{ value: '', label: `${tr('tier')}: ${tr('all')}` }, ...tiers.map((x) => ({ value: String(x), label: `${tr('tier')} ${roman(x)}` }))]} />
      {enchs.length > 1 && (
        <PillSelect label={tr('enchant')} value={f.ench} onChange={(v) => setF({ ench: v })} options={[{ value: '', label: `${tr('enchant')}: ${tr('all')}` }, ...enchs.map((x) => ({ value: String(x), label: `${tr('enchant')} .${x}` }))]} />
      )}
      {showQuality && (
        <PillSelect label={tr('quality')} value={String(settings.quality)} onChange={(v) => update({ quality: Number(v) })} options={QUALITIES.map((q, i) => ({ value: String(i + 1), label: q[lang === 'es' ? 0 : 1] }))} />
      )}
    </div>
  );
}

const PREVIEW_MAX = 40;

// Vista previa en vivo de los objetos que coinciden con los filtros. Clic = filtrar por esa familia.
export function ItemPreview({ items, state, quality = 1 }: { items: { id: string; t: number; e: number }[]; state: ReturnType<typeof useRecipeFilters>; quality?: number }) {
  const { name, tr, data } = useApp();
  const { f, setF, global } = state;
  if (!global) return null;
  const baseName = (id: string) => {
    const base = id.replace(/@\d+$/, '');
    return name(data.names[base] ? base : id);
  };
  // Sin familia elegida: una tarjeta por objeto (todas sus variantes). Con familia: cada variante.
  const cards: { id: string; t: number; e: number; variants: number }[] = [];
  if (f.family) items.forEach((r) => cards.push({ ...r, variants: 1 }));
  else {
    const groups = new Map<string, { id: string; t: number; e: number; variants: number }>();
    for (const r of items) {
      const k = familyKey(r.id);
      const g = groups.get(k);
      if (!g) groups.set(k, { id: r.id, t: r.t, e: r.e, variants: 1 });
      else {
        g.variants++;
        if (r.t < g.t || (r.t === g.t && r.e < g.e)) Object.assign(g, { id: r.id, t: r.t, e: r.e });
      }
    }
    cards.push(...groups.values());
  }
  return (
    <div className="preview">
      <div className="preview-head">
        <b>{tr('matches', { n: items.length })}</b>
        {!f.family && cards.length > 0 && <span className="muted small">{tr('pickFamily')}</span>}
      </div>
      {items.length === 0 ? (
        <p className="muted small">{tr('noMatches')}</p>
      ) : (
        <div className="preview-grid">
          {cards.slice(0, PREVIEW_MAX).map((r) => (
            <button
              key={r.id}
              className={`preview-item ${f.family === familyKey(r.id) ? 'on' : ''}`}
              title={`${name(r.id)} (${r.id})`}
              onClick={() => setF({ family: familyKey(r.id), familyLabel: baseName(r.id), q: '' })}
            >
              <ItemIcon id={r.id} quality={quality} size={48} />
              <span className="preview-name">{name(r.id)}</span>
              <span className="item-sub">
                <span className={`tier t${r.t}`}>{roman(r.t)}</span>
                {r.e > 0 && <span className={`ench e${r.e}`}>.{r.e}</span>}
                {r.variants > 1 && <span className="muted">{tr('variants', { n: r.variants })}</span>}
              </span>
            </button>
          ))}
          {cards.length > PREVIEW_MAX && <div className="preview-more">+{cards.length - PREVIEW_MAX}</div>}
        </div>
      )}
    </div>
  );
}
