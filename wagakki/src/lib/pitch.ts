// 音の高さ（MIDI番号）と寸法の計算

export const SUN_MIN = 13;
export const SUN_MAX = 24;
export const SUN_LIST: number[] = Array.from({ length: SUN_MAX - SUN_MIN + 1 }, (_, i) => SUN_MIN + i);

const CDE = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const DOREMI = ['ド', 'ド♯', 'レ', 'レ♯', 'ミ', 'ファ', 'ファ♯', 'ソ', 'ソ♯', 'ラ', 'ラ♯', 'シ'];

export const pc = (midi: number) => ((midi % 12) + 12) % 12;

/** 尺八の筒音（ロ）。1尺8寸＝D4(62)、1寸長いと半音下 */
export function tsutsuneMidi(sun: number): number {
  return 62 - (sun - 18);
}

/** 「1尺8寸」 */
export function sunLabel(sun: number): string {
  const shaku = Math.floor(sun / 10);
  const s = sun % 10;
  return s === 0 ? `${shaku}尺` : `${shaku}尺${s}寸`;
}

/** 「1尺8寸（D）」 */
export function sunLabelWithNote(sun: number): string {
  return `${sunLabel(sun)}（${CDE[pc(tsutsuneMidi(sun))]}）`;
}

/** 三味線の本数（1本＝A … 12本＝G♯） */
export function honFromSun(sun: number): number {
  return ((pc(tsutsuneMidi(sun)) - 9 + 12) % 12) + 1;
}

export function honLabel(sun: number): string {
  return `${honFromSun(sun)}本（${CDE[pc(tsutsuneMidi(sun))]}）`;
}

/** 三味線の一の糸の開放弦。1本＝A2(45) 〜 12本＝G♯3(56) */
export function shamisenBaseMidi(sun: number): number {
  return 45 + honFromSun(sun) - 1;
}

export function freq(midi: number, a4 = 440): number {
  return a4 * Math.pow(2, (midi - 69) / 12);
}

export type NameStyle = 'doremi' | 'cde';

/** 固定ドの名前（オクターブ番号つきは withOctave） */
export function noteName(midi: number, style: NameStyle = 'doremi', withOctave = false): string {
  const base = (style === 'doremi' ? DOREMI : CDE)[pc(midi)];
  if (!withOctave) return base;
  return `${base}${Math.floor(midi / 12) - 1}`;
}

/** 移動ド：basePc を「ド」とした名前 */
export function movableName(midi: number, basePc: number): string {
  return DOREMI[pc(midi - basePc)];
}

export const isBlackKey = (midi: number) => [1, 3, 6, 8, 10].includes(pc(midi));
