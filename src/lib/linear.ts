// 一次関数 y = ax + b の計算（練習・ダンジョンで共通）
import { add, div, eq, frac, mul, parseAnswer, sub } from './fraction';
import type { Frac } from './fraction';
import type { Pt } from './graphMath';

export interface Linear {
  a: Frac;
  b: Frac;
}

/** データの "2/3" や "-1" を分数にする */
export function toFrac(s: string): Frac {
  const p = parseAnswer(s);
  if (!p) throw new Error(`数として読めない: ${s}`);
  return p.value;
}

export const linear = (a: string, b: string): Linear => ({ a: toFrac(a), b: toFrac(b) });

export const yAt = (l: Linear, x: number): Frac => add(mul(l.a, frac(x)), l.b);

export const onLine = (l: Linear, p: Pt) => eq(yAt(l, p.x), frac(p.y));

/** 2点を通る直線。x が同じ（縦に並ぶ）ときは null */
export function lineThrough(p: Pt, q: Pt): Linear | null {
  if (p.x === q.x) return null;
  const a = div(frac(q.y - p.y), frac(q.x - p.x));
  return { a, b: sub(frac(p.y), mul(a, frac(p.x))) };
}

/** 博士の台詞・式の表示用。分数は [2/3] の形にする（MathText で縦の分数になる） */
export function numText(f: Frac): string {
  const s = f.d === 1 ? `${Math.abs(f.n)}` : `[${Math.abs(f.n)}/${f.d}]`;
  return f.n < 0 ? `−${s}` : s;
}

/** かけ算・引き算の右側に置く数。負の数だけかっこをつける：「2」「(−9)」 */
export const numParen = (f: Frac) => (f.n < 0 ? `(${numText(f)})` : numText(f));

/** y ＝ 2x − 3 のような式の文字列 */
export function eqText(l: Linear): string {
  let ax: string;
  if (l.a.n === 0) ax = '';
  else if (l.a.d === 1 && Math.abs(l.a.n) === 1) ax = l.a.n < 0 ? '−x' : 'x';
  else ax = `${numText(l.a)}x`;
  let bs = '';
  if (l.b.n !== 0) {
    const abs = numText({ n: Math.abs(l.b.n), d: l.b.d });
    bs = ax ? ` ${l.b.n < 0 ? '−' : '＋'} ${abs}` : numText(l.b);
  }
  return `y ＝ ${ax}${bs}` || 'y ＝ 0';
}

/** グラフに描く用（小数） */
export const asLine = (l: Linear) => ({ a: l.a.n / l.a.d, b: l.b.n / l.b.d });
