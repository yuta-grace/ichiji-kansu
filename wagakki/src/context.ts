import { createContext, useContext } from 'react';
import type { Settings } from './lib/storage';
import type { KinkoFont } from './lib/fonts';

export interface AppState {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  /** 今使う琴古フォント（null ならカタカナ） */
  kinkoFont: KinkoFont | null;
  installedFonts: KinkoFont[];
  loadedFont: KinkoFont | null;
  setLoadedFont: (f: KinkoFont | null) => void;
  toast: (msg: string) => void;
}

export const AppCtx = createContext<AppState>(null as unknown as AppState);
export const useApp = () => useContext(AppCtx);
