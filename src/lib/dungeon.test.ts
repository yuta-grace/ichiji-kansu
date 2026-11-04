import { describe, expect, it } from 'vitest';
import content from '../content/dungeon.json';
import { frac, toString } from './fraction';
import { methodSteps, solutionLines } from './dungeon';
import type { DungeonProblem } from './dungeon';

const P = (id: string) => content.problems.find((p) => p.id === id)! as DungeonProblem;
const ans = (steps: ReturnType<typeof methodSteps>) => steps.map((s) => s.answer && toString(s.answer));

describe('解き方ごとのヒントの問い（5.4）', () => {
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
