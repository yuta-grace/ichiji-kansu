// 練習のヒントの順番と、解き方の説明（解き方を見せるとき・「あとで聞く」を見るとき）
// 表の問題は、表に見えている x の並びに合わせる：
// ・x の差が1でなければ、見えている変化（x が3増えると）を聞いてから1あたりに直す
// ・x ＝ 0 が表になければ、傾きを先に出し、x を戻して切片を出す
import content from '../content/practice.json';
import { abs, frac, mul, sub } from './fraction';
import { change } from './hints';
import type { HintSpec } from './hints';
import { eqText, linear, numText, yAt } from './linear';
import { fill } from './text';

const S = content.lines.solution;

interface PracticeProblem {
  type: string;
  a: string;
  b: string;
  xs?: number[];
  hints?: HintSpec[];
}

/** 表の x の並び：最初の x と、となりとの差 */
function tableStep(xs: number[]) {
  const sorted = [...xs].sort((p, q) => p - q);
  const x0 = sorted.includes(0) ? 0 : sorted[0];
  return { x0, dx: sorted[1] - sorted[0], hasZero: sorted.includes(0) };
}

/** ヒントの段。問題に hints が書いてあればそれを使う */
export function practiceHints(p: PracticeProblem): HintSpec[] {
  if (p.hints) return p.hints;
  if (p.type !== 'table-eq' || !p.xs || p.xs.length < 2) return content.defaultHints as HintSpec[];
  const { x0, dx, hasZero } = tableStep(p.xs);
  const slope: HintSpec[] = dx === 1 ? [{ kind: 'slope', from: x0 }] : [{ kind: 'rise', from: x0, to: x0 + dx }, { kind: 'perOne', dx }];
  return hasZero
    ? [{ kind: 'intercept' }, ...slope, { kind: 'final' }]
    : [...slope, { kind: 'interceptBack', from: x0 }, { kind: 'final' }];
}

export function practiceSolution(p: PracticeProblem): string[] {
  const line = linear(p.a, p.b);
  const negative = line.a.n < 0;
  const vars = { a: numText(line.a), b: numText(line.b), absA: numText(abs(line.a)), eq: eqText(line) };
  // 負の傾きは「y は2減る。2減るから、傾きは−2」とつなげる
  const slopeLine = fill(negative ? S.slopeDown : S.slopeUp, vars);
  const slopeLineGraph = fill(negative ? S.slopeDownGraph : S.slopeUpGraph, vars);
  if (p.type === 'eq-graph') return S.graph.map((t) => fill(t, { ...vars, slopeLineGraph }));
  if (p.type !== 'table-eq' || !p.xs || p.xs.length < 2) return S.eq.map((t) => fill(t, { ...vars, slopeLine }));

  const { x0, dx, hasZero } = tableStep(p.xs);
  const slope = dx === 1
    ? [slopeLine]
    : [fill(S.rise, { x0, x1: x0 + dx, riseChange: change(mul(line.a, frac(dx))) }), slopeLine];
  const intercept = hasZero
    ? fill(S.eq[0], vars)
    : fill(S.interceptBack, { ...vars, x0, y0: numText(yAt(line, x0)), backChange: change(sub(frac(0), line.a)) });
  const eq = fill(S.eq[2], vars);
  return hasZero ? [intercept, ...slope, eq] : [...slope, intercept, eq];
}
