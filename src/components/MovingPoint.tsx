import { useEffect, useMemo, useState } from 'react';
import content from '../content/task.json';
import { areaAt, endTime, pointAt, trianglePts } from '../lib/task';
import type { MovingFigure } from '../lib/task';
import { fill } from '../lib/text';

const M = content.moving;
/** つまみの刻み（秒） */
const STEP = 0.5;
const fmt = (v: number) => String(Math.round(v * 100) / 100).replace('-', '−');

/**
 * E：動く点の図（5.7）。つまみで P を動かすと、△ が薄く塗られ、横に x と y のグラフが点で描かれていく。
 * 面積の数（y の目盛り）は、答える前は出さない。正解した後（revealed）に見られる
 */
export default function MovingPoint({ figure, revealed, focusT }: { figure: MovingFigure; revealed: boolean; focusT?: number }) {
  const T = endTime(figure);
  const [t, setT] = useState(0);
  // 動かして通った x（グラフに点で残す）
  const [visited, setVisited] = useState<number[]>([0]);
  const maxArea = useMemo(() => {
    let m = 0;
    for (let x = 0; x <= T; x += STEP) m = Math.max(m, areaAt(figure, x));
    return m || 1;
  }, [figure, T]);

  const move = (x: number) => {
    setT(x);
    setVisited((v) => (v.includes(x) ? v : [...v, x]));
  };
  // ヒントの表と対応させる：聞いている x に、つまみを合わせる
  useEffect(() => {
    if (focusT !== undefined) move(focusT);
  }, [focusT]);

  return (
    <div className="moving">
      <div className="moving-row">
        <FigureSvg figure={figure} t={t} />
        <PlotSvg figure={figure} T={T} maxArea={maxArea} visited={visited} t={t} revealed={revealed} />
      </div>
      <label className="moving-slider">
        {/* 正解した後は、つまみの横に面積の数も出す */}
        <span className="muted small moving-note">{revealed ? fill(M.readout, { x: fmt(t), y: fmt(areaAt(figure, t)) }) : fill(M.slider, { x: fmt(t) })}</span>
        <input type="range" min={0} max={T} step={STEP} value={t} aria-label={M.sliderLabel} onChange={(e) => move(Number(e.target.value))} />
      </label>
    </div>
  );
}

/** 長方形と P。頂点の名前、辺の長さ、P が通る道（点線）、△ を薄く塗る */
function FigureSvg({ figure, t }: { figure: MovingFigure; t: number }) {
  const vs = Object.values(figure.vertices);
  const xs = vs.map((v) => v[0]);
  const ys = vs.map((v) => v[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const pad = 2.2;
  const W = x1 - x0 + pad * 2;
  const H = y1 - y0 + pad * 2;
  const sx = (x: number) => x - x0 + pad;
  const sy = (y: number) => y1 - y + pad;
  const center = [(x0 + x1) / 2, (y0 + y1) / 2];
  const names = Object.keys(figure.vertices);
  const tri = trianglePts(figure, t);
  const p = pointAt(figure, t);
  // 頂点の名前は、図の中心から外向きに少し離して置く
  const out = (v: number[]) => {
    const dx = Math.sign(v[0] - center[0]);
    const dy = Math.sign(v[1] - center[1]);
    return [sx(v[0]) + dx * 1.1, sy(v[1]) - dy * 1.1 + 0.45];
  };
  return (
    <svg className="moving-figure" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="動く点の図">
      <polygon className="mv-shape" points={names.map((n) => `${sx(figure.vertices[n][0])},${sy(figure.vertices[n][1])}`).join(' ')} />
      <polyline className="mv-path" points={figure.path.map((n) => `${sx(figure.vertices[n][0])},${sy(figure.vertices[n][1])}`).join(' ')} />
      <polygon className="mv-tri" points={tri.map((v) => `${sx(v[0])},${sy(v[1])}`).join(' ')} />
      {figure.sides.map(([a, b, label]) => {
        const va = figure.vertices[a];
        const vb = figure.vertices[b];
        const mid = [(va[0] + vb[0]) / 2, (va[1] + vb[1]) / 2];
        const dx = Math.sign(mid[0] - center[0]);
        const dy = Math.sign(mid[1] - center[1]);
        return (
          <text key={`${a}${b}`} className="mv-side" x={sx(mid[0]) + dx * 1.3} y={sy(mid[1]) - dy * 1.0 + 0.4} textAnchor="middle">
            {label}
          </text>
        );
      })}
      {names.map((n) => {
        const [lx, ly] = out(figure.vertices[n]);
        return (
          <text key={n} className="mv-name" x={lx} y={ly} textAnchor="middle">
            {n}
          </text>
        );
      })}
      <circle className="mv-p" cx={sx(p[0])} cy={sy(p[1])} r={0.45} />
      <text className="mv-pname" x={sx(p[0]) + 0.7} y={sy(p[1]) - 0.6}>P</text>
    </svg>
  );
}

/** x と y のグラフ。動かして通った x に点を打つ。y の目盛りは答えた後にだけ出す */
function PlotSvg({ figure, T, maxArea, visited, t, revealed }: { figure: MovingFigure; T: number; maxArea: number; visited: number[]; t: number; revealed: boolean }) {
  const W = 120;
  const H = 100;
  const L = revealed ? 22 : 10;
  const B = 14;
  const px = (x: number) => L + (x / T) * (W - L - 6);
  // 答える前は、上の端に「y の数は、答えた後に」を出すので、点はその下に描く
  const top = revealed ? 8 : 16;
  const py = (y: number) => H - B - (y / maxArea) * (H - B - top);
  const xTicks = Array.from({ length: Math.floor(T) + 1 }, (_, i) => i).filter((i) => T <= 8 || i % 2 === 0);
  return (
    <svg className="moving-plot" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="x と y のグラフ">
      <line className="mv-axis" x1={L} y1={H - B} x2={W - 4} y2={H - B} />
      <line className="mv-axis" x1={L} y1={H - B} x2={L} y2={4} />
      {xTicks.map((i) => (
        <text key={i} className="mv-tick" x={px(i)} y={H - 3} textAnchor="middle">
          {i}
        </text>
      ))}
      {revealed && (
        <>
          <text className="mv-tick" x={L - 3} y={py(maxArea) + 3} textAnchor="end">{fmt(maxArea)}</text>
          <text className="mv-tick" x={L - 3} y={py(0) + 3} textAnchor="end">0</text>
          {/* 正解した後は、動かしたところを線でもつなげて見せる */}
          <polyline
            className="mv-curve"
            points={[...visited].sort((a, b) => a - b).map((x) => `${px(x)},${py(areaAt(figure, x))}`).join(' ')}
          />
        </>
      )}
      {!revealed && (
        <text className="mv-hidden" x={(L + W) / 2 + 6} y={8} textAnchor="middle">
          {M.hidden}
        </text>
      )}
      <text className="mv-label" x={W - 4} y={H - B - 3} textAnchor="end">x</text>
      <text className="mv-label" x={L + 3} y={10}>y</text>
      {visited.map((x) => (
        <circle key={x} className={`mv-dot ${x === t ? 'now' : ''}`} cx={px(x)} cy={py(areaAt(figure, x))} r={x === t ? 2.6 : 1.8} />
      ))}
    </svg>
  );
}
