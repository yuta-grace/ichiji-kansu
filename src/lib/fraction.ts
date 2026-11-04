// 分数演算。傾きが分数になる問題があるため、内部では小数を使わずに分数で計算・判定する。

export interface Frac {
  n: number; // 分子（符号はここに持つ）
  d: number; // 分母（常に正）
}

function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a || 1;
}

export function frac(n: number, d = 1): Frac {
  if (d === 0) throw new Error('分母が0');
  if (d < 0) {
    n = -n;
    d = -d;
  }
  const g = gcd(n, d);
  return { n: n / g, d: d / g };
}

export const add = (a: Frac, b: Frac) => frac(a.n * b.d + b.n * a.d, a.d * b.d);
export const sub = (a: Frac, b: Frac) => frac(a.n * b.d - b.n * a.d, a.d * b.d);
export const mul = (a: Frac, b: Frac) => frac(a.n * b.n, a.d * b.d);
export const div = (a: Frac, b: Frac) => frac(a.n * b.d, a.d * b.n);
export const eq = (a: Frac, b: Frac) => a.n === b.n && a.d === b.d;
export const abs = (a: Frac) => frac(Math.abs(a.n), a.d);
export const isInt = (a: Frac) => a.d === 1;

export function toString(a: Frac): string {
  return a.d === 1 ? `${a.n}` : `${a.n}/${a.d}`;
}

/** 画面表示用。負号は全角に近い「−」を使う */
export function display(a: Frac): string {
  return toString(a).replace('-', '−');
}

export interface ParsedNumber {
  value: Frac;
  /** 約分していない分数として入力された（例：4/6）。6章「答えの判定」 */
  unreduced: boolean;
}

/**
 * 生徒が入力した文字列を数に変換する。
 * 受け付けるもの：整数、分数（a/b）、小数。帯分数は使わない（6章）。
 * 読めないときは null。
 */
export function parseAnswer(raw: string): ParsedNumber | null {
  const s = raw.replace(/[−ー–]/g, '-').replace(/\s/g, '');
  let m = s.match(/^(-?)(\d+)\/(\d+)$/);
  if (m) {
    const n = Number(m[2]) * (m[1] ? -1 : 1);
    const d = Number(m[3]);
    if (d === 0) return null;
    const value = frac(n, d);
    return { value, unreduced: value.d !== d && n !== 0 };
  }
  m = s.match(/^(-?)(\d+)(?:\.(\d+))?$/);
  if (m) {
    const decimals = m[3] ?? '';
    const d = 10 ** decimals.length;
    const n = Number(m[2] + decimals) * (m[1] ? -1 : 1);
    return { value: frac(n, d), unreduced: false };
  }
  return null;
}
