import { useRef } from 'react';
import MathText from './MathText';

// 博士：シンプルなアイコンと文字のみ（4章・7章）

/** 講師用画面を開くためのタップの回数と、その回数を押しきる時間 */
const TEACHER_TAPS = 5;
const TEACHER_TAP_MS = 3000;

export function HakaseIcon() {
  // アイコンを3秒以内に5回タップすると講師用画面を開く（長押しはスマートフォンで文字が選択されてしまうため）
  const taps = useRef<number[]>([]);
  return (
    <svg
      className="hakase-icon"
      viewBox="0 0 48 48"
      aria-hidden="true"
      onClick={() => {
        const now = Date.now();
        taps.current = [...taps.current.filter((t) => now - t < TEACHER_TAP_MS), now];
        if (taps.current.length >= TEACHER_TAPS) {
          taps.current = [];
          window.location.hash = '#/teacher';
        }
      }}
    >
      <circle cx="24" cy="24" r="22" className="hk-face" />
      <circle cx="17" cy="22" r="5" className="hk-glass" />
      <circle cx="31" cy="22" r="5" className="hk-glass" />
      <line x1="22" y1="22" x2="26" y2="22" className="hk-glass" />
      <path d="M17 33 Q24 37 31 33" className="hk-mouth" />
    </svg>
  );
}

export function Hakase({ lines }: { lines: string[] }) {
  return (
    <div className="hakase" aria-live="polite">
      <HakaseIcon />
      <div className="bubble">
        {lines.map((l, i) => (
          <p key={i}>
            <MathText text={l} />
          </p>
        ))}
      </div>
    </div>
  );
}
