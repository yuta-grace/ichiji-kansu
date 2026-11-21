// 楽譜のデータと計算
import { shamisenBaseMidi, tsutsuneMidi } from './pitch';
import type { Tuning } from './shamisen';

export type Instrument = 'shamisen' | 'shakuhachi';
export type Div = 1 | 2 | 3 | 4;

export type Slot =
  | null // 空（休みとして扱う）
  | { k: 'n'; midi: number; str?: number } // 音（str は三味線の糸の指定）
  | { k: 'r' } // 休み ○
  | { k: 'x' }; // 伸ばし ー

export interface Beat {
  div: Div;
  slots: Slot[];
}

export interface Part {
  id: string;
  name: string;
  instrument: Instrument;
  sun: number;
  tuning: Tuning;
  volume: number; // 0〜1
  muted: boolean;
  beats: Beat[];
}

export interface Song {
  version: 1;
  id: string;
  title: string;
  tempo: number; // 1分あたりの拍数
  beatsPerMeasure: number;
  measures: number;
  parts: Part[];
  updatedAt: number;
}

export const MAX_PARTS = 8;

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export const emptyBeat = (): Beat => ({ div: 1, slots: [null] });

export function newPart(instrument: Instrument, sun: number, tuning: Tuning, beats: number, name?: string): Part {
  return {
    id: uid(),
    name: name ?? (instrument === 'shamisen' ? '三味線' : '尺八'),
    instrument,
    sun,
    tuning,
    volume: 0.8,
    muted: false,
    beats: Array.from({ length: beats }, emptyBeat),
  };
}

export function newSong(instrument: Instrument = 'shamisen', sun = 18, tuning: Tuning = 'honchoshi'): Song {
  const beatsPerMeasure = 4;
  const measures = 4;
  return {
    version: 1,
    id: uid(),
    title: '無題の曲',
    tempo: 80,
    beatsPerMeasure,
    measures,
    parts: [newPart(instrument, sun, tuning, beatsPerMeasure * measures)],
    updatedAt: Date.now(),
  };
}

export const totalBeats = (s: Song) => s.beatsPerMeasure * s.measures;

/** 拍数の変化に合わせて各パートの拍の数をそろえる */
export function normalize(s: Song): Song {
  const n = totalBeats(s);
  return {
    ...s,
    parts: s.parts.map((p) => {
      if (p.beats.length === n) return p;
      const beats = p.beats.slice(0, n);
      while (beats.length < n) beats.push(emptyBeat());
      return { ...p, beats };
    }),
  };
}

/** 拍の分割を変える。前から順に残し、足りなければ空で埋める */
export function setDiv(beat: Beat, div: Div): Beat {
  const slots = beat.slots.slice(0, div);
  while (slots.length < div) slots.push(null);
  return { div, slots };
}

export interface NoteEvent {
  start: number; // 拍
  dur: number; // 拍
  midi: number;
  beat: number;
  slot: number;
}

/** パートの音を、開始と長さ（拍単位）の並びにする。伸ばしは前の音を延ばす */
export function partEvents(p: Part): NoteEvent[] {
  const out: NoteEvent[] = [];
  let cur: NoteEvent | null = null;
  p.beats.forEach((b, bi) => {
    const len = 1 / b.div;
    b.slots.forEach((s, si) => {
      const t = bi + si * len;
      if (s && s.k === 'n') {
        cur = { start: t, dur: len, midi: s.midi, beat: bi, slot: si };
        out.push(cur);
      } else if (s && s.k === 'x') {
        if (cur) cur.dur = t + len - cur.start;
      } else {
        cur = null;
      }
    });
  });
  return out;
}

function mapNotes(p: Part, f: (midi: number) => number): Part {
  return {
    ...p,
    beats: p.beats.map((b) => ({
      ...b,
      slots: b.slots.map((s) => (s && s.k === 'n' ? { ...s, midi: f(s.midi) } : s)),
    })),
  };
}

export function transposePart(p: Part, delta: number): Part {
  return delta === 0 ? p : mapNotes(p, (m) => m + delta);
}

/** 楽器の基準の音（尺八は筒音、三味線は一の糸） */
export function baseMidi(instrument: Instrument, sun: number): number {
  return instrument === 'shamisen' ? shamisenBaseMidi(sun) : tsutsuneMidi(sun);
}

/**
 * 寸法を変える。keepFingering なら指使い（勘所・ロツレチ）はそのままで音が並行移動する。
 * そうでなければ音の高さを保つ。
 */
export function changeSun(p: Part, sun: number, keepFingering: boolean): Part {
  const delta = baseMidi(p.instrument, sun) - baseMidi(p.instrument, p.sun);
  const moved = keepFingering ? transposePart(p, delta) : p;
  return { ...moved, sun };
}

/** 曲全体の寸法を半音 steps だけ変える（短い管＝高い方向が正）。指使いは保つ */
export function shiftAllSun(s: Song, steps: number, sunMin: number, sunMax: number): Song {
  return {
    ...s,
    parts: s.parts.map((p) => {
      const next = Math.min(sunMax, Math.max(sunMin, p.sun - steps));
      return changeSun(p, next, true);
    }),
  };
}

// ---- 読み込みの検査 ----

export function parseSong(json: unknown): Song {
  const o = json as Song;
  if (!o || typeof o !== 'object' || o.version !== 1 || !Array.isArray(o.parts)) {
    throw new Error('和楽器アプリの楽譜ファイルではありません');
  }
  const s: Song = {
    version: 1,
    id: typeof o.id === 'string' ? o.id : uid(),
    title: String(o.title ?? '無題の曲'),
    tempo: clampNum(o.tempo, 30, 240, 80),
    beatsPerMeasure: clampNum(o.beatsPerMeasure, 1, 8, 4),
    measures: clampNum(o.measures, 1, 200, 4),
    parts: o.parts.slice(0, MAX_PARTS).map((p) => ({
      id: typeof p.id === 'string' ? p.id : uid(),
      name: String(p.name ?? ''),
      instrument: p.instrument === 'shakuhachi' ? 'shakuhachi' : 'shamisen',
      sun: clampNum(p.sun, 13, 24, 18),
      tuning: (['honchoshi', 'niagari', 'sansagari'] as const).includes(p.tuning) ? p.tuning : 'honchoshi',
      volume: clampNum(p.volume, 0, 1, 0.8),
      muted: !!p.muted,
      beats: Array.isArray(p.beats)
        ? p.beats.map((b) => {
            const div = ([1, 2, 3, 4] as const).includes(b?.div) ? b.div : 1;
            const slots = Array.isArray(b?.slots) ? b.slots.map(parseSlot) : [];
            return setDiv({ div, slots }, div);
          })
        : [],
    })),
    updatedAt: Date.now(),
  };
  return normalize(s);
}

function parseSlot(x: unknown): Slot {
  const s = x as { k?: string; midi?: unknown; str?: unknown } | null;
  if (!s || typeof s !== 'object') return null;
  if (s.k === 'r') return { k: 'r' };
  if (s.k === 'x') return { k: 'x' };
  if (s.k === 'n' && typeof s.midi === 'number' && Number.isFinite(s.midi)) {
    const str = typeof s.str === 'number' && s.str >= 0 && s.str < 3 ? s.str : undefined;
    return str === undefined ? { k: 'n', midi: Math.round(s.midi) } : { k: 'n', midi: Math.round(s.midi), str };
  }
  return null;
}

function clampNum(v: unknown, min: number, max: number, def: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : def;
  return Math.min(max, Math.max(min, n));
}
