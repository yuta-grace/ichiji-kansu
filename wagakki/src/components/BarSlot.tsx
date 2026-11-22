// 画面ごとの操作を、上のバーの中に置く
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import { useApp } from '../context';

export function BarSlot({ children }: { children: ReactNode }) {
  const { barSlot } = useApp();
  return barSlot ? createPortal(children, barSlot) : null;
}
