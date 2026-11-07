import { ItemIcon, Panel, useApp } from '../components/ui';

const CARDS = [
  { page: 'craft', icon: 'T6_2H_CLAYMORE@2', es: 'Armas, armaduras, bolsas, capas, monturas y herramientas, con artefactos y encantamientos.', en: 'Weapons, armor, bags, capes, mounts and tools, with artifacts and enchantments.' },
  { page: 'refine', icon: 'T6_PLANKS_LEVEL1@1', es: 'Tablas, lingotes, tela, cuero y bloques. Incluye el bono del +40 % de cada ciudad.', en: 'Planks, bars, cloth, leather and blocks. Includes each city’s +40% bonus.' },
  { page: 'cook', icon: 'T8_MEAL_STEW@1', es: 'Comidas e ingredientes (pan, harina, mantequilla, alcohol) con salsas de pescado.', en: 'Food and ingredients (bread, flour, butter, alcohol) with fish sauces.' },
  { page: 'alchemy', icon: 'T6_POTION_HEAL@1', es: 'Pociones de curación, energía, resistencia y más, con extractos arcanos.', en: 'Healing, energy, resistance potions and more, with arcane extracts.' },
  { page: 'compare', icon: 'T8_MAIN_SWORD@1', es: 'Para uso personal: arma tu build y mira en qué ciudad sale más barato comprarla.', en: 'For personal use: build your loadout and see which city sells it cheapest.' },
  { page: 'flip', icon: 'T8_BAG', es: 'Compra barato en una ciudad y vende caro en otra o en el Black Market.', en: 'Buy low in one city and sell high in another or the Black Market.' },
];

export function HomePage({ go }: { go: (p: string) => void }) {
  const { settings, tr } = useApp();
  const es = settings.lang === 'es';
  return (
    <>
      <Panel title={es ? 'Bienvenido a Holy Profit' : 'Welcome to Holy Profit'}>
        <p>
          {es
            ? 'Elige una actividad y la calculadora busca, con precios reales del Albion Online Data Project, dónde te sale más barato comprar cada material, en qué ciudad conviene producir (bono de ciudad, foco y tarifa de estación) y dónde se vende más caro.'
            : 'Pick an activity and the calculator uses real Albion Online Data Project prices to find where each material is cheapest, which city is best to produce in (city bonus, focus and station fee) and where it sells for the most.'}
        </p>
        {[
          ['navProduce', ['craft', 'refine', 'cook', 'alchemy']],
          ['navTrade', ['flip', 'compare']],
        ].map(([group, pages]) => (
          <section key={group as string} className="card-section">
            <h3>{tr(group as string)}</h3>
            <div className={`cards n${pages.length}`}>
              {CARDS.filter((c) => (pages as string[]).includes(c.page)).map((c) => (
                <button key={c.page} className="card" onClick={() => go(c.page)}>
                  <ItemIcon id={c.icon} size={64} />
                  <div>
                    <strong>{tr(c.page)}</strong>
                    <span>{es ? c.es : c.en}</span>
                  </div>
                </button>
              ))}
            </div>
          </section>
        ))}
      </Panel>

      <Panel title={es ? '¿Cómo evita los outliers?' : 'How are outliers avoided?'}>
        <ul className="bullets">
          {es ? (
            <>
              <li><b>Promedio ponderado por volumen</b> de los últimos días (historial del API): un único objeto a precio absurdo casi no pesa.</li>
              <li>Los <b>días anómalos</b> del historial (p. ej. 13 ventas a 1,9 m cuando lo normal son 55 k) se descartan comparándolos con la mediana.</li>
              <li>El <b>precio actual</b> solo se usa si está a menos del % configurado del histórico; si no, se usa el valor más conservador y se marca con un punto rojo.</li>
              <li>Los mercados con <b>pocas ventas diarias</b> no se eligen para vender, aunque muestren el precio más alto.</li>
              <li>Los precios con más de 24 h de antigüedad se ignoran (configurable).</li>
            </>
          ) : (
            <>
              <li><b>Volume-weighted average</b> over recent days (API history): a single item at an absurd price barely counts.</li>
              <li><b>Anomalous days</b> in history (e.g. 13 sales at 1.9m when normal is 55k) are dropped by comparing them to the median.</li>
              <li>The <b>current price</b> is only used if it is within the configured % of history; otherwise the most conservative value is used and marked with a red dot.</li>
              <li>Markets with <b>few daily sales</b> are not chosen to sell, even if they show the highest price.</li>
              <li>Prices older than 24 h are ignored (configurable).</li>
            </>
          )}
        </ul>
        <div className="legend">
          <span><i className="flag flag-ok" /> {tr('flagOk')}</span>
          <span><i className="flag flag-outlier" /> {es ? 'Outlier descartado' : 'Outlier discarded'}</span>
          <span><i className="flag flag-hist" /> {es ? 'Solo histórico' : 'History only'}</span>
          <span><i className="flag flag-nohist" /> {es ? 'Sin verificar' : 'Unverified'}</span>
        </div>
      </Panel>

      <Panel title={es ? 'Ayuda a mantener los precios al día' : 'Help keep prices fresh'}>
        <p>
          {es
            ? 'Los precios los suben jugadores con el cliente del Albion Data Project. Si lo ejecutas mientras juegas y abres los mercados, tus datos mejoran los cálculos de todos.'
            : 'Prices are uploaded by players running the Albion Data Project client. Running it while you browse markets improves everyone’s calculations.'}
        </p>
        <div className="center">
          <a className="btn-gold" href="https://www.albion-online-data.com/" target="_blank" rel="noreferrer">
            {es ? 'Descargar el cliente' : 'Download the client'}
          </a>
        </div>
      </Panel>
    </>
  );
}
