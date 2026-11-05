import { useMemo, useState } from 'react';
import { apiDone, fetchCurrent, fetchHistory } from '../lib/api';
import { calcProduction, type ProdResult } from '../lib/calc';
import { bonusCities, type Activity } from '../lib/data';
import { pct, roman } from '../lib/format';
import { buildBook } from '../lib/prices';
import { applyFilters, FilterBar, ItemPreview, useRecipeFilters } from '../components/Filters';
import { CityTag, Flag, ItemIcon, Modal, Panel, Silver, sortBy, Th, useApp, type SortDir } from '../components/ui';

const MAX_ITEMS = 600;

export function ProductionPage({ act }: { act: Activity }) {
  const app = useApp();
  const { data, settings: s, tr, name } = app;
  const recipes = useMemo(() => data.recipes.filter((r) => r.act === act), [data, act]);
  const filters = useRecipeFilters(recipes);
  const selected = applyFilters(filters, name);
  const selectedIds = useMemo(() => new Set(selected.map((r) => r.id)), [selected]);
  const [results, setResults] = useState<ProdResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sort, setSort] = useState<[string, SortDir]>(['profit', -1]);
  const [detail, setDetail] = useState<ProdResult | null>(null);
  const [reliableOnly, setReliableOnly] = useState(true);
  const isEquipment = act === 'craft';

  async function calculate() {
    if (selected.length > MAX_ITEMS) return;
    setBusy(true);
    setError(null);
    try {
      const products = selected.map((r) => r.id);
      const mats = [...new Set(selected.flatMap((r) => r.r.map((x) => x[0])))];
      const q = isEquipment ? s.quality : 1;
      const productSet = new Set(products);
      const [curP, curM, hisP, hisM] = await Promise.all([
        fetchCurrent(s.server, products, [q]),
        fetchCurrent(s.server, mats, [1]),
        fetchHistory(s.server, products, [q]),
        fetchHistory(s.server, mats, [1]),
      ]);
      const book = buildBook([...curP, ...curM], [...hisP, ...hisM], s, (id) => (productSet.has(id) ? q : 1));
      setResults(selected.map((r) => calcProduction(r, book, s)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      apiDone();
      setBusy(false);
    }
  }

  const getters: Record<string, (r: ProdResult) => number | string | null> = {
    name: (r) => name(r.recipe.id),
    cost: (r) => r.unitCost,
    net: (r) => r.unitNet,
    profit: (r) => r.profitUnit,
    margin: (r) => r.margin,
    focus: (r) => r.silverPerFocus,
    vol: (r) => r.sell?.vol ?? null,
  };
  // Los resultados ya calculados se filtran en vivo con los filtros actuales
  const matching = results?.filter((r) => selectedIds.has(r.recipe.id)) ?? [];
  // Un producto sin ventas suficientes en su mejor mercado tiene un precio poco fiable (posible outlier)
  const reliable = matching.filter((r) => r.sell?.enoughVolume);
  const visible = reliableOnly ? reliable : matching;
  const rows = sortBy(visible, getters[sort[0]], sort[1]);
  const hidden = matching.length - reliable.length;
  const notCalculated = results ? selected.filter((r) => !results.some((x) => x.recipe.id === r.id)).length : 0;

  return (
    <>
      <Panel title={tr(act)} right={<span className="count-badge">{selected.length} {tr('items')}</span>}>
        <FilterBar state={filters} showQuality={isEquipment} />
        <div className="action-row">
          <p className="hint">
            {selected.length > MAX_ITEMS
              ? tr('tooMany', { n: selected.length, max: MAX_ITEMS })
              : new Set(selected.map((r) => r.bk)).size === 1
                ? bonusHint(selected[0].bk, s.lang)
                : tr('bonusVaries')}
          </p>
          <button className="btn-red" disabled={busy || !selected.length || selected.length > MAX_ITEMS} onClick={calculate}>
            {busy ? '…' : tr('calculate')}
          </button>
        </div>
        {error && <p className="error">{error}</p>}
        <ItemPreview items={selected} state={filters} quality={isEquipment ? s.quality : 1} />
      </Panel>

      <Panel className="results">
        {!results ? (
          <p className="empty">{tr('noResults')}</p>
        ) : (
          <>
          <div className="results-bar">
            <label className="check">
              <input type="checkbox" checked={reliableOnly} onChange={(e) => setReliableOnly(e.target.checked)} />
              {tr('reliableOnly', { v: s.minVolume })}
            </label>
            {reliableOnly && hidden > 0 && <span className="muted small">{tr('hiddenLowVol', { n: hidden })}</span>}
            {notCalculated > 0 && <span className="warn small">{tr('notCalculated', { n: notCalculated })}</span>}
          </div>
          <div className="table-wrap">
            <table className="market-table">
              <thead>
                <tr>
                  <Th k="name" sort={sort} setSort={setSort} className="col-item">{tr('item')}</Th>
                  <th><span className="th-pill static">{tr('buyMats')}</span></th>
                  <th><span className="th-pill static">{tr('craftIn')}</span></th>
                  <Th k="cost" sort={sort} setSort={setSort}>{tr('unitCost')}</Th>
                  <th><span className="th-pill static">{tr('sellIn')}</span></th>
                  <Th k="net" sort={sort} setSort={setSort}>{tr('netSell')}</Th>
                  <Th k="profit" sort={sort} setSort={setSort}>{tr('profit')}</Th>
                  <Th k="margin" sort={sort} setSort={setSort}>{tr('margin')}</Th>
                  <Th k="focus" sort={sort} setSort={setSort}>{tr('perFocus')}</Th>
                  <Th k="vol" sort={sort} setSort={setSort}>{tr('volume')}</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <ResultRow key={r.recipe.id} r={r} onOpen={() => setDetail(r)} quality={isEquipment ? s.quality : 1} />
                ))}
                {!rows.length && (
                  <tr><td colSpan={10} className="empty">{tr('noResults')}</td></tr>
                )}
              </tbody>
            </table>
          </div>
          </>
        )}
      </Panel>
      {detail && <ProdDetail r={detail} quality={isEquipment ? s.quality : 1} onClose={() => setDetail(null)} />}
    </>
  );
}

function bonusHint(bk: string | undefined, lang: string) {
  if (!bk) return '';
  const cities = bonusCities(bk);
  if (!cities.length) return lang === 'es' ? 'Sin bono de ciudad para esta categoría.' : 'No city bonus for this category.';
  return lang === 'es' ? `Bono de producción en: ${cities.join(', ')}` : `Production bonus in: ${cities.join(', ')}`;
}

function matCities(r: ProdResult) {
  return [...new Set(r.mats.map((m) => m.chosen?.city).filter(Boolean))] as string[];
}

function ResultRow({ r, onOpen, quality }: { r: ProdResult; onOpen: () => void; quality: number }) {
  const { name, tr } = useApp();
  const lowVol = r.sell && !r.sell.enoughVolume;
  return (
    <tr onClick={onOpen} className="clickable">
      <td className="col-item">
        <div className="item-cell">
          <ItemIcon id={r.recipe.id} quality={quality} />
          <div>
            <div className="item-name">{name(r.recipe.id)}</div>
            <div className="item-sub">
              <span className={`tier t${r.recipe.t}`}>{roman(r.recipe.t)}</span>
              {r.recipe.e > 0 && <span className={`ench e${r.recipe.e}`}>.{r.recipe.e}</span>}
              {r.recipe.a > 1 && <span className="muted"> ×{r.recipe.a}</span>}
            </div>
          </div>
        </div>
      </td>
      <td>
        {r.missing.length ? (
          <span className="warn">{tr('missingPrices')}</span>
        ) : (
          <div className="tags">{matCities(r).map((c) => <CityTag key={c} market={c as never} />)}</div>
        )}
      </td>
      <td>{r.craft && <CityTag market={r.craft.city} extra={pct(r.craft.rrr, 0)} />}</td>
      <td className="num"><Silver value={r.unitCost} /></td>
      <td>{r.sell ? <CityTag market={r.sell.market} /> : <span className="warn">{tr('noSellData')}</span>}</td>
      <td className="num">
        <Silver value={r.unitNet} /> {r.sell && <Flag flag={r.sell.flag} current={r.sell.current} />}
      </td>
      <td className="num big"><Silver value={r.profitUnit} signed /></td>
      <td className={`num ${r.margin != null ? (r.margin >= 0 ? 'pos' : 'neg') : ''}`}>{pct(r.margin, 0)}</td>
      <td className="num">{r.silverPerFocus != null ? r.silverPerFocus.toFixed(1) : '—'}</td>
      <td className={`num ${lowVol ? 'warn' : ''}`} title={lowVol ? tr('lowVolume') : undefined}>
        {r.sell ? r.sell.vol.toFixed(r.sell.vol < 10 ? 1 : 0) : '—'}
      </td>
    </tr>
  );
}

function ProdDetail({ r, quality, onClose }: { r: ProdResult; quality: number; onClose: () => void }) {
  const { name, tr } = useApp();
  return (
    <Modal onClose={onClose}>
      <div className="detail-head">
        <ItemIcon id={r.recipe.id} quality={quality} size={80} />
        <div>
          <h3>{name(r.recipe.id)}</h3>
          <p className="muted">
            {r.recipe.id} · {tr('produces', { n: r.recipe.a })} · {tr('focusCost')}: {Math.round(r.focusCost).toLocaleString('es-ES')}
          </p>
          <div className="kpis">
            <div><span>{tr('unitCost')}</span><Silver value={r.unitCost} /></div>
            <div><span>{tr('netSell')}</span><Silver value={r.unitNet} /></div>
            <div><span>{tr('profit')}</span><Silver value={r.profitUnit} signed /></div>
            <div><span>{tr('margin')}</span><b>{pct(r.margin, 1)}</b></div>
          </div>
        </div>
      </div>

      <h4>{tr('materials')}</h4>
      <div className="table-wrap">
        <table className="mini-table">
          <thead>
            <tr><th>{tr('material')}</th><th>{tr('qty')}</th><th>{tr('city')}</th><th>{tr('price')}</th><th>{tr('history')} / {tr('current')}</th></tr>
          </thead>
          <tbody>
            {r.mats.map((m) => (
              <tr key={m.id}>
                <td>
                  <div className="item-cell small">
                    <ItemIcon id={m.id} size={36} />
                    <span>{name(m.id)}{!m.returnable && <em className="muted"> ({tr('artifact')})</em>}</span>
                  </div>
                </td>
                <td className="num">{m.count}</td>
                <td>{m.chosen ? <CityTag market={m.chosen.city} /> : <span className="warn">—</span>}</td>
                <td className="num">{m.chosen && <><Silver value={m.chosen.price} /> <Flag flag={m.chosen.flag} current={m.chosen.current} /></>}</td>
                <td className="alt-prices">
                  {m.options.slice(0, 4).map((o) => (
                    <span key={o.city}><CityTag market={o.city} /> <Silver value={o.price} /></span>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h4>{tr('craftIn')}</h4>
      <div className="table-wrap">
        <table className="mini-table">
          <thead>
            <tr><th>{tr('city')}</th><th>{tr('bonus')}</th><th>{tr('rrr')}</th><th>{tr('stationFee')}</th><th>{tr('costCraft')}</th></tr>
          </thead>
          <tbody>
            {r.craftCities.map((c) => (
              <tr key={c.city} className={r.craft?.city === c.city ? 'chosen' : ''}>
                <td><CityTag market={c.city} /></td>
                <td className="num">{c.bonus} %</td>
                <td className="num">{pct(c.rrr)}</td>
                <td className="num"><Silver value={c.fee} /></td>
                <td className="num"><Silver value={r.missing.length ? null : c.cost} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h4>{tr('sellIn')}</h4>
      <div className="table-wrap">
        <table className="mini-table">
          <thead>
            <tr><th>{tr('market')}</th><th>{tr('price')}</th><th>{tr('net')}</th><th>{tr('volume')}</th><th>{tr('profit')}</th></tr>
          </thead>
          <tbody>
            {r.sells.map((o) => (
              <tr key={o.market} className={r.sell?.market === o.market ? 'chosen' : o.enoughVolume ? '' : 'dim'}>
                <td><CityTag market={o.market} /></td>
                <td className="num"><Silver value={o.gross} /> <Flag flag={o.flag} current={o.current} /></td>
                <td className="num"><Silver value={o.price} /></td>
                <td className={`num ${o.enoughVolume ? '' : 'warn'}`}>{o.vol.toFixed(1)}</td>
                <td className="num"><Silver value={r.unitCost != null ? o.price - r.unitCost : null} signed /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
