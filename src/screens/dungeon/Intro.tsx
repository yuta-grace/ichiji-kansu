// 解き方の導入（5.4）
// ③：問いの形で体験させ、解けた後で「戻って解く」と名前をつける
// ②：③が面倒になる分数の問題で、③で解いた後に「別のやり方もあるよ」と②の手順を例として見せる
import { useMemo, useState } from 'react';
import AnswerBar from '../../components/AnswerBar';
import Graph from '../../components/Graph';
import type { GraphPoint } from '../../components/Graph';
import { Hakase } from '../../components/Hakase';
import HintFound from '../../components/HintFound';
import { NumberField } from '../../components/NumberPad';
import { useFields } from '../../components/useFields';
import { useHintFlow } from '../../components/useHintFlow';
import content from '../../content/dungeon.json';
import settings from '../../content/settings.json';
import { checkNumber, isOk } from '../../lib/answer';
import { change, buildHints } from '../../lib/hints';
import type { HintSpec, HintTexts } from '../../lib/hints';
import { methodName, pointsText, problemVars } from '../../lib/dungeon';
import type { DungeonProblem } from '../../lib/dungeon';
import { samePt } from '../../lib/graphMath';
import type { Pt } from '../../lib/graphMath';
import { asLine, lineThrough, numText } from '../../lib/linear';
import { fill } from '../../lib/text';
import Solve from './Solve';
import type { SolveOutcome } from './Solve';

const L = content.lines;
const I = content.intro;
const HINT_FIELD = 2;
const say = (lines: string[], vars: Record<string, string | number> = {}) => lines.map((t) => fill(t, vars));
const P1 = { x: I.p1[0], y: I.p1[1] };
const P2 = { x: I.p2[0], y: I.p2[1] };
const INTRO_LINE = lineThrough(P1, P2)!;

export function IntroModoru({ onDone }: { onDone: () => void }) {
  const line = INTRO_LINE;
  const vars = { x1: P1.x, y1: P1.y, x2: P2.x, y2: P2.y, a: numText(line.a), b: numText(line.b), aChange: change(line.a) };
  const steps = useMemo(
    () =>
      buildHints(L.intro3.hints as HintSpec[], line, {
        type: 'dungeon',
        where: 'グラフ',
        texts: L.steps.hintTexts as unknown as Record<string, HintTexts>,
      }),
    [line],
  );
  const hints = useHintFlow(steps);
  const f = useFields(3, undefined, HINT_FIELD);
  const [pts, setPts] = useState<Pt[]>([]);
  const [plotMiss, setPlotMiss] = useState(0);
  const [clueX, setClueX] = useState<number | undefined>();
  const [eqMiss, setEqMiss] = useState(0);
  const [eqClue, setEqClue] = useState(false);
  const [talk, setTalk] = useState(say(L.intro3.start, vars));
  const [phase, setPhase] = useState<'plot' | 'steps' | 'named'>('plot');

  const checkPlot = () => {
    if (pts.length < 2) return setTalk(say(L.intro3.plotNotEnough, { n: 2 - pts.length }));
    const wrong = pts.find((p) => !samePt(p, P1) && !samePt(p, P2));
    if (!wrong) {
      setPhase('steps');
      hints.start();
      return setTalk([]);
    }
    const m = plotMiss + 1;
    setPlotMiss(m);
    if (m >= settings.attemptsBeforeAnswerShown) {
      setPts([P1, P2]);
      setPhase('steps');
      hints.start();
      return setTalk(L.intro3.plotShow);
    }
    if (m === 2) {
      const missing = [P1, P2].find((q) => !pts.some((p) => samePt(p, q)))!;
      setClueX(missing.x);
      return setTalk(say(L.intro3.plotClue, { x: missing.x }));
    }
    setTalk(say(L.intro3.plotWrong, { ...vars, x: wrong.x, y: wrong.y }));
  };

  const check = () => {
    if (hints.asking) {
      const r = hints.check(f.values[HINT_FIELD]);
      if (!r) return;
      if (!r.accepted && r.lines.length === 0) return setTalk(L.unreadable);
      if (r.accepted) {
        f.setValues(['', '', '']);
        if (steps[hints.index + 1]?.answer === null) f.setActive(0);
      }
      return setTalk(r.lines);
    }
    // 式：間違えたら理解パートと同じ3段階
    const ra = checkNumber(f.values[0], line.a);
    const rb = checkNumber(f.values[1], line.b);
    if (ra.verdict === 'empty' || rb.verdict === 'empty') return setTalk(L.empty);
    if (ra.verdict === 'unreadable' || rb.verdict === 'unreadable') return setTalk(L.unreadable);
    const m = eqMiss + 1;
    if (isOk(ra) && isOk(rb)) {
      f.closePad();
      setPhase('named');
      return setTalk(L.intro3.naming);
    }
    setEqMiss(m);
    if (m >= settings.attemptsBeforeAnswerShown) {
      f.closePad();
      f.setValues([numText(line.a), numText(line.b), '']);
      setPhase('named');
      return setTalk([...say(L.eqShow, { eq: `y ＝ ${numText(line.a)}x ＋ ${numText(line.b)}` }), ...L.intro3.naming]);
    }
    if (m === 2) {
      setEqClue(true);
      return setTalk(L.eqClue);
    }
    const v = (r: typeof ra) => (r.value ? numText(r.value) : '□');
    setTalk(say(L.eqWrongMeaning, { a: v(ra), b: v(rb), aChange: ra.value ? change(ra.value) : '□増える' }));
  };

  const points: GraphPoint[] = phase === 'plot' ? [] : [{ ...P1, tone: 'main' }, { ...P2, tone: 'main' }];
  const showLine = phase === 'named';
  const stepLine = phase === 'steps' && hints.step ? hints.step.q : null;

  return (
    <div className="step">
      <Hakase lines={stepLine ? [...talk, stepLine] : talk} />
      <div className="work">
        {hints.found.length > 0 && phase !== 'plot' && (
          <div className={eqClue ? 'clue-box' : ''}>
            <HintFound title={L.foundTitle} items={hints.found} />
          </div>
        )}
        <Graph
          {...I.graph}
          equalScale
          mode={phase === 'plot' ? 'plot' : 'none'}
          userPoints={phase === 'plot' ? pts : []}
          onUserPointsChange={setPts}
          maxUserPoints={2}
          points={points}
          lines={showLine ? [{ ...asLine(line) }] : []}
          stairs={hints.visual?.run ? [{ ...hints.visual.run, dy: 0, tone: 'accent' }] : []}
          highlightX={clueX ?? hints.visual?.highlightX}
        />
      </div>
      <div className="actions">
        {phase === 'plot' && <button type="button" className="btn primary" onClick={checkPlot}>{L.done}</button>}
        {phase === 'steps' && (
          <AnswerBar f={f} onSubmit={check} submitLabel={L.check} tabCount={hints.asking ? 3 : 2}>
            {hints.asking ? (
              <NumberField value={f.values[HINT_FIELD]} active onFocus={() => f.focus(HINT_FIELD)} state="clue" ariaLabel="途中の値" />
            ) : (
              <div className="equation">
                <span className="eq-text">y ＝</span>
                <NumberField value={f.values[0]} active={f.active === 0} onFocus={() => f.focus(0)} ariaLabel="傾き" />
                <span className="eq-text">x ＋</span>
                <NumberField value={f.values[1]} active={f.active === 1} onFocus={() => f.focus(1)} ariaLabel="切片" />
              </div>
            )}
          </AnswerBar>
        )}
        {phase === 'named' && (
          <button
            type="button"
            className="btn primary"
            onClick={() => (talk.join() === L.intro3.after.join() ? onDone() : setTalk(L.intro3.after))}
          >
            {L.next}
          </button>
        )}
      </div>
    </div>
  );
}

/** ②の導入：まず③で解かせ、その後に②の手順を例として1つずつ見せる */
export function IntroDainyu({ problem, onDone }: { problem: DungeonProblem; onDone: (o: SolveOutcome) => void }) {
  const [outcome, setOutcome] = useState<SolveOutcome | null>(null);
  const [step, setStep] = useState(-1);
  const vars = problemVars(problem);
  const example = L.intro2.example.map((t) => fill(t, vars));

  if (!outcome) {
    return <Solve problem={problem} method="modoru" stage="A" intro={L.intro2.start} onDone={setOutcome} />;
  }
  const lines = step < 0 ? L.intro2.after : step < example.length ? [example[step]] : L.intro2.naming;
  return (
    <div className="step">
      <Hakase lines={lines} />
      <div className="work">
        <div className="points-card">
          {pointsText(problem)}
        </div>
        {step >= 0 && <HintFound title={methodName('dainyu')} items={example.slice(0, Math.min(step + 1, example.length))} />}
      </div>
      <div className="actions">
        <button type="button" className="btn primary" onClick={() => (step >= example.length ? onDone(outcome) : setStep(step + 1))}>
          {L.next}
        </button>
      </div>
    </div>
  );
}
