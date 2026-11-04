import { useState } from 'react';
import { Hakase } from '../../components/Hakase';
import Topbar from '../../components/Topbar';
import content from '../../content/practice.json';
import settings from '../../content/settings.json';
import { moveSameTypeCloser } from '../../lib/practiceOrder';
import { addLater, addLog, load, update } from '../../lib/storage';
import Problem, { L } from './Problem';
import type { ProblemData, ProblemResult } from './Problem';

const byId = new Map((content.problems as ProblemData[]).map((p) => [p.id, p]));
const typeOf = (id: string) => byId.get(id)?.type ?? '';
const initialQueue = () => content.problems.map((p) => p.id);

// 練習：3方向を混ぜて9問（5.3）。ダンジョンへ進む条件はつけない
// resume：学ぶの「続きから」カードから入ったときは、続きから始めるかを聞かない
export default function Practice({ onExit, resume = false }: { onExit: () => void; resume?: boolean }) {
  const saved = load().practice;
  const canResume = !!saved && !saved.done && saved.pos > 0 && saved.queue.every((id) => byId.has(id));
  const [queue, setQueue] = useState<string[]>(canResume ? saved!.queue : initialQueue());
  const [pos, setPos] = useState(canResume ? (resume ? saved!.pos : -1) : 0);
  // 注釈を消すための連続正解（3方向まとめて数える）。間違えたら0から数え直す
  const [streak, setStreak] = useState(saved?.streak ?? 0);
  const [startedAt, setStartedAt] = useState(Date.now());

  const persist = (q: string[], p: number, s: number, done = false) =>
    update((d) => {
      d.practice = { queue: q, pos: p, streak: s, done };
    });

  const start = (p: number, q = queue) => {
    setPos(p);
    setStartedAt(Date.now());
    persist(q, p, streak);
  };

  const onFinish = (r: ProblemResult) => {
    const id = queue[pos];
    addLog({ part: 'practice', step: id, attempts: r.attempts, shown: r.shown, hintsUsed: r.hintsUsed, ms: Date.now() - startedAt });
    const s = r.firstTry ? streak + 1 : 0;
    // 解き方を見せた問題と同じ種類を、後でもう一度出す（出題順の調整で）
    const q = r.shown ? moveSameTypeCloser(queue, pos, typeOf, settings.practice.sameTypeAgainAfter) : queue;
    setStreak(s);
    setQueue(q);
    const next = pos + 1;
    setPos(next);
    setStartedAt(Date.now());
    persist(q, next, s, next >= q.length);
  };

  if (pos < 0) {
    return (
      <div className="screen fit">
        <Topbar onExit={onExit} progress={saved!.pos / queue.length} />
        <Hakase lines={L.resume} />
        <div className="actions">
          <button type="button" className="btn primary" onClick={() => start(saved!.pos)}>続きから</button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              const q = initialQueue();
              setQueue(q);
              start(0, q);
            }}
          >
            最初から
          </button>
        </div>
      </div>
    );
  }

  if (pos >= queue.length) {
    return (
      <div className="screen fit">
        <Topbar onExit={onExit} progress={1} />
        <Hakase lines={L.end} />
        <div className="actions">
          <button type="button" className="btn primary" onClick={onExit}>{L.home}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="screen fit">
      <Topbar onExit={onExit} progress={pos / queue.length} />
      <Problem
        key={`${pos}-${queue[pos]}`}
        problem={byId.get(queue[pos])!}
        first={pos === 0}
        annotate={streak < settings.practice.annotationHideAfterStreak}
        onFinish={onFinish}
        onLater={() => addLater({ part: 'practice', problemId: queue[pos], from: 'solving' })}
      />
    </div>
  );
}
