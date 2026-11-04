// 解き方ノート：解き方の3つの状態（まだ知らない／学んだ・名前なし／名前あり）（5.4）
import content from '../content/dungeon.json';
import type { MethodId } from './dungeon';
import { addLog, update } from './storage';
import type { NoteMethod, SaveData } from './storage';

const N = content.lines.note;
export const METHODS = content.methods.map((m) => m.id as MethodId);
export const methodInfo = (m: MethodId) => content.methods.find((x) => x.id === m)!;
/** 名前の長さの上限（ニックネームと同じ） */
export const NAME_MAX = 12;

/** 学んだ解き方。前の版の記録は、導入を済ませた解き方を学んだことにする */
export function noteMethods(d: SaveData): Partial<Record<MethodId, NoteMethod>> {
  if (d.notebook) return d.notebook;
  const old = d.dungeon as { intro3?: boolean; intro2?: boolean } | undefined;
  return {
    ...(old?.intro3 ? { modoru: { learnedAt: 0 } } : {}),
    ...(old?.intro2 ? { dainyu: { learnedAt: 1 } } : {}),
  };
}

export const isLearned = (d: SaveData, m: MethodId) => !!noteMethods(d)[m];

/** ノートに並べる順：学んだ順。まだ知らない解き方はその後に、データの並び順で */
export function noteOrder(d: SaveData): MethodId[] {
  const n = noteMethods(d);
  const learned = METHODS.filter((m) => n[m]).sort((a, b) => n[a]!.learnedAt - n[b]!.learnedAt);
  return [...learned, ...METHODS.filter((m) => !n[m])];
}

/** 画面に出す名前：生徒が付けた名前、なければ「新しい解き方」 */
export const methodLabel = (d: SaveData, m: MethodId) => noteMethods(d)[m]?.name ?? N.newName;
/** ノートの番号（1から） */
export const methodNumber = (d: SaveData, m: MethodId) => noteOrder(d).indexOf(m) + 1;

export function learnMethod(m: MethodId, from: string): void {
  update((d) => {
    const n = { ...noteMethods(d) };
    if (!n[m]) n[m] = { learnedAt: Date.now() };
    d.notebook = n;
  });
  addLog({ part: 'notebook', step: `学んだ（${from}）`, choice: m });
}

export function nameMethod(m: MethodId, name: string): void {
  const trimmed = name.trim().slice(0, NAME_MAX);
  update((d) => {
    const n = { ...noteMethods(d) };
    n[m] = { learnedAt: n[m]?.learnedAt ?? Date.now(), name: trimmed || undefined };
    d.notebook = n;
  });
  addLog({ part: 'notebook', step: '名前を付けた', choice: `${m} ${trimmed}` });
}
