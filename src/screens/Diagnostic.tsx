import { useState } from 'react';
import AnswerBar from '../components/AnswerBar';
import { Hakase } from '../components/Hakase';
import MathText from '../components/MathText';
import { NumberField } from '../components/NumberPad';
import { useFields } from '../components/useFields';
import content from '../content/diagnostic.json';
import { checkNumber, isOk } from '../lib/answer';
import { parseAnswer } from '../lib/fraction';
import { addLog, load, update } from '../lib/storage';
import Topbar from '../components/Topbar';

const Q = content.questions;
const L = content.lines;

type Outcome = 'ok' | 'later';

// 診断（準備運動）：一次関数の前提を6問。結果は記録するだけで、他の機能には影響させない（5.1）
// 「テスト」とは呼ばず、点数や学年・水準も表示しない
export default function Diagnostic({ onExit }: { onExit: () => void }) {
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<{ id: string; correct: boolean; answer: string }[]>([]);

  const record = (correct: boolean, answer: string, ms: number) => {
    const q = Q[index];
    addLog({ part: 'diagnostic', step: q.id, attempts: 1, choice: correct ? '正解' : answer === '' ? 'わからない' : `誤答 ${answer}`, ms });
    setResults((r) => [...r, { id: q.id, correct, answer }]);
  };

  const next = () => {
    if (index + 1 < Q.length) return setIndex(index + 1);
    update((d) => {
      d.diagnostic = { done: true, results };
    });
    setIndex(Q.length);
  };

  if (index >= Q.length) {
    const entry = load().entryAnswer ?? 'beginner';
    return (
      <div className="screen fit">
        <Topbar onExit={onExit} progress={1} />
        <Hakase lines={[...L.end, ...L.endSuggest[entry]]} />
        <div className="actions">
          <button type="button" className="btn primary" onClick={onExit}>{L.home}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="screen fit">
      <Topbar onExit={onExit} progress={index / Q.length} />
      <Question key={index} index={index} onAnswered={record} onNext={next} />
    </div>
  );
}

function Question({
  index,
  onAnswered,
  onNext,
}: {
  index: number;
  onAnswered: (correct: boolean, answer: string, ms: number) => void;
  onNext: () => void;
}) {
  const q = Q[index];
  const f = useFields(1);
  const [startedAt] = useState(Date.now());
  const [lines, setLines] = useState(index === 0 ? [...L.start, ...q.say] : q.say);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  // 約分していない分数で答えたとき：正解として扱い、約分を聞く（6章）
  // 約分を聞いた後は、最初の答え（約分していない分数）を記録に残す
  const [unreducedAnswer, setUnreducedAnswer] = useState<string | null>(null);

  const finish = (o: Outcome, answer: string) => {
    f.closePad();
    setOutcome(o);
    setLines(o === 'ok' ? L.ok : L.later);
    onAnswered(o === 'ok', answer, Date.now() - startedAt);
  };

  const check = () => {
    const expected = parseAnswer(q.answer)!.value;
    const r = checkNumber(f.values[0], expected);
    if (r.verdict === 'empty') return;
    if (r.verdict === 'unreadable') return setLines(L.unreadable);
    if (unreducedAnswer !== null) return finish('ok', unreducedAnswer);
    if (r.verdict === 'ok-unreduced') {
      setUnreducedAnswer(f.values[0]);
      f.setValues(['']);
      return setLines(L.unreduced);
    }
    finish(isOk(r) ? 'ok' : 'later', f.values[0]);
  };

  return (
    <div className="step">
      <Hakase lines={lines} />
      <div className="work">
        <div className="problem">
          <MathText text={q.expr} />
        </div>
      </div>
      <div className="actions">
        {outcome ? (
          <button type="button" className="btn primary" onClick={onNext}>{L.next}</button>
        ) : (
          <>
            <AnswerBar f={f} onSubmit={check} submitLabel={L.check}>
              <NumberField value={f.values[0]} active onFocus={() => f.focus(0)} ariaLabel="答え" />
            </AnswerBar>
            {unreducedAnswer === null && (
              <button type="button" className="btn ghost small" onClick={() => finish('later', '')}>
                {L.dontKnow}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
