import { useState } from 'react';
import Graph from '../components/Graph';
import { Hakase } from '../components/Hakase';
import MathText from '../components/MathText';
import ValueTable from '../components/ValueTable';
import dungeon from '../content/dungeon.json';
import practice from '../content/practice.json';
import content from '../content/profile.json';
import { pointsText } from '../lib/dungeon';
import { isLearned, methodLabel, noteOrder } from '../lib/notebook';
import type { DungeonProblem } from '../lib/dungeon';
import { toString } from '../lib/fraction';
import { asLine, eqText, linear, yAt } from '../lib/linear';
import { practiceSolution } from '../lib/practiceSolution';
import { load, openLater } from '../lib/storage';
import type { LaterItem, SaveData } from '../lib/storage';
import { fill } from '../lib/text';
import Walkthrough from './dungeon/Walkthrough';
import MovingPoint from '../components/MovingPoint';
import { entryLabel } from '../lib/results';
import { isTaskEntry, num, taskProblems } from '../lib/task';
import type { TaskProblem } from '../lib/task';

const T = content.later;
type PracticeProblem = { id: string; type: string; a: string; b: string; xs?: number[] };
const dungeonById = (id: string) => (dungeon.problems as DungeonProblem[]).find((p) => p.id === id);
const practiceById = (id: string) => (practice.problems as PracticeProblem[]).find((p) => p.id === id);

/** 一覧・講師用画面に出す見出し（問題と、あれば解き方）。d は、その生徒の記録（解き方の名前に使う） */
export function laterLabel(it: LaterItem, d: SaveData = load()): { title: string; sub: string } {
  if (it.part && isTaskEntry(it.part)) {
    const i = taskProblems(it.part).findIndex((p) => p.id === it.problemId);
    return { title: `${entryLabel(it.part)}：${fill(T.taskNumber, { n: i + 1 })}`, sub: T.fromSolving };
  }
  if (it.part === 'practice') {
    const p = practiceById(it.problemId);
    const title = p ? (p.type === 'eq-graph' ? eqText(linear(p.a, p.b)).replace(/\[|\]/g, '') : T.typeLabel[p.type as keyof typeof T.typeLabel]) : it.problemId;
    return { title: `${T.practiceLabel}：${title}`, sub: T.fromSolving };
  }
  const p = dungeonById(it.problemId);
  return {
    title: p ? pointsText(p) : it.problemId,
    sub: `${it.method ? methodLabel(d, it.method) : ''}（${it.from === 'solving' ? T.fromSolving : T.fromOthers}）`,
  };
}

/** 練習の問題を、その問題の数字で解き方を1つずつ見せる */
function PracticeView({ problem, onDone }: { problem: PracticeProblem; onDone: () => void }) {
  const steps = practiceSolution(problem);
  const line = linear(problem.a, problem.b);
  const [i, setI] = useState(0);
  return (
    <div className="step">
      <Hakase lines={i === 0 ? [...T.practiceViewIntro, steps[0]] : [steps[i]]} />
      <div className="work">
        {problem.type === 'table-eq' ? (
          <ValueTable xLabel="x" yLabel="y" xs={problem.xs ?? []} ys={(problem.xs ?? []).map((x) => toString(yAt(line, x)))} />
        ) : (
          <>
            {problem.type === 'eq-graph' && (
              <div className="equation big">
                <MathText text={eqText(line)} />
              </div>
            )}
            <Graph {...practice.graph} equalScale lines={[asLine(line)]} points={[{ x: 0, y: line.b.n / line.b.d, tone: 'accent' }]} />
          </>
        )}
        <div className="hint-found">
          {steps.slice(0, i + 1).map((t, k) => (
            <span key={k}>
              <MathText text={t} />
            </span>
          ))}
        </div>
      </div>
      <div className="actions">
        <button type="button" className="btn primary" onClick={() => (i >= steps.length - 1 ? onDone() : setI(i + 1))}>
          {dungeon.lines.next}
        </button>
      </div>
    </div>
  );
}

/** 新しい入口の問題を、問題を出したまま解き方を1つずつ見せる */
function TaskView({ problem, onDone }: { problem: TaskProblem; onDone: () => void }) {
  const steps = problem.solution;
  const [i, setI] = useState(0);
  const g = problem.graph;
  return (
    <div className="step">
      <Hakase lines={i === 0 ? [...T.practiceViewIntro, steps[0]] : [steps[i]]} />
      <div className="work">
        <div className="scene-card">
          {[...(problem.card ?? []), ...problem.prompt].map((t, k) => (
            <p key={k}>
              <MathText text={t} />
            </p>
          ))}
        </div>
        <div className="hint-found">
          {steps.slice(0, i + 1).map((t, k) => (
            <span key={k}>
              <MathText text={t} />
            </span>
          ))}
        </div>
        {problem.table && <ValueTable xLabel={problem.table.xLabel} yLabel={problem.table.yLabel} xs={problem.table.xs} ys={problem.table.ys.map(String)} />}
        {problem.figure && <MovingPoint figure={problem.figure} revealed />}
        {g && (
          <Graph
            xMin={g.xMin}
            xMax={g.xMax}
            yMin={g.yMin}
            yMax={g.yMax}
            equalScale
            lines={(g.lines ?? []).map((l) => ({ a: num(l.a), b: num(l.b), name: l.name }))}
            polygons={g.polygon ? [{ pts: g.polygon.map(([x, y]) => ({ x, y })) }] : []}
            points={(g.points ?? []).map((p) => ({ x: p.x, y: p.y, label: p.label, tone: 'faint' as const }))}
          />
        )}
      </div>
      <div className="actions">
        <button type="button" className="btn primary" onClick={() => (i >= steps.length - 1 ? onDone() : setI(i + 1))}>
          {dungeon.lines.next}
        </button>
      </div>
    </div>
  );
}

/** 「あとで聞く」の1件を見る */
export function LaterView({ item, onDone }: { item: LaterItem; onDone: () => void }) {
  if (item.part === 'practice') {
    const p = practiceById(item.problemId);
    return p ? <PracticeView problem={p} onDone={onDone} /> : null;
  }
  if (item.part && isTaskEntry(item.part)) {
    const p = taskProblems(item.part).find((x) => x.id === item.problemId);
    return p ? <TaskView problem={p} onDone={onDone} /> : null;
  }
  const problem = dungeonById(item.problemId);
  if (!problem) return null;
  // 解き方が決まっていない（ヒントを使う前に残した）ときは、ノートの最初の解き方で見せる
  const d = load();
  const method = item.method ?? noteOrder(d).find((m) => isLearned(d, m)) ?? 'modoru';
  return (
    <Walkthrough
      problem={problem}
      method={method}
      intro={T.viewIntro.map((t) => fill(t, { m: methodLabel(d, method) }))}
      onDone={onDone}
    />
  );
}

// 生徒が自分で見る「後で聞く」の一覧（講師が「聞いた」にしたものは出さない）
export default function Later({ onView }: { onView: (it: LaterItem) => void }) {
  const items = openLater(load());
  return (
    <div className="screen tabbed">
      <h2 className="menu-title">{T.title}</h2>
      <Hakase lines={items.length ? T.listIntro : T.empty} />
      <ul className="menu">
        {items.map((it) => {
          const label = laterLabel(it);
          return (
            <li key={it.id}>
              <button type="button" className="menu-item" onClick={() => onView(it)}>
                <span className="menu-label">
                  <MathText text={label.title} />
                  <small className="later-method">{label.sub}</small>
                </span>
                <span className="menu-note">{T.view}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
