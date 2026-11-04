import { describe, expect, it } from 'vitest';
import content from '../content/dungeon.json';
import { frac, toString } from './fraction';
import { applyResult, effectiveStage, methodSteps, newProgress, solutionLines } from './dungeon';
import type { DungeonProblem, MethodProgress } from './dungeon';

const P = (id: string) => content.problems.find((p) => p.id === id)! as DungeonProblem;
const ans = (steps: ReturnType<typeof methodSteps>) => steps.map((s) => s.answer && toString(s.answer));

describe('解き方ごとの途中の問い（5.4 段階A）', () => {
  it('① 連立：どちらの順に引いても正解。右の数は a の前の数と同じ順', () => {
    const p = P('連1'); // (12, 7) と (−9, 21)
    expect(ans(methodSteps('renritsu', p, []))).toEqual(['21', '-14', null]);
    expect(methodSteps('renritsu', p, [])[0].alsoAccept!.map(toString)).toEqual(['-21']);
    expect(ans(methodSteps('renritsu', p, [frac(-21)]))).toEqual(['21', '14', null]);
  });
  it('② 代入：傾きは見えている変化から1あたりへ。どちらの点を代入してもよい', () => {
    const p = P('代1'); // (2, 1) と (5, 3)
    const s = methodSteps('dainyu', p, []);
    expect(s[0].q).toBe('x が2から5に増えると、y はいくつ増える？');
    expect(ans(s)).toEqual(['2', '2/3', '2', '1', null]);
    expect(ans(methodSteps('dainyu', p, [frac(2), frac(2, 3), frac(5)]))).toEqual(['2', '2/3', '2', '3', null]);
  });
  it('③ 戻って：符号つき。どちらの点から戻ってもよい', () => {
    const p = P('戻1'); // (1, 3) と (4, 9)
    expect(ans(methodSteps('modoru', p, []))).toEqual(['6', '2', '-1', '-2', null]);
    expect(ans(methodSteps('modoru', p, [frac(6), frac(2), frac(-4)]))).toEqual(['6', '2', '-1', '-8', null]);
  });
  it('x の差が1なら傾きは1段で聞く', () => {
    const s = methodSteps('modoru', P('戻2'), []); // (1, 1) と (2, 4)
    expect(s[0].q).toBe('x が 1 増えると、y はいくつ増える？');
    expect(ans(s)).toEqual(['3', '-1', '-3', null]);
  });
  it('解き方の説明', () => {
    expect(solutionLines('modoru', P('戻1'))).toEqual([
      'x が1から4に3増えると、y は6増える。だから傾きは 6 ÷ 3 ＝ 2。',
      '(1, 3) から x ＝ 0 まで、x は−1変わる。',
      'そのとき y は 2 × (−1) ＝ −2 変わるから、x ＝ 0 のとき y は1。',
      '式は y ＝ 2x ＋ 1。',
    ]);
  });
});

describe('段階の切り替えと称号（5.4）', () => {
  const A = (correct: boolean, slopeSign = 1) => ({ stage: 'A' as const, correct, slopeSign, ms: 0 });
  const B = (correct: boolean, ms: number) => ({ stage: 'B' as const, correct, slopeSign: 1, ms });

  it('段階Aを3問続けて正解で段階Bへ。段階Bで間違えたら次の1問だけ段階A', () => {
    let p = newProgress();
    p = applyResult(p, A(true)).next;
    p = applyResult(p, A(false)).next;
    expect(p.streakA).toBe(0);
    for (let i = 0; i < 3; i++) p = applyResult(p, A(true, i === 0 ? -1 : 1)).next;
    expect(effectiveStage(p)).toBe('B');
    p = applyResult(p, B(false, 50000)).next;
    expect(effectiveStage(p)).toBe('A');
    p = applyResult(p, A(false)).next;
    expect(effectiveStage(p)).toBe('B');
  });
  it('使える：段階Aで3問正解、傾きの正と負を両方ふくむ', () => {
    let p = newProgress();
    for (let i = 0; i < 3; i++) p = applyResult(p, A(true, 1)).next;
    expect(p.titles.usable).toBeUndefined();
    const r = applyResult(p, A(true, -1));
    expect(r.gained).toEqual(['usable']);
  });
  it('慣れた：段階Bで10問正解。タイム：最初の段階B記録より速い', () => {
    let p: MethodProgress = { ...newProgress(), stage: 'B' };
    p = applyResult(p, B(true, 60000)).next;
    expect(applyResult(p, B(true, 40000)).gained).toEqual(['time']);
    for (let i = 0; i < 8; i++) p = applyResult(p, B(true, 70000)).next;
    expect(p.titles.familiar).toBeUndefined();
    expect(applyResult(p, B(true, 70000)).gained).toEqual(['familiar']);
    // 間違えた問題は数えない
    expect(applyResult(p, B(false, 70000)).next.bCorrect).toBe(9);
  });
});
