import { describe, expect, it } from 'vitest';
import { isLearned, methodLabel, methodNumber, noteOrder } from './notebook';
import type { SaveData } from './storage';

const data = (extra: Partial<SaveData>): SaveData => ({ understanding: { done: false, predictions: {} }, later: [], log: [], ...extra });

describe('解き方ノート（5.4）', () => {
  it('まだ何も学んでいなければ、3つともまだ知らない', () => {
    const d = data({});
    expect(noteOrder(d).map((m) => isLearned(d, m))).toEqual([false, false, false]);
  });
  it('学んだ順に並べ、まだ知らない解き方はその後。番号は並び順', () => {
    const d = data({ notebook: { renritsu: { learnedAt: 20 }, modoru: { learnedAt: 10 } } });
    expect(noteOrder(d)).toEqual(['modoru', 'renritsu', 'dainyu']);
    expect(methodNumber(d, 'renritsu')).toBe(2);
  });
  it('名前がなければ「新しい解き方」、あれば生徒が付けた名前', () => {
    const d = data({ notebook: { modoru: { learnedAt: 1, name: '0まで戻す' }, dainyu: { learnedAt: 2 } } });
    expect(methodLabel(d, 'modoru')).toBe('0まで戻す');
    expect(methodLabel(d, 'dainyu')).toBe('新しい解き方');
  });
  it('前の版の記録：導入を済ませた解き方は学んだことにする', () => {
    const d = data({ dungeon: { pos: 3, intro3: true, intro2: true } as SaveData['dungeon'] });
    expect(noteOrder(d)).toEqual(['modoru', 'dainyu', 'renritsu']);
    expect(isLearned(d, 'renritsu')).toBe(false);
  });
});
