// ミックス（5.9）：1問以上解いたことのある入口から、問題を混ぜて10問。同じ種類が続かないように並べる
import { useState } from 'react';
import { Hakase } from '../components/Hakase';
import Topbar from '../components/Topbar';
import dungeon from '../content/dungeon.json';
import home from '../content/home.json';
import practice from '../content/practice.json';
import settings from '../content/settings.json';
import type { DungeonProblem } from '../lib/dungeon';
import { addResult, resultsOf } from '../lib/results';
import { addLater, addLog, load } from '../lib/storage';
import Solve from './dungeon/Solve';
import Problem from './practice/Problem';
import type { ProblemData } from './practice/Problem';

const M = home.mix;

type Item = { entry: 'practice'; p: ProblemData } | { entry: 'dungeon'; p: DungeonProblem };
const ALL: Item[] = [
  ...(practice.problems as ProblemData[]).map((p): Item => ({ entry: 'practice', p })),
  ...(dungeon.problems as DungeonProblem[]).map((p): Item => ({ entry: 'dungeon', p })),
];
/** 「同じ種類」：傾きと切片を読むは3方向のどれか、2点から式を作るは1種類 */
export const kindOf = (it: Item) => (it.entry === 'practice' ? `practice:${it.p.type}` : 'dungeon');
const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

/** 解いたことのある入口 */
export const mixEntries = () => [...new Set(resultsOf(load()).map((r) => r.entry))].filter((e) => ALL.some((it) => it.entry === e));

/** 入口を同じ確率で選び、その中から問題を選ぶ。前の問題と同じ種類はできるだけ避ける。同じ問題は、足りないときだけもう一度出す */
export function makeQueue(entries: string[], count: number): Item[] {
  const pool = ALL.filter((it) => entries.includes(it.entry));
  const queue: Item[] = [];
  while (pool.length && queue.length < count) {
    // 問題が足りないときは、もう一度出してよい
    const fresh = pool.filter((it) => !queue.includes(it));
    const unused = fresh.length ? fresh : pool;
    const last = queue[queue.length - 1];
    const differ = unused.filter((it) => !last || kindOf(it) !== kindOf(last));
    const candidates = differ.length ? differ : unused;
    const entry = pick([...new Set(candidates.map((it) => it.entry))]);
    queue.push(pick(candidates.filter((it) => it.entry === entry)));
  }
  return queue;
}

export default function Mix({ onExit }: { onExit: () => void }) {
  const [queue] = useState(() => makeQueue(mixEntries(), settings.mix.count));
  const [pos, setPos] = useState(-1);
  const [gained, setGained] = useState<string[]>([]);

  const frame = (body: React.ReactNode) => (
    <div className="screen fit">
      <Topbar onExit={onExit} progress={Math.max(pos, 0) / queue.length} />
      {body}
    </div>
  );
  const talk = (lines: string[], label: string, onClick: () => void) =>
    frame(
      <>
        <Hakase lines={lines} />
        <div className="actions">
          <button type="button" className="btn primary" onClick={onClick}>{label}</button>
        </div>
      </>,
    );

  const record = (it: Item, r: { correct: boolean; ms: number; hint: boolean; attempts: number; shown: boolean }) => {
    addLog({ part: it.entry, step: `ミックス ${it.p.id}`, attempts: r.attempts, shown: r.shown, hintsUsed: r.hint ? 1 : 0, ms: r.ms });
    setGained(addResult({ entry: it.entry, problemId: it.p.id, level: it.p.level, types: it.p.types, correct: r.correct, ms: r.ms, hint: r.hint, mix: true }));
    setPos(pos + 1);
  };

  if (pos < 0) return talk(M.start, M.begin, () => setPos(0));
  if (gained.length) return talk(gained, dungeon.lines.next, () => setGained([]));
  if (pos >= queue.length) return talk(M.end, home.back, onExit);

  const it = queue[pos];
  if (it.entry === 'practice') {
    return frame(
      <Problem
        key={pos}
        problem={it.p}
        first={false}
        annotate={false}
        onFinish={(r) => record(it, { correct: !r.shown, ms: r.ms, hint: r.hintsUsed > 0, attempts: r.attempts, shown: r.shown })}
        onLater={() => addLater({ part: 'practice', problemId: it.p.id, from: 'solving' })}
      />,
    );
  }
  return frame(
    <Solve
      key={pos}
      problem={it.p}
      onDone={(o) => record(it, { correct: o.correct, ms: o.ms, hint: o.hintsUsed > 0, attempts: o.attempts, shown: o.shown })}
      onLater={(m) => addLater({ problemId: it.p.id, method: m, from: 'solving' })}
    />,
  );
}
