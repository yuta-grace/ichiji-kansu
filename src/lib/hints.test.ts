import { describe, expect, it } from 'vitest';
import content from '../content/practice.json';
import { frac, toString } from './fraction';
import { buildHints, change } from './hints';
import type { HintSpec, HintTexts } from './hints';
import { linear } from './linear';

const texts = content.lines.hintTexts as unknown as Record<string, HintTexts>;
const build = (id: string) => {
  const p = content.problems.find((q) => q.id === id)! as { a: string; b: string; type: string; hints?: HintSpec[] };
  return buildHints(p.hints ?? (content.defaultHints as HintSpec[]), linear(p.a, p.b), { type: p.type, where: '表', texts });
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
    expect(h[1].q).toBe('x を1から 0 に戻すと、y はいくつになる？');
    expect(h.map((s) => s.answer && toString(s.answer))).toEqual(['-2', '5', null]);
    // 何を表すかを返す：切片が 7 なら x = 1 のとき y は 5 のはず
    expect(h[1].meaning(frac(7))).toEqual(['x が 0 のとき y が7なら、x が1のとき y は5になるはずだね。表と比べてみよう。']);
    expect(h[0].show).toEqual(['x が 1 増えると、y は2減るね。']);
  });
  it('負の数は「減る」と言う', () => {
    expect(change(frac(-2))).toBe('2減る');
    expect(change(frac(2, 3))).toBe('[2/3]増える');
  });
});
