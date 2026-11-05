import { describe, expect, it } from 'vitest';
import dungeon from '../content/dungeon.json';
import practice from '../content/practice.json';
import { isFast, masterState, recentStats, titleState } from './results';
import type { ProblemResult } from './results';
import { taskProblems } from './task';
import type { TaskEntryId } from './task';

let t = 0;
const r = (extra: Partial<ProblemResult>): ProblemResult => ({
  entry: 'practice', problemId: 'x', level: '基本', types: ['式からグラフをかく'], correct: true, ms: 10_000, hint: false, at: ++t, ...extra,
});
const many = (n: number, extra: Partial<ProblemResult> = {}) => Array.from({ length: n }, () => r(extra));

describe('称号（5.10）', () => {
  it('解いた数：5・10・15問。ヒントを使っても正解なら数える。解き方を見せた問題は数えない', () => {
    const s = titleState([...many(9, { hint: true }), r({ correct: false }), r({})], 'practice');
    expect(s.solved).toBe(10);
    expect(s.steps.map((x) => [x.n, x.name, x.got])).toEqual([[5, '見習い', true], [10, '一人前', true], [15, '達人', false]]);
  });
  it('スピード：ヒントなし・目標タイム以内の正解が5問。基本は20秒', () => {
    expect(isFast(r({ ms: 20_000 }))).toBe(true);
    expect(isFast(r({ ms: 20_001 }))).toBe(false);
    expect(isFast(r({ ms: 5_000, hint: true }))).toBe(false);
    expect(isFast(r({ level: '標準', entry: 'dungeon', ms: 59_000 }))).toBe(true);
    expect(isFast(r({ level: '発展', ms: 200_000, targetSec: 240 }))).toBe(true);
    expect(titleState(many(4), 'practice').speedGot).toBe(false);
    expect(titleState(many(5), 'practice').speedGot).toBe(true);
  });
  it('入口ごとに、達人とスピードがそろったか', () => {
    expect(titleState(many(15), 'practice').complete).toBe(true);
    expect(titleState(many(14), 'practice').complete).toBe(false);
    expect(titleState(many(15, { ms: 30_000 }), 'practice').complete).toBe(false);
  });
  it('挑戦：解いた数の称号だけ（スピードはない）', () => {
    const s = titleState(many(15, { entry: 'challenge', level: '発展' }), 'challenge');
    expect([s.hasSpeed, s.speedGot, s.complete]).toEqual([false, false, true]);
  });
  it('一次関数クリア：挑戦以外がそろい、挑戦以外の問題をすべて自力で正解。マスター：さらに挑戦の問題もすべて', () => {
    const entries = [
      { entry: 'practice', level: '基本', ids: practice.problems.map((p) => p.id) },
      { entry: 'dungeon', level: '標準', ids: dungeon.problems.map((p) => p.id) },
      ...(['points', 'figures', 'life'] as TaskEntryId[]).map((e) => ({ entry: e, level: taskProblems(e)[0].level, ids: taskProblems(e).map((p) => p.id) })),
    ];
    const total = entries.reduce((n, e) => n + e.ids.length, 0);
    // 入口ごとに、すべての問題を1回ずつ正解し、15問に足りない分は最後の問題を繰り返す
    const solveAll = (e: (typeof entries)[number]) =>
      [...e.ids, ...Array(Math.max(0, 15 - e.ids.length)).fill(e.ids[e.ids.length - 1])].map((id) => r({ entry: e.entry, level: e.level, problemId: id }));
    const normal = entries.flatMap(solveAll);
    const challengeIds = taskProblems('challenge').map((p) => p.id);
    expect(masterState([])).toMatchObject({ done: 0, total: 5, unsolved: total, clear: false, challengeUnsolved: 4, master: false });
    expect(masterState(normal)).toMatchObject({ done: 5, unsolved: 0, clear: true, challengeUnsolved: 4, master: false });
    const withChallenge = [...normal, ...challengeIds.map((id) => r({ entry: 'challenge', level: '発展', problemId: id, ms: 999_000 }))];
    expect(masterState(withChallenge)).toMatchObject({ clear: true, challengeUnsolved: 0, master: true });
    // 挑戦を全部解いても、クリアしていなければマスターではない
    expect(masterState(withChallenge.filter((x) => x.entry !== 'dungeon')).master).toBe(false);
    // 解き方を見せた問題は「自力で正解」に数えない
    const first = normal.findIndex((x) => x.problemId === practice.problems[0].id);
    expect(masterState([...normal.slice(0, first), ...normal.slice(first + 1), r({ problemId: practice.problems[0].id, correct: false })]).unsolved).toBe(1);
  });
});

describe('講師用画面：直近の問題の系統別タイム（5.12）', () => {
  const results = [
    r({ types: ['グラフから関数を決定'], ms: 30_000 }),
    r({ types: ['グラフから関数を決定'], ms: 10_000, hint: true }),
    r({ types: ['グラフから関数を決定', '座標と図形'], correct: false, ms: 90_000 }),
    r({ types: ['2点から関数を決定'], entry: 'dungeon', ms: 40_000 }),
  ];
  it('平均時間は正解した問題だけ。正答率・問題数・ヒントを使った数。型が複数なら両方に数える', () => {
    const rows = recentStats(results, 0, 'type');
    expect(rows.find((x) => x.key === 'グラフから関数を決定')).toMatchObject({ count: 3, hinted: 1, correct: 2, avgMs: 20_000 });
    expect(rows.find((x) => x.key === '座標と図形')).toMatchObject({ count: 1, correct: 0, avgMs: null });
    expect(rows.map((x) => x.key)).toHaveLength(7);
    expect(recentStats(results, 0, 'entry').map((x) => x.key)).toContain('challenge');
  });
  it('直近 n 問だけ。入口別にも分けられる', () => {
    expect(recentStats(results, 2, 'type').find((x) => x.key === 'グラフから関数を決定')!.count).toBe(1);
    expect(recentStats(results, 0, 'entry').find((x) => x.key === 'dungeon')!.count).toBe(1);
  });
});
