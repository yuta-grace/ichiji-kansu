// 解法ダンジョン：2点から直線の式を求める（5.4）
import { useState } from 'react';
import { Hakase } from '../../components/Hakase';
import Topbar from '../../components/Topbar';
import content from '../../content/dungeon.json';
import { applyResult, effectiveStage, isMaster, methodName, newProgress, pointsText, problemLine } from '../../lib/dungeon';
import type { DungeonProblem, MethodId, MethodProgress, Stage, TitleKey } from '../../lib/dungeon';
import { addLater, addLog, load, update } from '../../lib/storage';
import type { SaveData } from '../../lib/storage';
import { fill } from '../../lib/text';
import { IntroDainyu, IntroModoru } from './Intro';
import Solve from './Solve';
import type { SolveOutcome } from './Solve';
import Walkthrough from './Walkthrough';

const L = content.lines;
const PROBLEMS = content.problems as DungeonProblem[];
const METHODS = content.methods.map((m) => m.id as MethodId);

type DungeonSave = NonNullable<SaveData['dungeon']>;
const emptySave = (): DungeonSave => ({ intro3: false, intro2: false, chose1: false, pos: 0, methods: {}, comparedPairs: [], seenMethods: [] });

/** 時間の表示：「42秒」「1分05秒」 */
export function formatTime(ms: number) {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}秒` : `${Math.floor(s / 60)}分${String(s % 60).padStart(2, '0')}秒`;
}

const pairKey = (a: MethodId, b: MethodId) => [a, b].sort().join('+');

type ResultPhase = { kind: 'result'; lines: string[]; used: MethodId; problem: DungeonProblem; correct: boolean };
type Phase =
  | { kind: 'intro3' }
  | { kind: 'intro2' }
  | { kind: 'choose' }
  | { kind: 'solve'; method: MethodId; stage: Stage; intro: string[] }
  | ResultPhase
  | { kind: 'others'; used: MethodId; problem: DungeonProblem }
  | { kind: 'othersShow'; used: MethodId; method: MethodId; problem: DungeonProblem }
  | { kind: 'othersWhich'; used: MethodId; method: MethodId; problem: DungeonProblem }
  | { kind: 'othersDone'; lines: string[] }
  | { kind: 'propose'; pair: [MethodId, MethodId] }
  | { kind: 'compare'; pair: [MethodId, MethodId]; problem: DungeonProblem; times: number[] }
  | { kind: 'compareAsk'; pair: [MethodId, MethodId]; times: number[] }
  | { kind: 'compareDone' };

export default function Dungeon({ onExit }: { onExit: () => void }) {
  const [save, setSave] = useState<DungeonSave>(() => ({ ...emptySave(), ...load().dungeon }));
  // その場で断った解き比べは、次にダンジョンに入るまで勧めない
  const [declined, setDeclined] = useState<string[]>([]);
  const problem = PROBLEMS[save.pos % PROBLEMS.length];

  const persist = (next: DungeonSave) => {
    setSave(next);
    update((d) => {
      d.dungeon = next;
    });
  };
  const progress = (m: MethodId): MethodProgress => save.methods[m] ?? newProgress();
  const available = METHODS.filter((m) => (m === 'modoru' ? save.intro3 : m === 'dainyu' ? save.intro2 : true));

  // 次に何をするか：③の導入 → （決めた問題で）②の導入 → 解き方を選ぶ
  const nextPhase = (s: DungeonSave): Phase => {
    if (!s.intro3) return { kind: 'intro3' };
    const p = PROBLEMS[s.pos % PROBLEMS.length];
    if (!s.intro2 && p.id === content.intro.dainyuProblem) return { kind: 'intro2' };
    return { kind: 'choose' };
  };
  const [phase, setPhase] = useState<Phase>(() => nextPhase(save));

  /** 2つのやり方が「使える」になったら、まだしていない組み合わせの解き比べを勧める（称号には関係しない） */
  const comparePair = (s: DungeonSave): [MethodId, MethodId] | null => {
    const usable = METHODS.filter((m) => s.methods[m]?.titles.usable);
    for (let i = 0; i < usable.length; i++)
      for (let j = i + 1; j < usable.length; j++) {
        const k = pairKey(usable[i], usable[j]);
        if (!s.comparedPairs.includes(k) && !declined.includes(k)) return [usable[i], usable[j]];
      }
    return null;
  };

  const titleLines = (m: MethodId, gained: TitleKey[], p: MethodProgress) => [
    ...gained.map((k) => fill(L.result.title, { method: methodName(m), level: L.titles.levels[k] })),
    ...(gained.length && isMaster(p) ? [fill(L.result.master, { method: methodName(m) })] : []),
  ];

  const onSolved = (method: MethodId, stage: Stage, o: SolveOutcome) => {
    const before = progress(method);
    const line = problemLine(problem);
    const { next, gained } = applyResult(before, { stage, correct: o.correct, slopeSign: Math.sign(line.a.n), ms: o.ms });
    // どの問題でどの解き方を選んだかを記録する
    addLog({ part: 'dungeon', step: `${problem.id} ${methodName(method)} 段階${stage}`, attempts: o.attempts, shown: o.shown, hintsUsed: o.hintsUsed, ms: o.ms, choice: method });
    const s: DungeonSave = { ...save, pos: save.pos + 1, methods: { ...save.methods, [method]: next } };
    persist(s);
    // 時間は段階Bだけ。解いている最中は見せず、結果で見せる
    const lines: string[] = [];
    if (stage === 'B' && o.correct) {
      lines.push(fill(L.result.time, { t: formatTime(o.ms) }));
      if (before.firstB !== undefined) {
        lines.push(fill(L.result.first, { t: formatTime(before.firstB) }));
        if (o.ms < before.firstB) lines.push(L.result.faster);
      }
    }
    lines.push(...titleLines(method, gained, next));
    const result: ResultPhase = { kind: 'result', lines, used: method, problem, correct: !o.shown };
    if (lines.length) return setPhase(result);
    afterResult(s, result);
  };

  /** 自分で正解した後は「他のやり方も見てみる？」。その後に解き比べの提案か、次の問題 */
  const afterResult = (s: DungeonSave, r: ResultPhase) => {
    const others = available.filter((m) => m !== r.used);
    if (r.correct && others.length) return setPhase({ kind: 'others', used: r.used, problem: r.problem });
    toNext(s);
  };
  const toNext = (s: DungeonSave) => {
    const pair = comparePair(s);
    setPhase(pair ? { kind: 'propose', pair } : nextPhase(s));
  };

  const choose = (m: MethodId) => {
    const intro = m === 'renritsu' && !save.chose1 ? L.chose1First : [];
    if (intro.length) persist({ ...save, chose1: true });
    setPhase({ kind: 'solve', method: m, stage: effectiveStage(progress(m)), intro });
  };

  const titlesCount = METHODS.reduce((n, m) => n + Object.values(progress(m).titles).filter(Boolean).length, 0);
  const screen = (body: React.ReactNode) => (
    <div className="screen fit">
      <Topbar onExit={onExit} progress={titlesCount / (METHODS.length * 3)} />
      {body}
    </div>
  );
  const talkScreen = (lines: string[], actions: React.ReactNode, work: React.ReactNode = null) =>
    screen(
      <div className="step">
        <Hakase lines={lines} />
        <div className="work">{work}</div>
        <div className="actions">{actions}</div>
      </div>,
    );
  const nextButton = (onClick: () => void) => (
    <button type="button" className="btn primary" onClick={onClick}>{L.next}</button>
  );

  switch (phase.kind) {
    case 'intro3':
      return screen(
        <IntroModoru
          onDone={() => {
            const s = { ...save, intro3: true };
            persist(s);
            setPhase(nextPhase(s));
          }}
        />,
      );
    case 'intro2':
      return screen(
        <IntroDainyu
          key={problem.id}
          problem={problem}
          onDone={(o) => {
            addLog({ part: 'dungeon', step: `${problem.id} ②の導入`, attempts: o.attempts, shown: o.shown });
            const s = { ...save, intro2: true, pos: save.pos + 1 };
            persist(s);
            setPhase(nextPhase(s));
          }}
        />,
      );
    case 'choose':
      return talkScreen(
        [fill(L.problem[0], { x1: problem.p1[0], y1: problem.p1[1], x2: problem.p2[0], y2: problem.p2[1] }), ...L.choose],
        <div className="method-choices">
          {available.map((m) => (
            <button key={m} type="button" className="btn choice method-choice" onClick={() => choose(m)}>
              <span>{methodName(m)}</span>
              <small>{L.stageTag[effectiveStage(progress(m))]}</small>
            </button>
          ))}
        </div>,
        <div className="points-card">{pointsText(problem)}</div>,
      );
    case 'solve':
      return screen(
        <Solve
          key={`${problem.id}-${phase.method}`}
          problem={problem}
          method={phase.method}
          stage={phase.stage}
          intro={phase.intro}
          onDone={(o) => onSolved(phase.method, phase.stage, o)}
          onLater={() => addLater({ problemId: problem.id, method: phase.method, from: 'solving' })}
        />,
      );
    case 'result':
      return talkScreen(phase.lines, nextButton(() => afterResult(save, phase)));

    // ---- 他のやり方を見る（残りから1つだけ。今見る／あとで聞く。断ってもよい） ----
    case 'others': {
      const { used, problem: p } = phase;
      return talkScreen(
        L.others.ask,
        <>
          <div className="method-choices">
            {available
              .filter((m) => m !== used)
              .map((m) => (
                <div key={m} className="other-method">
                  <span className="other-name">
                    {methodName(m)}
                    {save.seenMethods.includes(m) && <small>{L.others.seen}</small>}
                  </span>
                  <button type="button" className="btn small" onClick={() => setPhase({ kind: 'othersShow', used, method: m, problem: p })}>
                    {L.others.now}
                  </button>
                  <button
                    type="button"
                    className="btn small ghost"
                    onClick={() => {
                      addLater({ problemId: p.id, method: m, from: 'others' });
                      addLog({ part: 'dungeon', step: `${p.id} 他のやり方 あとで聞く`, choice: m });
                      setPhase({ kind: 'othersDone', lines: L.others.saved });
                    }}
                  >
                    {L.others.later}
                  </button>
                </div>
              ))}
          </div>
          <button type="button" className="btn ghost" onClick={() => toNext(save)}>{L.others.skip}</button>
        </>,
        <div className="points-card">{pointsText(p)}</div>,
      );
    }
    case 'othersShow':
      return screen(
        <Walkthrough
          key={phase.method}
          problem={phase.problem}
          method={phase.method}
          intro={L.others.intro.map((t) => fill(t, { m: methodName(phase.method) }))}
          onDone={() => {
            if (!save.seenMethods.includes(phase.method)) persist({ ...save, seenMethods: [...save.seenMethods, phase.method] });
            setPhase({ ...phase, kind: 'othersWhich' });
          }}
        />,
      );
    case 'othersWhich':
      return talkScreen(
        L.others.which,
        <div className="choices">
          {[phase.used, phase.method].map((m) => (
            <button
              key={m}
              type="button"
              className="btn choice"
              onClick={() => {
                // 答えは記録するだけ
                addLog({ part: 'dungeon', step: `${phase.problem.id} 他のやり方 ${methodName(phase.method)} どっちが楽そう？`, choice: m });
                setPhase({ kind: 'othersDone', lines: L.others.after });
              }}
            >
              {methodName(m)}
            </button>
          ))}
        </div>,
      );
    case 'othersDone':
      return talkScreen(phase.lines, nextButton(() => toNext(save)));

    // ---- 解き比べ（称号には関係しない活動） ----
    case 'propose': {
      const [m1, m2] = phase.pair;
      const names = { m1: methodName(m1), m2: methodName(m2) };
      return talkScreen(
        L.compare.propose.map((t) => fill(t, names)),
        <div className="choices">
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              // 比べる2つのやり方のどちらかが楽そうな問題を、次の問題から探す
              const n = PROBLEMS.length;
              const found =
                Array.from({ length: n }, (_, i) => PROBLEMS[(save.pos + i) % n]).find((p) => p.best.includes(m1) || p.best.includes(m2)) ?? problem;
              setPhase({ kind: 'compare', pair: phase.pair, problem: found, times: [] });
            }}
          >
            {L.compare.yes}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setDeclined((d) => [...d, pairKey(m1, m2)]);
              setPhase(nextPhase(save));
            }}
          >
            {L.compare.no}
          </button>
        </div>,
      );
    }
    case 'compare': {
      // 両方とも段階Bの形（やり方は博士が指定、答えだけ）。この時間は称号のタイムとは別
      const m = phase.pair[phase.times.length];
      const intro = (phase.times.length === 0 ? L.compare.first : L.compare.second).map((t) => fill(t, { m: methodName(m) }));
      return screen(
        <Solve
          key={`compare-${m}`}
          problem={phase.problem}
          method={m}
          stage="B"
          intro={intro}
          onDone={(o) => {
            addLog({ part: 'dungeon', step: `${phase.problem.id} 解き比べ ${methodName(m)}`, attempts: o.attempts, shown: o.shown, hintsUsed: o.hintsUsed, ms: o.ms, choice: m });
            const times = [...phase.times, o.ms];
            setPhase(times.length < 2 ? { ...phase, times } : { kind: 'compareAsk', pair: phase.pair, times });
          }}
        />,
      );
    }
    case 'compareAsk': {
      const [m1, m2] = phase.pair;
      const vars = { m1: methodName(m1), m2: methodName(m2), t1: formatTime(phase.times[0]), t2: formatTime(phase.times[1]) };
      return talkScreen(
        L.compare.result.map((t) => fill(t, vars)),
        <div className="choices">
          {[m1, m2].map((m) => (
            <button
              key={m}
              type="button"
              className="btn choice"
              onClick={() => {
                addLog({ part: 'dungeon', step: '解き比べ どっちが楽だった？', choice: m });
                persist({ ...save, comparedPairs: [...save.comparedPairs, pairKey(m1, m2)] });
                setPhase({ kind: 'compareDone' });
              }}
            >
              {methodName(m)}
            </button>
          ))}
        </div>,
      );
    }
    case 'compareDone':
      return talkScreen(L.compare.after, nextButton(() => setPhase(nextPhase(save))));
  }
}
