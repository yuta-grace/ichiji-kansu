// 三味線：調弦と津軽の勘所表記
import { shamisenBaseMidi } from './pitch';

export type Tuning = 'honchoshi' | 'niagari' | 'sansagari';

export const TUNINGS: { id: Tuning; label: string; intervals: [number, number, number] }[] = [
  { id: 'honchoshi', label: '本調子', intervals: [0, 5, 12] },
  { id: 'niagari', label: '二上り', intervals: [0, 7, 12] },
  { id: 'sansagari', label: '三下り', intervals: [0, 5, 10] },
];

/** 勘所の表記。添字＝開放弦からの半音数（0〜24） */
export const POSITION_LABELS = [
  '0', '1', '2', '3', '#', '4', '5', '6', '7', '8', '9', '♭',
  '10', '11', '12', '13', '1#', '14', '15', '16', '17', '18', '19', '1♭', '20',
];
export const MAX_POS = POSITION_LABELS.length - 1;

export const STRING_LABELS = ['一', '二', '三'];

export function tuningOf(id: Tuning) {
  return TUNINGS.find((t) => t.id === id) ?? TUNINGS[0];
}

/** 3本の糸の開放弦（MIDI） */
export function openStrings(sun: number, tuning: Tuning): number[] {
  const base = shamisenBaseMidi(sun);
  return tuningOf(tuning).intervals.map((i) => base + i);
}

export function positionMidi(sun: number, tuning: Tuning, string: number, pos: number): number {
  return openStrings(sun, tuning)[string] + pos;
}

export interface Fingering {
  string: number; // 0=一の糸
  pos: number;
}

/**
 * 音の高さから糸と勘所を選ぶ。hint の糸で弾けるならそれを使い、
 * なければ勘所の数字がいちばん小さくなる糸を選ぶ。弾けなければ null。
 */
export function fingeringFor(midi: number, sun: number, tuning: Tuning, hint?: number): Fingering | null {
  const opens = openStrings(sun, tuning);
  if (hint !== undefined && hint >= 0 && hint < 3) {
    const p = midi - opens[hint];
    if (p >= 0 && p <= MAX_POS) return { string: hint, pos: p };
  }
  let best: Fingering | null = null;
  opens.forEach((o, s) => {
    const p = midi - o;
    if (p < 0 || p > MAX_POS) return;
    // 同じ勘所なら高い糸（三の糸寄り）を選ぶ
    if (!best || p < best.pos || (p === best.pos && s > best.string)) best = { string: s, pos: p };
  });
  return best;
}

export function rangeOf(sun: number, tuning: Tuning): [number, number] {
  const opens = openStrings(sun, tuning);
  return [opens[0], Math.max(...opens) + MAX_POS];
}
