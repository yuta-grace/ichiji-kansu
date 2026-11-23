// PC のキーボードで鳴らす・入力するときのキー割り当て（楽器ごと。設定で変えられる）
// キーは物理的な位置（KeyboardEvent.code）で持つので、日本語・英語キーボードの違いに左右されない。
import type { Instrument } from './instruments';
import { POSITION_LABELS, STRING_LABELS } from './shamisen';

export interface KeyAction {
  id: string;
  label: string;
  group: string;
}

export type Keymap = Record<string, string>; // 動作 → キー（code）

// ---------------- ピアノ：白鍵・黒鍵をそのまま ----------------

const PIANO_NAMES = ['ド', 'ド♯', 'レ', 'レ♯', 'ミ', 'ファ', 'ファ♯', 'ソ', 'ソ♯', 'ラ', 'ラ♯', 'シ', 'ド', 'ド♯', 'レ', 'レ♯', 'ミ'];
const PIANO_ACTIONS: KeyAction[] = [
  ...PIANO_NAMES.map((n, i) => ({ id: `n${i}`, label: i >= 12 ? `${n}（上）` : n, group: '鍵盤（C から半音ずつ）' })),
  { id: 'octDown', label: 'オクターブを下げる', group: 'オクターブ' },
  { id: 'octUp', label: 'オクターブを上げる', group: 'オクターブ' },
];
const PIANO_DEFAULT: Keymap = {
  n0: 'KeyA',
  n1: 'KeyW',
  n2: 'KeyS',
  n3: 'KeyE',
  n4: 'KeyD',
  n5: 'KeyF',
  n6: 'KeyT',
  n7: 'KeyG',
  n8: 'KeyY',
  n9: 'KeyH',
  n10: 'KeyU',
  n11: 'KeyJ',
  n12: 'KeyK',
  n13: 'KeyO',
  n14: 'KeyL',
  n15: 'KeyP',
  n16: 'Semicolon',
  octDown: 'KeyZ',
  octUp: 'KeyX',
};

// ---------------- 三味線：右手（バチ）と左手（勘所） ----------------

const SHAMISEN_ACTIONS: KeyAction[] = [
  ...[0, 1, 2].map((s) => ({ id: `str${s}`, label: `${STRING_LABELS[s]}の糸を弾く`, group: '右手（バチ）' })),
  ...POSITION_LABELS.slice(1).map((l, i) => ({ id: `pos${i + 1}`, label: `勘所 ${l}`, group: '左手（勘所。押さえたまま右手で弾く）' })),
];
const SHAMISEN_DEFAULT: Keymap = {
  str0: 'KeyJ',
  str1: 'KeyK',
  str2: 'KeyL',
  // 数字の段：1 2 3 # 4 5 6 7 8 9 ♭ 10
  pos1: 'Digit1',
  pos2: 'Digit2',
  pos3: 'Digit3',
  pos4: 'Digit4',
  pos5: 'Digit5',
  pos6: 'Digit6',
  pos7: 'Digit7',
  pos8: 'Digit8',
  pos9: 'Digit9',
  pos10: 'Digit0',
  pos11: 'Minus',
  pos12: 'Equal',
  // Q の段：11 12 13 1# 14 15 16 17 18 19 1♭ 20
  pos13: 'KeyQ',
  pos14: 'KeyW',
  pos15: 'KeyE',
  pos16: 'KeyR',
  pos17: 'KeyT',
  pos18: 'KeyY',
  pos19: 'KeyU',
  pos20: 'KeyI',
  pos21: 'KeyO',
  pos22: 'KeyP',
  pos23: 'BracketLeft',
  pos24: 'BracketRight',
};

// ---------------- 尺八：ロツレチリ＋メリ・カリ＋甲乙 ----------------

/** 指（ロツレチリ）の筒音からの半音数 */
export const SHAKU_FINGERS: { id: string; label: string; rel: number }[] = [
  { id: 'ro', label: 'ロ', rel: 0 },
  { id: 'tsu', label: 'ツ', rel: 3 },
  { id: 're', label: 'レ', rel: 5 },
  { id: 'chi', label: 'チ', rel: 7 },
  { id: 'ri', label: 'リ', rel: 10 },
];
/** 押しながら使う変化 */
export const SHAKU_MODS: { id: string; label: string; shift: number }[] = [
  { id: 'meri', label: 'メリ（半音下）', shift: -1 },
  { id: 'daimeri', label: '大メリ（全音下）', shift: -2 },
  { id: 'kari', label: 'カリ（半音上）', shift: 1 },
  { id: 'kan', label: '甲（1オクターブ上）', shift: 12 },
  { id: 'daikan', label: '大甲（2オクターブ上）', shift: 24 },
];
const SHAKU_ACTIONS: KeyAction[] = [
  ...SHAKU_FINGERS.map((f) => ({ id: f.id, label: f.label, group: '指（押している間鳴る）' })),
  ...SHAKU_MODS.map((m) => ({ id: m.id, label: m.label, group: '押しながら（変化）' })),
];
// 右手のホームポジションで指（ロツレチリ）、左手のホームポジションで変化を押さえる（密集しないように左右に分ける）
const SHAKU_DEFAULT: Keymap = {
  ro: 'KeyJ',
  tsu: 'KeyK',
  re: 'KeyL',
  chi: 'Semicolon',
  ri: 'Quote',
  daikan: 'KeyA',
  daimeri: 'KeyS',
  meri: 'KeyD',
  kari: 'KeyF',
  kan: 'Space',
};

export const KEY_ACTIONS: Record<Instrument, KeyAction[]> = { piano: PIANO_ACTIONS, shamisen: SHAMISEN_ACTIONS, shakuhachi: SHAKU_ACTIONS };
export const DEFAULT_KEYMAPS: Record<Instrument, Keymap> = { piano: PIANO_DEFAULT, shamisen: SHAMISEN_DEFAULT, shakuhachi: SHAKU_DEFAULT };

/** 設定で変えた分を、標準の割り当てに重ねる */
export function keymapFor(inst: Instrument, custom?: Partial<Record<Instrument, Keymap>>): Keymap {
  return { ...DEFAULT_KEYMAPS[inst], ...(custom?.[inst] ?? {}) };
}

/** キー → 動作（同じキーに複数あれば最初のもの） */
export function actionOf(map: Keymap, code: string): string | null {
  for (const [a, c] of Object.entries(map)) if (c === code) return a;
  return null;
}

/** キーの見た目の名前 */
export function keyLabel(code: string | undefined): string {
  if (!code) return '—';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const names: Record<string, string> = {
    Space: 'スペース',
    ShiftLeft: '左Shift',
    ShiftRight: '右Shift',
    Minus: '-',
    Equal: '^ / =',
    BracketLeft: '@ / [',
    BracketRight: '[ / ]',
    Semicolon: ';',
    Quote: ": / '",
    Comma: ',',
    Period: '.',
    Slash: '/',
    Backslash: '＼',
    IntlRo: '＼（ろ）',
    IntlYen: '¥',
    Enter: 'Enter',
    Tab: 'Tab',
    CapsLock: 'CapsLock',
  };
  return names[code] ?? code;
}

/** その楽器で使うキーか（書くの画面で、楽譜の操作のキーと重なるときは楽器を優先する） */
export function usesKey(inst: Instrument, custom: Partial<Record<Instrument, Keymap>> | undefined, code: string): boolean {
  return actionOf(keymapFor(inst, custom), code) !== null;
}
