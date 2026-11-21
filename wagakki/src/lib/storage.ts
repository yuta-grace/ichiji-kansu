// ブラウザへの保存（設定・曲）
import type { Tuning } from './shamisen';
import { parseSong, type Instrument, type Song } from './score';

export interface Settings {
  a4: number;
  doremi: 'fixed' | 'movable';
  nameStyle: 'doremi' | 'cde';
  shamisenLabel: 'sun' | 'hon';
  /** 文化譜の3本の線のうち、上の線がどの糸か */
  bunkaTop: 'san' | 'ichi';
  showPiano: boolean;
  /** 'auto'：見つかった琴古フォント、'kana'：カタカナ、それ以外：フォント名 */
  kinkoFont: string;
  theme: 'system' | 'light' | 'dark';
  // 演奏モードの状態
  instrument: Instrument;
  shamisenSun: number;
  shamisenTuning: Tuning;
  shakuhachiSun: number;
}

export const DEFAULT_SETTINGS: Settings = {
  a4: 440,
  doremi: 'fixed',
  nameStyle: 'doremi',
  shamisenLabel: 'sun',
  bunkaTop: 'san',
  showPiano: true,
  kinkoFont: 'auto',
  theme: 'system',
  instrument: 'shamisen',
  shamisenSun: 18,
  shamisenTuning: 'honchoshi',
  shakuhachiSun: 18,
};

const K_SETTINGS = 'wagakki.settings';
const K_SONGS = 'wagakki.songs';
const K_CURRENT = 'wagakki.current';

function read<T>(key: string): T | null {
  try {
    const s = localStorage.getItem(key);
    return s ? (JSON.parse(s) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* 保存できない環境（プライベートモードなど）では何もしない */
  }
}

export function loadSettings(): Settings {
  return { ...DEFAULT_SETTINGS, ...(read<Partial<Settings>>(K_SETTINGS) ?? {}) };
}

export const saveSettings = (s: Settings) => write(K_SETTINGS, s);

export function loadSongs(): Song[] {
  const raw = read<unknown[]>(K_SONGS) ?? [];
  const out: Song[] = [];
  for (const r of raw) {
    try {
      const s = parseSong(r);
      s.updatedAt = (r as Song).updatedAt ?? s.updatedAt;
      out.push(s);
    } catch {
      /* 壊れた曲は飛ばす */
    }
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function saveSong(song: Song) {
  const list = loadSongs().filter((s) => s.id !== song.id);
  list.unshift({ ...song, updatedAt: Date.now() });
  write(K_SONGS, list);
  write(K_CURRENT, song.id);
}

export function deleteSong(id: string) {
  write(K_SONGS, loadSongs().filter((s) => s.id !== id));
}

export const currentSongId = () => read<string>(K_CURRENT);
export const setCurrentSongId = (id: string) => write(K_CURRENT, id);
