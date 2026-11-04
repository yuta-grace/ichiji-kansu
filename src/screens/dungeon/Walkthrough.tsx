import { useState } from 'react';
import { Hakase } from '../../components/Hakase';
import MathText from '../../components/MathText';
import content from '../../content/dungeon.json';
import { pointsText, solutionLines } from '../../lib/dungeon';
import type { DungeonProblem, MethodId } from '../../lib/dungeon';

const L = content.lines;

/** その問題の数字で、ある解き方の手順を1つずつ見せる（他のやり方を見る・あとで聞くを見る） */
export default function Walkthrough({
  problem,
  method,
  intro,
  onDone,
}: {
  problem: DungeonProblem;
  method: MethodId;
  intro: string[];
  onDone: () => void;
}) {
  const steps = solutionLines(method, problem);
  const [i, setI] = useState(0);
  const last = i >= steps.length - 1;
  return (
    <div className="step">
      <Hakase lines={i === 0 ? [...intro, steps[0]] : [steps[i]]} />
      <div className="work">
        <div className="points-card">{pointsText(problem)}</div>
        <div className="hint-found">
          {steps.slice(0, i + 1).map((t, k) => (
            <span key={k}>
              <MathText text={t} />
            </span>
          ))}
        </div>
      </div>
      <div className="actions">
        <button type="button" className="btn primary" onClick={() => (last ? onDone() : setI(i + 1))}>
          {L.next}
        </button>
      </div>
    </div>
  );
}
