import { describe, expect, it } from 'vitest';
import dungeon from '../content/dungeon.json';
import practice from '../content/practice.json';
import { isFast, masterState, recentStats, titleState } from './results';
import type { ProblemResult } from './results';

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
  it('一次関数マスター：すべての入口がそろい、すべての問題を一度は自力で正解', () => {
    const all = [
      ...practice.problems.map((p) => r({ problemId: p.id })),
      // 傾きと切片を読むは9問なので、達人（15問）には繰り返して解く
      ...many(6, { problemId: practice.problems[1].id }),
      ...dungeon.problems.map((p) => r({ entry: 'dungeon', level: '標準', problemId: p.id })),
    ];
    expect(masterState([])).toMatchObject({ done: 0, total: 2, unsolved: 39, master: false });
    // 傾きと切片を読むはそろったが、2点から式を作るは30問中15問しか正解していない
    const half = [...practice.problems.map((p) => r({ problemId: p.id })), ...many(6), ...dungeon.problems.slice(0, 15).map((p) => r({ entry: 'dungeon', level: '標準', problemId: p.id }))];
    expect(masterState(half)).toMatchObject({ done: 2, unsolved: 15, master: false });
    expect(masterState(all)).toMatchObject({ done: 2, unsolved: 0, master: true });
    // 解き方を見せた問題は「自力で正解」に数えない
    expect(masterState([...all.slice(1), r({ problemId: practice.problems[0].id, correct: false })]).unsolved).toBe(1);
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
  });
  it('直近 n 問だけ。入口別にも分けられる', () => {
    expect(recentStats(results, 2, 'type').find((x) => x.key === 'グラフから関数を決定')!.count).toBe(1);
    expect(recentStats(results, 0, 'entry').find((x) => x.key === 'dungeon')!.count).toBe(1);
  });
});
