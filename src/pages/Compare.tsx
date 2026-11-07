import { useEffect, useMemo, useState } from 'react';
import { apiDone, fetchCurrent, fetchHistory } from '../lib/api';
import { CRAFT_CITIES } from '../lib/data';
import { QUALITIES } from '../lib/i18n';
import { ageLabel, roman } from '../lib/format';
import { bookKey, buildBook, type Book } from '../lib/prices';
import { familyKey, normalize } from '../components/Filters';
import { CityTag, ItemIcon, Panel, PillSelect, Silver, useApp } from '../components/ui';

// Comparador de precios de compra para uso personal: arma una lista (tu build, comida, pociones…)
// y mira en qué ciudad sale más barato cada cosa y el total por ciudad.

interface Entry {
  id: string;
  q: number; // calidad
  n: number; // cantidad
}
interface SavedBuild {
  name: string;
  items: Entry[];
}
interface CatItem {
  id: string;
  t: number;
  e: number;
  hasQuality: boolean;
}

const STORE = 'holy-profit-compare';
const SUGGEST_MAX = 48;

function load(): { items: Entry[]; builds: SavedBuild[] } {
  try {
    const v = JSON.parse(localStorage.getItem(STORE) ?? '');
    if (Array.isArray(v.items) && Array.isArray(v.builds)) return v;
  } catch {
    /* sin datos guardados */
  }
  return { items: [], builds: [] };
}

const tierOf = (id: string) => Number(/^T(\d+)/.exec(id)?.[1] ?? 0);
const enchOf = (id: string) => Number(/@(\d+)$/.exec(id)?.[1] ?? 0);

export function ComparePage() {
  const { data, settings: s, tr, name } = useApp();
  const lang = s.lang;
  const [{ items, builds }, setStore] = useState(load);
  const [q, setQ] = useState('');
  const [tier, setTier] = useState('');
  const [ench, setEnch] = useState('');
  const [book, setBook] = useState<Book | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [buildName, setBuildName] = useState('');
  const [orBetter, setOrBetter] = useState(true);
  const [maxAge, setMaxAge] = useState(72);

  useEffect(() => {
    try {
      localStorage.setItem(STORE, JSON.stringify({ items, builds }));
    } catch {
      /* almacenamiento no disponible */
    }
  }, [items, builds]);

  const setItems = (fn: (xs: Entry[]) => Entry[]) => setStore((st) => ({ ...st, items: fn(st.items) }));

  // Catálogo: todo lo que se puede fabricar más sus materiales
  const catalog = useMemo(() => {
    const m = new Map<string, CatItem>();
    for (const r of data.recipes) {
      m.set(r.id, { id: r.id, t: r.t, e: r.e, hasQuality: r.act === 'craft' });
      for (const [res] of r.r) if (!m.has(res) && data.names[res]) m.set(res, { id: res, t: tierOf(res), e: enchOf(res), hasQuality: false });
    }
    return m;
  }, [data]);

  const families = useMemo(() => {
    const m = new Map<string, CatItem[]>();
    for (const c of catalog.values()) {
      const k = familyKey(c.id);
      const arr = m.get(k) ?? [];
      arr.push(c);
      m.set(k, arr);
    }
    return m;
  }, [catalog]);

  const words = normalize(q).split(/\s+/).filter(Boolean);
  const suggestions = useMemo(() => {
    if (!words.length) return [];
    const out: CatItem[] = [];
    for (const c of catalog.values()) {
      if (tier && c.t !== Number(tier)) continue;
      if (ench && c.e !== Number(ench)) continue;
      const hay = normalize(`${name(c.id)} ${c.id}`);
      if (words.every((w) => hay.includes(w))) out.push(c);
    }
    return out.sort((a, b) => a.t - b.t || a.e - b.e || name(a.id).localeCompare(name(b.id)));
  }, [catalog, q, tier, ench, name]);

  function add(c: CatItem) {
    setItems((xs) => (xs.some((x) => x.id === c.id) ? xs.map((x) => (x.id === c.id ? { ...x, n: x.n + 1 } : x)) : [...xs, { id: c.id, q: c.hasQuality ? s.quality : 1, n: 1 }]));
  }
  const patch = (i: number, p: Partial<Entry>) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const remove = (i: number) => setItems((xs) => xs.filter((_, j) => j !== i));

  // Cambia de nivel o encantamiento dentro de la misma familia
  function variant(i: number, t: number, e: number) {
    const cur = items[i];
    const fam = families.get(familyKey(cur.id)) ?? [];
    const hit = fam.find((c) => c.t === t && c.e === e) ?? fam.find((c) => c.t === t);
    if (hit && !items.some((x, j) => j !== i && x.id === hit.id)) patch(i, { id: hit.id });
  }

  async function query() {
    setBusy(true);
    setError(null);
    try {
      const ids = items.map((x) => x.id);
      // Se piden todas las calidades: permite usar una calidad superior si es más barata o la única en venta
      const qs = [1, 2, 3, 4, 5];
      const [cur, his] = await Promise.all([fetchCurrent(s.server, ids, qs), fetchHistory(s.server, ids, qs)]);
      const s2 = { ...s, maxAgeHours: maxAge };
      const merged: Book = new Map();
      for (const qq of qs) for (const [k, v] of buildBook(cur, his, s2, () => qq)) merged.set(k, v);
      setBook(merged);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      apiDone();
      setBusy(false);
    }
  }

  // Precio de compra inmediata (orden de venta más barata) por objeto y ciudad
  const th = s.outlierPct / 100;
  const rows = items.map((x) => {
    const cells = CRAFT_CITIES.map((c) => {
      // Calidad pedida o, si está activado, cualquier calidad superior (la más barata)
      const quals = orBetter && catalog.get(x.id)?.hasQuality ? [1, 2, 3, 4, 5].filter((qq) => qq >= x.q) : [x.q];
      let pick: { qq: number; st: NonNullable<ReturnType<Book['get']>>[typeof c] } | null = null;
      for (const qq of quals) {
        const st = book?.get(bookKey(x.id, qq))?.[c];
        if (st?.sellMin != null && (!pick || st.sellMin < pick.st!.sellMin!)) pick = { qq, st };
      }
      const own = book?.get(bookKey(x.id, x.q))?.[c];
      const st = pick?.st ?? own;
      const price = st?.sellMin ?? null;
      const vwap = st?.vwap ?? own?.vwap ?? null;
      const dev = price != null && vwap != null ? price / vwap - 1 : null;
      return { city: c, price, vwap, age: st?.sellAge ?? null, dev, qq: pick?.qq ?? x.q };
    });
    const avail = cells.filter((c) => c.price != null);
    const best = avail.length ? avail.reduce((a, b) => (b.price! < a.price! ? b : a)) : null;
    const worst = avail.length ? avail.reduce((a, b) => (b.price! > a.price! ? b : a)) : null;
    return { x, cells, best, worst };
  });

  const totals = CRAFT_CITIES.map((c, ci) => {
    let sum = 0;
    let missing = 0;
    for (const r of rows) {
      const p = r.cells[ci].price;
      if (p == null) missing++;
      else sum += p * r.x.n;
    }
    return { city: c, sum, missing };
  });
  const complete = totals.filter((t) => t.missing === 0 && rows.length > 0);
  const bestCity = complete.length ? complete.reduce((a, b) => (b.sum < a.sum ? b : a)) : null;
  const mixedMissing = rows.filter((r) => !r.best).length;
  const mixed = rows.reduce((a, r) => a + (r.best ? r.best.price! * r.x.n : 0), 0);
  const savings = rows.reduce((a, r) => a + (r.best && r.worst ? (r.worst.price! - r.best.price!) * r.x.n : 0), 0);

  function saveBuild() {
    const nm = buildName.trim();
    if (!nm || !items.length) return;
    setStore((st) => ({ ...st, builds: [...st.builds.filter((b) => b.name !== nm), { name: nm, items: st.items }] }));
    setBuildName('');
  }

  const qualityOpts = QUALITIES.map((ql, i) => ({ value: String(i + 1), label: ql[lang === 'es' ? 0 : 1] }));

  return (
    <>
      <Panel title={<><span className="step-num">1</span>{tr('stepCompare')}</>} right={<span className="count-badge">{items.length} {tr('items')}</span>}>
        <p className="hint">{tr('compareIntro')}</p>
        <div className="filter-bar" style={{ marginTop: 12 }}>
          <label className="pill search">
            <input value={q} placeholder={tr('addItem')} onChange={(e) => setQ(e.target.value)} />
            {q && (
              <button className="pill-reset" onClick={() => setQ('')} aria-label="reset">
                ⟲
              </button>
            )}
          </label>
          <PillSelect label={tr('tier')} value={tier} onChange={setTier} options={[{ value: '', label: `${tr('tier')}: ${tr('all')}` }, ...[1, 2, 3, 4, 5, 6, 7, 8].map((x) => ({ value: String(x), label: `${tr('tier')} ${roman(x)}` }))]} />
          <PillSelect label={tr('enchant')} value={ench} onChange={setEnch} options={[{ value: '', label: `${tr('enchant')}: ${tr('all')}` }, ...[0, 1, 2, 3, 4].map((x) => ({ value: String(x), label: `${tr('enchant')} .${x}` }))]} />
        </div>

        {words.length > 0 && (
          <div className="preview">
            <div className="preview-head">
              <b>{tr('matches', { n: suggestions.length })}</b>
              <span className="muted small">{tr('clickToAdd')}</span>
            </div>
            {suggestions.length === 0 ? (
              <p className="muted small">{tr('noMatches')}</p>
            ) : (
              <div className="preview-grid">
                {suggestions.slice(0, SUGGEST_MAX).map((c) => {
                  const inList = items.some((x) => x.id === c.id);
                  return (
                    <button key={c.id} className={`preview-item ${inList ? 'on' : ''}`} title={`${name(c.id)} (${c.id})`} onClick={() => add(c)}>
                      <ItemIcon id={c.id} size={48} />
                      <span className="preview-name">{name(c.id)}</span>
                      <span className="item-sub">
                        {c.t > 0 && <span className={`tier t${c.t}`}>{roman(c.t)}</span>}
                        {c.e > 0 && <span className={`ench e${c.e}`}>.{c.e}</span>}
                        {inList && <span className="pos">✓</span>}
                      </span>
                    </button>
                  );
                })}
                {suggestions.length > SUGGEST_MAX && <div className="preview-more">+{suggestions.length - SUGGEST_MAX}</div>}
              </div>
            )}
          </div>
        )}

        <div className="build-bar">
          {builds.map((b) => (
            <span key={b.name} className="build-chip">
              <button onClick={() => setStore((st) => ({ ...st, items: b.items }))} title={tr('loadBuild')}>
                {b.name} <small>({b.items.length})</small>
              </button>
              <button className="x" onClick={() => setStore((st) => ({ ...st, builds: st.builds.filter((x) => x.name !== b.name) }))} aria-label={tr('delete')} title={tr('delete')}>
                ✕
              </button>
            </span>
          ))}
          <label className="pill search build-name">
            <input value={buildName} placeholder={tr('buildName')} onChange={(e) => setBuildName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveBuild()} />
          </label>
          <button className="btn-gold" disabled={!buildName.trim() || !items.length} onClick={saveBuild}>
            {tr('saveBuild')}
          </button>
        </div>

        <div className="action-row">
          <p className="hint">{items.length ? '' : tr('emptyList')}</p>
          <div style={{ display: 'flex', gap: 10 }}>
            {items.length > 0 && (
              <button className="btn-gold" onClick={() => setItems(() => [])}>
                {tr('clearList')}
              </button>
            )}
            <button className="btn-red" disabled={busy || !items.length} onClick={query}>
              {busy ? '…' : tr('checkPrices')}
            </button>
          </div>
        </div>
        {error && <p className="error">{error}</p>}
      </Panel>

      {items.length > 0 && (
        <Panel className="results" title={<><span className="step-num">2</span>{tr('stepCompare2')}</>}>
          <div className="results-bar">
            <label className="check">
              <input type="checkbox" checked={orBetter} onChange={(e) => setOrBetter(e.target.checked)} />
              {tr('orBetter')}
            </label>
            <PillSelect
              label={tr('maxAge')}
              value={String(maxAge)}
              onChange={(v) => {
                setMaxAge(Number(v));
                setBook(null);
              }}
              options={[6, 24, 72, 168].map((h) => ({ value: String(h), label: `${tr('maxAge')}: ${h < 48 ? `${h} h` : `${h / 24} ${tr('days')}`}` }))}
            />
          </div>
          {book && (
            <div className="compare-summary">
              <div>
                <span className="muted small">{tr('mixedTotal')}</span>
                <b className="num big">
                  <Silver value={mixed} />
                </b>
                {mixedMissing > 0 && <span className="warn small">{tr('missingN', { n: mixedMissing })}</span>}
              </div>
              <div>
                <span className="muted small">{tr('bestSingleCity')}</span>
                {bestCity ? (
                  <b className="num big">
                    <CityTag market={bestCity.city} /> <Silver value={bestCity.sum} />
                  </b>
                ) : (
                  <span className="muted">{tr('noCityHasAll')}</span>
                )}
              </div>
              <div>
                <span className="muted small">{tr('savingVsWorst')}</span>
                <b className="num big pos">
                  <Silver value={savings} />
                </b>
              </div>
            </div>
          )}
          <div className="table-wrap">
            <table className="market-table compare-table">
              <thead>
                <tr>
                  <th className="col-item">
                    <span className="th-pill static">{tr('item')}</span>
                  </th>
                  <th>
                    <span className="th-pill static">{tr('qty')}</span>
                  </th>
                  {CRAFT_CITIES.map((c) => (
                    <th key={c}>
                      <CityTag market={c} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const c = catalog.get(r.x.id);
                  const fam = families.get(familyKey(r.x.id)) ?? [];
                  const tiers = [...new Set(fam.map((f) => f.t))].sort((a, b) => a - b);
                  const enchs = [...new Set(fam.filter((f) => f.t === (c?.t ?? 0)).map((f) => f.e))].sort((a, b) => a - b);
                  return (
                    <tr key={r.x.id}>
                      <td className="col-item">
                        <div className="item-cell">
                          <ItemIcon id={r.x.id} quality={r.x.q} size={48} />
                          <div>
                            <div className="item-name">{name(r.x.id)}</div>
                            <div className="row-controls">
                              {tiers.length > 1 && (
                                <select value={c?.t} onChange={(e) => variant(i, Number(e.target.value), c?.e ?? 0)} aria-label={tr('tier')}>
                                  {tiers.map((t) => (
                                    <option key={t} value={t}>
                                      T{t}
                                    </option>
                                  ))}
                                </select>
                              )}
                              {enchs.length > 1 && (
                                <select value={c?.e} onChange={(e) => variant(i, c?.t ?? 0, Number(e.target.value))} aria-label={tr('enchant')}>
                                  {enchs.map((x) => (
                                    <option key={x} value={x}>
                                      .{x}
                                    </option>
                                  ))}
                                </select>
                              )}
                              {c?.hasQuality && (
                                <select value={r.x.q} onChange={(e) => patch(i, { q: Number(e.target.value) })} aria-label={tr('quality')}>
                                  {qualityOpts.map((o) => (
                                    <option key={o.value} value={o.value}>
                                      {o.label}
                                    </option>
                                  ))}
                                </select>
                              )}
                              <button className="link-btn" onClick={() => remove(i)}>
                                {tr('remove')}
                              </button>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <input className="qty-input" type="number" min={1} value={r.x.n} onChange={(e) => patch(i, { n: Math.max(1, Math.floor(Number(e.target.value) || 1)) })} />
                      </td>
                      {r.cells.map((cell) => {
                        const isBest = r.best?.city === cell.city;
                        const high = cell.dev != null && cell.dev > th;
                        const low = cell.dev != null && cell.dev < -th;
                        const title = [
                          cell.age != null ? `${tr('updated')}: ${ageLabel(cell.age)}` : '',
                          cell.vwap != null ? `${tr('history')}: ${Math.round(cell.vwap).toLocaleString('es-ES')}` : '',
                          high ? tr('aboveHist') : low ? tr('belowHist') : '',
                        ]
                          .filter(Boolean)
                          .join(' · ');
                        return (
                          <td key={cell.city} className={`num price-cell ${isBest ? 'best' : ''}`} title={title}>
                            {cell.price != null ? (
                              <>
                                <Silver value={cell.price} />
                                {cell.qq !== r.x.q && (
                                  <span className="q-badge" title={QUALITIES[cell.qq - 1][lang === 'es' ? 0 : 1]}>
                                    {QUALITIES[cell.qq - 1][lang === 'es' ? 0 : 1].slice(0, 3)}
                                  </span>
                                )}
                                {high && <span className="warn" aria-label={tr('aboveHist')}> ▲</span>}
                                {low && <span className="pos" aria-label={tr('belowHist')}> ▼</span>}
                              </>
                            ) : cell.vwap != null ? (
                              <span className="muted" title={tr('onlyHistory')}>
                                ≈<Silver value={cell.vwap} />
                              </span>
                            ) : (
                              <span className="muted">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
              {book && (
                <tfoot>
                  <tr>
                    <td className="col-item">
                      <b>{tr('totalPerCity')}</b>
                    </td>
                    <td />
                    {totals.map((t) => (
                      <td key={t.city} className={`num price-cell ${bestCity?.city === t.city ? 'best' : ''}`}>
                        <Silver value={t.sum} />
                        {t.missing > 0 && <div className="warn small">{tr('missingN', { n: t.missing })}</div>}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          {!book && <p className="empty">{tr('pressCheck')}</p>}
          {book && (
            <p className="hint small" style={{ marginTop: 10 }}>
              {tr('compareLegend', { pct: s.outlierPct, h: maxAge })}
            </p>
          )}
          {book && (
            <p className="hint small" style={{ marginTop: 6 }}>
              {tr('dataSource')}{' '}
              <a href="https://www.albion-online-data.com/" target="_blank" rel="noreferrer">
                albion-online-data.com
              </a>
            </p>
          )}
        </Panel>
      )}
    </>
  );
}

