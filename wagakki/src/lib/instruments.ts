// 楽器の定義。楽器を増やすときは、ここに1つ足す（ほかの場所は定義を見て動く）。
import { shamisenBaseMidi, tsutsuneMidi } from './pitch';
import { rangeOf, type Tuning } from './shamisen';
import { shakuhachiRange } from './shakuhachi';

export type Instrument = 'piano' | 'shakuhachi' | 'shamisen';
export type Notation = 'staff' | 'kinko' | 'bunka';

export interface InstrumentDef {
  id: Instrument;
  label: string;
  /** 選べる記譜方式（最初が標準） */
  notations: Notation[];
  /** 寸法（調子）を使うか */
  usesSun: boolean;
  /** 調弦を使うか */
  usesTuning: boolean;
  /** General MIDI の音色番号（0 始まり） */
  gmProgram: number;
  /** 五線譜に書くときの音部記号。'treble8vb' はギターと同じく1オクターブ上に書く */
  clef: 'treble' | 'treble8vb';
  /** 出せる音の範囲 */
  range(sun: number, tuning: Tuning): [number, number];
  /** 基準の音（移動ドの「ド」、キーボード入力の起点） */
  base(sun: number): number;
}

export const INSTRUMENTS: Record<Instrument, InstrumentDef> = {
  piano: {
    id: 'piano',
    label: 'ピアノ',
    notations: ['staff'],
    usesSun: false,
    usesTuning: false,
    gmProgram: 0,
    clef: 'treble',
    // 普通のピアノと同じ 88鍵（A0〜C8）。楽譜は今はト音記号1段・単音（大譜表と和音はあとで）
    range: () => [21, 108],
    base: () => 60,
  },
  shakuhachi: {
    id: 'shakuhachi',
    label: '尺八',
    notations: ['kinko', 'staff'],
    usesSun: true,
    usesTuning: false,
    gmProgram: 77,
    clef: 'treble',
    range: (sun) => shakuhachiRange(sun),
    base: (sun) => tsutsuneMidi(sun),
  },
  shamisen: {
    id: 'shamisen',
    label: '三味線',
    notations: ['bunka', 'staff'],
    usesSun: true,
    usesTuning: true,
    gmProgram: 106,
    clef: 'treble8vb',
    range: (sun, tuning) => rangeOf(sun, tuning),
    base: (sun) => shamisenBaseMidi(sun),
  },
};

export const INSTRUMENT_LIST: InstrumentDef[] = [INSTRUMENTS.piano, INSTRUMENTS.shakuhachi, INSTRUMENTS.shamisen];

export const instrumentDef = (id: Instrument): InstrumentDef => INSTRUMENTS[id] ?? INSTRUMENTS.piano;

export const isInstrument = (x: unknown): x is Instrument => typeof x === 'string' && x in INSTRUMENTS;
