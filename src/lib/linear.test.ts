import { describe, expect, it } from 'vitest';
import { frac } from './fraction';
import { eqText, lineThrough, linear, onLine } from './linear';
import { moveSameTypeCloser } from './practiceOrder';

describe('linear', () => {
  it('2点を通る直線', () => {
    expect(lineThrough({ x: 0, y: 1 }, { x: 3, y: 3 })).toEqual({ a: frac(2, 3), b: frac(1) });
    expect(lineThrough({ x: 1, y: 1 }, { x: 1, y: 4 })).toBeNull();
  });
  it('点が直線上にあるか', () => {
    expect(onLine(linear('2/3', '1'), { x: 3, y: 3 })).toBe(true);
    expect(onLine(linear('2/3', '1'), { x: 1, y: 2 })).toBe(false);
  });
  it('式の表示', () => {
    expect(eqText(linear('2', '1'))).toBe('y ＝ 2x ＋ 1');
    expect(eqText(linear('-1', '4'))).toBe('y ＝ −x ＋ 4');
    expect(eqText(linear('3', '-2'))).toBe('y ＝ 3x − 2');
    expect(eqText(linear('2/3', '0'))).toBe('y ＝ [2/3]x');
    expect(eqText(linear('-2/3', '-1/2'))).toBe('y ＝ −[2/3]x − [1/2]');
  });
});

describe('moveSameTypeCloser（同じ種類の問題を後でもう一度）', () => {
  const t = (id: string) => id[0];
  it('次の同じ種類の問題を、間に1問はさんだ位置まで近づける', () => {
    expect(moveSameTypeCloser(['A1', 'B1', 'C1', 'B2', 'A2', 'C2'], 0, t, 2)).toEqual(['A1', 'B1', 'A2', 'C1', 'B2', 'C2']);
  });
  it('すでに近ければ動かさない。残っていなければそのまま（問題は増やさない）', () => {
    expect(moveSameTypeCloser(['A1', 'A2', 'B1'], 0, t, 2)).toEqual(['A1', 'A2', 'B1']);
    expect(moveSameTypeCloser(['A1', 'B1'], 0, t, 2)).toEqual(['A1', 'B1']);
  });
});
