import { useState } from 'react';
import type { ComponentType } from 'react';
import home from '../../content/home.json';
import { Hakase } from '../../components/Hakase';
import { addLog, load, update } from '../../lib/storage';
import type { StepProps, StepResult } from './common';
import {
  StepChangeRate, StepChangeStart, StepCompare, StepConnect, StepFindStart, StepPlot, StepPredict, StepStairs, StepTable,
} from './stepsTank';
import {
  StepEnd, StepEquation, StepNameA, StepNameB, StepNaming, StepRevEquation, StepRevIntercept, StepRevRate, StepTwelve,
} from './stepsEquation';
import Topbar from '../../components/Topbar';

// 設計書 5.2 の順番。id はログに残る
const STEPS: { id: string; C: ComponentType<StepProps> }[] = [
  { id: '1-2 表', C: StepTable },
  { id: '3 予想', C: StepPredict },
  { id: '4 点を打つ', C: StepPlot },
  { id: '4 予想と比べる', C: StepCompare },
  { id: '5 最初の量', C: StepFindStart },
  { id: '5 増え方', C: StepStairs },
  { id: '5 線でつなぐ', C: StepConnect },
  { id: '6 毎分を変える', C: StepChangeRate },
  { id: '6 最初を変える', C: StepChangeStart },
  { id: '7 12分後', C: StepTwelve },
  { id: '7 式', C: StepEquation },
  { id: '8 式の2', C: StepNameA },
  { id: '8 式の4', C: StepNameB },
  { id: '8 名前', C: StepNaming },
  { id: '9 切片を読む', C: StepRevIntercept },
  { id: '9 増え方を読む', C: StepRevRate },
  { id: '9 式', C: StepRevEquation },
  { id: 'おわり', C: StepEnd },
];

export default function Understanding({ onExit }: { onExit: () => void }) {
  const saved = load().understanding;
  // ステップを足したり並べかえたりしても再開位置がずれないよう、id で保存する
  const savedIndex = STEPS.findIndex((s) => s.id === saved.stepId);
  const canResume = savedIndex > 0 && !saved.done;
  const [index, setIndex] = useState(canResume ? -1 : 0);
  const [predictions, setPredictions] = useState<Record<string, string>>(saved.predictions ?? {});
  const [startedAt, setStartedAt] = useState(Date.now());

  const go = (i: number) => {
    setIndex(i);
    setStartedAt(Date.now());
    update((d) => {
      d.understanding.stepId = STEPS[i].id;
      d.understanding.done = false;
    });
    window.scrollTo(0, 0);
  };

  const setPrediction = (key: string, value: string) => {
    setPredictions((p) => ({ ...p, [key]: value }));
    update((d) => {
      d.understanding.predictions = { ...d.understanding.predictions, [key]: value };
    });
  };

  const onDone = (r: StepResult) => {
    addLog({ part: 'understanding', step: STEPS[index].id, ...r, ms: Date.now() - startedAt });
    if (index + 1 >= STEPS.length) {
      update((d) => {
        d.understanding = { ...d.understanding, stepId: undefined, done: true };
      });
      return onExit();
    }
    go(index + 1);
  };

  if (index < 0) {
    return (
      <div className="screen">
        <Topbar onExit={onExit} progress={savedIndex / STEPS.length} />
        <Hakase lines={home.resume.ask} />
        <div className="actions">
          <button type="button" className="btn primary" onClick={() => go(savedIndex)}>{home.resume.continue}</button>
          <button type="button" className="btn" onClick={() => go(0)}>{home.resume.restart}</button>
        </div>
      </div>
    );
  }

  const Step = STEPS[index].C;
  return (
    <div className="screen fit">
      <Topbar onExit={onExit} progress={index / (STEPS.length - 1)} />
      <Step key={index} onDone={onDone} predictions={predictions} setPrediction={setPrediction} />
    </div>
  );
}
