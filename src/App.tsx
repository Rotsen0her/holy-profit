import { useCallback, useEffect, useMemo, useState } from 'react';
import { onApiStatus, type Server } from './lib/api';
import { loadGameData, type Activity, type GameData } from './lib/data';
import { t } from './lib/i18n';
import { useSettings, type Lang } from './lib/settings';
import { Ctx, type AppCtx } from './components/ui';
import { iconUrl } from './lib/data';
import { HomePage } from './pages/Home';
import { ProductionPage } from './pages/Production';
import { FlipPage } from './pages/Flipping';
import { ComparePage } from './pages/Compare';
import { SettingsPage } from './pages/SettingsPage';

const PAGES = ['home', 'craft', 'refine', 'cook', 'alchemy', 'flip', 'compare', 'settings'] as const;
type Page = (typeof PAGES)[number];

// Pestañas agrupadas por propósito, con el icono de un objeto representativo
const NAV: { group: string | null; pages: [Page, string | null][] }[] = [
  { group: null, pages: [['home', null]] },
  { group: 'navProduce', pages: [['craft', 'T6_2H_CLAYMORE@2'], ['refine', 'T6_PLANKS_LEVEL1@1'], ['cook', 'T8_MEAL_STEW@1'], ['alchemy', 'T6_POTION_HEAL@1']] },
  { group: 'navTrade', pages: [['flip', 'T8_BAG'], ['compare', 'T8_MAIN_SWORD@1']] },
];

const readHash = (): Page => {
  const h = location.hash.slice(1) as Page;
  return PAGES.includes(h) ? h : 'home';
};

export default function App() {
  const [settings, update, reset] = useSettings();
  const [page, setPage] = useState<Page>(readHash);
  const [data, setData] = useState<GameData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [apiStatus, setApiStatus] = useState<string | null>(null);

  useEffect(() => {
    loadGameData().then(setData, (e) => setLoadError(String(e)));
    onApiStatus(setApiStatus);
    const onHash = () => setPage(readHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = useCallback((p: string) => {
    location.hash = p;
  }, []);

  const lang = settings.lang;
  const ctx = useMemo<AppCtx | null>(() => {
    if (!data) return null;
    const li = lang === 'es' ? 1 : 0;
    return {
      settings,
      update,
      data,
      name: (id) => data.names[id]?.[li] ?? id,
      tr: (key, vars) => t(lang, key, vars),
    };
  }, [data, settings, update, lang]);

  return (
    <div className="app">
      <header className="top-bar">
        <a className="brand" href="#home">
          <div className="avatar">
            <img src="https://render.albiononline.com/v1/item/T8_MOUNT_MAMMOTH_TRANSPORT.png?size=96&quality=5" alt="" />
          </div>
          <div>
            <h1>Holy Profit</h1>
            <p>{t(lang, 'subtitle')}</p>
          </div>
        </a>
        <div className="top-controls">
          <label className="pill dark">
            <span className="pill-label">{t(lang, 'server')}</span>
            <select value={settings.server} onChange={(e) => update({ server: e.target.value as Server })}>
              <option value="west">Americas (West)</option>
              <option value="europe">Europe</option>
              <option value="east">Asia (East)</option>
            </select>
          </label>
          <a href="#settings" className={`settings-btn ${page === 'settings' ? 'on' : ''}`}>
            ⚙ <span>{t(lang, 'settings')}</span>
          </a>
          <div className="lang-switch">
            {(['es', 'en'] as Lang[]).map((l) => (
              <button key={l} className={lang === l ? 'on' : ''} onClick={() => update({ lang: l })}>
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </header>

      <nav className="tabs">
        {NAV.map((g, gi) => (
          <div key={gi} className="tab-group">
            {g.group && <span className="tab-group-label">{t(lang, g.group)}</span>}
            <div className="tab-group-items">
              {g.pages.map(([p, icon]) => (
                <a key={p} href={`#${p}`} className={page === p ? 'active' : ''}>
                  {icon ? <img src={iconUrl(icon, 1, 64)} alt="" /> : <span className="home-ico">⌂</span>}
                  {t(lang, p)}
                </a>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <main>
        {loadError && <p className="error">{loadError}</p>}
        {!ctx ? (
          !loadError && <p className="loading">{t(lang, 'loadingData')}</p>
        ) : (
          <Ctx.Provider value={ctx}>
            {page === 'home' && <HomePage go={go} />}
            {(['craft', 'refine', 'cook', 'alchemy'] as Activity[]).map((a) => page === a && <ProductionPage key={a} act={a} />)}
            {page === 'flip' && <FlipPage />}
            {page === 'compare' && <ComparePage />}
            {page === 'settings' && <SettingsPage onReset={reset} />}
          </Ctx.Provider>
        )}
      </main>

      <footer className="disclaimer">
        {lang === 'es'
          ? 'Precios de albion-online-data.com. No afiliado a Albion Online ni a Sandbox Interactive GmbH.'
          : 'Prices from albion-online-data.com. Not affiliated with Albion Online or Sandbox Interactive GmbH.'}
      </footer>

      {apiStatus && (
        <div className="toast">
          <span className="spinner" /> {apiStatus}
        </div>
      )}
    </div>
  );
}
