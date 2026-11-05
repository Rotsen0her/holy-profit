import { useMemo, useState } from 'react';
import type { Recipe } from '../lib/data';
import { catLabel, QUALITIES } from '../lib/i18n';
import { roman } from '../lib/format';
import { PillSelect, useApp } from './ui';

export interface FilterState {
  cat: string;
  sub: string;
  tier: string;
  ench: string;
  q: string;
}

const uniq = <T,>(xs: T[]) => [...new Set(xs)];

const CAT_ORDER = ['weapons', 'armors', 'head', 'shoes', 'offhands', 'capes', 'bags', 'mounts', 'gathering', 'food', 'ingredients'];
const catRank = (c: string) => (CAT_ORDER.includes(c) ? CAT_ORDER.indexOf(c) : CAT_ORDER.length);

// Filtros estilo mercado del juego: Categoría · Tipo · Nivel · Encantamiento · Calidad · Buscar
export function useRecipeFilters(recipes: Recipe[]) {
  const cats = useMemo(() => uniq(recipes.map((r) => r.cat)).sort((a, b) => catRank(a) - catRank(b)), [recipes]);
  const [f, setF] = useState<FilterState>({ cat: cats[0] ?? '', sub: '', tier: '', ench: '', q: '' });
  const cat = cats.includes(f.cat) ? f.cat : cats[0] ?? '';
  const inCat = useMemo(() => recipes.filter((r) => r.cat === cat), [recipes, cat]);
  const subs = useMemo(() => uniq(inCat.map((r) => r.sub)), [inCat]);
  const tiers = useMemo(() => uniq(inCat.map((r) => r.t)).sort((a, b) => a - b), [inCat]);
  const enchs = useMemo(() => uniq(inCat.map((r) => r.e)).sort((a, b) => a - b), [inCat]);
  return { f: { ...f, cat }, setF: (p: Partial<FilterState>) => setF((s) => ({ ...s, ...p })), cats, subs, tiers, enchs, inCat };
}

export function applyFilters(inCat: Recipe[], f: FilterState, name: (id: string) => string) {
  const q = f.q.trim().toLowerCase();
  return inCat.filter(
    (r) =>
      (!f.sub || r.sub === f.sub) &&
      (!f.tier || r.t === Number(f.tier)) &&
      (!f.ench || r.e === Number(f.ench)) &&
      (!q || name(r.id).toLowerCase().includes(q) || r.id.toLowerCase().includes(q)),
  );
}

export function FilterBar({ state, showQuality }: { state: ReturnType<typeof useRecipeFilters>; showQuality: boolean }) {
  const { settings, update, tr } = useApp();
  const { f, setF, cats, subs, tiers, enchs } = state;
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
      {cats.length > 1 && (
        <PillSelect label={tr('category')} value={f.cat} onChange={(v) => setF({ cat: v, sub: '', tier: '', ench: '' })} options={cats.map((c) => ({ value: c, label: catLabel(lang, c) }))} />
      )}
      {subs.length > 1 && (
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
