import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppCtx, type AppState } from './context';
import { loadSettings, saveSettings, type Settings } from './lib/storage';
import { detectInstalled, restoreLoaded, type KinkoFont } from './lib/fonts';
import { Icon } from './components/icons';
import { Snackbar } from './components/ui';
import { PlayScreen } from './screens/PlayScreen';
import { ScoreScreen } from './screens/ScoreScreen';
import { SettingsScreen } from './screens/SettingsScreen';

type Tab = 'play' | 'score' | 'settings';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'play', label: '演奏', icon: 'music' },
  { id: 'score', label: '楽譜', icon: 'score' },
  { id: 'settings', label: '設定', icon: 'settings' },
];

export function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [tab, setTab] = useState<Tab>(() => (sessionStorage.getItem('wagakki.tab') as Tab) || 'play');
  const [installedFonts, setInstalled] = useState<KinkoFont[]>([]);
  const [loadedFont, setLoadedFont] = useState<KinkoFont | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const msgTimer = useRef<number>();

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((s) => {
      const n = { ...s, ...patch };
      saveSettings(n);
      return n;
    });
  }, []);

  const toast = useCallback((m: string) => {
    setMsg(m);
    clearTimeout(msgTimer.current);
    msgTimer.current = window.setTimeout(() => setMsg(null), 3200);
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem('wagakki.tab', tab);
    } catch {
      /* 保存できなくても動く */
    }
  }, [tab]);

  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', settings.theme);
  }, [settings.theme]);

  // 琴古フォント：端末にあるものを探し、前に読み込んだものを戻す
  useEffect(() => {
    void document.fonts.ready.then(() => setInstalled(detectInstalled()));
    void restoreLoaded().then(setLoadedFont);
  }, []);

  const kinkoFont = useMemo(() => {
    const all = [...(loadedFont ? [loadedFont] : []), ...installedFonts];
    if (settings.kinkoFont === 'kana') return null;
    if (settings.kinkoFont === 'auto') return all[0] ?? null;
    return all.find((f) => f.family === settings.kinkoFont) ?? all[0] ?? null;
  }, [settings.kinkoFont, installedFonts, loadedFont]);

  const state: AppState = { settings, update, kinkoFont, installedFonts, loadedFont, setLoadedFont, toast };

  return (
    <AppCtx.Provider value={state}>
      <div className="app">
        <nav className="nav" aria-label="画面">
          <div className="nav-brand" aria-hidden="true">
            和
          </div>
          {TABS.map((t) => (
            <button key={t.id} type="button" className={`nav-item${tab === t.id ? ' on' : ''}`} aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
              <span className="nav-indicator">
                <Icon name={t.icon} />
              </span>
              <span className="nav-label">{t.label}</span>
            </button>
          ))}
        </nav>
        <main className="main">
          <header className="topbar">
            <h1>和楽器</h1>
            <span className="topbar-sub">{TABS.find((t) => t.id === tab)?.label}</span>
          </header>
          {tab === 'play' && <PlayScreen />}
          {tab === 'score' && <ScoreScreen />}
          {tab === 'settings' && <SettingsScreen />}
        </main>
        <Snackbar message={msg} />
      </div>
    </AppCtx.Provider>
  );
}
