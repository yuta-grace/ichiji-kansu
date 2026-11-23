import { describe, expect, it } from 'vitest';
import {
  addTuplet,
  deleteMeasureAt,
  deleteNoteAt,
  deleteRange,
  insertMeasureAt,
  newSong,
  parseSong,
  PPQ,
  tupletAt,
  withEvents,
  writeAt,
  type Ev,
  type MeasureMarks,
  type Song,
} from './score';
import { perfMap, perfBeatFor, perfNotes, playOrder, writtenBeat } from './playorder';
import { measureItems } from './notation';
import { buildMusicXml } from './exporters';

const Q = PPQ;
const notes = (...m: number[]): Ev[] => m.map((x) => (x ? { dur: Q, midi: x } : { dur: Q }));

describe('削除とカーソル', () => {
  const e = notes(60, 62, 64, 0); // ド レ ミ 休
  it('音の上で消すと、その音が消えてカーソルは直前の音へ', () => {
    const r = deleteNoteAt(e, 2 * Q);
    expect(r.events.map((x) => x.midi)).toEqual([60, 62, undefined]);
    expect(r.t).toBe(Q);
  });
  it('休みの上で消すと、直前の音が消える。続けて押すと順に消える', () => {
    let r = deleteNoteAt(e, 3 * Q);
    expect(r.t).toBe(Q);
    r = deleteNoteAt(r.events, r.t);
    expect(r.t).toBe(0);
    r = deleteNoteAt(r.events, r.t);
    expect(r.events).toEqual([{ dur: 4 * Q }]);
    expect(r.t).toBe(0);
  });
  it('音の途中にカーソルがあっても、その音を消す', () => {
    const r = deleteNoteAt([{ dur: 2 * Q, midi: 60 }, { dur: 2 * Q, midi: 62 }], 3 * Q);
    expect(r.events).toEqual([{ dur: 2 * Q, midi: 60 }, { dur: 2 * Q }]);
    expect(r.t).toBe(0);
  });
  it('範囲の削除', () => {
    const r = deleteRange(e, Q, 3 * Q);
    expect(r.events.map((x) => x.midi)).toEqual([60, undefined]);
    expect(r.t).toBe(0);
  });
});

describe('3連符の区間', () => {
  it('区間を作ると中は休み3つ分の境目を持ち、音を入れても保たれる', () => {
    const s = newSong('shakuhachi');
    let p = addTuplet(s.parts[0], Q, Q); // 2拍目に ½拍×3
    expect(p.tuplets).toEqual([{ start: Q, span: Q }]);
    p = withEvents(p, writeAt(p.events, Q, Q / 3, { midi: 62 }));
    p = withEvents(p, writeAt(p.events, Q + Q / 3, Q / 3, { midi: 64 }));
    p = withEvents(p, writeAt(p.events, Q + (2 * Q) / 3, Q / 3, { midi: 65 }));
    expect(p.tuplets).toHaveLength(1);
    expect(tupletAt(p.tuplets, Q + 10)).toEqual({ start: Q, span: Q });
    const { tuplets, items } = measureItems(p.events, 0, 4 * Q, p.tuplets);
    expect(tuplets).toEqual([{ first: 1, last: 3 }]);
    expect(items.slice(1, 4).map((x) => x.triplet)).toEqual([true, true, true]);
  });
  it('区間の境目をまたいで普通の音で上書きすると、区間は外れる', () => {
    const s = newSong('shakuhachi');
    let p = addTuplet(s.parts[0], Q, Q);
    p = withEvents(p, writeAt(p.events, Q / 2, Q, { midi: 62 }));
    expect(p.tuplets).toEqual([]);
  });
  it('3連符の区間の中は、MusicXML でも3連符', () => {
    const s = newSong('shakuhachi');
    let p = addTuplet(s.parts[0], 0, Q);
    p = withEvents(p, writeAt(p.events, 0, Q / 3, { midi: 62 }));
    s.parts[0] = p;
    expect(buildMusicXml(s)).toContain('<tuplet type="start"');
  });
});

describe('小節の挿入・削除', () => {
  it('記号と3連符もずれる', () => {
    let s = newSong('shamisen');
    s.marks = { 1: { repeatStart: true }, 2: { repeatEnd: 2 } };
    s.parts[0] = addTuplet(s.parts[0], 4 * Q, Q);
    s = insertMeasureAt(s, 1);
    expect(s.measures).toBe(5);
    expect(s.marks).toEqual({ 2: { repeatStart: true }, 3: { repeatEnd: 2 } });
    expect(s.parts[0].tuplets).toEqual([{ start: 8 * Q, span: Q }]);
    s = deleteMeasureAt(s, 2);
    expect(s.marks).toEqual({ 2: { repeatEnd: 2 } });
    expect(s.parts[0].tuplets).toEqual([]);
  });
});

function song(measures: number, marks: Record<number, MeasureMarks>): Song {
  const s = newSong('piano');
  s.measures = measures;
  s.marks = marks;
  return s;
}
const order = (n: number, marks: Record<number, MeasureMarks>, opts = {}) => playOrder(song(n, marks), opts).measures.map((m) => m + 1);

describe('演奏の順番', () => {
  it('記号がなければ頭から順に', () => {
    expect(order(4, {})).toEqual([1, 2, 3, 4]);
  });
  it('繰り返し（始まりなしは曲の頭へ）', () => {
    expect(order(4, { 1: { repeatEnd: 2 } })).toEqual([1, 2, 1, 2, 3, 4]);
    expect(order(4, { 1: { repeatStart: true }, 2: { repeatEnd: 2 } })).toEqual([1, 2, 3, 2, 3, 4]);
    expect(order(3, { 1: { repeatEnd: 3 } })).toEqual([1, 2, 1, 2, 1, 2, 3]);
  });
  it('1番括弧・2番括弧', () => {
    // 1 2 |1. 3 :| |2. 4 | 5
    expect(order(5, { 2: { ending: { numbers: [1], length: 1 }, repeatEnd: 2 }, 3: { ending: { numbers: [2], length: 1 } } })).toEqual([1, 2, 3, 1, 2, 4, 5]);
  });
  it('繰り返しが2つ続く', () => {
    expect(order(4, { 1: { repeatEnd: 2 }, 2: { repeatStart: true }, 3: { repeatEnd: 2 } })).toEqual([1, 2, 1, 2, 3, 4, 3, 4]);
  });
  it('D.C. と D.C. al Fine（戻ったあとは繰り返さない）', () => {
    expect(order(3, { 2: { jump: 'DC' } })).toEqual([1, 2, 3, 1, 2, 3]);
    expect(order(4, { 1: { fine: true }, 3: { jump: 'DCalFine' } })).toEqual([1, 2, 3, 4, 1, 2]);
    expect(order(3, { 0: { repeatEnd: 2 }, 2: { jump: 'DC' } })).toEqual([1, 1, 2, 3, 1, 2, 3]);
    expect(order(3, { 0: { repeatEnd: 2 }, 2: { jump: 'DC' } }, { repeatsAfterJump: true })).toEqual([1, 1, 2, 3, 1, 1, 2, 3]);
  });
  it('D.S. al Coda と D.C. al Coda', () => {
    // 1 |𝄋2 3(To Coda) 4(D.S. al Coda) |𝄌5
    expect(order(5, { 1: { segno: true }, 2: { toCoda: true }, 3: { jump: 'DSalCoda' }, 4: { coda: true } })).toEqual([1, 2, 3, 4, 2, 3, 5]);
    expect(order(4, { 1: { toCoda: true }, 2: { jump: 'DCalCoda' }, 3: { coda: true } })).toEqual([1, 2, 3, 1, 2, 4]);
  });
  it('D.S. al Fine', () => {
    expect(order(4, { 1: { segno: true }, 2: { fine: true }, 3: { jump: 'DSalFine' } })).toEqual([1, 2, 3, 4, 2, 3]);
  });
  it('戻ったあとは最後の括弧だけ弾く', () => {
    expect(order(4, { 1: { ending: { numbers: [1], length: 1 }, repeatEnd: 2 }, 2: { ending: { numbers: [2], length: 1 } }, 3: { jump: 'DC' } })).toEqual([1, 2, 1, 3, 4, 1, 3, 4]);
  });
  it('おかしな組み合わせは知らせて、安全なほうに倒す', () => {
    const r = playOrder(song(3, { 2: { jump: 'DSalCoda' } }));
    expect(r.measures.map((m) => m + 1)).toEqual([1, 2, 3, 1, 2, 3]);
    expect(r.warnings.length).toBe(2);
  });
  it('終わらない組み合わせでも止まる', () => {
    const r = playOrder(song(2, { 0: { repeatEnd: 9 }, 1: { repeatEnd: 9, jump: 'DC' } }));
    expect(r.measures.length).toBeLessThan(5000);
  });
});

describe('演奏の順に並べた音', () => {
  it('続けて弾く小節をまたぐ音はつながり、戻ったところでは切れる', () => {
    const s = song(2, { 1: { repeatEnd: 2 } });
    s.beatsPerMeasure = 4;
    s.parts[0].events = [{ dur: 3 * Q }, { dur: 2 * Q, midi: 60 }, { dur: 3 * Q }];
    const o = playOrder(s).measures; // 1 2 1 2
    const ns = perfNotes(s, s.parts[0], o);
    expect(ns).toEqual([
      { start: 3, dur: 2, midi: 60 },
      { start: 11, dur: 2, midi: 60 },
    ]);
    const map = perfMap(s, o);
    expect(writtenBeat(map, 9)).toBe(1);
    expect(perfBeatFor(map, 5)).toBe(5);
  });
});

describe('前の形式からの読み込み', () => {
  it('版2の曲は版3になり、楽器と空の記号を持つ', () => {
    const v2 = { version: 2, title: 'x', tempo: 80, beatsPerMeasure: 4, measures: 1, parts: [{ instrument: 'shakuhachi', sun: 18, tuning: 'honchoshi', events: [{ dur: 4 * Q }] }] };
    const s = parseSong(v2);
    expect(s.version).toBe(3);
    expect(s.instrument).toBe('shakuhachi');
    expect(s.marks).toEqual({});
    expect(s.parts[0].tuplets).toEqual([]);
  });
  it('版3の記号と3連符を保存・読み込みしても同じ', () => {
    const s = newSong('piano');
    s.marks = { 0: { repeatStart: true, segno: true }, 3: { repeatEnd: 2, ending: { numbers: [1], length: 1 }, jump: 'DSalCoda' } };
    s.parts[0] = addTuplet(s.parts[0], 0, Q);
    const back = parseSong(JSON.parse(JSON.stringify(s)));
    expect(back.marks).toEqual(s.marks);
    expect(back.parts[0].tuplets).toEqual(s.parts[0].tuplets);
    expect(back.instrument).toBe('piano');
  });
});

describe('記号の書き出し', () => {
  it('MusicXML に繰り返し・番括弧・ジャンプが入り、MIDI は展開される', async () => {
    const { buildMidi } = await import('./exporters');
    const s = newSong('piano');
    s.parts[0].events = writeAt(s.parts[0].events, 0, Q, { midi: 60 });
    s.marks = { 0: { repeatStart: true, segno: true }, 1: { ending: { numbers: [1], length: 1 }, repeatEnd: 2 }, 2: { ending: { numbers: [2], length: 1 }, fine: true }, 3: { jump: 'DSalFine' } };
    const x = buildMusicXml(s);
    expect(x).toContain('<repeat direction="forward"/>');
    expect(x).toContain('<repeat direction="backward"/>');
    expect(x).toContain('<ending number="1" type="start">1.</ending>');
    expect(x).toContain('<ending number="1" type="stop"/>');
    expect(x).toContain('<ending number="2" type="discontinue"/>');
    expect(x).toContain('<segno/>');
    expect(x).toContain('dalsegno="s1"');
    // 1 2 1 3 4 | 1 3（D.S. al Fine → セーニョ（1小節目）から Fine（3小節目）まで）
    expect(playOrder(s).measures.map((m) => m + 1)).toEqual([1, 2, 1, 3, 4, 1, 3]);
    const midi = buildMidi(s);
    // 1小節目のド（60）は3回鳴る
    expect([...midi].filter((b, i) => b === 0x90 && midi[i + 1] === 60).length).toBe(3);
  });
});

describe('ピアノの大譜表', () => {
  it('新しいピアノの楽譜は大譜表。MusicXML は2段で、低い音はヘ音記号の段', () => {
    const s = newSong('piano');
    expect(s.parts[0].staff).toBe('grand');
    s.parts[0].events = writeAt(writeAt(s.parts[0].events, 0, Q, { midi: 64 }), Q, Q, { midi: 48 });
    const x = buildMusicXml(s);
    expect(x).toContain('<staves>2</staves>');
    expect(x).toContain('<clef number="2"><sign>F</sign><line>4</line></clef>');
    expect(x).toMatch(/<step>C<\/step><octave>3<\/octave><\/pitch>[\s\S]*?<staff>2<\/staff>/);
    s.parts[0].staff = 'bass';
    expect(parseSong(JSON.parse(JSON.stringify(s))).parts[0].staff).toBe('bass');
  });
});

describe('キー割り当て', () => {
  it('標準の割り当てに、変えた分を重ねる', async () => {
    const { keymapFor, actionOf } = await import('./keymaps');
    expect(actionOf(keymapFor('shakuhachi'), 'KeyJ')).toBe('ro');
    expect(actionOf(keymapFor('shakuhachi'), 'KeyD')).toBe('meri');
    expect(actionOf(keymapFor('shamisen'), 'KeyJ')).toBe('str0');
    expect(actionOf(keymapFor('piano', { piano: { n0: 'KeyQ' } }), 'KeyQ')).toBe('n0');
  });
});
