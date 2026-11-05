// 新しい入口の1問（5.6〜5.8）。答え方は A 座標／B 単位つきの数／y ＝ ax ＋ b の a と b
// 図は C・D（座標の上のグラフ）、E（動く点）、F（場面カード）。ヒントと間違えたときの扱いは練習と同じ
import { useMemo, useState } from 'react';
import AnswerBar from '../../components/AnswerBar';
import Graph from '../../components/Graph';
import { Hakase } from '../../components/Hakase';
import HintFound from '../../components/HintFound';
import MathText from '../../components/MathText';
import MovingPoint from '../../components/MovingPoint';
import { NumberField } from '../../components/NumberPad';
import ValueTable from '../../components/ValueTable';
import { useFields } from '../../components/useFields';
import type { Fields } from '../../components/useFields';
import { useHintFlow } from '../../components/useHintFlow';
import settings from '../../content/settings.json';
import content from '../../content/task.json';
import titleText from '../../content/titles.json';
import { checkNumber, isOk } from '../../lib/answer';
import type { Checked } from '../../lib/answer';
import { toFrac } from '../../lib/linear';
import { formatTime } from '../../lib/results';
import { num, taskHintSteps } from '../../lib/task';
import type { TaskProblem as TaskProblemData } from '../../lib/task';
import { fill } from '../../lib/text';

const L = content;
const S = settings.practice;
const HINT_FIELD = 2;

export interface TaskResult {
  attempts: number;
  shown: boolean;
  hintsUsed: number;
  ms: number;
}

type FieldState = 'ok' | 'check' | undefined;

export default function TaskProblem({
  problem,
  intro = [],
  onFinish,
  onLater,
}: {
  problem: TaskProblemData;
  /** 最初に博士が言うこと（「10問いくよ。」など） */
  intro?: string[];
  onFinish: (r: TaskResult) => void;
  onLater?: () => void;
}) {
  const steps = useMemo(() => taskHintSteps(problem, L.hintWrong), [problem]);
  const hints = useHintFlow(steps);
  const ans = problem.answer;
  const f = useFields(3); // 0・1：答え（数1つのときは 0 だけ）、2：ヒントの答え
  const [startedAt] = useState(Date.now());
  const [talk, setTalk] = useState<string[]>([...intro, ...problem.prompt]);
  const [wrong, setWrong] = useState(0);
  const [states, setStates] = useState<FieldState[]>([]);
  const [askReduce, setAskReduce] = useState(false);
  const [nudge, setNudge] = useState(false);
  const [solution, setSolution] = useState<number | null>(null);
  const [solved, setSolved] = useState<number | null>(null);
  const [laterSaved, setLaterSaved] = useState(false);
  // 正解した後に「他のやり方」を見ている段（null＝見ていない）
  const [others, setOthers] = useState<number | null>(null);
  const fieldCount = ans.kind === 'number' ? 1 : 2;

  const finish = () => onFinish({ attempts: wrong + 1, shown: solution !== null, hintsUsed: hints.used, ms: solved ?? Date.now() - startedAt });

  const showSolution = () => {
    f.closePad();
    setSolution(0);
    setTalk([...L.solution.intro, problem.solution[0]]);
  };

  const checkHint = () => {
    const r = hints.check(f.values[HINT_FIELD]);
    if (!r) return;
    if (r.lines.length === 0 && !r.accepted) return setTalk(L.unreadable);
    if (r.accepted) {
      f.setValues([f.values[0], f.values[1], '']);
      if (steps[hints.index + 1]?.answer === null) {
        f.setActive(0);
        return setTalk([...r.lines, L.backToProblem]);
      }
    }
    setTalk(r.lines);
  };

  const check = () => {
    if (hints.asking) return checkHint();
    const expected = ans.kind === 'number' ? [ans.value] : ans.kind === 'point' ? [ans.x, ans.y] : ans.kind === 'pair' ? ans.values : [ans.a, ans.b];
    const rs: Checked[] = expected.map((e, i) => checkNumber(f.values[i], toFrac(e)));
    if (rs.some((r) => r.verdict === 'empty')) return setTalk(L.empty);
    if (rs.some((r) => r.verdict === 'unreadable')) return setTalk(L.unreadable);
    if (rs.every(isOk) || askReduce) {
      // 約分していない分数は正解として扱い、約分を聞く（6章）
      if (!askReduce && rs.some((r) => r.verdict === 'ok-unreduced')) {
        setAskReduce(true);
        setStates(rs.map((r) => (r.verdict === 'ok-unreduced' ? 'check' : 'ok')));
        return setTalk(L.unreduced);
      }
      if (rs.every(isOk)) {
        const ms = Date.now() - startedAt;
        f.closePad();
        setSolved(ms);
        setStates(rs.map(() => 'ok'));
        // 時間は正解した後にだけ見せる（ヒントを使った問題は計らない）。動く点は、つまみで面積の数も見られる
        const lines = [...L.ok, ...(hints.started ? [] : [fill(titleText.time, { t: formatTime(ms) })])];
        return setTalk(problem.figure ? [...lines, ...L.moving.afterSolved] : lines);
      }
    }
    const n = wrong + 1;
    setWrong(n);
    setStates(rs.map((r) => (isOk(r) ? undefined : 'check')));
    if (hints.finished || n >= S.showSolutionAfterWrong) return showSolution();
    const bad = rs.map((r) => !isOk(r));
    const lines =
      ans.kind === 'pair'
        ? bad[0] && bad[1]
          ? [...L.wrong.pairBoth]
          : L.wrong.pair.map((t) => fill(t, { label: ans.labels[bad[0] ? 0 : 1] }))
        : [...L.wrong[ans.kind === 'number' ? 'number' : ans.kind === 'point' ? (bad[0] && bad[1] ? 'xy' : bad[0] ? 'x' : 'y') : bad[0] && bad[1] ? 'ab' : bad[0] ? 'a' : 'b']];
    if (n >= S.suggestHintAfterWrong && !hints.started) {
      lines.push(...L.suggestHint);
      setNudge(true);
    }
    setTalk(lines);
  };

  const openHint = () => {
    hints.start();
    setNudge(false);
    setTalk([]);
    f.setValues([f.values[0], f.values[1], '']);
    f.setActive(HINT_FIELD);
  };

  const hintLine = hints.step && hints.step.q && solved === null && solution === null ? hints.step.q : null;
  // その段で博士が添える一言（「実際には P はそこにいないけど…」など）
  const hintSay = hintLine && hints.asking ? problem.hints[hints.index]?.say : undefined;
  const laterButton = onLater && !laterSaved && (
    <button
      type="button"
      className="btn small ghost"
      onClick={() => {
        onLater();
        setLaterSaved(true);
        setTalk(L.laterSaved);
      }}
    >
      {L.laterButton}
    </button>
  );

  let actions;
  if (solved !== null && others !== null) {
    // 他のやり方を1つずつ見せる。最後まで見たら次の問題へ
    const o = problem.others!;
    actions = (
      <button
        type="button"
        className="btn primary"
        onClick={() => {
          if (others >= o.lines.length) return finish();
          const n = others + 1;
          setOthers(n);
          setTalk(n >= o.lines.length ? L.others.end : [o.lines[n]]);
        }}
      >
        {L.next}
      </button>
    );
  } else if (solved !== null) {
    actions = (
      <>
        {problem.others && (
          <button
            type="button"
            className="btn"
            onClick={() => {
              setOthers(0);
              setTalk([...problem.others!.intro, problem.others!.lines[0]]);
            }}
          >
            {L.others.button}
          </button>
        )}
        <button type="button" className="btn primary" onClick={finish}>{L.next}</button>
      </>
    );
  } else if (solution !== null) {
    const last = solution >= problem.solution.length - 1;
    actions = (
      <button
        type="button"
        className="btn primary"
        onClick={() => {
          if (last) return finish();
          const n = solution + 1;
          setSolution(n);
          setTalk(n === problem.solution.length - 1 ? [problem.solution[n], ...L.solution.end] : [problem.solution[n]]);
        }}
      >
        {L.next}
      </button>
    );
  } else {
    actions = (
      <AnswerBar
        f={f}
        onSubmit={check}
        submitLabel={L.check}
        tabCount={hints.asking ? 3 : fieldCount}
        extra={
          <>
            {laterButton}
            {!hints.started && (
              <button type="button" className={`btn small ghost ${nudge ? 'pulse' : ''}`} onClick={openHint}>
                {L.hint}
              </button>
            )}
          </>
        }
      >
        {hints.asking ? (
          <NumberField value={f.values[HINT_FIELD]} active onFocus={() => f.focus(HINT_FIELD)} state="clue" ariaLabel="ヒントの答え" />
        ) : (
          <AnswerFields problem={problem} f={f} states={states} />
        )}
      </AnswerBar>
    );
  }

  const g = problem.graph;
  return (
    <div className="step">
      <Hakase lines={hintLine ? [...talk, ...(hintSay ? [hintSay] : []), hintLine] : talk} />
      <div className="work">
        {problem.card && (
          <div className="scene-card">
            {problem.card.map((t, i) => (
              <p key={i}>
                <MathText text={t} />
              </p>
            ))}
          </div>
        )}
        {/* 表を作るヒントでは、分かったことは表の下に1行で出す（画面の高さに収めるため） */}
        {hints.found.length > 0 && solved === null && solution === null && !problem.hintTable && <HintFound title={L.foundTitle} items={hints.found} />}
        {problem.hintTable && hints.started && solution === null && (
          <HintTable problem={problem} answered={hints.finished ? problem.hints.length : hints.index} found={solved === null ? hints.found : []} />
        )}
        {others !== null && problem.others && (
          <div className="hint-found">
            {problem.others.lines.slice(0, others + 1).map((t, k) => (
              <span key={k}>
                <MathText text={t} />
              </span>
            ))}
          </div>
        )}
        {solution !== null && (
          <div className="hint-found">
            {problem.solution.slice(0, solution + 1).map((t, k) => (
              <span key={k}>
                <MathText text={t} />
              </span>
            ))}
          </div>
        )}
        {problem.table && (
          <ValueTable xLabel={problem.table.xLabel} yLabel={problem.table.yLabel} xs={problem.table.xs} ys={problem.table.ys.map(String)} />
        )}
        {problem.figure && (
          <MovingPoint figure={problem.figure} revealed={solved !== null} focusT={hints.asking ? problem.hints[hints.index]?.x : undefined} />
        )}
        {g && (
          <Graph
            xMin={g.xMin}
            xMax={g.xMax}
            yMin={g.yMin}
            yMax={g.yMax}
            equalScale={g.equalScale !== false}
            xLabel={g.xLabel}
            yLabel={g.yLabel}
            lines={(g.lines ?? []).map((l) => ({ a: num(l.a), b: num(l.b), name: l.name }))}
            polygons={g.polygon ? [{ pts: g.polygon.map(([x, y]) => ({ x, y })) }] : []}
            points={(g.points ?? []).map((p) => ({ x: p.x, y: p.y, label: p.label, tone: 'faint' as const }))}
          />
        )}
      </div>
      <div className="actions">{actions}</div>
    </div>
  );
}

/** A 座標「( □ , □ )」、B 単位つきの数、または y ＝ □x ＋ □ */
function AnswerFields({ problem, f, states }: { problem: TaskProblemData; f: Fields; states: FieldState[] }) {
  const a = problem.answer;
  const field = (i: number, label: string, small?: string) => (
    <span className="labeled-field">
      {small !== undefined && <small>{small}</small>}
      <NumberField value={f.values[i]} active={f.active === i} onFocus={() => f.focus(i)} state={states[i]} ariaLabel={label} />
    </span>
  );
  if (a.kind === 'point') {
    return (
      <div className="equation">
        <span className="eq-text">(</span>
        {field(0, 'x 座標', 'x')}
        <span className="eq-text">,</span>
        {field(1, 'y 座標', 'y')}
        <span className="eq-text">)</span>
      </div>
    );
  }
  if (a.kind === 'pair') {
    return (
      <div className="equation pair">
        {a.labels.map((label, i) => (
          <span key={label} className="pair-item">
            {field(i, label, label)}
            {a.unit && <span className="eq-text unit">{a.unit}</span>}
          </span>
        ))}
      </div>
    );
  }
  if (a.kind === 'linear') {
    return (
      <div className="equation">
        <span className="eq-text">y ＝</span>
        {field(0, '傾き', '傾き')}
        <span className="eq-text">x ＋</span>
        {field(1, '切片', '切片')}
      </div>
    );
  }
  return (
    <div className="equation">
      {a.before && <span className="eq-text">{a.before}</span>}
      {field(0, '答え')}
      {a.unit && <span className="eq-text unit">{a.unit}</span>}
    </div>
  );
}

/** 動く点のヒントで埋める表。最初から見せる列と、ヒントで答えたマスだけ数を出す */
function HintTable({ problem, answered, found }: { problem: TaskProblemData; answered: number; found: string[] }) {
  const t = problem.hintTable!;
  const filled = new Set(problem.hints.slice(0, answered).flatMap((h) => (h.cell ? [`${h.cell[0]}-${h.cell[1]}`] : [])));
  return (
    <div className="vtable-wrap">
      <table className="vtable hint-table">
        <tbody>
          <tr>
            <th>x</th>
            {t.xs.map((x) => (
              <td key={x}>{x}</td>
            ))}
          </tr>
          {t.rows.map((r, i) => (
            <tr key={r.label}>
              <th>{r.label}</th>
              {r.values.map((v, j) => (
                <td key={j} className={filled.has(`${i}-${j}`) ? 'filled' : ''}>
                  {r.given?.includes(j) || filled.has(`${i}-${j}`) ? v.replace('-', '−') : '　'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {found.length > 0 && <p className="hint-table-found">{found.join('　')}</p>}
    </div>
  );
}
