import { CRAFT_CITIES, type City } from '../lib/data';
import { focusEfficiency, type Settings } from '../lib/settings';
import { Panel, useApp } from '../components/ui';

function Num({ label, value, onChange, min = 0, max = 100000, step = 1, hint }: { label: string; value: number; onChange: (n: number) => void; min?: number; max?: number; step?: number; hint?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type="number" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Math.min(max, Math.max(min, Number(e.target.value) || 0)))} />
      {hint && <small>{hint}</small>}
    </label>
  );
}

function Toggle({ label, value, onChange, hint }: { label: string; value: boolean; onChange: (b: boolean) => void; hint?: string }) {
  return (
    <label className="field toggle">
      <span>{label}</span>
      <button type="button" className={`switch ${value ? 'on' : ''}`} onClick={() => onChange(!value)} aria-pressed={value}>
        <i />
      </button>
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
          <option key={String(v)} value={String(v)}>{l}</option>
        ))}
      </select>
      {hint && <small>{hint}</small>}
    </label>
  );
}

export function SettingsPage({ onReset }: { onReset: () => void }) {
  const { settings: s, update } = useApp();
  const es = s.lang === 'es';
  const L = (a: string, b: string) => (es ? a : b);
  const cities: [City | 'best', string][] = [['best', L('Automático (mejor)', 'Automatic (best)')], ...CRAFT_CITIES.map((c) => [c, c] as [City, string])];

  return (
    <>
      <Panel title={L('Cuenta y foco', 'Account and focus')}>
        <div className="fields">
          <Toggle label="Premium" value={s.premium} onChange={(premium) => update({ premium })} hint={L('Impuesto de venta 4 % con premium, 8 % sin premium', 'Sales tax 4% with premium, 8% without')} />
          <Toggle label={L('Usar foco', 'Use focus')} value={s.useFocus} onChange={(useFocus) => update({ useFocus })} hint={L('Suma +59 % de bono de producción', 'Adds +59% production bonus')} />
          <Num label={L('Maestría de la categoría', 'Category mastery')} value={s.mastery} max={100} onChange={(mastery) => update({ mastery })} />
          <Num label={L('Especialización del objeto', 'Item specialization')} value={s.spec} max={100} onChange={(spec) => update({ spec })} />
          <Num
            label={L('Eficiencia de foco (manual)', 'Focus efficiency (manual)')}
            value={s.fceOverride ?? 0}
            max={100000}
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
      </Panel>

      <Panel title={L('Compra, producción y venta', 'Buying, production and selling')}>
        <div className="fields">
          <Choice<Settings['buyMode']>
            label={L('Comprar materiales', 'Buy materials')}
            value={s.buyMode}
            options={[['instant', L('Al instante (orden de venta más barata)', 'Instantly (cheapest sell order)')], ['order', L('Con orden de compra (+2,5 %)', 'With buy order (+2.5%)')]]}
            onChange={(buyMode) => update({ buyMode })}
          />
          <Choice label={L('Ciudad de compra', 'Buying city')} value={s.buyFrom} options={cities} onChange={(buyFrom) => update({ buyFrom })} />
          <Choice label={L('Ciudad de producción', 'Production city')} value={s.craftIn} options={cities} onChange={(craftIn) => update({ craftIn })} />
          <Choice<Settings['sellMode']>
            label={L('Vender', 'Sell')}
            value={s.sellMode}
            options={[['order', L('Con orden de venta (impuesto + 2,5 %)', 'With sell order (tax + 2.5%)')], ['instant', L('Al instante a orden de compra', 'Instantly to buy order')]]}
            onChange={(sellMode) => update({ sellMode })}
          />
          <Toggle label={L('Incluir Black Market', 'Include Black Market')} value={s.includeBM} onChange={(includeBM) => update({ includeBM })} />
        </div>
      </Panel>

      <Panel title={L('Tarifa de estación por ciudad', 'Station fee per city')}>
        <p className="hint">{L('Plata por cada 100 de nutrición. Coste = valor del objeto × 0,1125 × tarifa / 100.', 'Silver per 100 nutrition. Cost = item value × 0.1125 × fee / 100.')}</p>
        <div className="fields">
          {CRAFT_CITIES.map((c) => (
            <Num key={c} label={c} value={s.stationFee[c]} max={10000} onChange={(n) => update({ stationFee: { ...s.stationFee, [c]: n } })} />
          ))}
        </div>
      </Panel>

      <Panel title={L('Protección contra outliers', 'Outlier protection')}>
        <div className="fields">
          <Num label={L('Días de historial', 'History days')} value={s.historyDays} min={1} max={28} onChange={(historyDays) => update({ historyDays })} hint={L('Para el promedio ponderado por volumen', 'For the volume-weighted average')} />
          <Num label={L('Desviación máxima (%)', 'Max deviation (%)')} value={s.outlierPct} min={5} max={500} onChange={(outlierPct) => update({ outlierPct })} hint={L('Si el precio actual se aleja más que esto del histórico, se usa el histórico', 'If the current price deviates more than this from history, history is used')} />
          <Num label={L('Volumen mínimo diario', 'Min daily volume')} value={s.minVolume} min={0} max={10000} step={0.5} onChange={(minVolume) => update({ minVolume })} hint={L('Mercados con menos ventas/día no se eligen para vender', 'Markets with fewer sales/day are not chosen to sell')} />
          <Num label={L('Antigüedad máxima del precio (h)', 'Max price age (h)')} value={s.maxAgeHours} min={1} max={168} onChange={(maxAgeHours) => update({ maxAgeHours })} />
        </div>
      </Panel>

      <div className="center">
        <button className="btn-gold" onClick={onReset}>{L('Restablecer ajustes', 'Reset settings')}</button>
      </div>
    </>
  );
}
