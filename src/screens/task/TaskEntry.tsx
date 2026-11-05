// 新しい入口（交点と直線上の点・座標と図形・暮らしの中の一次関数・挑戦）：問題を順に出す（5.6〜5.8）
import { useState } from 'react';
import { Hakase } from '../../components/Hakase';
import Topbar from '../../components/Topbar';
import content from '../../content/task.json';
import { addResult } from '../../lib/results';
import { addLater, addLog, load, update } from '../../lib/storage';
import { taskProblems } from '../../lib/task';
import type { TaskEntryId } from '../../lib/task';
import { fill } from '../../lib/text';
import TaskProblem from './TaskProblem';

const L = content;

// resume：学ぶの「続きから」カードから入ったときは、続きから始めるかを聞かない
export default function TaskEntry({ entry, onExit, resume = false }: { entry: TaskEntryId; onExit: () => void; resume?: boolean }) {
  const problems = taskProblems(entry);
  const saved = load().tasks?.[entry];
  const canResume = !!saved && !saved.done && saved.pos > 0 && saved.pos < problems.length;
  const [pos, setPos] = useState(canResume ? (resume ? saved!.pos : -1) : 0);
  const [gained, setGained] = useState<string[]>([]);

  const persist = (p: number) =>
    update((d) => {
      d.tasks = { ...d.tasks, [entry]: { pos: p, done: p >= problems.length } };
    });

  const frame = (body: React.ReactNode) => (
    <div className="screen fit">
      <Topbar onExit={onExit} progress={Math.max(pos, 0) / problems.length} />
      {body}
    </div>
  );

  if (pos < 0) {
    return frame(
      <>
        <Hakase lines={L.resume} />
        <div className="actions">
          <button type="button" className="btn primary" onClick={() => setPos(saved!.pos)}>{L.continue}</button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              persist(0);
              setPos(0);
            }}
          >
            {L.restart}
          </button>
        </div>
      </>,
    );
  }
  if (gained.length) {
    return frame(
      <>
        <Hakase lines={gained} />
        <div className="actions">
          <button type="button" className="btn primary" onClick={() => setGained([])}>{L.next}</button>
        </div>
      </>,
    );
  }
  if (pos >= problems.length) {
    return frame(
      <>
        <Hakase lines={L.end.map((t) => fill(t, { n: problems.length }))} />
        <div className="actions">
          <button type="button" className="btn primary" onClick={onExit}>{L.home}</button>
        </div>
      </>,
    );
  }

  const p = problems[pos];
  return frame(
    <TaskProblem
      key={p.id}
      problem={p}
      // 挑戦は「腕試ししてみる？」くらいの軽い一言で始める
      intro={pos === 0 ? [fill(entry === 'challenge' ? L.challengeStart : L.start, { n: problems.length })] : []}
      onFinish={(r) => {
        addLog({ part: entry, step: p.id, attempts: r.attempts, shown: r.shown, hintsUsed: r.hintsUsed, ms: r.ms });
        setGained(addResult({ entry, problemId: p.id, level: p.level, types: p.types, correct: !r.shown, ms: r.ms, hint: r.hintsUsed > 0, targetSec: p.targetSec }));
        persist(pos + 1);
        setPos(pos + 1);
      }}
      onLater={() => addLater({ part: entry, problemId: p.id, from: 'solving' })}
    />,
  );
}
