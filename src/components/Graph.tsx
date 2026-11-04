import { useLayoutEffect, useRef, useState } from 'react';
import type { PointerEvent as RPointerEvent } from 'react';
import settings from '../content/settings.json';
import { labelEvery, samePt, snap } from '../lib/graphMath';
import type { Pt, Range } from '../lib/graphMath';

export type Tone = 'main' | 'faint' | 'accent' | 'hint';

export interface GraphPoint extends Pt {
  tone?: Tone;
  label?: string;
}

export interface GraphLine {
  a: number;
  b: number;
  tone?: Tone;
  /** 線を引く x の範囲（省略時はグラフ全体） */
  from?: number;
  to?: number;
}

/** 点 (x, y) から右に dx、上に dy の階段 */
export interface GraphStair extends Pt {
  dx: number;
  dy: number;
  tone?: Tone;
  showLabels?: boolean;
}

interface Props extends Range {
  xLabel?: string;
  yLabel?: string;
  points?: GraphPoint[];
  lines?: GraphLine[];
  stairs?: GraphStair[];
  /** 手がかりとして光らせる縦の帯（x の値） */
  highlightX?: number;
  /** 生徒が打つ点。plot モードで使う */
  userPoints?: Pt[];
  onUserPointsChange?: (pts: Pt[]) => void;
  maxUserPoints?: number;
  /** 'plot'＝点を打つ／動かす、'pick'＝場所をタップして選ぶ */
  mode?: 'none' | 'plot' | 'pick';
  /** pick モード：吸着した格子点、タップした生の座標、座標→画面上の位置(px)の変換 */
  onPick?: (lattice: Pt, raw: Pt, toPx: (p: Pt) => Pt) => void;
  /**
   * 縦と横を同じ目盛りにする（練習・ダンジョン。傾きを見た目で読むため）。
   * false のときは、置き場所に収まるよう縦と横を別々に縮める（水そうのグラフ）
   */
  equalScale?: boolean;
}

const PAD = { l: 36, r: 14, t: 14, b: 30 };

export default function Graph(props: Props) {
  const {
    xMin, xMax, yMin, yMax,
    xLabel = 'x', yLabel = 'y',
    points = [], lines = [], stairs = [],
    userPoints = [], onUserPointsChange, maxUserPoints = Infinity,
    mode = 'none', onPick, highlightX,
  } = props;
  const range: Range = { xMin, xMax, yMin, yMax };

  const svgRef = useRef<SVGSVGElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 320, h: 300 });
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);

  // グラフは置き場所（親の残りの高さ）いっぱいに収める。画面を縦にスクロールさせないため
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);

  const fitX = Math.min(settings.graph.maxCellPx, (box.w - PAD.l - PAD.r) / (xMax - xMin));
  const fitY = Math.min(settings.graph.maxCellPx, (box.h - PAD.t - PAD.b) / (yMax - yMin));
  const ux = props.equalScale ? Math.min(fitX, fitY) : fitX;
  const uy = props.equalScale ? ux : fitY;
  const W = PAD.l + PAD.r + ux * (xMax - xMin);
  const H = PAD.t + PAD.b + uy * (yMax - yMin);
  const px = (x: number) => PAD.l + (x - xMin) * ux;
  const py = (y: number) => PAD.t + (yMax - y) * uy;

  const toData = (e: RPointerEvent): Pt => {
    const svg = svgRef.current!;
    const r = svg.getBoundingClientRect();
    const sx = ((e.clientX - r.left) / r.width) * W;
    const sy = ((e.clientY - r.top) / r.height) * H;
    return { x: xMin + (sx - PAD.l) / ux, y: yMax - (sy - PAD.t) / uy };
  };

  // 既にある点の近く（指の太さ程度）を押したら、その点を動かす
  const hitUserPoint = (e: RPointerEvent): number | null => {
    const svg = svgRef.current!;
    const r = svg.getBoundingClientRect();
    const scale = r.width / W;
    let best: number | null = null;
    let bestD = 24; // px
    userPoints.forEach((p, i) => {
      const d = Math.hypot(r.left + px(p.x) * scale - e.clientX, r.top + py(p.y) * scale - e.clientY);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  };

  const onDown = (e: RPointerEvent) => {
    if (mode === 'none') return;
    if (mode === 'pick') return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const hit = hitUserPoint(e);
    if (hit !== null) {
      setDragIndex(hit);
      setSelected(hit);
      return;
    }
    const p = snap(toData(e), range);
    const existing = userPoints.findIndex((q) => samePt(q, p));
    if (existing >= 0) {
      setDragIndex(existing);
      setSelected(existing);
      return;
    }
    if (userPoints.length >= maxUserPoints) {
      setSelected(null);
      return;
    }
    onUserPointsChange?.([...userPoints, p]);
    setDragIndex(userPoints.length);
    setSelected(userPoints.length);
  };

  const onMove = (e: RPointerEvent) => {
    if (dragIndex === null) return;
    const p = snap(toData(e), range);
    const cur = userPoints[dragIndex];
    if (!cur || samePt(cur, p)) return;
    if (userPoints.some((q, i) => i !== dragIndex && samePt(q, p))) return;
    const next = userPoints.slice();
    next[dragIndex] = p;
    onUserPointsChange?.(next);
  };

  const onUp = (e: RPointerEvent) => {
    if (mode === 'pick') {
      const raw = toData(e);
      onPick?.(snap(raw, range), raw, (p) => ({ x: px(p.x), y: py(p.y) }));
      return;
    }
    setDragIndex(null);
  };

  const removeSelected = () => {
    const i = selected ?? userPoints.length - 1;
    if (i < 0) return;
    onUserPointsChange?.(userPoints.filter((_, j) => j !== i));
    setSelected(null);
  };

  const tickX = labelEvery(ux);
  const tickY = labelEvery(uy);
  const xs: number[] = [];
  for (let x = Math.ceil(xMin); x <= xMax; x++) xs.push(x);
  const ys: number[] = [];
  for (let y = Math.ceil(yMin); y <= yMax; y++) ys.push(y);
  const drawMinorY = uy >= 9;

  const lineEnds = (l: GraphLine) => {
    const x1 = l.from ?? xMin - 1;
    const x2 = l.to ?? xMax + 1;
    return { x1: px(x1), y1: py(l.a * x1 + l.b), x2: px(x2), y2: py(l.a * x2 + l.b) };
  };

  // 座標の表示は点の上。上の端で切れるときは点の下に出す
  const readoutTop = (p: Pt) => (py(p.y) - 44 < 0 ? py(p.y) + 16 : py(p.y) - 44);
  const readout = dragIndex !== null ? userPoints[dragIndex] : selected !== null ? userPoints[selected] : null;

  return (
    <div className="graph">
      <div className="graph-box" ref={boxRef}>
        <svg
          ref={svgRef}
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          className={`graph-svg mode-${mode}`}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={() => setDragIndex(null)}
          role="img"
          aria-label="グラフ"
        >
          <defs>
            <clipPath id="plot-area">
              <rect x={PAD.l} y={PAD.t} width={W - PAD.l - PAD.r} height={H - PAD.t - PAD.b} />
            </clipPath>
          </defs>

          {highlightX !== undefined && (
            <rect className="g-highlight" x={px(highlightX) - ux * 0.35} y={PAD.t} width={ux * 0.7} height={H - PAD.t - PAD.b} rx={6} />
          )}

          {/* 格子 */}
          {xs.map((x) => (
            <line key={`gx${x}`} className={x % tickX === 0 ? 'g-grid' : 'g-grid minor'} x1={px(x)} x2={px(x)} y1={PAD.t} y2={H - PAD.b} />
          ))}
          {ys.map((y) =>
            drawMinorY || y % tickY === 0 ? (
              <line key={`gy${y}`} className={y % tickY === 0 ? 'g-grid' : 'g-grid minor'} y1={py(y)} y2={py(y)} x1={PAD.l} x2={W - PAD.r} />
            ) : null,
          )}

          {/* 軸 */}
          {yMin <= 0 && yMax >= 0 && <line className="g-axis" x1={PAD.l} x2={W - PAD.r} y1={py(0)} y2={py(0)} />}
          {xMin <= 0 && xMax >= 0 && <line className="g-axis" x1={px(0)} x2={px(0)} y1={PAD.t} y2={H - PAD.b} />}
          {xs.filter((x) => x % tickX === 0).map((x) => (
            <text key={`lx${x}`} className="g-tick" x={px(x)} y={H - PAD.b + 18} textAnchor="middle">
              {String(x).replace('-', '−')}
            </text>
          ))}
          {ys.filter((y) => y % tickY === 0).map((y) => (
            <text key={`ly${y}`} className="g-tick" x={PAD.l - 6} y={py(y) + 4} textAnchor="end">
              {String(y).replace('-', '−')}
            </text>
          ))}
          <text className="g-axis-label" x={W - PAD.r} y={H - PAD.b - 6} textAnchor="end">{xLabel}</text>
          <text className="g-axis-label" x={PAD.l + 6} y={PAD.t + 12}>{yLabel}</text>

          <g clipPath="url(#plot-area)">
            {lines.map((l, i) => {
              const e = lineEnds(l);
              return <line key={`l${i}`} className={`g-line tone-${l.tone ?? 'main'}`} {...e} />;
            })}
            {stairs.map((s, i) => (
              <g key={`s${i}`} className={`g-stair tone-${s.tone ?? 'main'}`}>
                <path d={`M${px(s.x)},${py(s.y)} H${px(s.x + s.dx)} V${py(s.y + s.dy)}`} />
                {s.showLabels && (
                  <>
                    <text x={(px(s.x) + px(s.x + s.dx)) / 2 + 6} y={py(s.y) + (s.dy < 0 ? -8 : 18)} textAnchor="middle">
                      右に{s.dx}
                    </text>
                    <text x={px(s.x + s.dx) + 5} y={(py(s.y) + py(s.y + s.dy)) / 2 + 4}>
                      {s.dy >= 0 ? `上に${s.dy}` : `下に${-s.dy}`}
                    </text>
                  </>
                )}
              </g>
            ))}
          </g>

          {points.map((p, i) => (
            <g key={`p${i}`} className={`g-point tone-${p.tone ?? 'main'}`}>
              <circle cx={px(p.x)} cy={py(p.y)} r={p.tone === 'accent' ? 9 : 6} />
              {p.label && (
                <text x={px(p.x) + 10} y={py(p.y) - 10}>{p.label}</text>
              )}
            </g>
          ))}

          {userPoints.map((p, i) => (
            <circle
              key={`u${i}`}
              className={`g-user ${i === selected ? 'selected' : ''}`}
              cx={px(p.x)}
              cy={py(p.y)}
              r={i === dragIndex ? 11 : 8}
            />
          ))}

          {readout && (
            <g className="g-readout">
              <rect x={px(readout.x) - 34} y={readoutTop(readout)} width={68} height={26} rx={6} />
              <text x={px(readout.x)} y={readoutTop(readout) + 18} textAnchor="middle">
                ({String(readout.x).replace('-', '−')}, {String(readout.y).replace('-', '−')})
              </text>
            </g>
          )}
        </svg>
      </div>

      {mode === 'plot' && (
        <div className="graph-tools">
          <span className="muted small">
            {userPoints.length}{Number.isFinite(maxUserPoints) ? ` / ${maxUserPoints}` : ''} 点
          </span>
          <button type="button" className="btn small ghost" onClick={removeSelected} disabled={userPoints.length === 0}>
            {selected !== null ? '選んだ点を消す' : '最後の点を消す'}
          </button>
        </div>
      )}
    </div>
  );
}
