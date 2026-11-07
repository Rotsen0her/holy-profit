import { useState, type ReactNode } from 'react';
import { CRAFT_CITIES, type City } from '../lib/data';
import { focusEfficiency, type Settings } from '../lib/settings';
import { useApp } from './ui';

// Ajustes de cada módulo: una franja con lo que más cambia el resultado y, al desplegar
// «Más ajustes», el resto. Cada módulo guarda su propia configuración (ver ModuleScope en App).

export type SettingsKind = 'produce' | 'flip';

function Seg<T extends string | boolean>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="qs-item">
      <span className="qs-label">{label}</span>
      <div className="seg" role="group" aria-label={label}>
        {options.map(([v, l]) => (
          <button key={String(v)} className={value === v ? 'on' : ''} onClick={() => onChange(v)} aria-pressed={value === v}>
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

function Num({ label, value, onChange, min = 0, max = 100000, step = 1, hint }: { label: string; value: number; onChange: (n: number) => void; min?: number; max?: number; step?: number; hint?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type="number" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Math.min(max, Math.max(min, Number(e.target.value) || 0)))} />
      {hint && <small>{hint}</small>}
    </label>
  );
}

function Choice<T extends string | number>({ label, value, options, onChange, hint }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void; hint?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={String(value)} onChange={(e) => onChange(options.find((o) => String(o[0]) === e.target.value)![0])}>
        {options.map(([v, l]) => (
          <option key={String(v)} value={String(v)}>
            {l}
          </option>
        ))}
      </select>
      {hint && <small>{hint}</small>}
    </label>
  );
}

function MoreSettings({ kind, onReset }: { kind: SettingsKind; onReset: () => void }) {
  const { settings: s, update } = useApp();
  const L = (a: string, b: string) => (s.lang === 'es' ? a : b);
  const cities: [City | 'best', string][] = [['best', L('Automático (mejor)', 'Automatic (best)')], ...CRAFT_CITIES.map((c) => [c, c] as [City, string])];
  const produce = kind === 'produce';

  return (
    <div className="more-settings">
      {produce && (
        <section>
          <h4>{L('Foco y especialización', 'Focus and specialization')}</h4>
          <div className="fields">
            <Num label={L('Maestría de la categoría', 'Category mastery')} value={s.mastery} max={100} onChange={(mastery) => update({ mastery })} />
            <Num label={L('Especialización del objeto', 'Item specialization')} value={s.spec} max={100} onChange={(spec) => update({ spec })} />
            <Num
              label={L('Eficiencia de foco (manual)', 'Focus efficiency (manual)')}
              value={s.fceOverride ?? 0}
              onChange={(n) => update({ fceOverride: n > 0 ? n : null })}
              hint={L(`Calculada: ${focusEfficiency(s)} · deja 0 para usar maestría ×30 + especialización ×250`, `Computed: ${focusEfficiency(s)} · leave 0 to use mastery ×30 + spec ×250`)}
            />
            <Choice<Settings['dailyBonus']>
              label={L('Bono diario de producción', 'Daily production bonus')}
              value={s.dailyBonus}
              options={[[0, '0 %'], [10, '+10 %'], [20, '+20 %']]}
              onChange={(dailyBonus) => update({ dailyBonus })}
            />
          </div>
        </section>
      )}

      {produce && (
        <section>
          <h4>{L('Ciudades', 'Cities')}</h4>
          <div className="fields">
            <Choice label={L('Comprar materiales en', 'Buy materials in')} value={s.buyFrom} options={cities} onChange={(buyFrom) => update({ buyFrom })} />
            <Choice label={L('Producir en', 'Produce in')} value={s.craftIn} options={cities} onChange={(craftIn) => update({ craftIn })} />
          </div>
        </section>
      )}

      {produce && (
        <section>
          <h4>{L('Tarifa de estación por ciudad', 'Station fee per city')}</h4>
          <p className="hint small">{L('Plata por cada 100 de nutrición. Coste = valor del objeto × 0,1125 × tarifa / 100.', 'Silver per 100 nutrition. Cost = item value × 0.1125 × fee / 100.')}</p>
          <div className="fields compact">
            {CRAFT_CITIES.map((c) => (
              <Num key={c} label={c} value={s.stationFee[c]} max={10000} onChange={(n) => update({ stationFee: { ...s.stationFee, [c]: n } })} />
            ))}
          </div>
        </section>
      )}

      <section>
        <h4>{L('Protección contra outliers', 'Outlier protection')}</h4>
        <div className="fields">
          <Num label={L('Días de historial', 'History days')} value={s.historyDays} min={1} max={28} onChange={(historyDays) => update({ historyDays })} hint={L('Para el promedio ponderado por volumen', 'For the volume-weighted average')} />
          <Num label={L('Desviación máxima (%)', 'Max deviation (%)')} value={s.outlierPct} min={5} max={500} onChange={(outlierPct) => update({ outlierPct })} hint={L('Si el precio actual se aleja más que esto del histórico, se usa el histórico', 'If the current price deviates more than this from history, history is used')} />
          <Num label={L('Volumen mínimo diario', 'Min daily volume')} value={s.minVolume} max={10000} step={0.5} onChange={(minVolume) => update({ minVolume })} hint={L('Mercados con menos ventas/día no se eligen para vender', 'Markets with fewer sales/day are not chosen to sell')} />
          <Num label={L('Antigüedad máxima del precio (h)', 'Max price age (h)')} value={s.maxAgeHours} min={1} max={168} onChange={(maxAgeHours) => update({ maxAgeHours })} />
        </div>
      </section>

      <div className="more-foot">
        <span className="muted small">{L('Estos ajustes solo afectan a esta sección.', 'These settings only affect this section.')}</span>
        <button className="btn-gold" onClick={onReset}>
          {L('Restablecer esta sección', 'Reset this section')}
        </button>
      </div>
    </div>
  );
}

export function QuickSettings({ kind = 'produce', extra }: { kind?: SettingsKind; extra?: ReactNode }) {
  const { settings: s, update, tr, reset } = useApp();
  const [open, setOpen] = useState(false);
  const yes = tr('yes');
  const no = tr('no');
  return (
    <div className={`quick-settings ${open ? 'open' : ''}`}>
      <div className="qs-row">
        <Seg label="Premium" value={s.premium} options={[[true, yes], [false, no]]} onChange={(premium) => update({ premium })} />
        {kind === 'produce' && <Seg label={tr('useFocus')} value={s.useFocus} options={[[true, yes], [false, no]]} onChange={(useFocus) => update({ useFocus })} />}
        <Seg label={tr('qsBuy')} value={s.buyMode} options={[['instant', tr('instant')], ['order', tr('order')]]} onChange={(buyMode) => update({ buyMode })} />
        <Seg label={tr('qsSell')} value={s.sellMode} options={[['order', tr('order')], ['instant', tr('instant')]]} onChange={(sellMode) => update({ sellMode })} />
        <Seg label="Black Market" value={s.includeBM} options={[[true, yes], [false, no]]} onChange={(includeBM) => update({ includeBM })} />
        {extra}
        <button className="qs-more" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          ⚙ {tr(open ? 'lessSettings' : 'moreSettings')} <span className="caret">▾</span>
        </button>
      </div>
      {open && <MoreSettings kind={kind} onReset={reset} />}
    </div>
  );
}

// Guía que ocupa el panel de resultados antes del primer cálculo
export function EmptyGuide({ steps }: { steps: string[] }) {
  return (
    <ol className="empty-guide">
      {steps.map((st, i) => (
        <li key={i}>
          <b>{i + 1}</b>
          <span>{st}</span>
        </li>
      ))}
    </ol>
  );
}
