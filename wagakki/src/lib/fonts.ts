// 琴古流フォント：端末にインストールされたものを探す／読み込んだものを使う
// フォントはリポジトリに入れない（再配布しない）。読み込んだものはこのブラウザの IndexedDB にだけ保存する。
import type { KinkoFontKind } from './shakuhachi';

export interface KinkoFont {
  family: string; // CSS で使う名前
  label: string;
  kind: KinkoFontKind;
  source: 'installed' | 'loaded';
}

const INSTALLED: { family: string; kind: KinkoFontKind }[] = [
  { family: 'ShakuhachiKinko', kind: 'tachibana' },
  { family: 'Kinko_Font 1', kind: 'tachibana' },
  { family: 'SenshuTK', kind: 'senshu' },
];

export const LOADED_FAMILY = 'WagakkiKinkoLoaded';

/** 端末にそのフォントがあるかを、文字の幅の違いで調べる */
function isInstalled(family: string): boolean {
  const c = document.createElement('canvas').getContext('2d');
  if (!c) return false;
  const text = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  return ['monospace', 'serif', 'sans-serif'].some((fb) => {
    c.font = `40px ${fb}`;
    const w0 = c.measureText(text).width;
    c.font = `40px "${family}", ${fb}`;
    return Math.abs(c.measureText(text).width - w0) > 0.5;
  });
}

export function detectInstalled(): KinkoFont[] {
  return INSTALLED.filter((f) => isInstalled(f.family)).map((f) => ({ ...f, label: f.family, source: 'installed' as const }));
}

// ---- IndexedDB ----

interface Stored {
  name: string;
  kind: KinkoFontKind;
  data: ArrayBuffer;
}

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('wagakki', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('fonts');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idb<T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const r = f(d.transaction('fonts', mode).objectStore('fonts'));
    r.onsuccess = () => resolve(r.result as T);
    r.onerror = () => reject(r.error);
  });
}

async function register(s: Stored): Promise<KinkoFont> {
  const face = new FontFace(LOADED_FAMILY, s.data);
  await face.load();
  document.fonts.add(face);
  return { family: LOADED_FAMILY, label: s.name, kind: s.kind, source: 'loaded' };
}

/** 前に読み込んだフォントを登録する */
export async function restoreLoaded(): Promise<KinkoFont | null> {
  try {
    const s = await idb<Stored | undefined>('readonly', (st) => st.get('kinko'));
    return s ? await register(s) : null;
  } catch {
    return null;
  }
}

export function guessKind(fileName: string): KinkoFontKind {
  return /senshu/i.test(fileName) ? 'senshu' : 'tachibana';
}

export async function loadFontFile(file: File, kind: KinkoFontKind): Promise<KinkoFont> {
  const data = await file.arrayBuffer();
  const s: Stored = { name: file.name.replace(/\.(ttf|otf)$/i, ''), kind, data };
  const font = await register(s); // 壊れたファイルならここで失敗する
  await idb('readwrite', (st) => st.put(s, 'kinko'));
  return font;
}

export async function setLoadedKind(kind: KinkoFontKind): Promise<void> {
  const s = await idb<Stored | undefined>('readonly', (st) => st.get('kinko'));
  if (s) await idb('readwrite', (st) => st.put({ ...s, kind }, 'kinko'));
}

export async function removeLoaded(): Promise<void> {
  await idb('readwrite', (st) => st.delete('kinko'));
  for (const f of [...document.fonts]) if (f.family.replace(/"/g, '') === LOADED_FAMILY) document.fonts.delete(f);
}
