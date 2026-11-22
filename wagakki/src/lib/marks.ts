// 小節の記号：表示のための計算と、記号を変える操作
import type { JumpKind, MeasureMarks, Song } from './score';

export const JUMP_LABEL: Record<JumpKind, string> = {
  DC: 'D.C.',
  DCalFine: 'D.C. al Fine',
  DCalCoda: 'D.C. al Coda',
  DS: 'D.S.',
  DSalFine: 'D.S. al Fine',
  DSalCoda: 'D.S. al Coda',
};

export interface Decor {
  repStart: boolean;
  /** 繰り返しの終わり（全部で何回弾くか）。0 なら無し */
  repEnd: number;
  /** 番括弧（この小節がその中なら） */
  volta: { label: string; start: boolean; end: boolean } | null;
  segno: boolean;
  coda: boolean;
  /** 小節の終わりに書く文字（Fine・To Coda・D.C. など） */
  right: string[];
}

/** m 小節目（0 始まり）に書く記号 */
export function measureDecor(song: Song, m: number): Decor {
  const mk = song.marks[m] ?? {};
  let volta: Decor['volta'] = null;
  for (let s = m; s >= 0; s--) {
    const e = song.marks[s]?.ending;
    if (e && s + e.length - 1 >= m) {
      volta = { label: `${e.numbers.join(',')}.`, start: s === m, end: s + e.length - 1 === m };
      break;
    }
  }
  const right: string[] = [];
  if (mk.toCoda) right.push('To Coda');
  if (mk.fine) right.push('Fine');
  if (mk.jump) right.push(JUMP_LABEL[mk.jump]);
  return { repStart: !!mk.repeatStart, repEnd: mk.repeatEnd ?? 0, volta, segno: !!mk.segno, coda: !!mk.coda, right };
}

/** m 小節目の記号を変える（空になった項目は消す） */
export function setMarks(song: Song, m: number, patch: Partial<MeasureMarks>): Song {
  const next: MeasureMarks = { ...(song.marks[m] ?? {}), ...patch };
  for (const k of Object.keys(next) as (keyof MeasureMarks)[]) {
    const v = next[k];
    if (v === undefined || v === false || v === 0 || v === null) delete next[k];
  }
  const marks = { ...song.marks };
  if (Object.keys(next).length) marks[m] = next;
  else delete marks[m];
  return { ...song, marks };
}

/** 記号が1つでもあるか */
export const hasMarks = (song: Song) => Object.keys(song.marks).length > 0;
