import { useRef } from 'react';
import MathText from './MathText';

// 博士：シンプルなアイコンと文字のみ（4章・7章）

/** 講師用画面を開くための長押しの長さ */
const TEACHER_HOLD_MS = 5000;

export function HakaseIcon() {
  // アイコンを5秒長押しすると講師用画面を開く（生徒が偶然開かないように長めにする）
  const timer = useRef<number | null>(null);
  const cancel = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  return (
    <svg
      className="hakase-icon"
      viewBox="0 0 48 48"
      aria-hidden="true"
      onPointerDown={() => {
        cancel();
        timer.current = window.setTimeout(() => {
          window.location.hash = '#/teacher';
        }, TEACHER_HOLD_MS);
      }}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onContextMenu={(e) => e.preventDefault()}
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
