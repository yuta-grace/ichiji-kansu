import { useState } from 'react';
import { applyKey } from './NumberPad';
import type { PadKey } from './NumberPad';

/**
 * 複数の数字入力欄と、共有のキーパッドをつなぐ。
 * padOpen は、キーパッドを入力欄を押したときだけ出す画面（点を打つ問題）で使う。物理キーボードはいつでも使える。
 */
export function useFields(count: number, initial?: string[], initialActive = 0) {
  const [values, setValues] = useState<string[]>(initial ?? Array(count).fill(''));
  const [active, setActive] = useState(initialActive);
  const [padOpen, setPadOpen] = useState(false);

  const onKey = (k: PadKey) => {
    setValues((vs) => {
      const next = vs.slice();
      next[active] = applyKey(vs[active] ?? '', k);
      return next;
    });
  };

  const focus = (i: number) => {
    setActive(i);
    setPadOpen(true);
  };

  return {
    values, setValues, active, setActive, onKey, focus, padOpen,
    closePad: () => setPadOpen(false),
    count,
  };
}

export type Fields = ReturnType<typeof useFields>;
