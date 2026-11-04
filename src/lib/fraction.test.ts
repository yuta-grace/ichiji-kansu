import { describe, expect, it } from 'vitest';
import { checkNumber } from './answer';
import { frac, parseAnswer, toString } from './fraction';
import { snap } from './graphMath';
import { applyKey } from '../components/NumberPad';

describe('parseAnswer', () => {
  it('整数・負の数', () => {
    expect(toString(parseAnswer('12')!.value)).toBe('12');
    expect(toString(parseAnswer('-3')!.value)).toBe('-3');
    expect(toString(parseAnswer('−3')!.value)).toBe('-3');
  });
  it('分数。約分していない分数は印をつける', () => {
    expect(parseAnswer('2/3')).toEqual({ value: frac(2, 3), unreduced: false });
    expect(parseAnswer('4/6')).toEqual({ value: frac(2, 3), unreduced: true });
    expect(parseAnswer('-4/2')).toEqual({ value: frac(-2), unreduced: true });
    expect(parseAnswer('1/0')).toBeNull();
  });
  it('小数', () => {
    expect(toString(parseAnswer('0.5')!.value)).toBe('1/2');
    expect(toString(parseAnswer('-1.25')!.value)).toBe('-5/4');
  });
  it('読めないもの', () => {
    expect(parseAnswer('1/2/3')).toBeNull();
    expect(parseAnswer('2/')).toBeNull();
    expect(parseAnswer('1 1/2'.replace(' ', 'x'))).toBeNull();
  });
});

describe('checkNumber（6章 答えの判定）', () => {
  it('同じ値の小数・約分していない分数を正解にする', () => {
    expect(checkNumber('0.5', frac(1, 2)).verdict).toBe('ok');
    expect(checkNumber('2/4', frac(1, 2)).verdict).toBe('ok-unreduced');
    expect(checkNumber('3', 2).verdict).toBe('wrong');
    expect(checkNumber('', 2).verdict).toBe('empty');
    expect(checkNumber('-', 2).verdict).toBe('empty');
  });
});

describe('applyKey', () => {
  it('負号は先頭で切りかえる', () => {
    expect(applyKey('3', '-')).toBe('-3');
    expect(applyKey('-3', '-')).toBe('3');
  });
  it('分数の線と小数点は1つまで、数字の後だけ', () => {
    expect(applyKey('', '/')).toBe('');
    expect(applyKey('2', '/')).toBe('2/');
    expect(applyKey('2/3', '/')).toBe('2/3');
    expect(applyKey('2/3', '.')).toBe('2/3');
    expect(applyKey('0', '.')).toBe('0.');
  });
});

describe('snap（一番近い格子点）', () => {
  const r = { xMin: 0, xMax: 6, yMin: 0, yMax: 16 };
  it('四捨五入して範囲内に収める', () => {
    expect(snap({ x: 1.4, y: 5.6 }, r)).toEqual({ x: 1, y: 6 });
    expect(snap({ x: -0.8, y: 20 }, r)).toEqual({ x: 0, y: 16 });
  });
});
