import { useState } from 'react';
import settings from '../content/settings.json';
import { checkNumber, isOk } from '../lib/answer';
import type { Frac } from '../lib/fraction';
import type { HintStep, HintVisual } from '../lib/hints';

/**
 * ヒントの段を順に進める。
 * 間違えたとき：1回目＝その答えが何を表すか、2回目＝手がかりを指す、3回目＝答えを見せて次の段へ
 * autoStart：最初から1段目を聞く（ダンジョンの段階A）
 */
export function useHintFlow(steps: HintStep[], autoStart = false) {
  const [index, setIndex] = useState(autoStart ? 0 : -1);
  const [miss, setMiss] = useState(0);
  const [visual, setVisual] = useState<HintVisual | null>(null);
  const [found, setFound] = useState<string[]>([]);

  const step = index >= 0 ? steps[index] : null;
  /** 数を答える段にいる */
  const asking = !!step && step.answer !== null;
  /** 最後の段まで来た（元の問題に戻っている） */
  const finished = !!step && step.answer === null;

  const advance = (s: HintStep, v: Frac) => {
    const line = typeof s.found === 'function' ? s.found(v) : s.found;
    if (line) setFound((f) => [...f, line]);
    setIndex((i) => i + 1);
    setMiss(0);
    setVisual(null);
  };

  /**
   * 数を答える段の判定。博士の台詞と、受け付けた値を返す（台詞が空なら次の段の問いだけを出す）
   */
  const check = (raw: string): { lines: string[]; accepted: boolean; value?: Frac } | null => {
    if (!step || step.answer === null) return null;
    const answers = [step.answer, ...(step.alsoAccept ?? [])];
    const results = answers.map((a) => checkNumber(raw, a));
    const r = results.find(isOk) ?? results[0];
    if (r.verdict === 'empty') return null;
    if (r.verdict === 'unreadable') return { lines: [], accepted: false };
    if (isOk(r)) {
      advance(step, r.value!);
      return { lines: [], accepted: true, value: r.value };
    }
    const m = miss + 1;
    if (m >= settings.attemptsBeforeAnswerShown) {
      advance(step, step.answer);
      return { lines: step.show, accepted: true, value: step.answer };
    }
    setMiss(m);
    if (m === 1) return { lines: step.meaning(r.value!), accepted: false };
    setVisual(step.visual ?? null);
    return { lines: step.clue, accepted: false };
  };

  return {
    index,
    started: index >= 0,
    used: index + 1,
    start: () => setIndex(0),
    step,
    asking,
    finished,
    visual,
    found,
    check,
  };
}
