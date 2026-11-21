// 尺八（琴古流）：音の名前とフォントの文字
// 名前は JapoScore の音符名一覧表の標準（太字）に合わせている。ここを直せば名前が変わる。
import { tsutsuneMidi } from './pitch';

export type Register = '乙' | '甲' | '大甲';

export interface KinkoNote {
  rel: number; // 筒音からの半音数
  name: string;
  register: Register;
}

const RAW: [string, Register][] = [
  ['ロ大メリ', '乙'], // -2
  ['ロメリ', '乙'],
  ['ロ', '乙'], // 0
  ['ツメリ', '乙'],
  ['ツ中メリ', '乙'],
  ['ツ', '乙'],
  ['レメリ', '乙'],
  ['レ', '乙'],
  ['ウ', '乙'],
  ['チ', '乙'],
  ['リメリ', '乙'],
  ['リ中メリ', '乙'],
  ['リ', '乙'], // 10
  ['イメリ', '甲'],
  ['ロ', '甲'], // 12
  ['ツメリ', '甲'],
  ['ツ中メリ', '甲'],
  ['ツ', '甲'],
  ['レメリ', '甲'],
  ['レ', '甲'],
  ['ウ', '甲'],
  ['チ', '甲'],
  ['ヒメリ', '甲'],
  ['ヒ中メリ', '甲'],
  ['ヒ', '甲'], // 22
  ['イメリ', '大甲'],
  ['ハ', '大甲'], // 24
  ['ハサン', '大甲'],
  ['シ', '大甲'],
  ['ツ', '大甲'],
  ['レメリ', '大甲'],
  ['レ', '大甲'],
  ['ウ', '大甲'],
  ['チ', '大甲'],
  ['ヒメリ', '大甲'], // 32
];

export const REL_MIN = -2;
export const KINKO_NOTES: KinkoNote[] = RAW.map(([name, register], i) => ({ rel: i + REL_MIN, name, register }));
export const REL_MAX = REL_MIN + KINKO_NOTES.length - 1;

export function kinkoFor(midi: number, sun: number): KinkoNote | null {
  const rel = midi - tsutsuneMidi(sun);
  if (rel < REL_MIN || rel > REL_MAX) return null;
  return KINKO_NOTES[rel - REL_MIN];
}

export function shakuhachiRange(sun: number): [number, number] {
  const t = tsutsuneMidi(sun);
  return [t + REL_MIN, t + REL_MAX];
}

// ---- フォントの文字の割り当て（立花 宏さんの MuseScore 尺八プラグインに合わせる） ----

export type KinkoFontKind = 'tachibana' | 'senshu';

/** ShakuhachiKinko / Kinko_Font 1：ロ大メリ＝A から半音ごとに A–Z, a–m */
const TACHIBANA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklm';

/** SenshuTK（プラグインの fingeringsSenshuK） */
const SENSHU = [
  ...'ABCDEFGHIJKLMN', // 乙 ロ大メリ〜イメリ
  ...'CDEFGHIJKLMNOPQ', // 甲 ロ〜シ
  ...'FGHIJKLMNO', // 大甲 ツ〜
];

export function kinkoGlyph(rel: number, kind: KinkoFontKind): string | null {
  const i = rel - REL_MIN;
  const table = kind === 'tachibana' ? TACHIBANA : SENSHU;
  const ch = table[i];
  return ch ?? null;
}
