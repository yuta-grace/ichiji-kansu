import { describe, expect, it } from 'vitest';
import { toFrac } from './linear';
import { areaAt, endTime, num, taskProblems } from './task';
import type { TaskEntryId } from './task';

const ENTRIES: TaskEntryId[] = ['points', 'figures', 'life', 'challenge'];
const all = ENTRIES.flatMap((e) => taskProblems(e).map((p) => ({ e, p })));
const byId = (id: string) => all.find((x) => x.p.id === id)!.p;

describe('新しい入口の問題（草案）', () => {
  it('3つの入口に10問ずつ、挑戦に4問。答え・ヒントの答えはすべて数として読める', () => {
    expect(ENTRIES.map((e) => taskProblems(e).length)).toEqual([10, 10, 10, 4]);
    expect(new Set(all.map(({ p }) => p.id)).size).toBe(all.length);
    for (const { p } of all) {
      const a = p.answer;
      const values = a.kind === 'number' ? [a.value] : a.kind === 'point' ? [a.x, a.y] : a.kind === 'pair' ? a.values : [a.a, a.b];
      values.forEach((v) => expect(() => toFrac(v), p.id).not.toThrow());
      p.hints.forEach((h) => expect(() => toFrac(h.answer), `${p.id} ${h.q}`).not.toThrow());
      expect(p.solution.length, p.id).toBeGreaterThan(0);
      expect(p.types.length, p.id).toBeGreaterThan(0);
    }
  });
  it('2直線の問題：答えの座標が、グラフの2本の直線の上にある', () => {
    for (const { p } of all.filter(({ p }) => p.answer.kind === 'point' && (p.graph?.lines?.length ?? 0) === 2)) {
      const a = p.answer as { x: string; y: string };
      for (const l of p.graph!.lines!) expect(num(l.a) * num(a.x) + num(l.b), p.id).toBeCloseTo(num(a.y));
    }
  });
  it('動く点：図から計算した面積が、答えと合う。ヒントの表の数も図と合う', () => {
    expect(areaAt(byId('図4').figure!, 5)).toBeCloseTo(15);
    const two = byId('図5');
    expect([areaAt(two.figure!, 2), areaAt(two.figure!, 3)]).toEqual((two.answer as { values: string[] }).values.map(Number));
    for (const id of ['図9', '図10']) {
      const p = byId(id);
      const a = p.answer as { a: string; b: string };
      for (let t = 0; t <= endTime(p.figure!); t += 0.5) expect(areaAt(p.figure!, t), `${id} x=${t}`).toBeCloseTo(num(a.a) * t + num(a.b));
    }
    // 挑戦：P が辺 CD 上にあるとき（8 ≦ x ≦ 14）だけ
    const p = byId('挑3');
    expect(endTime(p.figure!)).toBe(14);
    for (let t = 8; t <= 14; t += 0.5) expect(areaAt(p.figure!, t)).toBeCloseTo(-4 * t + 56);
    // ヒントの表：面積の行は、図から計算した面積と同じ。表を埋める段では、つまみがその x に合う
    for (const { p: q } of all.filter(({ p }) => p.hintTable && p.figure)) {
      const t = q.hintTable!;
      t.rows[t.rows.length - 1].values.forEach((v, j) => expect(areaAt(q.figure!, t.xs[j]), `${q.id} x=${t.xs[j]}`).toBeCloseTo(num(v)));
      for (const h of q.hints.filter((h) => h.cell)) {
        expect(h.x, `${q.id} ${h.q}`).toBe(t.xs[h.cell![1]]);
        expect(num(h.answer), `${q.id} ${h.q}`).toBeCloseTo(num(t.rows[h.cell![0]].values[h.cell![1]]));
      }
    }
  });
  it('挑戦：問題ごとの目標タイム（3・5・6・5分）。挑3 の最後の段は、つまみを x ＝ 8 のままにして一言添える', () => {
    expect(taskProblems('challenge').map((p) => p.targetSec)).toEqual([180, 300, 360, 300]);
    const last = byId('挑3').hints.slice(-2);
    expect(last.map((h) => h.x)).toEqual([8, 8]);
    expect(last[1].say).toContain('実際には P はそこにいない');
  });
  it('プラン比べ・追いつく：式で解くヒント。差が縮まる考え方は「他のやり方」', () => {
    const plan = byId('生10');
    expect(plan.hints.map((h) => h.answer)).toEqual(['1000', '300', '2500', '150', '10']);
    expect(plan.others!.lines.join('')).toContain('150円ずつ縮まる');
    expect(byId('挑4').others!.lines.join('')).toContain('100m 縮まる');
    expect(byId('生4').hints.map((h) => h.answer)).toEqual(['0', '40']);
  });
  it('座標の上の三角形：塗る三角形の面積が、答えと合う', () => {
    for (const { p } of all.filter(({ p }) => p.graph?.polygon && p.answer.kind === 'number')) {
      const [[x1, y1], [x2, y2], [x3, y3]] = p.graph!.polygon!;
      const area = Math.abs((x2 - x1) * (y3 - y1) - (x3 - x1) * (y2 - y1)) / 2;
      expect(area, p.id).toBeCloseTo(num((p.answer as { value: string }).value));
    }
  });
});
