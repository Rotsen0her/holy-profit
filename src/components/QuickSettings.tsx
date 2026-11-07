import type { ReactNode } from 'react';
import { useApp } from './ui';

// Ajustes que más cambian el resultado, a mano en cada calculadora (el resto sigue en Ajustes)
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

export function QuickSettings({ focus = true, extra }: { focus?: boolean; extra?: ReactNode }) {
  const { settings: s, update, tr } = useApp();
  const yes = tr('yes');
  const no = tr('no');
  return (
    <div className="quick-settings">
      <Seg label="Premium" value={s.premium} options={[[true, yes], [false, no]]} onChange={(premium) => update({ premium })} />
      {focus && <Seg label={tr('useFocus')} value={s.useFocus} options={[[true, yes], [false, no]]} onChange={(useFocus) => update({ useFocus })} />}
      <Seg label={tr('qsBuy')} value={s.buyMode} options={[['instant', tr('instant')], ['order', tr('order')]]} onChange={(buyMode) => update({ buyMode })} />
      <Seg label={tr('qsSell')} value={s.sellMode} options={[['order', tr('order')], ['instant', tr('instant')]]} onChange={(sellMode) => update({ sellMode })} />
      <Seg label="Black Market" value={s.includeBM} options={[[true, yes], [false, no]]} onChange={(includeBM) => update({ includeBM })} />
      {extra}
      <a className="qs-more" href="#settings">
        ⚙ {tr('moreSettings')}
      </a>
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
