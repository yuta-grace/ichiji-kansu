import { FracText } from './NumberPad';

// x と y の表。表示用と入力用の両方に使う

interface Props {
  xLabel: string;
  yLabel: string;
  xs: number[];
  /** 表示する y。入力欄にする列は undefined にして renderInput で描く */
  ys: (string | number | undefined)[];
  renderInput?: (i: number) => React.ReactNode;
  /** 手がかりとして光らせる列 */
  highlight?: number[];
  /** 列と列の間に「+2」のような増え方を書く */
  diffs?: (string | undefined)[];
}

export default function ValueTable({ xLabel, yLabel, xs, ys, renderInput, highlight = [], diffs }: Props) {
  const fmt = (v: string | number) => <FracText text={String(v).replace(/^-/, '−')} />;
  return (
    <div className="vtable-wrap">
      <table className="vtable">
        <tbody>
          <tr>
            <th scope="row">{xLabel}</th>
            {xs.map((x, i) => (
              <td key={i} className={highlight.includes(i) ? 'hl' : ''}>{fmt(x)}</td>
            ))}
          </tr>
          <tr>
            <th scope="row">{yLabel}</th>
            {ys.map((y, i) => (
              <td key={i} className={highlight.includes(i) ? 'hl' : ''}>
                {y === undefined ? renderInput?.(i) : fmt(y)}
              </td>
            ))}
          </tr>
          {diffs && (
            <tr className="diffs">
              <th scope="row" />
              {xs.map((_, i) => (
                <td key={i}>{i > 0 && diffs[i] ? <span className="diff">{diffs[i]}</span> : null}</td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
