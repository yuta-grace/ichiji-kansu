// ダンジョンの1回の解答：段階A（途中の値を答えてから a と b）／段階B（a と b だけ。ヒントで途中の問いをたどれる）
import { useMemo, useState } from 'react';
import AnswerBar from '../../components/AnswerBar';
import Graph from '../../components/Graph';
import { Hakase } from '../../components/Hakase';
import HintFound from '../../components/HintFound';
import MathText from '../../components/MathText';
import { NumberField } from '../../components/NumberPad';
import { useFields } from '../../components/useFields';
import type { Fields } from '../../components/useFields';
import { useHintFlow } from '../../components/useHintFlow';
import content from '../../content/dungeon.json';
import settings from '../../content/settings.json';
import { checkNumber, isOk } from '../../lib/answer';
import type { Frac } from '../../lib/fraction';
import { methodSteps, pointEquation, pointsText, problemLine, solutionLines } from '../../lib/dungeon';
import type { DungeonProblem, MethodId, Stage } from '../../lib/dungeon';
import { asLine } from '../../lib/linear';
import { fill } from '../../lib/text';

export const L = content.lines;
const S = settings.dungeon;
const HINT_FIELD = 2;

export interface SolveOutcome {
  correct: boolean;
  shown: boolean;
  ms: number;
  attempts: number;
  hintsUsed: number;
}

export function problemText(p: DungeonProblem) {
  return fill(L.problem[0], { x1: p.p1[0], y1: p.p1[1], x2: p.p2[0], y2: p.p2[1] });
}

/** 2点と切片が −10〜10 に収まる問題だけ、グラフに2点を出す（縦と横は同じ目盛り） */
function graphRange(p: DungeonProblem) {
  const l = asLine(problemLine(p));
  const xs = [p.p1[0], p.p2[0], 0];
  const ys = [p.p1[1], p.p2[1], l.b, 0];
  if ([...xs, ...ys].some((v) => Math.abs(v) > 10)) return null;
  return {
    xMin: Math.floor(Math.min(...xs)) - 1,
    xMax: Math.ceil(Math.max(...xs)) + 1,
    yMin: Math.floor(Math.min(...ys)) - 1,
    yMax: Math.ceil(Math.max(...ys)) + 1,
  };
}

export default function Solve({
  problem,
  method,
  stage,
  intro = [],
  onDone,
  onLater,
  doneLabel = L.next,
}: {
  problem: DungeonProblem;
  method: MethodId;
  stage: Stage;
  /** 最初に博士が言うこと（「それも1つのやり方だね」など） */
  intro?: string[];
  onDone: (o: SolveOutcome) => void;
  /** 解いている途中の「あとで聞く」。渡さなければボタンを出さない */
  onLater?: () => void;
  doneLabel?: string;
}) {
  const line = useMemo(() => problemLine(problem), [problem]);
  const [picks, setPicks] = useState<Frac[]>([]);
  const steps = useMemo(() => methodSteps(method, problem, picks), [method, problem, picks]);
  // 段階Aは、途中の問いから始める
  const hints = useHintFlow(steps, stage === 'A');
  const f = useFields(3, undefined, stage === 'A' ? HINT_FIELD : 0); // 0：傾き、1：切片、2：途中の値
  const [startedAt] = useState(Date.now());
  const [talk, setTalk] = useState<string[]>([...intro, problemText(problem)]);
  const [wrong, setWrong] = useState(0);
  const [states, setStates] = useState<('ok' | 'check' | undefined)[]>([]);
  const [askReduce, setAskReduce] = useState(false);
  const [nudge, setNudge] = useState(false);
  const [solution, setSolution] = useState<number | null>(null);
  const [solved, setSolved] = useState<{ ms: number } | null>(null);
  const [laterSaved, setLaterSaved] = useState(false);
  const solutionSteps = useMemo(() => solutionLines(method, problem), [method, problem]);

  const finish = () =>
    onDone({
      correct: solution === null && wrong === 0,
      shown: solution !== null,
      ms: solved?.ms ?? Date.now() - startedAt,
      attempts: wrong + 1,
      hintsUsed: stage === 'B' ? hints.used : 0,
    });

  const showSolution = () => {
    f.closePad();
    setSolution(0);
    setTalk([...L.solution.intro, solutionSteps[0]]);
  };

  const checkStep = () => {
    const r = hints.check(f.values[HINT_FIELD]);
    if (!r) return;
    if (!r.accepted && r.lines.length === 0) return setTalk(L.unreadable);
    if (r.accepted) {
      setPicks((p) => [...p, r.value!]);
      f.setValues([f.values[0], f.values[1], '']);
      if (steps[hints.index + 1]?.answer === null) f.setActive(0);
    }
    setTalk(r.lines);
  };

  const checkFinal = () => {
    if (hints.asking) return checkStep();
    const ra = checkNumber(f.values[0], line.a);
    const rb = checkNumber(f.values[1], line.b);
    if (ra.verdict === 'empty' || rb.verdict === 'empty') return setTalk(L.empty);
    if (ra.verdict === 'unreadable' || rb.verdict === 'unreadable') return setTalk(L.unreadable);
    if ((isOk(ra) && isOk(rb)) || askReduce) {
      if (!askReduce && (ra.verdict === 'ok-unreduced' || rb.verdict === 'ok-unreduced')) {
        setAskReduce(true);
        setStates([ra.verdict === 'ok-unreduced' ? 'check' : 'ok', rb.verdict === 'ok-unreduced' ? 'check' : 'ok']);
        return setTalk(L.unreduced);
      }
      if (isOk(ra) && isOk(rb)) {
        f.closePad();
        setStates(['ok', 'ok']);
        setSolved({ ms: Date.now() - startedAt });
        return setTalk(L.ok);
      }
    }
    const n = wrong + 1;
    setWrong(n);
    setStates([isOk(ra) ? undefined : 'check', isOk(rb) ? undefined : 'check']);
    // 段階Aは途中の問いをたどった後なので、2回目に違ったら解き方を見せる。
    // 段階Bは練習と同じ（2回目にヒントを勧める。ヒントの後でも違ったら、またはヒントなしで何度も違ったら解き方）
    if ((stage === 'A' && n >= 2) || (stage === 'B' && (hints.finished || n >= S.showSolutionAfterWrong))) return showSolution();
    const which = !isOk(ra) && !isOk(rb) ? 'both' : !isOk(ra) ? 'a' : 'b';
    const lines = [...L.wrong[which]];
    if (stage === 'B' && n >= S.suggestHintAfterWrong && !hints.started) {
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

  const range = graphRange(problem);
  const showEquations = method === 'renritsu' && hints.started && solution === null;
  const stepLine = hints.step && !solved && solution === null ? hints.step.q : null;

  let actions;
  if (solved) {
    actions = <button type="button" className="btn primary" onClick={finish}>{doneLabel}</button>;
  } else if (solution !== null) {
    actions = (
      <button
        type="button"
        className="btn primary"
        onClick={() => {
          if (solution >= solutionSteps.length - 1) return finish();
          const n = solution + 1;
          setSolution(n);
          setTalk(n === solutionSteps.length - 1 ? [solutionSteps[n], ...L.solution.end] : [solutionSteps[n]]);
        }}
      >
        {L.next}
      </button>
    );
  } else {
    actions = (
      <AnswerBar
        f={f}
        onSubmit={checkFinal}
        submitLabel={L.check}
        tabCount={hints.asking ? 3 : 2}
        extra={
          <>
            {onLater && !laterSaved && (
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
            )}
            {stage === 'B' && !hints.started && (
              <button type="button" className={`btn small ghost ${nudge ? 'pulse' : ''}`} onClick={openHint}>{L.hint}</button>
            )}
          </>
        }
      >
        {hints.asking ? (
          <span className="hint-field">
            <small>{stage === 'A' ? '' : L.hint}</small>
            <NumberField value={f.values[HINT_FIELD]} active onFocus={() => f.focus(HINT_FIELD)} state="clue" ariaLabel="途中の値" />
          </span>
        ) : (
          <EquationFieldsAB f={f} states={states} />
        )}
      </AnswerBar>
    );
  }

  return (
    <div className="step">
      <Hakase lines={stepLine ? [...talk, stepLine] : talk} />
      <div className="work">
        <div className="points-card">
          {pointsText(problem)}
        </div>
        {showEquations && (
          <div className="hint-found">
            <span>{pointEquation(problem.p1[0], problem.p1[1])}</span>
            <span>{pointEquation(problem.p2[0], problem.p2[1])}</span>
          </div>
        )}
        {hints.found.length > 0 && !solved && solution === null && <HintFound title={L.foundTitle} items={hints.found} />}
        {solution !== null && solution >= solutionSteps.length - 1 && (
          <div className="equation big">
            <MathText text={solutionSteps[solutionSteps.length - 1].replace(/^式は |。$/g, '')} />
          </div>
        )}
        {range && (
          <Graph
            {...range}
            equalScale
            points={[
              { x: problem.p1[0], y: problem.p1[1], tone: 'main' },
              { x: problem.p2[0], y: problem.p2[1], tone: 'main' },
            ]}
            lines={solved || solution !== null ? [{ ...asLine(line), tone: 'faint' }] : []}
          />
        )}
      </div>
      <div className="actions">{actions}</div>
    </div>
  );
}

function EquationFieldsAB({ f, states }: { f: Fields; states: ('ok' | 'check' | undefined)[] }) {
  return (
    <div className="equation">
      <span className="eq-text">y ＝</span>
      <NumberField value={f.values[0]} active={f.active === 0} onFocus={() => f.focus(0)} state={states[0]} ariaLabel="傾き" />
      <span className="eq-text">x ＋</span>
      <NumberField value={f.values[1]} active={f.active === 1} onFocus={() => f.focus(1)} state={states[1]} ariaLabel="切片" />
    </div>
  );
}
