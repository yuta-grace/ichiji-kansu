import { useState } from 'react';
import Graph from '../components/Graph';
import { Hakase } from '../components/Hakase';
import MathText from '../components/MathText';
import ValueTable from '../components/ValueTable';
import dungeon from '../content/dungeon.json';
import practice from '../content/practice.json';
import content from '../content/profile.json';
import { methodName, pointsText } from '../lib/dungeon';
import type { DungeonProblem } from '../lib/dungeon';
import { toString } from '../lib/fraction';
import { asLine, eqText, linear, yAt } from '../lib/linear';
import { practiceSolution } from '../lib/practiceSolution';
import { load, openLater } from '../lib/storage';
import type { LaterItem } from '../lib/storage';
import { fill } from '../lib/text';
import Walkthrough from './dungeon/Walkthrough';

const T = content.later;
type PracticeProblem = { id: string; type: string; a: string; b: string; xs?: number[] };
const dungeonById = (id: string) => (dungeon.problems as DungeonProblem[]).find((p) => p.id === id);
const practiceById = (id: string) => (practice.problems as PracticeProblem[]).find((p) => p.id === id);

/** 一覧・講師用画面に出す見出し（問題と、あれば解き方） */
export function laterLabel(it: LaterItem): { title: string; sub: string } {
  if (it.part === 'practice') {
    const p = practiceById(it.problemId);
    const title = p ? (p.type === 'eq-graph' ? eqText(linear(p.a, p.b)).replace(/\[|\]/g, '') : T.typeLabel[p.type as keyof typeof T.typeLabel]) : it.problemId;
    return { title: `${T.practiceLabel}：${title}`, sub: T.fromSolving };
  }
  const p = dungeonById(it.problemId);
  return {
    title: p ? pointsText(p) : it.problemId,
    sub: `${it.method ? methodName(it.method) : ''}（${it.from === 'solving' ? T.fromSolving : T.fromOthers}）`,
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

/** 「あとで聞く」の1件を見る */
export function LaterView({ item, onDone }: { item: LaterItem; onDone: () => void }) {
  if (item.part === 'practice') {
    const p = practiceById(item.problemId);
    return p ? <PracticeView problem={p} onDone={onDone} /> : null;
  }
  const problem = dungeonById(item.problemId);
  if (!problem || !item.method) return null;
  return (
    <Walkthrough
      problem={problem}
      method={item.method}
      intro={T.viewIntro.map((t) => fill(t, { m: methodName(item.method!) }))}
      onDone={onDone}
    />
  );
}

// 生徒が自分で見る「あとで聞く」の一覧（講師が「聞いた」にしたものは出さない）
export default function Later({ onExit }: { onExit: () => void }) {
  const items = openLater(load());
  const [viewing, setViewing] = useState<LaterItem | null>(null);

  if (viewing) {
    return (
      <div className="screen fit">
        <header className="topbar">
          <button type="button" className="btn small ghost" onClick={() => setViewing(null)}>{T.back}</button>
        </header>
        <LaterView item={viewing} onDone={() => setViewing(null)} />
      </div>
    );
  }
  return (
    <div className="screen">
      <header className="topbar">
        <button type="button" className="btn small ghost" onClick={onExit}>ホーム</button>
        <h2 className="menu-title">{T.title}</h2>
      </header>
      <Hakase lines={items.length ? T.listIntro : T.empty} />
      <ul className="menu">
        {items.map((it) => {
          const label = laterLabel(it);
          return (
            <li key={it.id}>
              <button type="button" className="menu-item" onClick={() => setViewing(it)}>
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
