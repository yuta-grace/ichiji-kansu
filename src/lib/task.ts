// 新しい入口（交点と直線上の点・座標と図形・暮らしの中の一次関数・挑戦）の問題の形と、計算（5.6〜5.8）
import challenge from '../content/challenge.json';
import figures from '../content/figures.json';
import life from '../content/life.json';
import points from '../content/points.json';
import type { Frac } from './fraction';
import type { HintStep } from './hints';
import { numText, toFrac } from './linear';
import { fill } from './text';

export type TaskEntryId = 'points' | 'figures' | 'life' | 'challenge';

/** 答え方：A 座標、B 単位つきの数、または y ＝ ax ＋ b の a と b */
export type TaskAnswer =
  | { kind: 'number'; value: string; unit?: string; before?: string }
  | { kind: 'point'; x: string; y: string }
  | { kind: 'linear'; a: string; b: string }
  /** 数を2つ（「2秒後」「3秒後」の面積など） */
  | { kind: 'pair'; labels: string[]; values: string[]; unit?: string };

export interface TaskHint {
  q: string;
  answer: string;
  /** ほかにも正解として受け付ける値 */
  also?: string[];
  /** 間違えた1回目：その答えが何を表すか（{v} は生徒の答え） */
  wrong?: string;
  /** 2回目：手がかり */
  clue: string;
  /** 3回目：答えを見せる */
  show: string;
  /** 答えた後も「分かったこと」に残す一行 */
  found?: string;
  /** この段の問いの前に、博士が添える一言 */
  say?: string;
  /** 動く点：この段を聞くときに、つまみをこの x に合わせる */
  x?: number;
  /** ヒントの表：答えたら埋めるマス [行, 列] */
  cell?: number[];
}

/** C・D：座標の上のグラフ（直線に名前、三角形を薄く塗る、点に名前） */
export interface TaskGraph {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  lines?: { a: string; b: string; name?: string }[];
  polygon?: number[][];
  points?: { x: number; y: number; label: string }[];
  /** false：縦と横を別々の目盛りにする（場面のグラフ） */
  equalScale?: boolean;
  xLabel?: string;
  yLabel?: string;
}

/** E：動く点の図。座標は cm（左下が原点、上向きが正） */
export interface MovingFigure {
  vertices: Record<string, number[]>;
  /** 辺の長さの表示：[頂点, 頂点, 文字] */
  sides: string[][];
  /** P が通る頂点の順 */
  path: string[];
  /** 毎秒何 cm */
  speed: number;
  /** 面積を求める三角形（"P" は動く点） */
  triangle: string[];
}

export interface TaskProblem {
  id: string;
  level: string;
  types: string[];
  /** 問題ごとの目標タイム（秒）。動く点の問題など */
  targetSec?: number;
  /** F：場面カード（問題の場面が分かる短い文） */
  card?: string[];
  /** 博士が聞くこと */
  prompt: string[];
  graph?: TaskGraph;
  table?: { xLabel: string; yLabel: string; xs: number[]; ys: number[] };
  figure?: MovingFigure;
  answer: TaskAnswer;
  hints: TaskHint[];
  /** 動く点のヒントで埋める表（given は最初から見せる列） */
  hintTable?: { xs: number[]; rows: { label: string; values: string[]; given?: number[] }[] };
  /** 解き方を順に見せるとき */
  solution: string[];
  /** 正解した後に見られる「他のやり方」 */
  others?: { intro: string[]; lines: string[] };
}

export const TASK_CONTENT = { points, figures, life, challenge } as const;
export const taskProblems = (entry: TaskEntryId) => TASK_CONTENT[entry].problems as TaskProblem[];
export const isTaskEntry = (id: string): id is TaskEntryId => id in TASK_CONTENT;

/** データの "9/4" などを、グラフに描くための小数にする */
export const num = (s: string): number => {
  const f = toFrac(s);
  return f.n / f.d;
};

/** データのヒントを、練習・ダンジョンと同じヒントの段にする */
export function taskHintSteps(p: TaskProblem, wrongDefault: string): HintStep[] {
  return [
    ...p.hints.map(
      (h): HintStep => ({
        q: h.q,
        answer: toFrac(h.answer),
        alsoAccept: h.also?.map(toFrac),
        meaning: (v: Frac) => [fill(h.wrong ?? wrongDefault, { v: numText(v) })],
        clue: [h.clue],
        show: [h.show],
        found: h.found,
      }),
    ),
    { q: '', answer: null, meaning: () => [], clue: [], show: [] },
  ];
}

// ---- E：動く点 ----

/** P が通る道の長さ（cm）と、動き終わるまでの秒数 */
export function pathLength(f: MovingFigure) {
  let len = 0;
  for (let i = 1; i < f.path.length; i++) {
    const [x1, y1] = f.vertices[f.path[i - 1]];
    const [x2, y2] = f.vertices[f.path[i]];
    len += Math.hypot(x2 - x1, y2 - y1);
  }
  return len;
}
export const endTime = (f: MovingFigure) => pathLength(f) / f.speed;

/** x 秒後の P の位置 */
export function pointAt(f: MovingFigure, t: number): number[] {
  let rest = Math.max(0, Math.min(t, endTime(f))) * f.speed;
  for (let i = 1; i < f.path.length; i++) {
    const [x1, y1] = f.vertices[f.path[i - 1]];
    const [x2, y2] = f.vertices[f.path[i]];
    const seg = Math.hypot(x2 - x1, y2 - y1);
    if (rest <= seg) return [x1 + ((x2 - x1) * rest) / seg, y1 + ((y2 - y1) * rest) / seg];
    rest -= seg;
  }
  return f.vertices[f.path[f.path.length - 1]];
}

/** x 秒後の三角形の頂点 */
export const trianglePts = (f: MovingFigure, t: number) => f.triangle.map((v) => (v === 'P' ? pointAt(f, t) : f.vertices[v]));

/** x 秒後の三角形の面積（cm²） */
export function areaAt(f: MovingFigure, t: number): number {
  const [[x1, y1], [x2, y2], [x3, y3]] = trianglePts(f, t);
  return Math.abs((x2 - x1) * (y3 - y1) - (x3 - x1) * (y2 - y1)) / 2;
}
