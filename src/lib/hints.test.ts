import { describe, expect, it } from 'vitest';
import content from '../content/practice.json';
import { frac, toString } from './fraction';
import { buildHints, change } from './hints';
import type { HintSpec, HintTexts } from './hints';
import { linear } from './linear';
import { practiceHints, practiceSolution } from './practiceSolution';
import dungeon from '../content/dungeon.json';
import { methodSteps } from './dungeon';
import type { DungeonProblem, MethodId } from './dungeon';

const texts = content.lines.hintTexts as unknown as Record<string, HintTexts>;
const build = (id: string) => {
  const p = content.problems.find((q) => q.id === id)! as { a: string; b: string; type: string; hints?: HintSpec[] };
  return buildHints(practiceHints(p), linear(p.a, p.b), { type: p.type, where: '表', texts });
};

describe('ヒントの段', () => {
  it('⑨ x = 0, 3, 6, 9：見えている変化を聞いてから1あたりに直す', () => {
    const h = build('表→式3');
    expect(h.map((s) => s.q)).toEqual([
      'x が 0 のとき、y はいくつ？',
      'x が0から3に増えると、y はいくつ増える？',
      'x が3増えて y が2増えるなら、x が 1 増えると y はいくつ増える？',
      'この2つを式に入れると？',
    ]);
    expect(h.map((s) => s.answer && toString(s.answer))).toEqual(['1', '2', '2/3', null]);
    expect(h[2].meaning(frac(1))).toEqual(['x が 1 増えるごとに y が1増えるなら、x が3増えると y は3増えるはずだね。']);
  });
  it('⑦ x = 0 がない表：傾きを先に聞き、切片は x を1から0に戻して聞く', () => {
    const h = build('表→式2');
    expect(h[0].q).toBe('x が 1 増えると、y はいくつ増える？');
    expect(h[1].q).toBe('じゃあ、x が 0 のとき、y はいくつかな？');
    expect(h[1].clue).toEqual(['x が1のときの y を光らせたよ。']);
    expect(h.map((s) => s.answer && toString(s.answer))).toEqual(['-2', '5', null]);
    // 何を表すかを返す：切片が 7 なら x = 1 のとき y は 5 のはず
    expect(h[1].meaning(frac(7))).toEqual(['x が 0 のとき y が7なら、x が1のとき y は5になるはずだね。表と比べてみよう。']);
    expect(h[0].show).toEqual(['x が 1 増えると、y は2減るね。']);
  });
  it('どの問題でも、x の差が1でなければ「見えている変化 → 1あたり」の順に聞く', () => {
    // 練習の表：表の x のとなりどうしの差
    for (const p of content.problems.filter((q) => q.type === 'table-eq')) {
      const xs = [...p.xs!].sort((m, n) => m - n);
      const dx = xs[1] - xs[0];
      const qs = build(p.id).map((s) => s.q);
      const perOne = qs.findIndex((q) => q.includes('x が 1 増えると'));
      if (dx !== 1) expect(qs[perOne - 1], p.id).toMatch(new RegExp(`に増えると`));
      if (!xs.includes(0)) expect(qs[0], p.id).not.toContain('x が 0 のとき');
    }
    // ダンジョン：2つの点の x の差（「戻って解く」「代入で解く」の最初の問い）
    for (const p of dungeon.problems as DungeonProblem[]) {
      for (const m of ['modoru', 'dainyu'] as MethodId[]) {
        const qs = methodSteps(m, p, []).map((s) => s.q);
        if (Math.abs(p.p1[0] - p.p2[0]) === 1) expect(qs[0], p.id).toBe('x が 1 増えると、y はいくつ増える？');
        else {
          expect(qs[0], p.id).toMatch(/から.*に増えると、y はいくつ増える？/);
          expect(qs[1], p.id).toContain('x が 1 増えると');
        }
      }
    }
  });
  it('練習の解き方の説明も、表の x の並びに合わせる', () => {
    const at = (id: string) => practiceSolution(content.problems.find((q) => q.id === id)!);
    expect(at('表→式3')).toEqual([
      'x が 0 のとき、y は1。だから切片は1。',
      'x が0から3に増えると、y は2増える。',
      'x が 1 増えると、y は[2/3]増える。だから傾きは[2/3]。',
      '式にすると、y ＝ [2/3]x ＋ 1。',
    ]);
    expect(at('表→式2')[1]).toBe('x が1のとき、y は3。x を 1 戻すと y は2増えるから、x が 0 のとき y は5。だから切片は5。');
  });
  it('負の数は「減る」と言う', () => {
    expect(change(frac(-2))).toBe('2減る');
    expect(change(frac(2, 3))).toBe('[2/3]増える');
  });
});
