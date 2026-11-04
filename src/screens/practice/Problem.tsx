// 練習の1問（5.3・5.5）
import { useMemo, useState } from 'react';
import AnswerBar from '../../components/AnswerBar';
import Graph from '../../components/Graph';
import type { GraphLine, GraphPoint, GraphStair } from '../../components/Graph';
import { Hakase } from '../../components/Hakase';
import HintFound from '../../components/HintFound';
import MathText from '../../components/MathText';
import { NumberField } from '../../components/NumberPad';
import ValueTable from '../../components/ValueTable';
import { useFields } from '../../components/useFields';
import type { Fields } from '../../components/useFields';
import { useHintFlow } from '../../components/useHintFlow';
import content from '../../content/practice.json';
import settings from '../../content/settings.json';
import { checkNumber, isOk } from '../../lib/answer';
import { eq, toString } from '../../lib/fraction';
import type { Pt } from '../../lib/graphMath';
import { buildHints } from '../../lib/hints';
import type { HintSpec, HintTexts } from '../../lib/hints';
import { asLine, eqText, lineThrough, linear, onLine, yAt } from '../../lib/linear';
import { practiceHints, practiceSolution } from '../../lib/practiceSolution';
import { fill } from '../../lib/text';

export const L = content.lines;
const S = settings.practice;
const HINT_FIELD = 2;

type ProblemType = 'eq-graph' | 'graph-eq' | 'table-eq';
/** practice.json の1問 */
export interface ProblemData {
  id: string;
  type: string;
  a: string;
  b: string;
  xs?: number[];
  hints?: HintSpec[];
}

export interface ProblemResult {
  attempts: number;
  /** 一度も間違えずに正解した（注釈を消すための連続正解に数える） */
  firstTry: boolean;
  shown: boolean;
  hintsUsed: number;
}

type FieldState = 'ok' | 'check' | undefined;

export default function Problem({
  problem,
  first,
  annotate,
  onFinish,
  onLater,
}: {
  problem: ProblemData;
  first: boolean;
  /** 注釈を出すか（最初の数回）。間違えたら、この問題の間は必ず出す */
  annotate: boolean;
  onFinish: (r: ProblemResult) => void;
  /** 「あとで聞く」（問題単位。ヒントの途中でも押せる） */
  onLater: () => void;
}) {
  const type = problem.type as ProblemType;
  const line = useMemo(() => linear(problem.a, problem.b), [problem]);
  const prompt = L.prompt[type];

  // ヒントの段：表は x の並びから決める（見えている変化から聞いて、1あたりに直す）。問題ごとに上書きもできる
  const hintSteps = useMemo(
    () =>
      buildHints(practiceHints(problem), line, {
        type,
        where: L.where[type],
        texts: L.hintTexts as unknown as Record<string, HintTexts>,
      }),
    [problem, line, type],
  );
  const hints = useHintFlow(hintSteps);

  const f = useFields(3); // 0：傾き、1：切片、2：ヒントの答え
  const [pts, setPts] = useState<Pt[]>([]);
  const [wrong, setWrong] = useState(0);
  const [talk, setTalk] = useState<string[]>(first ? [...L.start, ...prompt] : prompt);
  const [states, setStates] = useState<FieldState[]>([]);
  const [studentLine, setStudentLine] = useState<GraphLine | null>(null);
  const [askReduce, setAskReduce] = useState(false);
  const [nudge, setNudge] = useState(false);
  // 解き方を見せている段（null＝見せていない）
  const [solution, setSolution] = useState<number | null>(null);
  const [solved, setSolved] = useState(false);
  // ヒントの後、元の問題に一度答えたら「この2つを式に入れると？」は消す
  const [answeredAfterHints, setAnsweredAfterHints] = useState(false);
  const [laterSaved, setLaterSaved] = useState(false);
  const laterButton = !laterSaved && (
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

  const S2 = L.solution;
  const solutionSteps = useMemo(() => practiceSolution(problem), [problem]);

  const finish = () =>
    onFinish({ attempts: wrong + 1, firstTry: wrong === 0 && solution === null, shown: solution !== null, hintsUsed: hints.used });

  const markWrong = (which: 'a' | 'b' | 'both', extra: string[] = []) => {
    const n = wrong + 1;
    setWrong(n);
    // ヒントを最後まで使ってから元の問題で違ったとき、またはヒントなしで何度も違ったとき、解き方を順に見せる
    if (hints.finished || n >= S.showSolutionAfterWrong) {
      f.closePad();
      setSolution(0);
      setTalk([...S2.intro, solutionSteps[0]]);
      return;
    }
    const lines = [...extra, ...L.wrong[which]];
    if (n >= S.suggestHintAfterWrong && !hints.started) {
      lines.push(...L.suggestHint);
      setNudge(true);
    }
    setTalk(lines);
  };

  const solve = (lines: string[]) => {
    f.closePad();
    setSolved(true);
    setTalk(lines);
  };

  // a と b を答える問題
  const checkEquation = () => {
    if (hints.asking) return checkHint();
    if (hints.finished) setAnsweredAfterHints(true);
    const ra = checkNumber(f.values[0], line.a);
    const rb = checkNumber(f.values[1], line.b);
    if (ra.verdict === 'empty' || rb.verdict === 'empty') return setTalk(L.empty);
    if (ra.verdict === 'unreadable' || rb.verdict === 'unreadable') return setTalk(L.unreadable);
    if (isOk(ra) && isOk(rb)) {
      // 約分していない分数は正解として扱い、約分を聞く（6章）
      if (!askReduce && (ra.verdict === 'ok-unreduced' || rb.verdict === 'ok-unreduced')) {
        setAskReduce(true);
        setStates([ra.verdict === 'ok-unreduced' ? 'check' : 'ok', rb.verdict === 'ok-unreduced' ? 'check' : 'ok']);
        f.setActive(ra.verdict === 'ok-unreduced' ? 0 : 1);
        return setTalk(L.unreduced);
      }
      setStates(['ok', 'ok']);
      return solve(L.ok);
    }
    if (askReduce) {
      // 約分を聞いた後は、値が合っていれば正解のまま
      setStates(['ok', 'ok']);
      return solve(L.ok);
    }
    // a と b のどちらが違うかだけ示す（5.5）
    setStates([isOk(ra) ? undefined : 'check', isOk(rb) ? undefined : 'check']);
    markWrong(!isOk(ra) && !isOk(rb) ? 'both' : !isOk(ra) ? 'a' : 'b');
  };

  // グラフを描く問題（点を2つ打つ）
  const checkGraph = () => {
    if (hints.finished) setAnsweredAfterHints(true);
    if (pts.length < 2) return setTalk(L.notEnough.map((t) => fill(t, { n: 2 - pts.length })));
    const l = lineThrough(pts[0], pts[1]);
    if (!l) return setTalk(L.sameX);
    if (pts.every((p) => onLine(line, p))) {
      setStudentLine(null);
      return solve(L.okGraph);
    }
    // 打った点が表す直線を見せて、どちらが違うかを返す
    setStudentLine({ ...asLine(l), tone: 'hint' });
    const aOk = eq(l.a, line.a);
    const bOk = eq(l.b, line.b);
    markWrong(!aOk && !bOk ? 'both' : !aOk ? 'a' : 'b', [L.studentLine]);
  };

  const openHint = () => {
    hints.start();
    setNudge(false);
    setTalk([]);
    f.setValues([f.values[0], f.values[1], '']);
    f.setActive(HINT_FIELD);
  };

  const checkHint = () => {
    const r = hints.check(f.values[HINT_FIELD]);
    if (!r) return;
    if (r.lines.length === 0 && !r.accepted) return setTalk(L.unreadable);
    if (r.accepted) {
      f.setValues([f.values[0], f.values[1], '']);
      // 最後の段に来たら元の問題に戻る
      if (hintSteps[hints.used]?.answer === null && type !== 'eq-graph') f.setActive(0);
    }
    setTalk(r.lines);
  };

  const hintLine = hints.step && !solved && solution === null && !(hints.finished && answeredAfterHints) ? hints.step.q : null;

  // ---- 表示するもの ----
  const showAnnotation = annotate || wrong > 0;
  const points: GraphPoint[] = [];
  const stairs: GraphStair[] = [];
  const lines: GraphLine[] = [];
  const intercept = { x: 0, y: line.b.n / line.b.d };
  const step = solution ?? -1;
  const v = hints.visual;
  let highlightX = v?.highlightX;

  if (type === 'graph-eq') lines.push({ ...asLine(line) });
  if (type === 'eq-graph' && (solved || step >= 2)) lines.push({ ...asLine(line), tone: solved ? 'main' : 'faint' });
  if (studentLine && !solved && solution === null) lines.push(studentLine);
  if (v?.run) stairs.push({ x: v.run.x, y: v.run.y, dx: v.run.dx, dy: 0, tone: 'accent' });
  if (step === 0) highlightX = 0;
  if (step >= 0) points.push({ ...intercept, tone: 'accent' });
  if (step >= 1) {
    stairs.push({ ...intercept, dx: line.a.d, dy: line.a.n, tone: 'accent', showLabels: true });
    if (type === 'eq-graph') points.push({ x: line.a.d, y: intercept.y + line.a.n, tone: 'accent' });
  }

  const tableXs = problem.xs ?? [];
  const tableHighlight = tableXs.flatMap((x, i) => ((v?.tableXs?.includes(x) || (step === 0 && x === 0)) ? [i] : []));

  // ---- 下の操作 ----
  let actions;
  if (solved) {
    actions = <button type="button" className="btn primary" onClick={finish}>{L.next}</button>;
  } else if (solution !== null) {
    const last = solution >= solutionSteps.length - 1;
    actions = (
      <button
        type="button"
        className="btn primary"
        onClick={() => {
          if (last) return finish();
          const n = solution + 1;
          setSolution(n);
          setTalk(n === solutionSteps.length - 1 ? [solutionSteps[n], ...S2.end] : [solutionSteps[n]]);
        }}
      >
        {L.next}
      </button>
    );
  } else if (type === 'eq-graph') {
    actions = (
      <>
        {hints.asking && (
          <AnswerBar f={f} onSubmit={checkHint} submitLabel={L.check} tabCount={3} extra={laterButton} padOnTap>
            <NumberField value={f.values[HINT_FIELD]} active onFocus={() => f.focus(HINT_FIELD)} state="clue" ariaLabel="ヒントの答え" />
          </AnswerBar>
        )}
        {!hints.asking && (
          <div className="answer-row">
            <div className="answer-buttons">
              {laterButton}
              {!hints.started && <HintButton nudge={nudge} onClick={openHint} />}
              <button type="button" className="btn primary submit" onClick={checkGraph}>{L.done}</button>
            </div>
          </div>
        )}
      </>
    );
  } else {
    actions = (
      <AnswerBar
        f={f}
        onSubmit={checkEquation}
        submitLabel={L.check}
        tabCount={hints.asking ? 3 : 2}
        extra={
          <>
            {laterButton}
            {!hints.started && <HintButton nudge={nudge} onClick={openHint} />}
          </>
        }
      >
        {hints.asking ? (
          <NumberField value={f.values[HINT_FIELD]} active onFocus={() => f.focus(HINT_FIELD)} state="clue" ariaLabel="ヒントの答え" />
        ) : (
          <SlopeInterceptFields f={f} states={states} />
        )}
      </AnswerBar>
    );
  }

  return (
    <div className="step">
      <Hakase lines={hintLine ? [...talk, hintLine] : talk} />
      <div className="work">
        {type === 'eq-graph' && (
          <div className="equation big">
            <MathText text={eqText(line)} />
          </div>
        )}
        {showAnnotation && (
          <div className="annotation">
            <span>{L.annotation.a}</span>
            <span>{L.annotation.b}</span>
          </div>
        )}
        {hints.found.length > 0 && !solved && solution === null && <HintFound title={L.hintFound} items={hints.found} />}
        {type === 'table-eq' ? (
          <>
            <ValueTable xLabel="x" yLabel="y" xs={tableXs} ys={tableXs.map((x) => toString(yAt(line, x)))} highlight={tableHighlight} />
            {solution !== null && solution >= solutionSteps.length - 1 && (
              <div className="equation big">
                <MathText text={eqText(line)} />
              </div>
            )}
          </>
        ) : (
          <Graph
            {...content.graph}
            equalScale
            mode={type === 'eq-graph' && !solved && solution === null && !hints.asking ? 'plot' : 'none'}
            userPoints={type === 'eq-graph' ? pts : []}
            onUserPointsChange={(p) => {
              setPts(p);
              setStudentLine(null);
            }}
            maxUserPoints={2}
            points={points}
            lines={lines}
            stairs={stairs}
            highlightX={highlightX}
          />
        )}
      </div>
      <div className="actions">{actions}</div>
    </div>
  );
}

function HintButton({ nudge, onClick }: { nudge: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`btn small ghost ${nudge ? 'pulse' : ''}`} onClick={onClick}>
      {L.hint}
    </button>
  );
}

/** y ＝ □x ＋ □。「傾き」「切片」の見出しつき */
function SlopeInterceptFields({ f, states }: { f: Fields; states: FieldState[] }) {
  return (
    <div className="equation">
      <span className="eq-text">y ＝</span>
      <span className="labeled-field">
        <small>{L.label.a}</small>
        <NumberField value={f.values[0]} active={f.active === 0} onFocus={() => f.focus(0)} state={states[0]} ariaLabel="傾き" />
      </span>
      <span className="eq-text">x ＋</span>
      <span className="labeled-field">
        <small>{L.label.b}</small>
        <NumberField value={f.values[1]} active={f.active === 1} onFocus={() => f.focus(1)} state={states[1]} ariaLabel="切片" />
      </span>
    </div>
  );
}
