// 練習の解き方の説明（解き方を見せるとき・「あとで聞く」を見るとき）
import content from '../content/practice.json';
import { abs } from './fraction';
import { eqText, linear, numText } from './linear';
import { fill } from './text';

const S = content.lines.solution;

export function practiceSolution(p: { type: string; a: string; b: string }): string[] {
  const line = linear(p.a, p.b);
  const negative = line.a.n < 0;
  const vars = { a: numText(line.a), b: numText(line.b), absA: numText(abs(line.a)), eq: eqText(line) };
  // 負の傾きは「y は2減る。2減るから、傾きは−2」とつなげる
  const slopeLine = fill(negative ? S.slopeDown : S.slopeUp, vars);
  const slopeLineGraph = fill(negative ? S.slopeDownGraph : S.slopeUpGraph, vars);
  return (p.type === 'eq-graph' ? S.graph : S.eq).map((t) => fill(t, { ...vars, slopeLine, slopeLineGraph }));
}
