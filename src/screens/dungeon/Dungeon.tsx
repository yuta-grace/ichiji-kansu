// 2点から式を作る（5.4）：問題は a と b を答えるだけ。解き方はノートに集め、ヒントで選ぶ
import { useState } from 'react';
import { Hakase } from '../../components/Hakase';
import Topbar from '../../components/Topbar';
import content from '../../content/dungeon.json';
import settings from '../../content/settings.json';
import { pointsText } from '../../lib/dungeon';
import type { DungeonProblem, MethodId } from '../../lib/dungeon';
import { isLearned, learnMethod, methodLabel, noteOrder } from '../../lib/notebook';
import { addLater, addLog, load, update } from '../../lib/storage';
import type { SaveData } from '../../lib/storage';
import { fill } from '../../lib/text';
import { IntroDainyu, IntroModoru } from './Intro';
import LearnMethod from './Learn';
import MethodCard from './MethodCard';
import NameMethod from './NameMethod';
import Solve from './Solve';
import type { SolveOutcome } from './Solve';
import Walkthrough from './Walkthrough';

const L = content.lines;
const N = L.note;
const PROBLEMS = content.problems as DungeonProblem[];

type DungeonSave = NonNullable<SaveData['dungeon']>;

/** 時間の表示：「42秒」「1分05秒」 */
export function formatTime(ms: number) {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}秒` : `${Math.floor(s / 60)}分${String(s % 60).padStart(2, '0')}秒`;
}

type Phase =
  | { kind: 'intro3' }
  | { kind: 'intro2' }
  | { kind: 'offer1' }
  | { kind: 'solve' }
  | { kind: 'learn'; method: MethodId; from: string }
  | { kind: 'name'; method: MethodId; lines: string[]; then: Phase }
  | { kind: 'talk'; lines: string[]; then: Phase }
  | { kind: 'others'; used?: MethodId; problem: DungeonProblem }
  | { kind: 'othersShow'; used?: MethodId; method: MethodId; problem: DungeonProblem }
  | { kind: 'othersWhich'; used: MethodId; method: MethodId; problem: DungeonProblem };

export default function Dungeon({ onExit }: { onExit: () => void }) {
  const [save, setSave] = useState<DungeonSave>(() => ({ pos: 0, ...load().dungeon }));
  const problem = PROBLEMS[save.pos % PROBLEMS.length];
  const seen = save.seen ?? [];

  const persist = (next: DungeonSave) => {
    setSave(next);
    update((d) => {
      d.dungeon = next;
    });
  };

  // 次に何をするか：③の導入 → （決めた問題で）②の導入 → 5問解いても①を知らなければ1回だけ提案 → 問題
  const nextPhase = (s: DungeonSave): Phase => {
    const d = load();
    if (!isLearned(d, 'modoru')) return { kind: 'intro3' };
    const p = PROBLEMS[s.pos % PROBLEMS.length];
    if (!isLearned(d, 'dainyu') && p.id === content.intro.dainyuProblem) return { kind: 'intro2' };
    if (!isLearned(d, 'renritsu') && !s.offered1 && (s.solved ?? 0) >= settings.dungeon.offerUnknownAfterSolved) return { kind: 'offer1' };
    return { kind: 'solve' };
  };
  const [phase, setPhase] = useState<Phase>(() => nextPhase(save));

  const onSolved = (o: SolveOutcome) => {
    // 問題ごとに、ヒントで選んだ解き方を記録する（画面には出さない）
    addLog({ part: 'dungeon', step: problem.id, attempts: o.attempts, shown: o.shown, hintsUsed: o.hintsUsed, ms: o.ms, choice: o.hintMethod });
    const s: DungeonSave = { ...save, pos: save.pos + 1, solved: (save.solved ?? 0) + 1 };
    persist(s);
    // 自分で正解した後は「他のやり方も見てみる？」（ヒントで使った解き方は除く）
    const others = noteOrder(load()).filter((m) => m !== o.hintMethod);
    setPhase(o.correct && others.length ? { kind: 'others', used: o.hintMethod, problem } : nextPhase(s));
  };
  const toNext = () => setPhase(nextPhase(save));

  const screen = (body: React.ReactNode) => (
    <div className="screen fit">
      <Topbar onExit={onExit} progress={(save.pos % PROBLEMS.length) / PROBLEMS.length} />
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
            learnMethod('modoru', '最初の導入');
            setPhase({ kind: 'name', method: 'modoru', lines: N.saved, then: { kind: 'talk', lines: L.intro3.after, then: nextPhase(save) } });
          }}
        />,
      );
    case 'intro2':
      return screen(
        <IntroDainyu
          key={problem.id}
          problem={problem}
          onDone={(o) => {
            addLog({ part: 'dungeon', step: `${problem.id} ②の導入`, attempts: o.attempts, shown: o.shown, ms: o.ms });
            learnMethod('dainyu', '②の導入');
            const s = { ...save, pos: save.pos + 1, solved: (save.solved ?? 0) + 1 };
            persist(s);
            setPhase({ kind: 'name', method: 'dainyu', lines: N.saved, then: nextPhase(s) });
          }}
        />,
      );
    case 'offer1':
      return talkScreen(
        L.offer1.ask,
        <div className="choices">
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              persist({ ...save, offered1: true });
              setPhase({ kind: 'learn', method: 'renritsu', from: '博士の提案' });
            }}
          >
            {L.offer1.yes}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              persist({ ...save, offered1: true });
              setPhase({ kind: 'solve' });
            }}
          >
            {L.offer1.no}
          </button>
        </div>,
      );
    case 'solve':
      return screen(
        <Solve
          key={problem.id}
          problem={problem}
          onDone={onSolved}
          onLater={(m) => addLater({ problemId: problem.id, method: m, from: 'solving' })}
        />,
      );
    case 'learn':
      return screen(<LearnMethod key={phase.method} method={phase.method} from={phase.from} onDone={toNext} />);
    case 'name':
      return screen(<NameMethod key={phase.method} method={phase.method} lines={phase.lines} onDone={() => setPhase(phase.then)} />);
    case 'talk':
      return talkScreen(phase.lines, nextButton(() => setPhase(phase.then)));

    // ---- 他のやり方を見る（今見る／後で聞く。まだ知らない解き方はここから学べる。断ってもよい） ----
    case 'others': {
      const { used, problem: p } = phase;
      const d = load();
      return talkScreen(
        L.others.ask,
        <>
          <div className="method-choices">
            {noteOrder(d)
              .filter((m) => m !== used)
              .map((m) =>
                isLearned(d, m) ? (
                  <MethodCard key={m} d={d} method={m} summary={false}>
                    {seen.includes(m) && <small className="muted">{L.others.seen}</small>}
                    <button type="button" className="btn small" onClick={() => setPhase({ kind: 'othersShow', used, method: m, problem: p })}>
                      {L.others.now}
                    </button>
                    <button
                      type="button"
                      className="btn small ghost"
                      onClick={() => {
                        addLater({ problemId: p.id, method: m, from: 'others' });
                        addLog({ part: 'dungeon', step: `${p.id} 他のやり方 後で聞く`, choice: m });
                        setPhase({ kind: 'talk', lines: L.others.saved, then: nextPhase(save) });
                      }}
                    >
                      {L.others.later}
                    </button>
                  </MethodCard>
                ) : (
                  <MethodCard key={m} d={d} method={m} summary={false} onClick={() => setPhase({ kind: 'learn', method: m, from: '他のやり方' })} />
                ),
              )}
          </div>
          <button type="button" className="btn ghost" onClick={toNext}>{L.others.skip}</button>
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
          intro={L.others.intro.map((t) => fill(t, { m: methodLabel(load(), phase.method) }))}
          onDone={() => {
            // 正解後に見た解き方を記録する（画面には出さない）
            addLog({ part: 'dungeon', step: `${phase.problem.id} 他のやり方 今見る`, choice: phase.method });
            if (!seen.includes(phase.method)) persist({ ...save, seen: [...seen, phase.method] });
            // ヒントで解き方を選んでいたら、どっちが楽そうかを聞く（記録だけ）
            setPhase(
              phase.used
                ? { kind: 'othersWhich', used: phase.used, method: phase.method, problem: phase.problem }
                : { kind: 'talk', lines: L.others.after, then: nextPhase(save) },
            );
          }}
        />,
      );
    case 'othersWhich': {
      const d = load();
      return talkScreen(
        L.others.which,
        <div className="method-choices">
          {[phase.used, phase.method].map((m) => (
            <MethodCard
              key={m}
              d={d}
              method={m}
              summary={false}
              onClick={() => {
                addLog({ part: 'dungeon', step: `${phase.problem.id} 他のやり方 どっちが楽そう？`, choice: m });
                setPhase({ kind: 'talk', lines: L.others.after, then: nextPhase(save) });
              }}
            />
          ))}
        </div>,
      );
    }
  }
}
