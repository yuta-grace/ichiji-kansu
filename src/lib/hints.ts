// 段階的なヒント（練習・ダンジョンで共通）
// ・見えている変化から聞いて、1あたりに直す
// ・ヒントの問いで間違えたら3段階（何を表すか → 手がかり → 答えを見せて次の段へ）
// ・最後の段まで答えたら元の問題に戻る（わかった値は見える状態のまま）
import { abs, add, div, frac, mul, sub } from './fraction';
import type { Frac } from './fraction';
import { numText } from './linear';
import type { Linear } from './linear';
import { fill } from './text';

/** ヒントの手がかりとして画面に出すもの */
export interface HintVisual {
  highlightX?: number;
  /** 表の何列目を光らせるか（x の値で指定） */
  tableXs?: number[];
  /** グラフに引く「右に dx」の線（上下はまだ見せない） */
  run?: { x: number; y: number; dx: number };
}

export interface HintStep {
  q: string;
  /** null は最後の段（元の問題に戻る） */
  answer: Frac | null;
  /** ほかにも正解として受け付ける値（どちらの点から考えてもよい、など） */
  alsoAccept?: Frac[];
  meaning: (v: Frac) => string[];
  clue: string[];
  visual?: HintVisual;
  show: string[];
  /** 答えた後も見えるように残す一行（受け付けた値によって変わるときは関数） */
  found?: string | ((v: Frac) => string);
}

/** データに書くヒントの段 */
export interface HintSpec {
  kind: 'intercept' | 'slope' | 'rise' | 'perOne' | 'interceptBack' | 'final';
  from?: number;
  to?: number;
  dx?: number;
  q?: string;
}

export interface HintTexts {
  q: string;
  wrong?: string;
  wrongOnLine?: string;
  clue?: string;
  show?: string;
  found?: string;
}

/** 「2増える」「2減る」 */
export function change(f: Frac): string {
  return f.n < 0 ? `${numText(abs(f))}減る` : `${numText(f)}増える`;
}

/**
 * データのヒントの段を、問題の直線から作る。
 * texts は種類ごとの台詞（"intercept@eq-graph" のように問題の種類ごとの上書きを先に探す）
 */
export function buildHints(
  specs: HintSpec[],
  line: Linear,
  opts: { type: string; where: string; texts: Record<string, HintTexts> },
): HintStep[] {
  const { a, b } = line;
  const y = (x: number) => add(mul(a, frac(x)), b);
  const T = (kind: string): HintTexts => opts.texts[`${kind}@${opts.type}`] ?? opts.texts[kind];
  const base = { a: numText(a), b: numText(b), aChange: change(a), where: opts.where };

  return specs.map((s): HintStep => {
    const t = T(s.kind);
    const say = (tpl: string | undefined, extra: Record<string, string | number> = {}) =>
      tpl ? [fill(tpl, { ...base, ...extra })] : [];

    switch (s.kind) {
      case 'intercept': {
        return {
          q: fill(s.q ?? t.q, base),
          answer: b,
          meaning: (v) => {
            // 生徒の答えの y は、直線上では x がいくつのところか
            const xv = a.n === 0 ? null : div(sub(v, b), a);
            if (t.wrongOnLine && xv && xv.d === 1) return say(t.wrongOnLine, { v: numText(v), xv: numText(xv) });
            return say(t.wrong, { v: numText(v) });
          },
          clue: say(t.clue),
          visual: { highlightX: 0, tableXs: [0] },
          show: say(t.show),
          found: say(t.found)[0],
        };
      }
      case 'slope':
      case 'rise': {
        const x0 = s.from ?? 0;
        const x1 = s.kind === 'slope' ? x0 + 1 : (s.to ?? x0 + 1);
        const dx = x1 - x0;
        const rise = sub(y(x1), y(x0));
        const vars = { x0, x1, dx, riseChange: change(rise), y0: numText(y(x0)) };
        return {
          q: fill(s.q ?? t.q, { ...base, ...vars }),
          answer: rise,
          meaning: (v) => say(t.wrong, { ...vars, v: numText(v), vChange: change(v), yv: numText(add(y(x0), v)) }),
          clue: say(t.clue, vars),
          visual: { tableXs: [x0, x1], run: { x: x0, y: y(x0).n / y(x0).d, dx } },
          show: say(t.show, vars),
          found: say(t.found, vars)[0],
        };
      }
      case 'perOne': {
        const dx = s.dx ?? 1;
        const rise = mul(a, frac(dx));
        const vars = { dx, riseChange: change(rise), absRise: numText(abs(rise)) };
        return {
          q: fill(s.q ?? t.q, { ...base, ...vars }),
          answer: a,
          meaning: (v) => say(t.wrong, { ...vars, v: numText(v), vChange: change(v), vdxChange: change(mul(v, frac(dx))) }),
          clue: say(t.clue, vars),
          show: say(t.show, vars),
          found: say(t.found, vars)[0],
        };
      }
      case 'interceptBack': {
        const x0 = s.from ?? 1;
        const vars = { x0, y0: numText(y(x0)) };
        return {
          q: fill(s.q ?? t.q, { ...base, ...vars }),
          answer: b,
          meaning: (v) => say(t.wrong, { ...vars, v: numText(v), yv: numText(add(v, mul(a, frac(x0)))) }),
          clue: say(t.clue, vars),
          visual: { tableXs: [x0] },
          show: say(t.show, vars),
          found: say(t.found, vars)[0],
        };
      }
      case 'final':
        return { q: fill(s.q ?? t.q, base), answer: null, meaning: () => [], clue: [], show: [] };
    }
  });
}
