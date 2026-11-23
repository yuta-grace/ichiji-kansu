import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppCtx, type AppState } from './context';
import { loadSettings, saveSettings, type Settings } from './lib/storage';
import { detectInstalled, restoreLoaded, type KinkoFont } from './lib/fonts';
import { IconButton, Snackbar } from './components/ui';
import { PlayScreen } from './screens/PlayScreen';
import { ScoreScreen } from './screens/ScoreScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { ReadScreen } from './screens/ReadScreen';

type Mode = 'score' | 'play' | 'read';

export function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  // 開いたときは前回使っていた画面。初めてのときは、すぐ音が出せる「演奏」
  const [mode, setMode] = useState<Mode>(() => {
    try {
      const m = localStorage.getItem('wagakki.mode');
      return m === 'score' || m === 'play' || m === 'read' ? m : 'play';
    } catch {
      return 'play';
    }
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [installedFonts, setInstalled] = useState<KinkoFont[]>([]);
  const [loadedFont, setLoadedFont] = useState<KinkoFont | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [barSlot, setBarSlot] = useState<HTMLElement | null>(null);
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
      localStorage.setItem('wagakki.mode', mode);
    } catch {
      /* 保存できなくても動く */
    }
  }, [mode]);

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

  const state: AppState = { settings, update, kinkoFont, installedFonts, loadedFont, setLoadedFont, toast, barSlot };

  return (
    <AppCtx.Provider value={state}>
      <div className="app">
        <header className="appbar">
          <span className="brand" aria-hidden="true">
            和
          </span>
          <nav className="modes" aria-label="画面">
            <button type="button" className={mode === 'score' ? 'on' : ''} aria-current={mode === 'score' ? 'page' : undefined} onClick={() => setMode('score')}>
              楽譜
            </button>
            <button type="button" className={mode === 'play' ? 'on' : ''} aria-current={mode === 'play' ? 'page' : undefined} onClick={() => setMode('play')}>
              演奏
            </button>
            <button type="button" className={mode === 'read' ? 'on' : ''} aria-current={mode === 'read' ? 'page' : undefined} onClick={() => setMode('read')}>
              読み替え
            </button>
          </nav>
          <div className="appbar-slot" ref={setBarSlot} />
          <IconButton icon="settings" label="設定" onClick={() => setSettingsOpen(true)} />
        </header>
        <main className="main">
          {mode === 'score' && <ScoreScreen />}
          {mode === 'play' && <PlayScreen />}
          {mode === 'read' && <ReadScreen />}
        </main>
        {settingsOpen && (
          <div className="sheet" role="dialog" aria-modal="true" aria-label="設定">
            <div className="sheet-head">
              <h2>設定</h2>
              <IconButton icon="close" label="閉じる" onClick={() => setSettingsOpen(false)} />
            </div>
            <SettingsScreen />
          </div>
        )}
        <Snackbar message={msg} />
      </div>
    </AppCtx.Provider>
  );
}
