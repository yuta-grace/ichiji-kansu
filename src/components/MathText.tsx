import { Fragment } from 'react';
import { FracText } from './NumberPad';

/** 式の文字列を表示する。[2/3] のように書いた部分は縦の分数にする */
export default function MathText({ text }: { text: string }) {
  const parts = text.split(/(\[[^\]]+\])/);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('[') ? <FracText key={i} text={p.slice(1, -1).replace('-', '−')} /> : <Fragment key={i}>{p}</Fragment>,
      )}
    </>
  );
}
