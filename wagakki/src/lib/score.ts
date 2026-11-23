// 楽譜のデータと計算
// 曲は「音の高さ（MIDI番号）と長さ」の並びだけで持つ。文化譜・琴古譜・五線譜・MIDI・MusicXML は
// すべてこのデータから作る（どの表記でも同じ曲になる）。
import { instrumentDef, isInstrument, type Instrument } from './instruments';
import type { Tuning } from './shamisen';

export type { Instrument } from './instruments';

/** 1拍（4分音符）の長さ。MIDI と同じ考え方 */
export const PPQ = 480;

/** 音か休み。midi が無ければ休み。str は三味線の糸の指定（0＝一の糸） */
export interface Ev {
  dur: number;
  midi?: number;
  str?: number;
}

/**
 * 3連符の区間。[start, start+span) に、span/3 の長さのマスが3つ入る（普通の2つ分の時間に3つ）。
 * 中の音の長さは実際の時間で持つので、再生や書き出しの計算はそのまま。
 */
export interface Tuplet {
  start: number;
  span: number;
}

export type JumpKind = 'DC' | 'DCalFine' | 'DCalCoda' | 'DS' | 'DSalFine' | 'DSalCoda';

/** 小節に付く記号。小節の頭に付くもの・終わりに付くものがある */
export interface MeasureMarks {
  /** 繰り返しの始まり ||:（小節の頭） */
  repeatStart?: boolean;
  /** 繰り返しの終わり :||（小節の終わり）。全部で何回弾くか（ふつう 2） */
  repeatEnd?: number;
  /** 番括弧（この小節から length 小節）。numbers は何回目に弾くか */
  ending?: { numbers: number[]; length: number };
  /** セーニョ 𝄋（小節の頭） */
  segno?: boolean;
  /** コーダ 𝄌（小節の頭。To Coda の飛び先） */
  coda?: boolean;
  /** To Coda（小節の終わり） */
  toCoda?: boolean;
  /** Fine（小節の終わり） */
  fine?: boolean;
  /** D.C.・D.S. など（小節の終わり） */
  jump?: JumpKind;
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
  tuplets: Tuplet[];
  /** ピアノの五線譜：大譜表（ト音記号＋ヘ音記号、標準）・ト音記号だけ・ヘ音記号だけ */
  staff?: 'grand' | 'treble' | 'bass';
}

export interface Song {
  version: 3;
  id: string;
  title: string;
  /** 楽譜の楽器（新しく作る楽譜は1つの楽器。前の形式の曲ではパートごとに違うことがある） */
  instrument: Instrument;
  /** 小節の番号（0 始まり）→ 記号 */
  marks: Record<number, MeasureMarks>;
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
    name: name ?? instrumentDef(instrument).label,
    instrument,
    sun,
    tuning,
    volume: 0.8,
    muted: false,
    events: [{ dur: len }],
    tuplets: [],
    ...(instrument === 'piano' ? { staff: 'grand' as const } : {}),
  };
}

export function newSong(instrument: Instrument = 'shamisen', sun = 18, tuning: Tuning = 'honchoshi'): Song {
  const s: Song = {
    version: 3,
    id: uid(),
    title: '無題の曲',
    instrument,
    marks: {},
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
  const marks: Record<number, MeasureMarks> = {};
  for (const [k, v] of Object.entries(s.marks ?? {})) if (Number(k) < s.measures) marks[Number(k)] = v;
  return {
    ...s,
    marks,
    parts: s.parts.map((p) =>
      withEvents({ ...p, tuplets: (p.tuplets ?? []).filter((t) => t.start + t.span <= len) }, fitLength(p.events, len)),
    ),
  };
}

// ---------------- 3連符の区間 ----------------

export const tupletAt = (tuplets: Tuplet[], t: number): Tuplet | null =>
  tuplets.find((x) => t >= x.start && t < x.start + x.span) ?? null;

/** 区間の中の音の境目がすべてマスの境目にあるものだけ残す（上書きで壊れた区間は外す） */
export function validTuplets(events: Ev[], tuplets: Tuplet[]): Tuplet[] {
  const ps = placed(events);
  const sorted = [...tuplets].sort((a, b) => a.start - b.start);
  const out: Tuplet[] = [];
  for (const tp of sorted) {
    if (tp.span % 3 !== 0 || out.some((o) => tp.start < o.start + o.span && o.start < tp.start + tp.span)) continue;
    const slot = tp.span / 3;
    const end = tp.start + tp.span;
    const ok = ps.every((p) => {
      for (const x of [p.start, p.start + p.dur]) {
        if (x > tp.start && x < end && (x - tp.start) % slot !== 0) return false;
      }
      return true;
    });
    // 区間の頭と終わりも音の境目でなければならない
    const edgeOk = [tp.start, end].every((x) => ps.some((p) => p.start === x) || x === ps.reduce((a, e) => Math.max(a, e.start + e.dur), 0));
    if (ok && edgeOk) out.push(tp);
  }
  return out;
}

/** t から span の3連符の区間を作る（中は休み3つ） */
export function addTuplet(p: Part, start: number, span: number): Part {
  const events = writeAt(p.events, start, span, {});
  // 休みがまとまっても、区間の頭と終わりが境目になるよう分けておく
  const split = splitAtTimes(events, [start, start + span]);
  const tuplets = [...p.tuplets.filter((x) => x.start + x.span <= start || x.start >= start + span), { start, span }];
  return { ...p, events: split, tuplets: validTuplets(split, tuplets) };
}

/** 休みを、指定の時刻で分ける（音は分けない） */
function splitAtTimes(events: Ev[], times: number[]): Ev[] {
  const out: Ev[] = [];
  for (const p of placed(events)) {
    const { start, ...e } = p;
    const cuts = isNote(e) ? [] : times.filter((x) => x > start && x < start + e.dur).sort((a, b) => a - b);
    let pos = start;
    for (const c of cuts) {
      out.push({ dur: c - pos });
      pos = c;
    }
    out.push({ ...e, dur: start + e.dur - pos });
  }
  return out;
}

/** パートの音を書き換えたあと、3連符の区間の境目を保つ（tidy で休みがまとまった分を分け直す） */
export function withEvents(p: Part, events: Ev[]): Part {
  const times = p.tuplets.flatMap((t) => [t.start, t.start + t.span, t.start + t.span / 3, t.start + (2 * t.span) / 3]);
  const split = splitAtTimes(events, times);
  return { ...p, events: split, tuplets: validTuplets(split, p.tuplets) };
}

// ---------------- 削除とカーソル ----------------

/**
 * 削除：カーソルが音の上ならその音を、休みの上なら直前の音を休みにする。
 * カーソルはその直前の音の頭へ移る（直前の音がなければ消した位置）。
 */
export function deleteNoteAt(events: Ev[], t: number): { events: Ev[]; t: number } {
  const ps = placed(events);
  const here = ps.find((p) => t >= p.start && t < p.start + p.dur);
  const target = here && isNote(here) ? here : [...ps].reverse().find((p) => isNote(p) && p.start < t);
  if (!target) return { events, t };
  const next = writeAt(events, target.start, target.dur, {});
  const prev = [...placed(next)].reverse().find((p) => isNote(p) && p.start < target.start);
  return { events: next, t: prev ? prev.start : target.start };
}

/** 範囲 [a, b) を休みにする。カーソルは範囲の前の音の頭へ */
export function deleteRange(events: Ev[], a: number, b: number): { events: Ev[]; t: number } {
  const next = writeAt(events, a, b - a, {});
  const prev = [...placed(next)].reverse().find((p) => isNote(p) && p.start < a);
  return { events: next, t: prev ? prev.start : a };
}

// ---------------- 小節の挿入・削除（記号と3連符もずらす） ----------------

export function insertMeasureAt(s: Song, m: number): Song {
  const mLen = measureLen(s);
  const at = m * mLen;
  const marks: Record<number, MeasureMarks> = {};
  for (const [k, v] of Object.entries(s.marks)) marks[Number(k) >= m ? Number(k) + 1 : Number(k)] = v;
  return normalize({
    ...s,
    measures: s.measures + 1,
    marks,
    parts: s.parts.map((p) => ({
      ...p,
      events: insertTime(p.events, at, mLen),
      tuplets: p.tuplets.map((t) => (t.start >= at ? { ...t, start: t.start + mLen } : t)),
    })),
  });
}

export function deleteMeasureAt(s: Song, m: number): Song {
  if (s.measures <= 1) return s;
  const mLen = measureLen(s);
  const a = m * mLen;
  const b = a + mLen;
  const marks: Record<number, MeasureMarks> = {};
  for (const [k, v] of Object.entries(s.marks)) {
    const n = Number(k);
    if (n < m) marks[n] = v;
    else if (n > m) marks[n - 1] = v;
  }
  return normalize({
    ...s,
    measures: s.measures - 1,
    marks,
    parts: s.parts.map((p) => ({
      ...p,
      events: removeTime(p.events, a, b),
      tuplets: p.tuplets.filter((t) => t.start + t.span <= a || t.start >= b).map((t) => (t.start >= b ? { ...t, start: t.start - mLen } : t)),
    })),
  });
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
  return instrumentDef(instrument).base(sun);
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
  if (!o || typeof o !== 'object' || ![1, 2, 3].includes(o.version as number) || !Array.isArray(o.parts)) {
    throw new Error('和楽器アプリの楽譜ファイルではありません');
  }
  const s: Song = {
    version: 3,
    id: typeof o.id === 'string' ? o.id : uid(),
    title: String(o.title ?? '無題の曲'),
    instrument: 'shamisen',
    marks: parseMarks(o.marks),
    tempo: clampNum(o.tempo, 30, 240, 80),
    beatsPerMeasure: clampNum(o.beatsPerMeasure, 1, 8, 4),
    measures: clampNum(o.measures, 1, 400, 4),
    parts: [],
    updatedAt: typeof o.updatedAt === 'number' ? o.updatedAt : Date.now(),
  };
  s.parts = (o.parts as Record<string, unknown>[]).slice(0, MAX_PARTS).map((p) => ({
    id: typeof p.id === 'string' ? p.id : uid(),
    name: String(p.name ?? ''),
    instrument: isInstrument(p.instrument) ? p.instrument : 'shamisen',
    sun: clampNum(p.sun, 13, 24, 18),
    tuning: (['honchoshi', 'niagari', 'sansagari'] as const).includes(p.tuning as Tuning) ? (p.tuning as Tuning) : 'honchoshi',
    volume: clampNum(p.volume, 0, 1, 0.8),
    muted: !!p.muted,
    events: o.version === 1 ? fromV1Beats(p.beats) : parseEvents(p.events),
    tuplets: parseTuplets(p.tuplets),
    ...(p.staff === 'grand' || p.staff === 'treble' || p.staff === 'bass' ? { staff: p.staff as Part['staff'] } : {}),
  }));
  if (!s.parts.length) throw new Error('パートがありません');
  // 前の形式には楽譜全体の楽器が無いので、最初のパートの楽器にする
  s.instrument = isInstrument(o.instrument) ? o.instrument : s.parts[0].instrument;
  return normalize(s);
}

function parseTuplets(x: unknown): Tuplet[] {
  if (!Array.isArray(x)) return [];
  return x
    .filter((t) => Number.isInteger(t?.start) && Number.isInteger(t?.span) && t.start >= 0 && t.span > 0)
    .map((t) => ({ start: t.start, span: t.span }));
}

const JUMPS: JumpKind[] = ['DC', 'DCalFine', 'DCalCoda', 'DS', 'DSalFine', 'DSalCoda'];

function parseMarks(x: unknown): Record<number, MeasureMarks> {
  const out: Record<number, MeasureMarks> = {};
  if (!x || typeof x !== 'object') return out;
  for (const [k, v] of Object.entries(x as Record<string, Record<string, unknown>>)) {
    const n = Number(k);
    if (!Number.isInteger(n) || n < 0 || !v || typeof v !== 'object') continue;
    const m: MeasureMarks = {};
    if (v.repeatStart) m.repeatStart = true;
    if (typeof v.repeatEnd === 'number' && v.repeatEnd >= 2) m.repeatEnd = Math.min(9, Math.round(v.repeatEnd));
    const e = v.ending as { numbers?: unknown; length?: unknown } | undefined;
    if (e && Array.isArray(e.numbers) && typeof e.length === 'number' && e.length >= 1) {
      const nums = e.numbers.filter((x): x is number => Number.isInteger(x) && (x as number) >= 1 && (x as number) <= 9);
      if (nums.length) m.ending = { numbers: nums, length: Math.round(e.length) };
    }
    if (v.segno) m.segno = true;
    if (v.coda) m.coda = true;
    if (v.toCoda) m.toCoda = true;
    if (v.fine) m.fine = true;
    if (JUMPS.includes(v.jump as JumpKind)) m.jump = v.jump as JumpKind;
    if (Object.keys(m).length) out[n] = m;
  }
  return out;
}

function clampNum(v: unknown, min: number, max: number, def: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : def;
  return Math.min(max, Math.max(min, Math.round(n)));
}
