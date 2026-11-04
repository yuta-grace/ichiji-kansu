// 解法ダンジョンの計算（画面に依存しない部分）：解き方ごとの途中の問い、解き方の説明、段階の切り替え、称号
import content from '../content/dungeon.json';
import settings from '../content/settings.json';
import { abs, add, div, frac, mul } from './fraction';
import type { Frac } from './fraction';
import { buildHints } from './hints';
import type { HintSpec, HintStep, HintTexts } from './hints';
import { eqText, lineThrough, numParen, numText } from './linear';
import type { Linear } from './linear';
import { fill } from './text';

export type MethodId = 'modoru' | 'dainyu' | 'renritsu';
export type Stage = 'A' | 'B';
export type TitleKey = 'usable' | 'familiar' | 'time';

export interface DungeonProblem {
  id: string;
  p1: number[];
  p2: number[];
  /** 最も楽そうな解き方のメモ（複数可）。称号の判定には使わない */
  best: string[];
}

const T = content.lines.steps;
const D = settings.dungeon;

export const methodName = (id: string) => content.methods.find((m) => m.id === id)?.name ?? id;

export function problemLine(p: DungeonProblem): Linear {
  return lineThrough({ x: p.p1[0], y: p.p1[1] }, { x: p.p2[0], y: p.p2[1] })!;
}

/** 「−9a」「a」のような a の項 */
const aTerm = (x: number) => (x === 1 ? 'a' : x === -1 ? '−a' : `${numText(frac(x))}a`);
/** y ＝ ax ＋ b に点を入れた式：「7 ＝ 12a ＋ b」 */
export const pointEquation = (x: number, y: number) => `${numText(frac(y))} ＝ ${aTerm(x)} ＋ b`;

/** 「(12, 7)　と　(−9, 21)」 */
export const pointsText = (p: DungeonProblem) =>
  `(${numText(frac(p.p1[0]))}, ${numText(frac(p.p1[1]))})　と　(${numText(frac(p.p2[0]))}, ${numText(frac(p.p2[1]))})`;

/** 台詞に使う、問題ごとの値 */
export function problemVars(p: DungeonProblem) {
  const [x1, y1] = p.p1;
  const [x2, y2] = p.p2;
  const l = problemLine(p);
  const n = (v: number | Frac) => numText(typeof v === 'number' ? frac(v) : v);
  return {
    x1: n(x1), y1: n(y1), x2: n(x2), y2: n(y2), x1p: numParen(frac(x1)), x2p: numParen(frac(x2)),
    a: n(l.a), b: n(l.b), eq: eqText(l),
    ax1: n(mul(l.a, frac(x1))),
    e1: pointEquation(x1, y1), e2: pointEquation(x2, y2),
  };
}

/** 傾きの問い：見えている変化（x が○から○に増えると）→ 1あたり。x の差が1なら1段 */
function slopeSteps(p: DungeonProblem, line: Linear): HintStep[] {
  const [lo, hi] = p.p1[0] < p.p2[0] ? [p.p1, p.p2] : [p.p2, p.p1];
  const dx = hi[0] - lo[0];
  const specs: HintSpec[] = dx === 1 ? [{ kind: 'slope', from: lo[0] }] : [{ kind: 'rise', from: lo[0], to: hi[0] }, { kind: 'perOne', dx }];
  return buildHints(specs, line, { type: 'dungeon', where: '2つの点', texts: T.hintTexts as unknown as Record<string, HintTexts> });
}

const finalStep = (): HintStep => ({ q: content.lines.final, answer: null, meaning: () => [], clue: [], show: [] });

/**
 * 段階A（途中も答える）と段階Bのヒントで聞く問い。
 * picks：これまでの段で受け付けた値（どちらの点を使ったかで、次の問いの答えが変わる）
 */
export function methodSteps(method: MethodId, p: DungeonProblem, picks: Frac[]): HintStep[] {
  const line = problemLine(p);
  const [x1, y1] = p.p1;
  const [x2, y2] = p.p2;
  const v0 = problemVars(p);
  const say = (t: string | undefined, extra: Record<string, string | number> = {}) => (t ? [fill(t, { ...v0, ...extra })] : []);

  if (method === 'renritsu') {
    const k = frac(x1 - x2);
    const kPick = picks[0];
    // 引く順は生徒が決めてよい。a の前の数の符号で、どちらから引いたかがわかる
    const reversed = kPick !== undefined && kPick.n === -k.n;
    const [xa, xb, ya, yb] = reversed ? [x2, x1, y2, y1] : [x1, x2, y1, y2];
    const kk = frac(xa - xb);
    const r = frac(ya - yb);
    const K = T.renritsuK;
    const R = T.renritsuR;
    return [
      {
        q: say(K.q)[0],
        answer: k,
        alsoAccept: [frac(x2 - x1)],
        meaning: (v) => say(K.wrong, { v: numText(v) }),
        clue: say(K.clue),
        show: say(K.show, { k: numText(k) }),
        found: (v) => say(K.found, { v: numText(v) })[0],
      },
      {
        q: say(R.q)[0],
        answer: r,
        meaning: (v) => say(R.wrong, { v: numText(v), va: numText(div(v, kk)) }),
        clue: say(R.clue, { xa: numText(frac(xa)), xbp: numParen(frac(xb)), ya: numText(frac(ya)), ybp: numParen(frac(yb)) }),
        show: say(R.show, { r: numText(r) }),
        found: say(R.found, { k: numText(kk), r: numText(r) })[0],
      },
      finalStep(),
    ];
  }

  const slope = slopeSteps(p, line);
  const i = slope.length;

  if (method === 'dainyu') {
    const px = picks[i] ? picks[i].n / picks[i].d : x1;
    const py = px === x1 ? y1 : y2;
    const X = T.pointX;
    const Y = T.pointY;
    return [
      ...slope,
      {
        q: say(X.q)[0],
        answer: frac(x1),
        alsoAccept: [frac(x2)],
        meaning: (v) => say(X.wrong, { v: numText(v) }),
        clue: say(X.clue),
        show: say(X.show),
        found: (v) => say(X.found, { v: numText(v) })[0],
      },
      {
        q: say(Y.q)[0],
        answer: frac(py),
        meaning: (v) => say(Y.wrong, { v: numText(v), px: numText(frac(px)) }),
        clue: say(Y.clue, { px: numText(frac(px)), py: numText(frac(py)) }),
        show: say(Y.show, { py: numText(frac(py)) }),
        found: say(Y.found, { px: numText(frac(px)), py: numText(frac(py)) })[0],
      },
      finalStep(),
    ];
  }

  // 戻って解く：x ＝ 0 まで戻す（どちらの点から戻ってもよい。符号つきで答える）
  const bx = picks[i] ?? frac(-x1);
  const by = mul(line.a, bx);
  const BX = T.backX;
  const BY = T.backY;
  return [
    ...slope,
    {
      q: say(BX.q)[0],
      answer: frac(-x1),
      alsoAccept: [frac(-x2)],
      meaning: (v) => say(BX.wrong, { v: numText(v), xv: numText(add(frac(x1), v)) }),
      clue: say(BX.clue),
      show: say(BX.show, { bx: numText(frac(-x1)) }),
      found: (v) => say(BX.found, { v: numText(v) })[0],
    },
    {
      q: say(BY.q)[0],
      answer: by,
      meaning: (v) => say(BY.wrong, { v: numText(v), per: numText(div(v, bx)) }),
      clue: say(BY.clue, { bxp: numParen(bx) }),
      show: say(BY.show, { by: numText(by) }),
      found: say(BY.found, { by: numText(by) })[0],
    },
    finalStep(),
  ];
}

/** 解き方を順に見せるときの説明 */
export function solutionLines(method: MethodId, p: DungeonProblem): string[] {
  const line = problemLine(p);
  const v = problemVars(p);
  const S = content.lines.solution;
  const [lo, hi] = p.p1[0] < p.p2[0] ? [p.p1, p.p2] : [p.p2, p.p1];
  const rise = frac(hi[1] - lo[1]);
  const slope = fill(S.slope, {
    x1: numText(frac(lo[0])), x2: numText(frac(hi[0])), dx: hi[0] - lo[0],
    riseChange: rise.n < 0 ? `${numText(abs(rise))}減る` : `${numText(rise)}増える`,
    rise: numText(rise), a: v.a,
  });
  const bx = frac(-p.p1[0]);
  const vars = {
    ...v, slope,
    bx: numText(bx), bxp: numParen(bx), by: numText(mul(line.a, bx)),
    k: numText(frac(p.p1[0] - p.p2[0])), r: numText(frac(p.p1[1] - p.p2[1])),
  };
  return S[method].map((t) => fill(t, vars));
}

// ---- 段階の切り替えと称号 ----

export interface MethodProgress {
  stage: Stage;
  /** 段階Aで続けて正解した数 */
  streakA: number;
  /** 段階Bで間違えた後、段階Aに戻す残りの問題数 */
  returnToA: number;
  /** 段階Aの正解数と、その中の傾きが正・負の問題の数 */
  aCorrect: { n: number; pos: number; neg: number };
  /** 段階Bの正解数 */
  bCorrect: number;
  /** 段階Bの最初の正解の時間（ミリ秒） */
  firstB?: number;
  titles: Partial<Record<TitleKey, boolean>>;
}

export const newProgress = (): MethodProgress => ({
  stage: 'A', streakA: 0, returnToA: 0, aCorrect: { n: 0, pos: 0, neg: 0 }, bCorrect: 0, titles: {},
});

export const effectiveStage = (p: MethodProgress): Stage => (p.returnToA > 0 ? 'A' : p.stage);

export interface SolveResult {
  stage: Stage;
  /** 段階A：途中の値は何度でも直してよく、最後の a と b を一度で正解。段階B：一度も間違えずに正解。どちらも解き方を見せていない */
  correct: boolean;
  slopeSign: number;
  ms: number;
}

/** 結果を反映し、新しく手に入れた称号を返す */
export function applyResult(prev: MethodProgress, r: SolveResult): { next: MethodProgress; gained: TitleKey[] } {
  const p: MethodProgress = { ...prev, aCorrect: { ...prev.aCorrect }, titles: { ...prev.titles } };
  if (r.stage === 'A') {
    if (p.returnToA > 0) {
      // 段階Bで間違えた後の「次の1問だけ段階A」
      p.returnToA -= 1;
    } else {
      p.streakA = r.correct ? p.streakA + 1 : 0;
      if (p.streakA >= D.stageAStreakToStageB) {
        p.stage = 'B';
        p.streakA = 0;
      }
    }
    if (r.correct) {
      p.aCorrect.n += 1;
      if (r.slopeSign > 0) p.aCorrect.pos += 1;
      if (r.slopeSign < 0) p.aCorrect.neg += 1;
    }
  } else if (!r.correct) {
    p.returnToA = D.stageBWrongReturnsToAFor;
  } else {
    p.bCorrect += 1;
    if (p.firstB === undefined) p.firstB = r.ms;
    else if (r.ms < p.firstB) p.titles.time = true;
  }
  return withTitles(prev, p);
}

function withTitles(prev: MethodProgress, p: MethodProgress) {
  const c = p.aCorrect;
  if (c.n >= D.titleUsableCount && c.pos > 0 && c.neg > 0) p.titles.usable = true;
  if (p.bCorrect >= D.titleFamiliarCount) p.titles.familiar = true;
  const gained = (['usable', 'familiar', 'time'] as TitleKey[]).filter((k) => p.titles[k] && !prev.titles[k]);
  return { next: p, gained };
}

export const isMaster = (p: MethodProgress) => !!(p.titles.usable && p.titles.familiar && p.titles.time);
