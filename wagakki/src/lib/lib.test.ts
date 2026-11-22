import { describe, expect, it } from 'vitest';
import { honFromSun, shamisenBaseMidi, sunLabelWithNote, tsutsuneMidi, movableName, noteName } from './pitch';
import { fingeringFor, openStrings, POSITION_LABELS } from './shamisen';
import { kinkoFor, kinkoGlyph, KINKO_NOTES } from './shakuhachi';

describe('寸法', () => {
  it('1尺8寸＝D4、1尺9寸＝C♯、2尺＝C', () => {
    expect(tsutsuneMidi(18)).toBe(62);
    expect(sunLabelWithNote(18)).toBe('1尺8寸（D）');
    expect(sunLabelWithNote(19)).toBe('1尺9寸（C♯）');
    expect(sunLabelWithNote(20)).toBe('2尺（C）');
    expect(sunLabelWithNote(13)).toBe('1尺3寸（G）');
    expect(sunLabelWithNote(24)).toBe('2尺4寸（G♯）');
  });
  it('三味線の一の糸は同じ音名で、本数の音域（A2〜G♯3）', () => {
    expect(honFromSun(18)).toBe(6);
    expect(shamisenBaseMidi(18)).toBe(50); // D3
    expect(honFromSun(24)).toBe(12);
    expect(honFromSun(13)).toBe(11);
    for (let s = 13; s <= 24; s++) {
      expect(Math.abs((shamisenBaseMidi(s) - tsutsuneMidi(s)) % 12)).toBe(0);
    }
  });
});

describe('三味線', () => {
  it('勘所の表記は 0〜20 で 25 個', () => {
    expect(POSITION_LABELS.length).toBe(25);
    expect(POSITION_LABELS[4]).toBe('#');
    expect(POSITION_LABELS[11]).toBe('♭');
    expect(POSITION_LABELS[12]).toBe('10');
    expect(POSITION_LABELS[16]).toBe('1#');
    expect(POSITION_LABELS[23]).toBe('1♭');
    expect(POSITION_LABELS[24]).toBe('20');
  });
  it('調弦', () => {
    expect(openStrings(18, 'honchoshi')).toEqual([50, 55, 62]);
    expect(openStrings(18, 'niagari')).toEqual([50, 57, 62]);
    expect(openStrings(18, 'sansagari')).toEqual([50, 55, 60]);
  });
  it('糸と勘所の自動選択は勘所の数字が小さい糸', () => {
    expect(fingeringFor(62, 18, 'honchoshi')).toEqual({ string: 2, pos: 0 });
    expect(fingeringFor(57, 18, 'honchoshi')).toEqual({ string: 1, pos: 2 });
    expect(fingeringFor(57, 18, 'honchoshi', 0)).toEqual({ string: 0, pos: 7 });
    expect(fingeringFor(40, 18, 'honchoshi')).toBeNull();
  });
});

describe('尺八', () => {
  it('琴古の名前', () => {
    expect(kinkoFor(62, 18)?.name).toBe('ロ');
    expect(kinkoFor(65, 18)?.name).toBe('ツ');
    expect(kinkoFor(68, 18)?.name).toBe('ウ');
    expect(kinkoFor(72, 18)?.name).toBe('リ');
    expect(kinkoFor(74, 18)).toMatchObject({ name: 'ロ', register: '甲' });
    expect(kinkoFor(84, 18)?.name).toBe('ヒ');
    expect(kinkoFor(86, 18)).toMatchObject({ name: 'ハ', register: '大甲' });
    expect(kinkoFor(60, 20)?.name).toBe('ロ');
  });
  it('フォントの文字：乙ロ＝C、甲ロ＝O', () => {
    expect(kinkoGlyph(0, 'tachibana')).toBe('C');
    expect(kinkoGlyph(12, 'tachibana')).toBe('O');
    expect(kinkoGlyph(24, 'tachibana')).toBe('a');
    expect(kinkoGlyph(0, 'senshu')).toBe('C');
    expect(kinkoGlyph(12, 'senshu')).toBe('C');
    for (const n of KINKO_NOTES) {
      expect(kinkoGlyph(n.rel, 'tachibana')).not.toBeNull();
      expect(kinkoGlyph(n.rel, 'senshu')).not.toBeNull();
    }
  });
});

describe('ドレミ', () => {
  it('固定ドと移動ド', () => {
    expect(noteName(62)).toBe('レ');
    expect(noteName(62, 'cde', true)).toBe('D4');
    expect(movableName(62, 2)).toBe('ド');
    expect(movableName(66, 2)).toBe('ミ');
    expect(movableName(65, 2)).toBe('レ♯');
  });
});

