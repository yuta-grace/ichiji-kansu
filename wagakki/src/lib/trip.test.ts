import { it, expect } from 'vitest';
import { newSong, addTuplet, writeAt, withEvents, tupletAt } from './score';
import { beatGrid, beatGroups } from './notation';

it('4分音符の3連は2拍をまとめて3つのマスにする', () => {
  let p = newSong('shamisen').parts[0];
  let t = 0;
  for (let i = 0; i < 3; i++) {
    const inside = tupletAt(p.tuplets, t);
    if (!inside) p = addTuplet(p, t, 960);
    p = withEvents(p, writeAt(p.events, t, 320, { midi: 60 + i }));
    t += 320;
  }
  const gs = beatGroups([p.tuplets], 0, 4);
  expect(gs).toEqual([{ first: 0, beats: 2 }, { first: 2, beats: 1 }, { first: 3, beats: 1 }]);
  const g = beatGrid(p.events, 0, 960, 2);
  expect(g.div).toBe(3);
  expect(g.slots.map((s) => s.kind)).toEqual(['note', 'note', 'note']);
});

it('拍の途中から始まる3連はまとめない', () => {
  expect(beatGroups([[{ start: 240, span: 960 }]], 0, 4).every((g) => g.beats === 1)).toBe(true);
});
