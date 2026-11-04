// 理解パート ステップ1〜6（場面・表・予想・点・グラフの中で探す・線でつなぐ・1つだけ変える）
import { useState } from 'react';
import AnswerBar from '../../components/AnswerBar';
import Graph from '../../components/Graph';
import type { GraphLine, GraphPoint, GraphStair } from '../../components/Graph';
import { NumberField } from '../../components/NumberPad';
import ValueTable from '../../components/ValueTable';
import { useFields } from '../../components/useFields';
import { checkNumber, isOk } from '../../lib/answer';
import { display } from '../../lib/fraction';
import { samePt } from '../../lib/graphMath';
import type { Pt } from '../../lib/graphMath';
import {
  C, Choices, L, NextButton, StepView, T, say, tankLine, tankPoints, tankY, useTries,
} from './common';
import type { StepProps } from './common';

const V = { start: T.start, rate: T.rate };
const doneResult = (n: number, shown: boolean) => ({ attempts: n + (shown ? 0 : 1), shown });

export function TankTable({ highlight, diffs }: { highlight?: number[]; diffs?: boolean }) {
  return (
    <ValueTable
      xLabel={T.tableXLabel}
      yLabel={T.tableYLabel}
      xs={T.minutes}
      ys={T.minutes.map((x) => tankY(x))}
      highlight={highlight}
      diffs={diffs ? T.minutes.map(() => `+${T.rate}`) : undefined}
    />
  );
}

export function TankGraph(props: Partial<React.ComponentProps<typeof Graph>>) {
  return <Graph {...T.graph} xLabel={T.xLabel} yLabel={T.yLabel} {...props} />;
}

const mainPoints = (): GraphPoint[] => tankPoints().map((p) => ({ ...p, tone: 'main' }));
const allStairs = (labelFirst = true): GraphStair[] =>
  T.minutes.slice(0, -1).map((x) => ({ x, y: tankY(x), dx: 1, dy: T.rate, tone: 'accent', showLabels: labelFirst && x === 0 }));

// ステップ1・2：場面と表
export function StepTable({ onDone }: StepProps) {
  const n = T.minutes.length;
  const f = useFields(n);
  const tries = useTries();
  const [lines, setLines] = useState(say(L.table.prompt, V));
  const [states, setStates] = useState<('ok' | 'check' | undefined)[]>([]);
  const [clue, setClue] = useState<number[] | null>(null);
  const [solved, setSolved] = useState<{ shown: boolean } | null>(null);

  const check = () => {
    const results = T.minutes.map((x, i) => checkNumber(f.values[i], tankY(x)));
    if (results.some((r) => r.verdict === 'empty')) return setLines(say(L.table.empty));
    if (results.some((r) => r.verdict === 'unreadable')) return setLines(say(L.common.unreadable));
    if (results.every(isOk)) {
      f.closePad();
      setStates(results.map(() => 'ok'));
      setLines(say(L.table.ok));
      return setSolved({ shown: false });
    }
    const w = results.findIndex((r) => !isOk(r));
    setStates(results.map((r) => (isOk(r) ? undefined : 'check')));
    f.setActive(w);
    const stage = tries.bump();
    if (stage === 'show') {
      f.closePad();
      f.setValues(T.minutes.map((x) => String(tankY(x))));
      setStates(results.map(() => 'ok'));
      setLines(say(L.table.show, V));
      return setSolved({ shown: true });
    }
    if (stage === 'clue') {
      setClue(w === 0 ? [0] : [w - 1, w]);
      return setLines(say(L.table.clue));
    }
    const x = T.minutes[w];
    const v = results[w].value!;
    setLines(
      x === 0
        ? say(L.table.wrongFirst)
        : say(L.table.wrong, { ...V, x, v: display(v), diff: Math.round((v.n / v.d - T.start) * 100) / 100 }),
    );
  };

  return (
    <StepView
      lines={lines}
      actions={
        solved ? (
          <NextButton onClick={() => onDone(doneResult(tries.n, solved.shown))} />
        ) : (
          <AnswerBar f={f} onSubmit={check} submitLabel={L.common.check} allowFraction={false} />
        )
      }
    >
      <ValueTable
        xLabel={T.tableXLabel}
        yLabel={T.tableYLabel}
        xs={T.minutes}
        ys={T.minutes.map(() => undefined)}
        highlight={clue ?? []}
        diffs={clue ? T.minutes.map(() => `+${T.rate}`) : undefined}
        renderInput={(i) => (
          <NumberField
            value={f.values[i]}
            active={!solved && f.active === i}
            onFocus={() => !solved && f.focus(i)}
            state={states[i]}
            ariaLabel={`${T.minutes[i]}分のときの水の量`}
          />
        )}
      />
    </StepView>
  );
}

// ステップ3：予想（間違った選択肢でも直さない）
export function StepPredict({ onDone, setPrediction }: StepProps) {
  return (
    <StepView lines={say(L.predict.prompt)}>
      <TankTable />
      <Choices
        options={L.predict.choices}
        onPick={(o) => {
          setPrediction('shape', o);
          onDone({ choice: o });
        }}
      />
    </StepView>
  );
}

// ステップ4：点を打つ
export function StepPlot({ onDone }: StepProps) {
  const correct = tankPoints();
  const [pts, setPts] = useState<Pt[]>([]);
  const tries = useTries();
  const [lines, setLines] = useState(say([...L.predict.after, ...L.plot.prompt]));
  const [clueX, setClueX] = useState<number | undefined>();
  const [solved, setSolved] = useState<{ shown: boolean } | null>(null);

  const check = () => {
    if (pts.length < correct.length) return setLines(say(L.plot.notEnough, { n: correct.length - pts.length }));
    const wrong = pts.find((p) => !correct.some((q) => samePt(p, q)));
    if (!wrong) {
      setLines(say(L.plot.ok));
      return setSolved({ shown: false });
    }
    const stage = tries.bump();
    if (stage === 'show') {
      setPts(correct);
      setClueX(undefined);
      setLines(say(L.plot.show));
      return setSolved({ shown: true });
    }
    // 手がかりは、その点の x の列。表の外の x なら、まだ打っていない列を指す
    const inTable = T.minutes.includes(wrong.x);
    if (stage === 'clue') {
      const x = inTable ? wrong.x : correct.find((q) => !pts.some((p) => samePt(p, q)))!.x;
      setClueX(x);
      return setLines(say(L.plot.clue, { x }));
    }
    setLines(say(inTable ? L.plot.wrong : L.plot.wrongOutside, { x: wrong.x, y: wrong.y }));
  };

  return (
    <StepView
      lines={lines}
      actions={
        solved ? (
          <NextButton onClick={() => onDone(doneResult(tries.n, solved.shown))} />
        ) : (
          <button type="button" className="btn primary" onClick={check}>{L.common.done}</button>
        )
      }
    >
      <TankTable highlight={clueX !== undefined ? [T.minutes.indexOf(clueX)] : []} />
      <TankGraph
        mode={solved ? 'none' : 'plot'}
        userPoints={pts}
        onUserPointsChange={setPts}
        maxUserPoints={correct.length}
        highlightX={clueX}
      />
    </StepView>
  );
}

// 予想と結果を比べる：実際の並び方を、予想と同じ4つから選ぶ
export function StepCompare({ onDone, predictions }: StepProps) {
  const D = L.compare;
  const predicted = predictions.shape ?? '';
  const tries = useTries();
  const [tried, setTried] = useState<string[]>([]);
  const [lines, setLines] = useState(say(D.prompt, { choice: predicted }));
  const [ruler, setRuler] = useState(false);
  const [solved, setSolved] = useState<{ shown: boolean; choice: string } | null>(null);

  // 予想と違った生徒には問いを残して次へ進む
  const after = predicted === D.answer ? D.afterSame : D.afterDifferent;

  const onPick = (o: string) => {
    if (o === D.answer) {
      setLines(say(after));
      return setSolved({ shown: false, choice: o });
    }
    setTried((t) => [...t, o]);
    const stage = tries.bump();
    if (stage === 'show') {
      setRuler(false);
      setLines([...say(D.show), ...say(after)]);
      return setSolved({ shown: true, choice: o });
    }
    if (stage === 'clue') {
      setRuler(true);
      return setLines(say(D.clue));
    }
    setLines(say((D.wrong as Record<string, string[]>)[o] ?? D.clue));
  };

  const last = tankPoints()[T.minutes.length - 1];
  return (
    <StepView
      lines={lines}
      actions={solved && <NextButton onClick={() => onDone({ ...doneResult(tries.n, solved.shown), choice: tried[0] ?? solved.choice })} />}
    >
      <TankGraph points={mainPoints()} lines={ruler ? [{ ...tankLine(), to: last.x, tone: 'faint' }] : []} />
      <Choices options={L.predict.choices} onPick={onPick} picked={solved ? D.answer : undefined} tried={tried} />
    </StepView>
  );
}

/** グラフ上でタップする場所を選ぶステップで、タップした格子点に一時的な印をつける */
function useTapMark() {
  const [mark, setMark] = useState<Pt | null>(null);
  const markPoint: GraphPoint[] = mark ? [{ ...mark, tone: 'hint' }] : [];
  return { setMark, markPoint };
}

// ステップ5a：最初の4Lはグラフのどこ？
export function StepFindStart({ onDone }: StepProps) {
  const target = { x: 0, y: T.start };
  const tries = useTries();
  const tap = useTapMark();
  const [lines, setLines] = useState(say(L.findStart.prompt, V));
  const [clue, setClue] = useState(false);
  const [solved, setSolved] = useState<{ shown: boolean } | null>(null);

  const onPick = (p: Pt) => {
    if (solved) return;
    if (samePt(p, target)) {
      tap.setMark(null);
      setLines(say(L.findStart.ok, V));
      return setSolved({ shown: false });
    }
    tap.setMark(p);
    const stage = tries.bump();
    if (stage === 'show') {
      tap.setMark(null);
      setLines(say(L.findStart.show, V));
      return setSolved({ shown: true });
    }
    if (stage === 'clue') {
      setClue(true);
      return setLines(say(L.findStart.clue));
    }
    setLines(say(L.findStart.wrong, { x: p.x, y: p.y }));
  };

  const points = mainPoints();
  if (solved) points.push({ ...target, tone: 'accent' });

  return (
    <StepView lines={lines} actions={solved && <NextButton onClick={() => onDone(doneResult(tries.n, solved.shown))} />}>
      <TankGraph mode={solved ? 'none' : 'pick'} onPick={onPick} points={[...points, ...tap.markPoint]} highlightX={clue ? 0 : undefined} />
    </StepView>
  );
}

// ステップ5b：毎分2Lは、グラフだとどう見える？（右に1、上にいくつ → ほかの点から点も同じ？）
export function StepStairs({ onDone }: StepProps) {
  const f = useFields(1);
  const tries = useTries();
  const [lines, setLines] = useState(say(L.stairs.prompt, V));
  const [clue, setClue] = useState(false);
  const [solved, setSolved] = useState<{ shown: boolean } | null>(null);
  const [same, setSame] = useState<string>();

  const check = () => {
    const r = checkNumber(f.values[0], T.rate);
    if (r.verdict === 'empty') return;
    if (r.verdict === 'unreadable') return setLines(say(L.common.unreadable));
    if (isOk(r)) {
      setLines([...say(L.stairs.ok, V), ...say(L.stairs.after)]);
      return setSolved({ shown: false });
    }
    const stage = tries.bump();
    if (stage === 'show') {
      setLines([...say(L.stairs.show, V), ...say(L.stairs.after)]);
      return setSolved({ shown: true });
    }
    if (stage === 'clue') {
      setClue(true);
      return setLines(say(L.stairs.clue));
    }
    setLines(say(L.stairs.wrong, { v: display(r.value!) }));
  };

  // 生徒が「同じ／ちがう」を選んだ後で、全部の階段を表示する
  const stairs: GraphStair[] = same
    ? allStairs()
    : solved
      ? [{ x: 0, y: T.start, dx: 1, dy: T.rate, tone: 'accent', showLabels: true }]
      : [{ x: 0, y: T.start, dx: 1, dy: 0, tone: 'accent' }];

  let actions = null;
  if (!solved) {
    actions = (
      <AnswerBar f={f} onSubmit={check} submitLabel={L.common.check}>
        <span>上に</span>
        <NumberField value={f.values[0]} active onFocus={() => f.focus(0)} ariaLabel="上にいくつ" />
      </AnswerBar>
    );
  } else if (!same) {
    actions = (
      <Choices
        options={L.stairs.afterChoices}
        onPick={(o) => {
          setSame(o);
          setLines(say(L.stairs.allShown));
        }}
      />
    );
  } else {
    actions = <NextButton onClick={() => onDone({ ...doneResult(tries.n, solved.shown), choice: same })} />;
  }

  return (
    <StepView lines={lines} actions={actions}>
      <TankTable highlight={clue ? [0, 1] : []} />
      <TankGraph points={mainPoints()} stairs={stairs} />
    </StepView>
  );
}

// ステップ5c：点を線でつなぐ
export function StepConnect({ onDone }: StepProps) {
  const [connected, setConnected] = useState(false);
  return (
    <StepView
      lines={say(connected ? L.connect.after : L.connect.say)}
      actions={
        connected ? (
          <NextButton onClick={() => onDone({})} />
        ) : (
          <button type="button" className="btn primary" onClick={() => setConnected(true)}>{L.connect.button}</button>
        )
      }
    >
      <TankGraph points={mainPoints()} lines={connected ? [tankLine()] : []} />
    </StepView>
  );
}

// ステップ6：1つだけ変える（予想 → 元の線を薄く残して新しい線を重ねる → 変わったのはどこ？）
function StepChange({ onDone, setPrediction, which }: StepProps & { which: 0 | 1 }) {
  const ch = C.changes[which];
  const D = L.change;
  const vars = { start: ch.start, rate: ch.rate, answer: ch.changed };
  const tries = useTries();
  const [choice, setChoice] = useState<string>();
  const [tried, setTried] = useState<string[]>([]);
  const [clue, setClue] = useState(false);
  const [talk, setTalk] = useState<string[] | null>(null);
  const [solved, setSolved] = useState<{ shown: boolean } | null>(null);

  const lines: GraphLine[] = choice
    ? [{ ...tankLine(), tone: 'faint' }, tankLine(ch.start, ch.rate)]
    : [tankLine()];

  const onPickChanged = (o: string) => {
    if (o === ch.changed) {
      setTalk(say(D.ok, vars));
      return setSolved({ shown: false });
    }
    setTried((t) => [...t, o]);
    const stage = tries.bump();
    if (stage === 'show') {
      setTalk(say(D.show, vars));
      return setSolved({ shown: true });
    }
    if (stage === 'clue') {
      setClue(true);
      return setTalk(say(D.clue));
    }
    setTalk(say(D.wrong, { choice: o }));
  };

  let bubble = say(ch.question, vars);
  let actions = null;
  if (!choice) {
    actions = (
      <Choices
        options={C.changeChoices}
        onPick={(o) => {
          setChoice(o);
          setPrediction(`change-${ch.id}`, o);
        }}
      />
    );
  } else {
    bubble = talk ?? say(D.after);
    actions = solved ? (
      <NextButton onClick={() => onDone({ ...doneResult(tries.n, solved.shown), choice })} />
    ) : (
      <Choices options={D.afterChoices} onPick={onPickChanged} tried={tried} />
    );
  }

  return (
    <StepView lines={bubble} actions={actions}>
      <TankGraph lines={lines} highlightX={clue && !solved ? 0 : undefined} />
    </StepView>
  );
}

export const StepChangeRate = (p: StepProps) => <StepChange {...p} which={0} />;
export const StepChangeStart = (p: StepProps) => <StepChange {...p} which={1} />;
