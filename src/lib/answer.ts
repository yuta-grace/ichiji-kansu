import { eq, frac, parseAnswer } from './fraction';
import type { Frac } from './fraction';

export type Verdict = 'empty' | 'unreadable' | 'ok' | 'ok-unreduced' | 'wrong';

export interface Checked {
  verdict: Verdict;
  value?: Frac;
}

/** 入力1つを判定する。約分していない分数は正解として扱う（6章「答えの判定」） */
export function checkNumber(raw: string, expected: Frac | number): Checked {
  if (raw.trim() === '' || raw === '-') return { verdict: 'empty' };
  const p = parseAnswer(raw);
  if (!p) return { verdict: 'unreadable' };
  const exp = typeof expected === 'number' ? frac(expected) : expected;
  if (!eq(p.value, exp)) return { verdict: 'wrong', value: p.value };
  return { verdict: p.unreduced ? 'ok-unreduced' : 'ok', value: p.value };
}

export const isOk = (c: Checked) => c.verdict === 'ok' || c.verdict === 'ok-unreduced';

/** 小数で表示する値（台詞の中で生徒の答えを言い直すとき用） */
export function asNumber(f: Frac): number {
  return f.n / f.d;
}
