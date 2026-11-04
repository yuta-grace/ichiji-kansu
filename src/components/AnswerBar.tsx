import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { NumberPad, keyFromKeyboard } from './NumberPad';
import type { Fields } from './useFields';

/**
 * 画面の下に置く答えの欄：入力欄・「こたえる」ボタン・キーパッド。
 * キーパッドは最初から出しておく（点を打つ問題では、グラフを隠さないよう入力欄を押したときだけ）。
 * Mac では物理キーボードで数字を入れ、Enter で答え、Tab で次の欄へ移る。
 */
export default function AnswerBar({
  f,
  onSubmit,
  submitLabel,
  children,
  extra,
  allowFraction = true,
  disabled,
  tabCount,
  padOnTap,
}: {
  f: Fields;
  onSubmit: () => void;
  submitLabel: string;
  children?: ReactNode;
  /** 「こたえる」の左に並べるボタン（ヒントなど） */
  extra?: ReactNode;
  allowFraction?: boolean;
  disabled?: boolean;
  /** Tab で回る欄の数（表示していない欄を飛ばすため） */
  tabCount?: number;
  /** キーパッドを入力欄を押したときだけ出す（点を打つ問題） */
  padOnTap?: boolean;
}) {
  // キーボードの処理は最新の値を使うため ref 経由で呼ぶ
  const latest = useRef({ f, onSubmit, allowFraction, tabCount });
  latest.current = { f, onSubmit, allowFraction, tabCount };

  useEffect(() => {
    if (disabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const k = keyFromKeyboard(e);
      if (!k) return;
      const { f, onSubmit, allowFraction, tabCount } = latest.current;
      e.preventDefault();
      if (k === 'enter') return onSubmit();
      if (k === 'tab') {
        const n = tabCount ?? f.count;
        return f.setActive((f.active + (e.shiftKey ? n - 1 : 1)) % n);
      }
      if (!allowFraction && (k === '/' || k === '.')) return;
      f.onKey(k);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [disabled]);

  return (
    <div className="answer-bar">
      <div className="answer-row">
        {children}
        <div className="answer-buttons">
          {extra}
          <button type="button" className="btn primary submit" onClick={onSubmit}>
            {submitLabel}
          </button>
        </div>
      </div>
      {(!padOnTap || f.padOpen) && <NumberPad onKey={f.onKey} allowFraction={allowFraction} />}
    </div>
  );
}
