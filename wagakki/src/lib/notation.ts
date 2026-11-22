// 表記に共通の計算：拍のマス割り（文化譜・琴古譜）と、音符の種類への分解（五線譜・MusicXML）
import { isNote, placed, PPQ, type Ev, type Tuplet } from './score';

// ---------------- 拍のマス割り（文化譜・琴古譜） ----------------

export type SlotKind = 'note' | 'cont' | 'rest' | 'blank';

export interface GridSlot {
  t: number; // マスの始まりの時刻
  len: number;
  kind: SlotKind;
  ev?: Ev;
}

export interface BeatGrid {
  div: number;
  slots: GridSlot[];
}

const DIVS = [1, 2, 3, 4, 6, 8, 12];

/**
 * 1拍を、音の始まりと終わりが全部マスの境目に来るいちばん少ない数に割る。
 * 休みは、そのパートの最後の音より後ろなら書かない（空欄）。
 */
export function beatGrid(events: Ev[], beatStart: number, lastNoteEnd: number): BeatGrid {
  const beatEnd = beatStart + PPQ;
  const ps = placed(events);
  const cuts: number[] = [];
  for (const p of ps) {
    for (const x of [p.start, p.start + p.dur]) if (x > beatStart && x < beatEnd) cuts.push(x - beatStart);
  }
  const div = DIVS.find((d) => cuts.every((c) => (c * d) % PPQ === 0)) ?? 8;
  const len = PPQ / div;
  const slots: GridSlot[] = [];
  for (let i = 0; i < div; i++) {
    const t = beatStart + Math.round(i * len);
    const p = ps.find((x) => t >= x.start && t < x.start + x.dur);
    let kind: SlotKind = 'blank';
    if (p) {
      if (isNote(p)) kind = p.start === t ? 'note' : 'cont';
      else if (t < lastNoteEnd && (p.start === t || i === 0)) kind = 'rest';
    }
    slots.push({ t, len, kind, ev: p ? { dur: p.dur, midi: p.midi, str: p.str } : undefined });
  }
  return { div, slots };
}

export function lastNoteEnd(events: Ev[]): number {
  let end = 0;
  for (const p of placed(events)) if (isNote(p)) end = p.start + p.dur;
  return end;
}

// ---------------- 音符の種類への分解（五線譜・MusicXML） ----------------

export type NoteValue = 'w' | 'h' | 'q' | '8' | '16' | '32';

export interface Item {
  start: number; // 小節の頭からの時刻
  ticks: number; // 実際の長さ（3連符は短くなった長さ）
  value: NoteValue;
  dots: number;
  triplet: boolean;
  midi?: number; // 無ければ休み
  str?: number;
  tieStart: boolean; // 次の音符とタイでつながる
  tieStop: boolean; // 前の音符からタイでつながる
  /** 元の音（要素）の始まりの曲全体での時刻（クリックで選ぶため） */
  evStart: number;
}

export interface TupletGroup {
  first: number; // items の添字
  last: number;
}

const PLAIN: [number, NoteValue, number][] = [
  [1920, 'w', 0],
  [1440, 'h', 1],
  [960, 'h', 0],
  [720, 'q', 1],
  [480, 'q', 0],
  [360, '8', 1],
  [240, '8', 0],
  [180, '16', 1],
  [120, '16', 0],
  [60, '32', 0],
];
const TRIPLET: [number, NoteValue][] = [
  [320, 'q'],
  [160, '8'],
  [80, '16'],
];

/** 長さを、書ける音符の並びに分ける（3連符を含む） */
export function splitDuration(d: number): { ticks: number; value: NoteValue; dots: number; triplet: boolean }[] {
  const out: { ticks: number; value: NoteValue; dots: number; triplet: boolean }[] = [];
  let rest = d;
  // 3連符でしか書けない分を先に取り出す
  while (rest > 0 && rest % 60 !== 0) {
    const t = TRIPLET.find(([v]) => v <= rest && (rest - v) % 20 === 0);
    if (!t) break;
    out.push({ ticks: t[0], value: t[1], dots: 0, triplet: true });
    rest -= t[0];
  }
  while (rest >= 60) {
    const p = PLAIN.find(([v]) => v <= rest)!;
    out.push({ ticks: p[0], value: p[1], dots: p[2], triplet: false });
    rest -= p[0];
  }
  return out;
}

/**
 * 小節 [mStart, mStart+mLen) の音符の並び。小節線と書けない長さはタイで分ける。
 */
export function measureItems(
  events: Ev[],
  mStart: number,
  mLen: number,
  regions?: Tuplet[],
): { items: Item[]; tuplets: TupletGroup[] } {
  const items: Item[] = [];
  const mEnd = mStart + mLen;
  for (const p of placed(events)) {
    const s = Math.max(mStart, p.start);
    const e = Math.min(mEnd, p.start + p.dur);
    if (e <= s) continue;
    const parts = splitDuration(e - s);
    let pos = s;
    parts.forEach((x, i) => {
      items.push({
        start: pos - mStart,
        ...x,
        midi: p.midi,
        str: p.str,
        // 音だけタイでつなぐ（休みはつながない）
        tieStart: isNote(p) && (i < parts.length - 1 || (i === parts.length - 1 && p.start + p.dur > mEnd)),
        tieStop: isNote(p) && (i > 0 || (i === 0 && p.start < mStart)),
        evStart: p.start,
      });
      pos += x.ticks;
    });
  }
  // 3連符の区間がデータにあれば、それでまとめる
  if (regions) {
    const tuplets: TupletGroup[] = [];
    for (const r of regions) {
      const a = r.start - mStart;
      const b = a + r.span;
      if (b <= 0 || a >= mLen) continue;
      const idx = items.map((it, i) => (it.start >= a && it.start < b ? i : -1)).filter((i) => i >= 0);
      if (!idx.length) continue;
      idx.forEach((i) => (items[i] = { ...items[i], ...asTriplet(items[i].ticks) }));
      tuplets.push({ first: idx[0], last: idx[idx.length - 1] });
    }
    return { items, tuplets };
  }
  // 前の形式（区間の情報なし）：続く3連符を、実際の長さが8分音符の倍数（240）になったところで区切る
  const tuplets: TupletGroup[] = [];
  let i = 0;
  while (i < items.length) {
    if (!items[i].triplet) {
      i++;
      continue;
    }
    let sum = 0;
    let j = i;
    while (j < items.length && items[j].triplet) {
      sum += items[j].ticks;
      j++;
      if (sum % 240 === 0) break;
    }
    tuplets.push({ first: i, last: j - 1 });
    i = j;
  }
  return { items, tuplets };
}

/** 3連符の区間の中の音を、3連符の音符で書く（例：160 → 3連の8分音符） */
function asTriplet(ticks: number): { value: NoteValue; dots: number; triplet: boolean } {
  const normal = (ticks * 3) / 2;
  const p = PLAIN.find(([v]) => v === normal);
  return p ? { value: p[1], dots: p[2], triplet: true } : { value: '16', dots: 0, triplet: true };
}

// ---------------- 音名（五線譜・MusicXML） ----------------

const STEPS = ['C', 'C', 'D', 'D', 'E', 'F', 'F', 'G', 'G', 'A', 'A', 'B'];
const ALTERS = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0];

export function spell(midi: number): { step: string; alter: number; octave: number } {
  const pc = ((midi % 12) + 12) % 12;
  return { step: STEPS[pc], alter: ALTERS[pc], octave: Math.floor(midi / 12) - 1 };
}
