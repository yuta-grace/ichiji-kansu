// 五線譜の表示（VexFlow で描く）。音符を押すと、その時刻にカーソルが移る
import { useEffect, useRef, useState } from 'react';
import { loadVexFlow, type VexFlow } from '../lib/libs';
import { measureItems, spell, type Item } from '../lib/notation';
import { measureLen, type Song } from '../lib/score';
import { instrumentDef } from '../lib/instruments';
import { PART_COLORS, type ViewProps } from './ScoreView';

const STAFF_H = 96; // 1段の高さ
const TOP = 18;
const LABEL_W = 64;

interface Hit {
  x: number;
  t: number;
}

export function StaffView({ song, editIdx, cursor, selection, playBeat, onSelect, printMode }: ViewProps) {
  const [vf, setVf] = useState<VexFlow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);

  useEffect(() => {
    let alive = true;
    loadVexFlow()
      .then((m) => alive && setVf(m))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const playT = playBeat === null ? null : playBeat * 480;
  const lines = vf ? layout(song, printMode ? 720 : width) : [];

  return (
    <div className={`score staff${printMode ? ' print' : ''}`} ref={ref}>
      {error && <p className="hint">{error}</p>}
      {!vf && !error && <p className="hint">五線譜を準備しています…</p>}
      {vf &&
        lines.map((ms, li) => (
          <StaffLine
            key={li}
            vf={vf}
            song={song}
            measures={ms.measures}
            widths={ms.widths}
            editIdx={editIdx}
            cursor={cursor}
            selection={selection}
            playT={playT}
            onSelect={onSelect}
          />
        ))}
    </div>
  );
}

/** 小節の幅を音符の数から決め、行に詰める */
function layout(song: Song, width: number): { measures: number[]; widths: number[] }[] {
  const mLen = measureLen(song);
  const usable = Math.max(240, width - LABEL_W - 16);
  const base = (m: number) => {
    const n = Math.max(...song.parts.map((p) => measureItems(p.events, m * mLen, mLen, p.tuplets).items.length));
    return 36 + n * 30;
  };
  const lines: { measures: number[]; widths: number[] }[] = [];
  let cur: number[] = [];
  let curW: number[] = [];
  let used = 0;
  for (let m = 0; m < song.measures; m++) {
    const w = base(m) + (cur.length === 0 ? 70 : 0) + (m === 0 ? 30 : 0);
    if (cur.length && used + w > usable) {
      lines.push({ measures: cur, widths: curW });
      cur = [];
      curW = [];
      used = 0;
      m--;
      continue;
    }
    cur.push(m);
    curW.push(w);
    used += w;
  }
  if (cur.length) lines.push({ measures: cur, widths: curW });
  // 行の幅いっぱいに広げる
  return lines.map((l) => {
    const sum = l.widths.reduce((a, b) => a + b, 0);
    const k = Math.min(1.8, usable / sum);
    return { measures: l.measures, widths: l.widths.map((w) => Math.floor(w * k)) };
  });
}

function StaffLine({
  vf,
  song,
  measures,
  widths,
  editIdx,
  cursor,
  selection,
  playT,
  onSelect,
}: {
  vf: VexFlow;
  song: Song;
  measures: number[];
  widths: number[];
  editIdx: number;
  cursor: ViewProps['cursor'];
  selection: ViewProps['selection'];
  playT: number | null;
  onSelect: ViewProps['onSelect'];
}) {
  const box = useRef<HTMLDivElement>(null);
  const hits = useRef<Hit[][]>([]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.innerHTML = '';
    const css = getComputedStyle(document.documentElement);
    const ink = css.getPropertyValue('--ink').trim() || '#000';
    const accent = css.getPropertyValue('--primary').trim() || '#415f91';
    const lit = css.getPropertyValue('--lit-strong').trim() || '#e8643c';
    const totalW = widths.reduce((a, b) => a + b, 0) + 10;
    const height = TOP + song.parts.length * STAFF_H + 26; // 下向きの符尾の3連符の数字が切れないように
    const renderer = new vf.Renderer(el, vf.Renderer.Backends.SVG);
    renderer.resize(totalW, height);
    const ctx = renderer.getContext();
    ctx.setFillStyle(ink);
    ctx.setStrokeStyle(ink);
    const mLen = measureLen(song);
    hits.current = song.parts.map(() => []);

    song.parts.forEach((p, pi) => {
      const y = TOP + pi * STAFF_H;
      const shamisen = instrumentDef(p.instrument).clef === 'treble8vb';
      let x = 0;
      let prevNote: InstanceType<VexFlow['StaveNote']> | null = null;
      let prevTieOpen = false;
      measures.forEach((m, mi) => {
        const w = widths[mi];
        const stave = new vf.Stave(x, y, w);
        if (mi === 0) stave.addClef('treble', 'default', shamisen ? '8vb' : undefined);
        if (m === 0) stave.addTimeSignature(`${song.beatsPerMeasure}/4`);
        stave.setContext(ctx).draw();
        const { items, tuplets } = measureItems(p.events, m * mLen, mLen, p.tuplets);
        const notes = items.map((it) => makeNote(vf, it, shamisen));
        items.forEach((it, i) => {
          const t = m * mLen + it.start;
          const inCursor = cursor?.part === pi && cursor.t >= t && cursor.t < t + it.ticks;
          const inSel = selection?.part === pi && t >= selection.a && t < selection.b;
          const playing = playT !== null && playT >= t && playT < t + it.ticks && it.midi !== undefined;
          const color = playing ? lit : inCursor || inSel ? accent : null;
          if (color) notes[i].setStyle({ fillStyle: color, strokeStyle: color });
        });
        const tps = tuplets.map((g) => new vf.Tuplet(notes.slice(g.first, g.last + 1), { num_notes: 3, notes_occupied: 2, ratioed: false }));
        const voice = new vf.Voice({ num_beats: song.beatsPerMeasure, beat_value: 4 }).setMode(vf.Voice.Mode.SOFT);
        voice.addTickables(notes);
        vf.Accidental.applyAccidentals([voice], 'C');
        const beams = vf.Beam.generateBeams(notes.filter((n) => !n.isRest()));
        new vf.Formatter().joinVoices([voice]).format([voice], Math.max(20, w - (stave.getNoteStartX() - x) - 12));
        voice.draw(ctx, stave);
        beams.forEach((b) => b.setContext(ctx).draw());
        tps.forEach((tp) => tp.setContext(ctx).draw());
        // タイ
        items.forEach((it, i) => {
          if (it.tieStop) {
            const tie = new vf.StaveTie({
              first_note: prevTieOpen ? prevNote : null,
              last_note: notes[i],
              first_indices: [0],
              last_indices: [0],
            });
            tie.setContext(ctx).draw();
          }
          prevNote = notes[i];
          prevTieOpen = it.tieStart;
          hits.current[pi].push({ x: notes[i].getAbsoluteX(), t: m * mLen + it.start });
        });
        x += w;
      });
      // 行の終わりで続くタイ
      if (prevTieOpen && prevNote) {
        new vf.StaveTie({ first_note: prevNote, last_note: null, first_indices: [0], last_indices: [0] }).setContext(ctx).draw();
      }
    });
  }, [vf, song, measures, widths, editIdx, cursor, selection, playT]);

  const click = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = box.current!.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const pi = Math.max(0, Math.min(song.parts.length - 1, Math.floor((y - TOP + 20) / STAFF_H)));
    const row = hits.current[pi];
    if (!row?.length) return;
    let best = row[0];
    for (const h of row) if (Math.abs(h.x - x) < Math.abs(best.x - x)) best = h;
    onSelect(pi, best.t, e.shiftKey);
  };

  return (
    <div className="staff-line" data-block>
      <div className="staff-labels" style={{ width: LABEL_W }}>
        {song.parts.map((p, pi) => (
          <div key={p.id} className={`staff-label${pi === editIdx ? ' editing' : ''}${p.muted ? ' muted' : ''}`} style={{ top: TOP + pi * STAFF_H + 24 }}>
            <span className="swatch" style={{ background: PART_COLORS[pi % PART_COLORS.length] }} />
            <span className="row-label-text">{p.name || `パート${pi + 1}`}</span>
          </div>
        ))}
      </div>
      <div className="staff-svg" ref={box} onClick={click} role="presentation" />
    </div>
  );
}

function makeNote(vf: VexFlow, it: Item, shamisen: boolean) {
  const dur = it.value + (it.midi === undefined ? 'r' : '');
  let key = 'b/4';
  if (it.midi !== undefined) {
    // 三味線はギターと同じく1オクターブ上に書く
    const sp = spell(it.midi + (shamisen ? 12 : 0));
    key = `${sp.step.toLowerCase()}${sp.alter ? '#' : ''}/${sp.octave}`;
  }
  const n = new vf.StaveNote({ keys: [key], duration: dur, dots: it.dots, auto_stem: true });
  if (it.dots) vf.Dot.buildAndAttach([n], { all: true });
  return n;
}
