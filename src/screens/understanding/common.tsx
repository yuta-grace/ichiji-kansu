import { useState } from 'react';
import type { ReactNode } from 'react';
import settings from '../../content/settings.json';
import content from '../../content/understanding.json';
import { Hakase } from '../../components/Hakase';
import { NumberField } from '../../components/NumberPad';
import type { Fields } from '../../components/useFields';
import { fill } from '../../lib/text';

export const C = content;
export const L = content.lines;
export const T = content.tank;

export type Vars = Record<string, string | number>;
export const say = (lines: string[], vars: Vars = {}) => lines.map((l) => fill(l, vars));

export interface StepResult {
  attempts?: number;
  shown?: boolean;
  hintsUsed?: number;
  choice?: string;
}

export interface StepProps {
  onDone: (r: StepResult) => void;
  predictions: Record<string, string>;
  setPrediction: (key: string, value: string) => void;
}

/**
 * 間違えた回数に応じた返し方（5.2「理解パートで間違えたときの返し方」）
 * 1回目：その答えが何を表すか ／ 2回目：手がかりを指す ／ 3回目：正しい答えを見せる
 */
export type Stage = 'meaning' | 'clue' | 'show';

export function useTries() {
  const [n, setN] = useState(0);
  const bump = (): Stage => {
    const m = n + 1;
    setN(m);
    if (m >= settings.attemptsBeforeAnswerShown) return 'show';
    return m === 1 ? 'meaning' : 'clue';
  };
  return { n, bump };
}

/** 1ステップ分の画面の枠：博士の台詞、作業する場所、下の操作 */
export function StepView({ lines, children, actions }: { lines: string[]; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="step">
      <Hakase lines={lines} />
      <div className="work">{children}</div>
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}

export function NextButton({ onClick, label = L.common.next }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" className="btn primary" onClick={onClick}>
      {label}
    </button>
  );
}

export function Choices({
  options,
  onPick,
  picked,
  tried = [],
}: {
  options: string[];
  onPick: (o: string) => void;
  /** 選び終わった答え（ボタンを押せなくする） */
  picked?: string;
  /** 一度選んで違っていた答え（印だけつけ、もう一度押せる） */
  tried?: string[];
}) {
  return (
    <div className="choices">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          className={`btn choice ${picked === o ? 'picked' : ''} ${tried.includes(o) ? 'tried' : ''}`}
          disabled={picked !== undefined}
          onClick={() => onPick(o)}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

/** y ＝ □x ＋ □ の入力欄 */
export function EquationFields({ f, states }: { f: Fields; states?: ('ok' | 'check' | undefined)[] }) {
  return (
    <div className="equation">
      <span className="eq-text">y ＝</span>
      <NumberField value={f.values[0]} active={f.active === 0} onFocus={() => f.focus(0)} state={states?.[0]} ariaLabel="x の前の数" />
      <span className="eq-text">x ＋</span>
      <NumberField value={f.values[1]} active={f.active === 1} onFocus={() => f.focus(1)} state={states?.[1]} ariaLabel="足す数" />
    </div>
  );
}

/** 水そうの値（x 分のときの水の量） */
export const tankY = (x: number, start = T.start, rate = T.rate) => start + rate * x;
export const tankPoints = (start = T.start, rate = T.rate) => T.minutes.map((x) => ({ x, y: tankY(x, start, rate) }));
/** 点を線でつないだもの。時間は0分から（負の時間は描かない） */
export const tankLine = (start = T.start, rate = T.rate) => ({ a: rate, b: start, from: 0 });
