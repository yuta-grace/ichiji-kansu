// 演奏の順番：繰り返し記号・ジャンプ記号から「何小節目をどの順で弾くか」を作る。
// 再生・WAV・MIDI はこの順番で鳴らす（楽譜の表示と再生の順番を一致させるため、ここだけで決める）。
import { isNote, measureLen, placed, PPQ, type MeasureMarks, type Part, type Placed, type Song } from './score';

export interface PlayOrderOptions {
  /** D.C.・D.S. で戻ったあとも繰り返しを弾くか（ふつうは弾かない） */
  repeatsAfterJump?: boolean;
}

export interface PlayOrder {
  /** 弾く小節の番号（0 始まり）の並び */
  measures: number[];
  /** 記号の組み合わせのおかしなところ（再生は安全なほうに倒して続ける） */
  warnings: string[];
}

/** 演奏する小節の数の上限（無限ループを防ぐ） */
const MAX_PLAYED = 4000;

export function playOrder(song: Song, opts: PlayOrderOptions = {}): PlayOrder {
  const M = song.measures;
  const mk = (i: number): MeasureMarks => song.marks[i] ?? {};
  const warnings: string[] = [];
  const marked = (f: (m: MeasureMarks) => unknown) => {
    for (let i = 0; i < M; i++) if (f(mk(i))) return i;
    return -1;
  };
  const segnoAt = marked((m) => m.segno);
  const codaAt = marked((m) => m.coda);
  const toCodaAt = marked((m) => m.toCoda);
  const fineAt = marked((m) => m.fine);
  // いちばん大きい番括弧の番号（D.C. などで戻ったあとは、最後の括弧だけ弾く）
  let lastEnding = 1;
  for (let i = 0; i < M; i++) for (const n of mk(i).ending?.numbers ?? []) lastEnding = Math.max(lastEnding, n);

  for (let i = 0; i < M; i++) {
    const j = mk(i).jump;
    if (!j) continue;
    if (j.startsWith('DS') && segnoAt < 0) warnings.push(`${i + 1}小節目の D.S. に対応するセーニョがありません（曲の頭へ戻ります）`);
    if (j.endsWith('Coda') && (toCodaAt < 0 || codaAt < 0)) warnings.push(`${i + 1}小節目の al Coda に必要な To Coda かコーダがありません（コーダへは飛びません）`);
    if (j.endsWith('Fine') && fineAt < 0) warnings.push(`${i + 1}小節目の al Fine に対応する Fine がありません（最後まで弾きます）`);
  }

  const out: number[] = [];
  let i = 0;
  let repeatStart = 0;
  let pass = 1; // いまの繰り返しの何回目か（番括弧の判定に使う）
  const endCount = new Map<number, number>(); // 繰り返しの終わりで戻った回数
  let jump: MeasureMarks['jump'] | null = null; // 一度使ったジャンプ
  let steps = 0;

  while (i < M) {
    if (++steps > MAX_PLAYED * 4 || out.length >= MAX_PLAYED) {
      warnings.push('繰り返しが多すぎるため、途中で止めました');
      break;
    }
    const m = mk(i);
    const playRepeats = !jump || opts.repeatsAfterJump;
    if (m.repeatStart && playRepeats && repeatStart !== i) {
      repeatStart = i;
      pass = 1;
    }
    // 番括弧：今回の回数に当たらなければ、括弧の小節を飛ばす
    if (m.ending) {
      const want = playRepeats ? pass : lastEnding;
      if (!m.ending.numbers.includes(want)) {
        i += m.ending.length;
        continue;
      }
    }
    out.push(i);

    // ---- 小節の終わりの記号 ----
    if (m.repeatEnd && playRepeats) {
      const n = endCount.get(i) ?? 0;
      if (n < m.repeatEnd - 1) {
        endCount.set(i, n + 1);
        pass = n + 2;
        i = repeatStart;
        continue;
      }
      // 繰り返しを抜けた。あとで同じ場所をもう一度通るときのために数え直す
      endCount.delete(i);
      pass = 1;
      repeatStart = i + 1;
    }
    if (jump && m.fine && jump.endsWith('Fine')) break;
    if (jump && m.toCoda && jump.endsWith('Coda') && codaAt >= 0) {
      i = codaAt;
      continue;
    }
    if (m.jump && !jump) {
      jump = m.jump;
      pass = 1;
      repeatStart = 0;
      i = m.jump.startsWith('DS') && segnoAt >= 0 ? segnoAt : 0;
      if (m.jump.startsWith('DS') && segnoAt >= 0) repeatStart = segnoAt;
      continue;
    }
    i++;
  }
  return { measures: out, warnings };
}

// ---------------- 演奏の順に並べた音 ----------------

export interface PerfNote {
  start: number; // 拍（演奏の時間）
  dur: number; // 拍
  midi: number;
}

/** 演奏の時間（拍）→ 楽譜の時刻（拍）の対応。再生中に楽譜の場所を光らせるのに使う */
export interface PerfMap {
  /** i 番目に弾く小節の、演奏の時間での頭（拍） */
  starts: number[];
  measures: number[];
  beatsPerMeasure: number;
  totalBeats: number;
}

export function perfMap(song: Song, order: number[]): PerfMap {
  const b = song.beatsPerMeasure;
  return { starts: order.map((_, k) => k * b), measures: order, beatsPerMeasure: b, totalBeats: order.length * b };
}

/** 演奏の時間（拍）→ 楽譜の時刻（拍）。最後を超えたら null */
export function writtenBeat(map: PerfMap, perfBeat: number): number | null {
  const k = Math.floor(perfBeat / map.beatsPerMeasure);
  if (k < 0 || k >= map.measures.length) return null;
  return map.measures[k] * map.beatsPerMeasure + (perfBeat - k * map.beatsPerMeasure);
}

/** 楽譜の時刻（拍）から再生を始めるときの、演奏の時間（拍）。その小節を最初に弾く場所 */
export function perfBeatFor(map: PerfMap, written: number): number {
  const m = Math.floor(written / map.beatsPerMeasure);
  const k = map.measures.indexOf(m);
  if (k < 0) return 0;
  return k * map.beatsPerMeasure + (written - m * map.beatsPerMeasure);
}

/**
 * パートの音を演奏の順に並べる。続けて弾く小節（m → m+1）をまたぐ音はつながったまま、
 * 飛んだところでは小節の終わりで切る。
 */
export function perfNotes(song: Song, part: Part, order: number[]): PerfNote[] {
  const mLen = measureLen(song);
  const b = song.beatsPerMeasure;
  const ps = placed(part.events).filter((p): p is Placed & { midi: number } => isNote(p));
  const out: PerfNote[] = [];
  let open: PerfNote | null = null; // 次の小節へ続く可能性のある音
  order.forEach((m, k) => {
    const a = m * mLen;
    const z = a + mLen;
    const contFromPrev = k > 0 && order[k - 1] === m - 1;
    if (!contFromPrev) open = null;
    let next: PerfNote | null = null;
    for (const p of ps) {
      const s = Math.max(a, p.start);
      const e = Math.min(z, p.start + p.dur);
      if (e <= s) continue;
      const startBeat = k * b + (s - a) / PPQ;
      const durBeat = (e - s) / PPQ;
      if (p.start < a && open && open.midi === p.midi) {
        open.dur += durBeat; // 前の小節から続く音
        if (p.start + p.dur > z) next = open;
        continue;
      }
      if (p.start < a) continue; // 飛んできた先で、前から続く音の途中は鳴らさない
      const n: PerfNote = { start: startBeat, dur: durBeat, midi: p.midi };
      out.push(n);
      if (p.start + p.dur > z) next = n;
    }
    open = next;
  });
  return out;
}
