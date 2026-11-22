import { describe, expect, it } from 'vitest';
import {
  changeSun,
  extendAt,
  insertTime,
  newSong,
  parseSong,
  partEvents,
  pasteAt,
  PPQ,
  removeTime,
  shiftAllSun,
  sliceEvents,
  songLen,
  writeAt,
  type Ev,
} from './score';
import { beatGrid, lastNoteEnd, measureItems, splitDuration } from './notation';
import { buildMidi, buildMusicXml, buildZip, encodeWav } from './exporters';

const Q = PPQ;
const total = (e: Ev[]) => e.reduce((a, x) => a + x.dur, 0);

describe('並びの操作', () => {
  const base: Ev[] = [{ dur: 4 * Q }];
  it('書くと上書きされ、長さは変わらない', () => {
    let e = writeAt(base, 0, Q, { midi: 62 });
    e = writeAt(e, Q, Q / 2, { midi: 64 });
    expect(e).toEqual([{ dur: Q, midi: 62 }, { dur: Q / 2, midi: 64 }, { dur: 2.5 * Q }]);
    expect(total(e)).toBe(4 * Q);
  });
  it('音の途中に書くと、残りは休みになる', () => {
    const e = writeAt([{ dur: 2 * Q, midi: 62 }, { dur: 2 * Q }], Q / 2, Q / 2, { midi: 67 });
    expect(e).toEqual([{ dur: Q / 2, midi: 62 }, { dur: Q / 2, midi: 67 }, { dur: 3 * Q }]);
  });
  it('伸ばしは直前の音を延ばす。直前が休みなら休み', () => {
    let e = writeAt(base, 0, Q, { midi: 62 });
    e = extendAt(e, Q, Q);
    expect(e).toEqual([{ dur: 2 * Q, midi: 62 }, { dur: 2 * Q }]);
    expect(extendAt(base, Q, Q)).toEqual(base);
  });
  it('切り出し・貼り付け・小節の挿入と削除', () => {
    let e = writeAt(base, 0, Q, { midi: 62 });
    e = writeAt(e, Q, Q, { midi: 64 });
    const clip = sliceEvents(e, 0, 2 * Q);
    const pasted = pasteAt(e, 2 * Q, clip);
    expect(pasted.map((x) => x.midi)).toEqual([62, 64, 62, 64]);
    const ins = insertTime(e, Q, Q);
    expect(total(ins)).toBe(5 * Q);
    expect(ins[1]).toEqual({ dur: Q });
    expect(removeTime(ins, Q, 2 * Q)).toEqual(e);
  });
});

describe('表記の計算', () => {
  it('拍のマス割りは、いちばん少ない分割', () => {
    const e: Ev[] = [{ dur: Q / 2, midi: 62 }, { dur: Q / 2, midi: 64 }, { dur: (Q * 2) / 3, midi: 65 }, { dur: Q / 3 }, { dur: 2 * Q }];
    expect(beatGrid(e, 0, lastNoteEnd(e)).div).toBe(2);
    expect(beatGrid(e, Q, lastNoteEnd(e)).div).toBe(3);
    const g = beatGrid(e, Q, lastNoteEnd(e));
    expect(g.slots.map((s) => s.kind)).toEqual(['note', 'cont', 'blank']);
  });
  it('長さを音符に分ける（付点・3連符・タイ）', () => {
    expect(splitDuration(Q * 1.5)).toEqual([{ ticks: 720, value: 'q', dots: 1, triplet: false }]);
    expect(splitDuration(160).map((x) => x.triplet)).toEqual([true]);
    expect(splitDuration(Q * 2.5).map((x) => x.value)).toEqual(['h', '8']);
  });
  it('小節をまたぐ音はタイで分かれる', () => {
    const e: Ev[] = [{ dur: 3 * Q }, { dur: 2 * Q, midi: 62 }, { dur: 3 * Q }];
    const m1 = measureItems(e, 0, 4 * Q).items;
    const m2 = measureItems(e, 4 * Q, 4 * Q).items;
    expect(m1[m1.length - 1]).toMatchObject({ midi: 62, tieStart: true, tieStop: false });
    expect(m2[0]).toMatchObject({ midi: 62, tieStart: false, tieStop: true });
  });
  it('3連符のまとまり', () => {
    const e: Ev[] = [{ dur: 160, midi: 62 }, { dur: 160, midi: 64 }, { dur: 160, midi: 65 }, { dur: 3 * Q }];
    expect(measureItems(e, 0, 4 * Q).tuplets).toEqual([{ first: 0, last: 2 }]);
  });
});

describe('楽譜', () => {
  it('再生用の並び', () => {
    const s = newSong();
    s.parts[0].events = writeAt(s.parts[0].events, Q, Q * 1.5, { midi: 62 });
    expect(partEvents(s.parts[0])).toEqual([{ start: 1, dur: 1.5, midi: 62 }]);
  });
  it('寸法の変更：指使いを保つと音が動く', () => {
    const s = newSong('shakuhachi', 18);
    s.parts[0].events = writeAt(s.parts[0].events, 0, Q, { midi: 62 });
    expect(changeSun(s.parts[0], 16, true).events[0]).toEqual({ dur: Q, midi: 64 });
    expect(changeSun(s.parts[0], 16, false).events[0]).toEqual({ dur: Q, midi: 62 });
    const all = shiftAllSun(s, 1, 13, 24);
    expect(all.parts[0].sun).toBe(17);
    expect(all.parts[0].events[0]).toEqual({ dur: Q, midi: 63 });
  });
  it('前の形式の曲を読み込める', () => {
    const v1 = {
      version: 1,
      title: '古い曲',
      tempo: 90,
      beatsPerMeasure: 4,
      measures: 1,
      parts: [
        {
          instrument: 'shamisen',
          sun: 18,
          tuning: 'honchoshi',
          beats: [
            { div: 1, slots: [{ k: 'n', midi: 62, str: 2 }] },
            { div: 2, slots: [{ k: 'x' }, { k: 'n', midi: 64 }] },
            { div: 1, slots: [{ k: 'r' }] },
            { div: 1, slots: [null] },
          ],
        },
      ],
    };
    const s = parseSong(v1);
    expect(s.version).toBe(3);
    expect(s.parts[0].events).toEqual([{ dur: Q * 1.5, midi: 62, str: 2 }, { dur: Q / 2, midi: 64 }, { dur: 2 * Q }]);
    expect(total(s.parts[0].events)).toBe(songLen(s));
    expect(() => parseSong({ foo: 1 })).toThrow();
  });
});

describe('書き出し', () => {
  const s = newSong('shamisen', 18);
  s.parts[0].events = writeAt(writeAt(s.parts[0].events, 0, Q, { midi: 62, str: 2 }), Q, 160, { midi: 64 });
  it('MIDI のヘッダとトラック', () => {
    const m = buildMidi(s);
    expect(String.fromCharCode(...m.slice(0, 4))).toBe('MThd');
    expect(m[11]).toBe(2); // トラック数（テンポ＋1パート）
    expect([...m].filter((b, i) => b === 0x90 && m[i + 1] === 62).length).toBe(1);
  });
  it('MusicXML に音と3連符と糸が入る', () => {
    const x = buildMusicXml(s);
    expect(x).toContain('<step>D</step><octave>4</octave>');
    expect(x).toContain('<actual-notes>3</actual-notes>');
    expect(x).toContain('<string>1</string>');
    expect(x).toContain('<clef-octave-change>-1</clef-octave-change>');
  });
  it('zip と WAV の形', () => {
    const z = buildZip([{ name: 'a.txt', data: new TextEncoder().encode('hi') }]);
    expect([z[0], z[1], z[2], z[3]]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    const w = encodeWav({ numberOfChannels: 1, sampleRate: 8000, length: 4, getChannelData: () => new Float32Array([0, 0.5, -0.5, 1]) });
    expect(w.length).toBe(44 + 8);
    expect(String.fromCharCode(...w.slice(8, 12))).toBe('WAVE');
  });
});
