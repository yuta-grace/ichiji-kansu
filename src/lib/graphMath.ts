// グラフ部品の座標計算（画面に依存しない部分。テストしやすいように分けておく）

export interface Pt {
  x: number;
  y: number;
}

export interface Range {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

/** タップした位置から一番近い格子点（範囲内に収める）。6章 */
export function snap(p: Pt, r: Range): Pt {
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  return {
    x: clamp(Math.round(p.x), r.xMin, r.xMax),
    y: clamp(Math.round(p.y), r.yMin, r.yMax),
  };
}

export const samePt = (a: Pt, b: Pt) => a.x === b.x && a.y === b.y;

/** 点 p から線分 ab までの距離 */
export function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** 目盛りの数字を何目盛りおきに書くか。1目盛りの幅が狭いときは間引く */
export function labelEvery(unitPx: number): number {
  if (unitPx >= 22) return 1;
  if (unitPx >= 11) return 2;
  return 5;
}
