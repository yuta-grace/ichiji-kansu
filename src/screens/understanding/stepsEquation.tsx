// 理解パート ステップ7〜9（式にする・名前をつける・逆向き）
import { useState } from 'react';
import Graph from '../../components/Graph';
import type { GraphPoint, GraphStair } from '../../components/Graph';
import AnswerBar from '../../components/AnswerBar';
import { NumberField } from '../../components/NumberPad';
import { useFields } from '../../components/useFields';
import { checkNumber, isOk } from '../../lib/answer';
import type { Checked } from '../../lib/answer';
import { display, frac } from '../../lib/fraction';
import { distToSegment } from '../../lib/graphMath';
import type { Pt } from '../../lib/graphMath';
import { C, EquationFields, L, NextButton, StepView, T, say, tankLine, tankPoints, tankY, useTries } from './common';
import type { StepProps, Vars } from './common';
import { TankGraph, TankTable } from './stepsTank';

const V = { start: T.start, rate: T.rate };
const doneResult = (n: number, shown: boolean) => ({ attempts: n + (shown ? 0 : 1), shown });
const shownValue = (c: Checked) => (c.value ? display(c.value) : '□');

// ステップ7a：12分後は何L？（ヒントは段階的な問い。ヒントにも生徒が答える）
export function StepTwelve({ onDone }: StepProps) {
  const answer = tankY(T.askMinute);
  const inc = T.rate * T.askMinute;
  const vars = { ...V, askMinute: T.askMinute, inc, answer };
  const hintAnswers = [inc, answer];

  const f = useFields(2); // 0：答え、1：ヒントの答え
  const tries = useTries();
  const [lines, setLines] = useState(say(L.twelve.prompt, vars));
  const [hint, setHint] = useState(-1);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [nudge, setNudge] = useState(false);
  const [solved, setSolved] = useState<{ shown: boolean } | null>(null);

  const openHint = () => {
    setHint(0);
    setHintsUsed(1);
    setNudge(false);
    setLines([]);
    f.setActive(1);
    f.setValues([f.values[0], '']);
  };

  const checkHint = () => {
    const r = checkNumber(f.values[1], hintAnswers[hint]);
    if (r.verdict === 'empty') return;
    if (r.verdict === 'unreadable') return setLines(say(L.common.unreadable));
    const h = L.twelve.hints[hint];
    if (!isOk(r)) {
      const v = r.value!;
      const per = display(frac(v.n, v.d * T.askMinute));
      return setLines([fill1(h.wrong, { ...vars, v: display(v), per })]);
    }
    if (hint + 1 < hintAnswers.length) {
      setHint(hint + 1);
      setHintsUsed(hint + 2);
      f.setValues([f.values[0], '']);
      return setLines([]);
    }
    // 最後のヒントに答えられたら、それがこの問いの答え
    f.setValues([String(answer), f.values[1]]);
    setHint(-1);
    setLines(say(L.twelve.ok, vars));
    setSolved({ shown: false });
  };

  const check = () => {
    if (hint >= 0 && f.active === 1) return checkHint();
    const r = checkNumber(f.values[0], answer);
    if (r.verdict === 'empty') return;
    if (r.verdict === 'unreadable') return setLines(say(L.common.unreadable));
    if (isOk(r)) {
      setHint(-1);
      setLines(say(L.twelve.ok, vars));
      return setSolved({ shown: false });
    }
    const stage = tries.bump();
    if (stage === 'show') {
      setHint(-1);
      f.setValues([String(answer), '']);
      setLines(say(L.twelve.show, vars));
      return setSolved({ shown: true });
    }
    if (stage === 'clue') {
      setNudge(true);
      return setLines(say(L.twelve.clue));
    }
    const v = r.value!;
    setLines(say(L.twelve.wrong, { ...vars, v: display(v), diff: display(frac(v.n - T.start * v.d, v.d)) }));
  };

  const hintLine = hint >= 0 ? fill1(L.twelve.hints[hint].q, vars) : null;

  return (
    <StepView
      lines={hintLine ? [...lines, hintLine] : lines}
      actions={
        solved ? (
          <NextButton onClick={() => onDone({ ...doneResult(tries.n, solved.shown), hintsUsed })} />
        ) : (
          <AnswerBar f={f} onSubmit={check} submitLabel={L.common.check} tabCount={hint >= 0 ? 2 : 1}>
            <NumberField value={f.values[0]} active={f.active === 0} onFocus={() => f.focus(0)} ariaLabel={`${T.askMinute}分後の水の量`} />
            <span>L</span>
            {hint >= 0 && (
              <>
                <span className="muted small">ヒント</span>
                <NumberField value={f.values[1]} active={f.active === 1} onFocus={() => f.focus(1)} ariaLabel="ヒントの答え" state="clue" />
              </>
            )}
            {hint < 0 && (
              <button type="button" className={`btn small ghost ${nudge ? 'pulse' : ''}`} onClick={openHint}>
                {L.common.hint}
              </button>
            )}
          </AnswerBar>
        )
      }
    >
      <TankTable />
    </StepView>
  );
}

function fill1(t: string, vars: Vars) {
  return say([t], vars)[0];
}

/** a と b の入力を判定し、間違えた回数に応じた台詞を返す（ステップ7b と 9c で共通） */
function useEquationCheck(opts: {
  a: number;
  b: number;
  lines: { prompt: string[]; wrong: string[]; clue: string[]; show: string[]; ok: string[] };
  vars: Vars;
  onClue: () => void;
}) {
  const f = useFields(2);
  const tries = useTries();
  const [lines, setLines] = useState(say(opts.lines.prompt, opts.vars));
  const [states, setStates] = useState<('ok' | 'check' | undefined)[]>([]);
  const [solved, setSolved] = useState<{ shown: boolean } | null>(null);

  const check = () => {
    const ra = checkNumber(f.values[0], opts.a);
    const rb = checkNumber(f.values[1], opts.b);
    if (ra.verdict === 'empty' || rb.verdict === 'empty') return setLines(say(L.table.empty));
    if (ra.verdict === 'unreadable' || rb.verdict === 'unreadable') return setLines(say(L.common.unreadable));
    if (isOk(ra) && isOk(rb)) {
      setStates(['ok', 'ok']);
      setLines(say(opts.lines.ok, opts.vars));
      return setSolved({ shown: false });
    }
    setStates([isOk(ra) ? undefined : 'check', isOk(rb) ? undefined : 'check']);
    const stage = tries.bump();
    if (stage === 'show') {
      f.setValues([String(opts.a), String(opts.b)]);
      setStates(['ok', 'ok']);
      setLines(say(opts.lines.show, opts.vars));
      return setSolved({ shown: true });
    }
    if (stage === 'clue') {
      opts.onClue();
      return setLines(say(opts.lines.clue, opts.vars));
    }
    setLines(say(opts.lines.wrong, { ...opts.vars, a: shownValue(ra), b: shownValue(rb) }));
  };

  return { f, tries, lines, setLines, states, solved, check };
}

// ステップ7b：式にする
export function StepEquation({ onDone }: StepProps) {
  const [nudge, setNudge] = useState(false);
  const [hintOpen, setHintOpen] = useState(false);
  const eq = useEquationCheck({ a: T.rate, b: T.start, lines: L.equation, vars: V, onClue: () => setNudge(true) });
  const lines = hintOpen && !eq.solved ? [...eq.lines, ...say(L.equation.hints, V)] : eq.lines;

  return (
    <StepView
      lines={lines}
      actions={
        eq.solved ? (
          <NextButton onClick={() => onDone({ ...doneResult(eq.tries.n, eq.solved!.shown), hintsUsed: hintOpen ? 1 : 0 })} />
        ) : (
          <AnswerBar f={eq.f} onSubmit={eq.check} submitLabel={L.common.check}>
            <EquationFields f={eq.f} states={eq.states} />
            {!hintOpen && (
              <button
                type="button"
                className={`btn small ghost ${nudge ? 'pulse' : ''}`}
                onClick={() => {
                  setHintOpen(true);
                  setNudge(false);
                }}
              >
                {L.common.hint}
              </button>
            )}
          </AnswerBar>
        )
      }
    >
      <TankTable diffs={nudge || hintOpen} />
    </StepView>
  );
}

/** 式の表示。名前をつける場面で、数字を目立たせる */
function TankEquation({ mark }: { mark?: 'a' | 'b' }) {
  return (
    <div className="equation big">
      y ＝ <span className={mark === 'a' ? 'mark' : ''}>{T.rate}</span>x ＋ <span className={mark === 'b' ? 'mark' : ''}>{T.start}</span>
    </div>
  );
}

const stairSegments = () =>
  T.minutes.slice(0, -1).map((x) => [
    { x, y: tankY(x) },
    { x: x + 1, y: tankY(x) },
    { x: x + 1, y: tankY(x + 1) },
  ]);

/** タップした場所が、階段・最初の点・その他のどれか（画面上の距離で判定） */
function classifyTap(raw: Pt, toPx: (p: Pt) => Pt): 'stair' | 'start' | 'other' {
  const r = toPx(raw);
  const s = toPx({ x: 0, y: T.start });
  if (Math.hypot(r.x - s.x, r.y - s.y) < 26) return 'start';
  for (const [p0, p1, p2] of stairSegments()) {
    if (distToSegment(r, toPx(p0), toPx(p1)) < 18 || distToSegment(r, toPx(p1), toPx(p2)) < 18) return 'stair';
  }
  return 'other';
}

// ステップ8a・8b：式の数はグラフのどこにあった？
function StepFindInGraph({ onDone, which }: StepProps & { which: 'a' | 'b' }) {
  const D = which === 'a' ? L.nameA : L.nameB;
  const want = which === 'a' ? 'stair' : 'start';
  const tries = useTries();
  const [lines, setLines] = useState(say(D.prompt, V));
  const [mark, setMark] = useState<Pt | null>(null);
  const [clue, setClue] = useState(false);
  const [solved, setSolved] = useState<{ shown: boolean } | null>(null);

  const onPick = (p: Pt, raw: Pt, toPx: (p: Pt) => Pt) => {
    if (solved) return;
    const hit = classifyTap(raw, toPx);
    if (hit === want) {
      setMark(null);
      setLines(say(D.ok, V));
      return setSolved({ shown: false });
    }
    setMark(hit === 'other' ? p : null);
    const stage = tries.bump();
    if (stage === 'show') {
      setMark(null);
      setLines(say(D.show, V));
      return setSolved({ shown: true });
    }
    if (stage === 'clue') {
      setClue(true);
      return setLines(say(D.clue));
    }
    if (hit === 'start') return setLines(say(L.nameA.wrongStart, V));
    if (hit === 'stair') return setLines(say(L.nameB.wrongStair, V));
    setLines(say(D.wrong, { ...V, x: p.x, y: p.y }));
  };

  const highlightStairs = which === 'a' && (clue || solved);
  const stairs: GraphStair[] = T.minutes.slice(0, -1).map((x) => ({
    x, y: tankY(x), dx: 1, dy: T.rate,
    tone: highlightStairs ? 'accent' : 'faint',
    showLabels: which === 'a' && !!solved && x === 0,
  }));
  const points: GraphPoint[] = tankPoints().map((p) => ({ ...p, tone: 'main' }));
  if (which === 'b' && solved) points.push({ x: 0, y: T.start, tone: 'accent' });
  if (mark) points.push({ ...mark, tone: 'hint' });

  return (
    <StepView lines={lines} actions={solved && <NextButton onClick={() => onDone(doneResult(tries.n, solved.shown))} />}>
      <TankEquation mark={which} />
      <TankGraph mode={solved ? 'none' : 'pick'} onPick={onPick} points={points} lines={[tankLine()]} stairs={stairs} highlightX={which === 'b' && clue && !solved ? 0 : undefined} />
    </StepView>
  );
}

export const StepNameA = (p: StepProps) => <StepFindInGraph {...p} which="a" />;
export const StepNameB = (p: StepProps) => <StepFindInGraph {...p} which="b" />;

// ステップ8c：名前をつける（生徒が見つけた後で）
export function StepNaming({ onDone }: StepProps) {
  const stairs: GraphStair[] = T.minutes.slice(0, -1).map((x) => ({
    x, y: tankY(x), dx: 1, dy: T.rate, tone: 'accent', showLabels: x === 0,
  }));
  const points: GraphPoint[] = tankPoints().map((p) => ({ ...p, tone: 'main' }));
  points.push({ x: 0, y: T.start, tone: 'accent', label: '切片' });
  return (
    <StepView lines={say(L.naming.say, V)} actions={<NextButton onClick={() => onDone({})} />}>
      <div className="equation big">
        y ＝ <span className="named">{T.rate}<small>傾き</small></span>x ＋ <span className="named">{T.start}<small>切片</small></span>
      </div>
      <TankGraph points={points} lines={[tankLine()]} stairs={stairs} />
    </StepView>
  );
}

// ステップ9：逆向き（場面のないグラフ。式は見せない）
const R = C.reverse;
const RV = { a: R.a, b: R.b, ra: R.a, rb: R.b };

function ReverseGraph(props: Partial<React.ComponentProps<typeof Graph>>) {
  return <Graph {...R.graph} lines={[{ a: R.a, b: R.b }]} {...props} />;
}

/** 数を1つ答えるステップ（9a と 9b） */
function useSingleCheck() {
  const f = useFields(1);
  const tries = useTries();
  const [solved, setSolved] = useState<{ shown: boolean } | null>(null);
  return { f, tries, solved, setSolved };
}

export function StepRevIntercept({ onDone }: StepProps) {
  const s = useSingleCheck();
  const [lines, setLines] = useState(say(L.revIntercept.prompt, RV));
  const [clue, setClue] = useState(false);

  const check = () => {
    const r = checkNumber(s.f.values[0], R.b);
    if (r.verdict === 'empty') return;
    if (r.verdict === 'unreadable') return setLines(say(L.common.unreadable));
    if (isOk(r)) {
      setLines(say(L.revIntercept.ok, RV));
      return s.setSolved({ shown: false });
    }
    const stage = s.tries.bump();
    if (stage === 'show') {
      setLines(say(L.revIntercept.show, RV));
      return s.setSolved({ shown: true });
    }
    if (stage === 'clue') {
      setClue(true);
      return setLines(say(L.revIntercept.clue));
    }
    // 生徒の答えの y が、直線上のどこ（x がいくつ）にあたるかを返す
    const v = r.value!;
    const xv = frac(v.n - R.b * v.d, v.d * R.a);
    const onGrid = xv.d === 1 && xv.n >= R.graph.xMin && xv.n <= R.graph.xMax;
    setLines(say(onGrid ? L.revIntercept.wrongOnLine : L.revIntercept.wrong, { v: display(v), xv: display(xv) }));
  };

  const points: GraphPoint[] = s.solved ? [{ x: 0, y: R.b, tone: 'accent' }] : [];
  return (
    <StepView
      lines={lines}
      actions={
        s.solved ? (
          <NextButton onClick={() => onDone(doneResult(s.tries.n, s.solved!.shown))} />
        ) : (
          <AnswerBar f={s.f} onSubmit={check} submitLabel={L.common.check}>
            <span>y ＝</span>
            <NumberField value={s.f.values[0]} active onFocus={() => s.f.focus(0)} ariaLabel="x が 0 のときの y" />
          </AnswerBar>
        )
      }
    >
      <ReverseGraph points={points} highlightX={clue && !s.solved ? 0 : undefined} />
    </StepView>
  );
}

export function StepRevRate({ onDone }: StepProps) {
  const s = useSingleCheck();
  const [lines, setLines] = useState(say(L.revRate.prompt, RV));
  const [clue, setClue] = useState(false);

  const check = () => {
    const r = checkNumber(s.f.values[0], R.a);
    if (r.verdict === 'empty') return;
    if (r.verdict === 'unreadable') return setLines(say(L.common.unreadable));
    if (isOk(r)) {
      setLines(say(L.revRate.ok, RV));
      return s.setSolved({ shown: false });
    }
    const stage = s.tries.bump();
    if (stage === 'show') {
      setLines(say(L.revRate.show, RV));
      return s.setSolved({ shown: true });
    }
    if (stage === 'clue') {
      setClue(true);
      return setLines(say(L.revRate.clue));
    }
    const v = r.value!;
    setLines(say(L.revRate.wrong, { v: display(v), next: display(frac(R.b * v.d + v.n, v.d)) }));
  };

  const stairs: GraphStair[] = s.solved
    ? [{ x: 0, y: R.b, dx: 1, dy: R.a, tone: 'accent', showLabels: true }]
    : clue
      ? [{ x: 0, y: R.b, dx: 1, dy: 0, tone: 'accent' }]
      : [];
  return (
    <StepView
      lines={lines}
      actions={
        s.solved ? (
          <NextButton onClick={() => onDone(doneResult(s.tries.n, s.solved!.shown))} />
        ) : (
          <AnswerBar f={s.f} onSubmit={check} submitLabel={L.common.check}>
            <span>y は</span>
            <NumberField value={s.f.values[0]} active onFocus={() => s.f.focus(0)} ariaLabel="y の増え方" />
            <span>増える</span>
          </AnswerBar>
        )
      }
    >
      <ReverseGraph points={[{ x: 0, y: R.b, tone: 'accent' }]} stairs={stairs} highlightX={clue && !s.solved ? 1 : undefined} />
    </StepView>
  );
}

export function StepRevEquation({ onDone }: StepProps) {
  const [clue, setClue] = useState(false);
  const eq = useEquationCheck({ a: R.a, b: R.b, lines: L.revEquation, vars: RV, onClue: () => setClue(true) });
  const showFound = clue || !!eq.solved;
  return (
    <StepView
      lines={eq.lines}
      actions={
        eq.solved ? (
          <NextButton onClick={() => onDone(doneResult(eq.tries.n, eq.solved!.shown))} />
        ) : (
          <AnswerBar f={eq.f} onSubmit={eq.check} submitLabel={L.common.check}>
            <EquationFields f={eq.f} states={eq.states} />
          </AnswerBar>
        )
      }
    >
      <ReverseGraph
        points={showFound ? [{ x: 0, y: R.b, tone: 'accent' }] : []}
        stairs={showFound ? [{ x: 0, y: R.b, dx: 1, dy: R.a, tone: 'accent', showLabels: true }] : []}
      />
    </StepView>
  );
}

export function StepEnd({ onDone }: StepProps) {
  return (
    <StepView lines={say(L.end.say)} actions={<NextButton onClick={() => onDone({})} label="戻る" />}>
      <div className="equation big">y ＝ {T.rate}x ＋ {T.start}</div>
      <TankGraph points={tankPoints().map((p) => ({ ...p, tone: 'main' as const }))} lines={[tankLine()]} />
    </StepView>
  );
}
