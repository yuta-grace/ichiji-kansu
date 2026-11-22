// 楽譜のデータと計算
// 曲は「音の高さ（MIDI番号）と長さ」の並びだけで持つ。文化譜・琴古譜・五線譜・MIDI・MusicXML は
// すべてこのデータから作る（どの表記でも同じ曲になる）。
import { shamisenBaseMidi, tsutsuneMidi } from './pitch';
import type { Tuning } from './shamisen';

export type Instrument = 'shamisen' | 'shakuhachi';

/** 1拍（4分音符）の長さ。MIDI と同じ考え方 */
export const PPQ = 480;

/** 音か休み。midi が無ければ休み。str は三味線の糸の指定（0＝一の糸） */
export interface Ev {
  dur: number;
  midi?: number;
  str?: number;
}

export interface Part {
  id: string;
  name: string;
  instrument: Instrument;
  sun: number;
  tuning: Tuning;
  volume: number; // 0〜1
  muted: boolean;
  /** 曲の頭から終わりまで隙間なく並ぶ（休みも1つの要素） */
  events: Ev[];
}

export interface Song {
  version: 2;
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

export const measureLen = (s: Song) => s.beatsPerMeasure * PPQ;
export const songLen = (s: Song) => s.measures * measureLen(s);

export const isNote = (e: Ev): e is Ev & { midi: number } => typeof e.midi === 'number';

export function newPart(instrument: Instrument, sun: number, tuning: Tuning, len: number, name?: string): Part {
  return {
    id: uid(),
    name: name ?? (instrument === 'shamisen' ? '三味線' : '尺八'),
    instrument,
    sun,
    tuning,
    volume: 0.8,
    muted: false,
    events: [{ dur: len }],
  };
}

export function newSong(instrument: Instrument = 'shamisen', sun = 18, tuning: Tuning = 'honchoshi'): Song {
  const s: Song = {
    version: 2,
    id: uid(),
    title: '無題の曲',
    tempo: 80,
    beatsPerMeasure: 4,
    measures: 4,
    parts: [],
    updatedAt: Date.now(),
  };
  s.parts = [newPart(instrument, sun, tuning, songLen(s))];
  return s;
}

// ---------------- 並びの操作 ----------------

/** 隣り合う休みをまとめ、長さ0を除く */
export function tidy(events: Ev[]): Ev[] {
  const out: Ev[] = [];
  for (const e of events) {
    if (e.dur <= 0) continue;
    const last = out[out.length - 1];
    if (last && !isNote(last) && !isNote(e)) last.dur += e.dur;
    else out.push({ ...e });
  }
  return out;
}

/** 全体の長さを len にそろえる（足りなければ休みを足し、長ければ切る） */
export function fitLength(events: Ev[], len: number): Ev[] {
  const out: Ev[] = [];
  let pos = 0;
  for (const e of events) {
    if (pos >= len) break;
    const d = Math.min(e.dur, len - pos);
    out.push({ ...e, dur: d });
    pos += d;
  }
  if (pos < len) out.push({ dur: len - pos });
  return tidy(out);
}

export interface Placed extends Ev {
  start: number;
}

export function placed(events: Ev[]): Placed[] {
  let pos = 0;
  return events.map((e) => {
    const p = { ...e, start: pos };
    pos += e.dur;
    return p;
  });
}

/** 時刻 t を含む要素 */
export function eventAt(events: Ev[], t: number): Placed | null {
  for (const p of placed(events)) if (t >= p.start && t < p.start + p.dur) return p;
  return null;
}

/**
 * [t, t+d) に ev を書く（上書き）。はみ出した音の残りは休みになる。
 * 書いた結果と、実際に書けた長さを返す。
 */
export function writeAt(events: Ev[], t: number, d: number, ev: Omit<Ev, 'dur'>): Ev[] {
  const total = events.reduce((a, e) => a + e.dur, 0);
  const end = Math.min(total, t + d);
  if (end <= t) return events;
  const before: Ev[] = [];
  const after: Ev[] = [];
  for (const p of placed(events)) {
    const pe = p.start + p.dur;
    const { start: _s, ...e } = p;
    if (pe <= t) before.push(e);
    else if (p.start >= end) after.push(e);
    else {
      if (p.start < t) before.push({ ...e, dur: t - p.start });
      if (pe > end) after.push({ dur: pe - end }); // 残りは休み
    }
  }
  return tidy([...before, { ...ev, dur: end - t }, ...after]);
}

/**
 * 伸ばし：時刻 t の直前で終わる音を d だけ延ばす。直前が音でなければ休みを書く。
 */
export function extendAt(events: Ev[], t: number, d: number): Ev[] {
  const ps = placed(events);
  const prev = ps.find((p) => p.start + p.dur === t);
  if (!prev || !isNote(prev)) return writeAt(events, t, d, {});
  const total = events.reduce((a, e) => a + e.dur, 0);
  const add = Math.min(d, total - t);
  if (add <= 0) return events;
  // [t, t+add) を休みにしてから、その休みを直前の音に吸収させる
  const carved = writeAt(events, t, add, {});
  const out: Ev[] = [];
  for (const p of placed(carved)) {
    const { start, ...e } = p;
    if (start === prev.start) out.push({ ...e, dur: e.dur + add });
    else if (start === t) {
      if (e.dur > add) out.push({ dur: e.dur - add });
    } else out.push(e);
  }
  return tidy(out);
}

/** [a, b) を切り出す */
export function sliceEvents(events: Ev[], a: number, b: number): Ev[] {
  const out: Ev[] = [];
  for (const p of placed(events)) {
    const s = Math.max(a, p.start);
    const e = Math.min(b, p.start + p.dur);
    if (e > s) {
      const { start: _s, ...ev } = p;
      out.push({ ...ev, dur: e - s });
    }
  }
  return out;
}

/** t の位置に並び clip を上書きで貼る */
export function pasteAt(events: Ev[], t: number, clip: Ev[]): Ev[] {
  let out = events;
  let pos = t;
  for (const c of clip) {
    const { dur, ...ev } = c;
    out = writeAt(out, pos, dur, ev);
    pos += dur;
  }
  return out;
}

/** t の位置に長さ len の休みを差し込む（後ろは後ろへずれる） */
export function insertTime(events: Ev[], t: number, len: number): Ev[] {
  const total = events.reduce((a, e) => a + e.dur, 0);
  return tidy([...sliceEvents(events, 0, t), { dur: len }, ...sliceEvents(events, t, total)]);
}

/** [a, b) を取り除く（後ろは前へ詰まる） */
export function removeTime(events: Ev[], a: number, b: number): Ev[] {
  const total = events.reduce((x, e) => x + e.dur, 0);
  return tidy([...sliceEvents(events, 0, a), ...sliceEvents(events, b, total)]);
}

/** 曲の長さが変わったときに各パートをそろえる */
export function normalize(s: Song): Song {
  const len = songLen(s);
  return { ...s, parts: s.parts.map((p) => ({ ...p, events: fitLength(p.events, len) })) };
}

// ---------------- 再生・計算 ----------------

export interface NoteEvent {
  start: number; // 拍
  dur: number; // 拍
  midi: number;
}

export function partEvents(p: Part): NoteEvent[] {
  const out: NoteEvent[] = [];
  for (const e of placed(p.events)) if (isNote(e)) out.push({ start: e.start / PPQ, dur: e.dur / PPQ, midi: e.midi });
  return out;
}

export function transposePart(p: Part, delta: number): Part {
  if (delta === 0) return p;
  return { ...p, events: p.events.map((e) => (isNote(e) ? { ...e, midi: e.midi + delta } : e)) };
}

/** 楽器の基準の音（尺八は筒音、三味線は一の糸） */
export function baseMidi(instrument: Instrument, sun: number): number {
  return instrument === 'shamisen' ? shamisenBaseMidi(sun) : tsutsuneMidi(sun);
}

/** 寸法を変える。keepFingering なら指使いはそのままで音が並行移動、そうでなければ音の高さを保つ */
export function changeSun(p: Part, sun: number, keepFingering: boolean): Part {
  const delta = baseMidi(p.instrument, sun) - baseMidi(p.instrument, p.sun);
  const moved = keepFingering ? transposePart(p, delta) : p;
  return { ...moved, sun };
}

/** 曲全体の寸法を半音 steps だけ変える（短い管＝高い方向が正）。指使いは保つ */
export function shiftAllSun(s: Song, steps: number, sunMin: number, sunMax: number): Song {
  return {
    ...s,
    parts: s.parts.map((p) => changeSun(p, Math.min(sunMax, Math.max(sunMin, p.sun - steps)), true)),
  };
}

// ---------------- 読み込みの検査（前の形式からの変換を含む） ----------------

interface V1Slot {
  k?: string;
  midi?: number;
  str?: number;
}

/** 前の形式（拍ごとの分割とマス）を新しい形式にする */
function fromV1Beats(beats: unknown): Ev[] {
  const out: Ev[] = [];
  if (!Array.isArray(beats)) return out;
  for (const b of beats) {
    const slots: unknown[] = Array.isArray(b?.slots) ? b.slots : [null];
    const div = [1, 2, 3, 4].includes(b?.div) ? b.div : slots.length || 1;
    const len = PPQ / div;
    for (let i = 0; i < div; i++) {
      const s = (slots[i] ?? null) as V1Slot | null;
      const last = out[out.length - 1];
      if (s && s.k === 'n' && typeof s.midi === 'number') {
        out.push(validNote({ dur: len, midi: s.midi, str: s.str }));
      } else if (s && s.k === 'x' && last) {
        last.dur += len;
      } else {
        out.push({ dur: len });
      }
    }
  }
  return tidy(out);
}

function validNote(e: { dur: number; midi: number; str?: unknown }): Ev {
  const midi = Math.round(e.midi);
  const str = typeof e.str === 'number' && e.str >= 0 && e.str < 3 ? e.str : undefined;
  return str === undefined ? { dur: e.dur, midi } : { dur: e.dur, midi, str };
}

function parseEvents(x: unknown): Ev[] {
  if (!Array.isArray(x)) return [];
  const out: Ev[] = [];
  for (const e of x) {
    const dur = typeof e?.dur === 'number' && Number.isFinite(e.dur) ? Math.round(e.dur) : 0;
    if (dur <= 0) continue;
    if (typeof e.midi === 'number' && Number.isFinite(e.midi)) out.push(validNote({ dur, midi: e.midi, str: e.str }));
    else out.push({ dur });
  }
  return out;
}

export function parseSong(json: unknown): Song {
  const o = json as Record<string, unknown> & { parts?: unknown[] };
  if (!o || typeof o !== 'object' || (o.version !== 1 && o.version !== 2) || !Array.isArray(o.parts)) {
    throw new Error('和楽器アプリの楽譜ファイルではありません');
  }
  const s: Song = {
    version: 2,
    id: typeof o.id === 'string' ? o.id : uid(),
    title: String(o.title ?? '無題の曲'),
    tempo: clampNum(o.tempo, 30, 240, 80),
    beatsPerMeasure: clampNum(o.beatsPerMeasure, 1, 8, 4),
    measures: clampNum(o.measures, 1, 400, 4),
    parts: [],
    updatedAt: typeof o.updatedAt === 'number' ? o.updatedAt : Date.now(),
  };
  s.parts = (o.parts as Record<string, unknown>[]).slice(0, MAX_PARTS).map((p) => ({
    id: typeof p.id === 'string' ? p.id : uid(),
    name: String(p.name ?? ''),
    instrument: p.instrument === 'shakuhachi' ? 'shakuhachi' : 'shamisen',
    sun: clampNum(p.sun, 13, 24, 18),
    tuning: (['honchoshi', 'niagari', 'sansagari'] as const).includes(p.tuning as Tuning) ? (p.tuning as Tuning) : 'honchoshi',
    volume: clampNum(p.volume, 0, 1, 0.8),
    muted: !!p.muted,
    events: o.version === 1 ? fromV1Beats(p.beats) : parseEvents(p.events),
  }));
  if (!s.parts.length) throw new Error('パートがありません');
  return normalize(s);
}

function clampNum(v: unknown, min: number, max: number, def: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : def;
  return Math.min(max, Math.max(min, Math.round(n)));
}
