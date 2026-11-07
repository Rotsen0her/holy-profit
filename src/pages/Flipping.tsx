import { useMemo, useState } from 'react';
import { apiDone, fetchCurrent, fetchHistory } from '../lib/api';
import { calcFlips, type FlipResult } from '../lib/calc';
import type { Activity } from '../lib/data';
import { pct } from '../lib/format';
import { buildBook } from '../lib/prices';
import { applyFilters, FilterBar, ItemPreview, useRecipeFilters } from '../components/Filters';
import { EmptyGuide, QuickSettings } from '../components/QuickSettings';
import { CityTag, Flag, ItemIcon, Modal, Panel, PillSelect, Silver, sortBy, Th, useApp, type SortDir } from '../components/ui';

// Flipping solo consulta los propios objetos (sin materiales), así que admite más por cálculo
const MAX_ITEMS = 1200;
const ACTS: Activity[] = ['craft', 'refine', 'cook', 'alchemy'];

export function FlipPage() {
  const { data, settings: s, tr, name } = useApp();
  const [act, setAct] = useState<Activity>('craft');
  const [source, setSource] = useState<'products' | 'materials'>('products');
  const recipes = useMemo(() => data.recipes.filter((r) => r.act === act), [data, act]);
  const filters = useRecipeFilters(recipes);
  const selected = applyFilters(filters, name);
  const ids = useMemo(
    () => (source === 'products' ? selected.map((r) => r.id) : [...new Set(selected.flatMap((r) => r.r.map((x) => x[0])))]),
    [selected, source],
  );
  const quality = act === 'craft' && source === 'products' ? s.quality : 1;
  const [results, setResults] = useState<FlipResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sort, setSort] = useState<[string, SortDir]>(['profit', -1]);
  const [detail, setDetail] = useState<FlipResult | null>(null);

  async function calculate() {
    setBusy(true);
    setError(null);
    try {
      const [cur, his] = await Promise.all([fetchCurrent(s.server, ids, [quality]), fetchHistory(s.server, ids, [quality])]);
      const book = buildBook(cur, his, s, () => quality);
      setResults(ids.map((id) => calcFlips(id, quality, book, s)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      apiDone();
      setBusy(false);
    }
  }

  const getters: Record<string, (r: FlipResult) => number | string | null> = {
    name: (r) => name(r.id),
    buy: (r) => r.best?.buy ?? null,
    sell: (r) => r.best?.sell.price ?? null,
    profit: (r) => r.best?.profit ?? null,
    roi: (r) => r.best?.roi ?? null,
    vol: (r) => r.best?.volTo ?? null,
  };
  // Los resultados ya calculados se filtran en vivo con los filtros actuales
  const idSet = new Set(ids);
  const rows = results ? sortBy(results.filter((r) => r.best && idSet.has(r.id)), getters[sort[0]], sort[1]) : [];

  return (
    <>
      <Panel title={<><span className="step-num">1</span>{tr('stepFlip')}</>} right={<span className="count-badge">{ids.length} {tr('items')}</span>}>
        <div className="filter-bar">
          <PillSelect label={tr('flipSource')} value={act} onChange={(v) => setAct(v as Activity)} options={ACTS.map((a) => ({ value: a, label: tr(a) }))} />
          <PillSelect
            label={`${tr('products')} / ${tr('materials')}`}
            value={source}
            onChange={(v) => setSource(v as 'products' | 'materials')}
            options={[{ value: 'products', label: tr('products') }, { value: 'materials', label: tr('materials') }]}
          />
        </div>
        <FilterBar state={filters} showQuality={act === 'craft' && source === 'products'} />
        <QuickSettings focus={false} />
        <div className="action-row">
          <p className="hint">{ids.length > MAX_ITEMS ? tr('tooMany', { n: ids.length, max: MAX_ITEMS }) : ''}</p>
          <button className="btn-red" disabled={busy || !ids.length || ids.length > MAX_ITEMS} onClick={calculate}>
            {busy ? '…' : tr('calculate')}
          </button>
        </div>
        {error && <p className="error">{error}</p>}
        <ItemPreview items={selected} state={filters} quality={quality} />
      </Panel>

      <Panel className="results" title={<><span className="step-num">2</span>{tr('stepResults')}</>} right={results && <span className="count-badge">{rows.length}</span>}>
        {!results ? (
          <EmptyGuide steps={[tr('guideFlip1'), tr('guideCalc'), tr('guideFlip3')]} />
        ) : (
          <div className="table-wrap">
            <table className="market-table">
              <thead>
                <tr>
                  <Th k="name" sort={sort} setSort={setSort} className="col-item">{tr('item')}</Th>
                  <th><span className="th-pill static">{tr('from')}</span></th>
                  <Th k="buy" sort={sort} setSort={setSort}>{tr('buy')}</Th>
                  <th><span className="th-pill static">{tr('to')}</span></th>
                  <Th k="sell" sort={sort} setSort={setSort}>{tr('netSell')}</Th>
                  <Th k="profit" sort={sort} setSort={setSort}>{tr('profit')}</Th>
                  <Th k="roi" sort={sort} setSort={setSort}>{tr('roi')}</Th>
                  <Th k="vol" sort={sort} setSort={setSort}>{tr('volume')}</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const b = r.best!;
                  return (
                    <tr key={r.id} className="clickable" onClick={() => setDetail(r)}>
                      <td className="col-item">
                        <div className="item-cell">
                          <ItemIcon id={r.id} quality={quality} />
                          <div className="item-name">{name(r.id)}</div>
                        </div>
                      </td>
                      <td><CityTag market={b.from} /></td>
                      <td className="num">
                        <Silver value={b.buy} /> {b.suspicious && <span className="warn" title={tr('suspicious')}>⚠</span>}
                      </td>
                      <td><CityTag market={b.to} /></td>
                      <td className="num"><Silver value={b.sell.price} /> <Flag flag={b.sell.flag} current={b.sell.current} /></td>
                      <td className="num big"><Silver value={b.profit} signed /></td>
                      <td className={`num ${b.roi >= 0 ? 'pos' : 'neg'}`}>{pct(b.roi, 0)}</td>
                      <td className="num">{b.volTo.toFixed(1)}</td>
                    </tr>
                  );
                })}
                {!rows.length && (
                  <tr><td colSpan={8} className="empty">{tr('noResults')}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {detail && (
        <Modal onClose={() => setDetail(null)}>
          <div className="detail-head">
            <ItemIcon id={detail.id} quality={quality} size={80} />
            <div>
              <h3>{name(detail.id)}</h3>
              <p className="muted">{detail.id} · {tr('routes')}: {detail.routes.length}</p>
            </div>
          </div>
          <div className="table-wrap">
            <table className="mini-table">
              <thead>
                <tr><th>{tr('from')}</th><th>{tr('buy')}</th><th>{tr('history')}</th><th>{tr('to')}</th><th>{tr('net')}</th><th>{tr('profit')}</th><th>{tr('volume')}</th></tr>
              </thead>
              <tbody>
                {detail.routes.slice(0, 30).map((rt) => (
                  <tr key={rt.from + rt.to}>
                    <td><CityTag market={rt.from} /></td>
                    <td className="num"><Silver value={rt.buy} /> {rt.suspicious && <span className="warn" title={tr('suspicious')}>⚠</span>}</td>
                    <td className="num"><Silver value={rt.buyVwap} /></td>
                    <td><CityTag market={rt.to} /></td>
                    <td className="num"><Silver value={rt.sell.price} /> <Flag flag={rt.sell.flag} current={rt.sell.current} /></td>
                    <td className="num"><Silver value={rt.profit} signed /></td>
                    <td className="num">{rt.volTo.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Modal>
      )}
    </>
  );
}
