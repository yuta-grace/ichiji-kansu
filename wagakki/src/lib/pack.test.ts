import { it, expect } from 'vitest';
import { newSong } from './score';
import { packLines } from '../screens/ScoreView';

it('書き出しでは1行の小節数を偶数にする（最後の行以外）', () => {
  const s = { ...newSong('shamisen'), measures: 13 };
  for (const usable of [250, 330, 420, 520, 700]) {
    const lines = packLines(s, usable, 30, 15, [0], true);
    lines.slice(0, -1).forEach((l) => expect(l.measures.length % 2 === 0 || l.measures.length === 1).toBe(true));
    expect(lines.flatMap((l) => l.measures)).toEqual(Array.from({ length: 13 }, (_, i) => i));
  }
});
