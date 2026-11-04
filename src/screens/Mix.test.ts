import { describe, expect, it } from 'vitest';
import { kindOf, makeQueue } from './Mix';

describe('ミックス（5.9）', () => {
  it('解いたことのある入口から10問。同じ種類が続かない', () => {
    for (let k = 0; k < 50; k++) {
      const q = makeQueue(['practice', 'dungeon'], 10);
      expect(q).toHaveLength(10);
      expect(new Set(q).size).toBe(10);
      q.slice(1).forEach((it, i) => expect(kindOf(it)).not.toBe(kindOf(q[i])));
    }
  });
  it('解いたことのない入口からは出さない', () => {
    expect(makeQueue(['practice'], 10).every((it) => it.entry === 'practice')).toBe(true);
    const q = makeQueue(['practice'], 10);
    expect(q).toHaveLength(10);
    q.slice(1).forEach((it, i) => expect(kindOf(it)).not.toBe(kindOf(q[i])));
  });
});
