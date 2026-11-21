// 楽譜の表示：編集中のパートの楽器の表記で全パートを書く
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../context';
import { noteName } from '../lib/pitch';
import { fingeringFor, POSITION_LABELS } from '../lib/shamisen';
import { kinkoFor } from '../lib/shakuhachi';
import type { Beat, Part, Slot, Song } from '../lib/score';
import { KinkoText } from '../components/KinkoText';

export interface Cursor {
  part: number;
  beat: number;
  slot: number;
}


export const PART_COLORS = ['#415f91', '#8f4c38', '#3b6939', '#6b5778', '#7c5800', '#006a6a', '#984061', '#5b5f71'];

export function ScoreView({
  song,
  editIdx,
  cursor,
  playBeat,
  onSelect,
  printMode,
}: {
  song: Song;
  editIdx: number;
  cursor: Cursor | null;
  playBeat: number | null;
  onSelect: (c: Cursor) => void;
  printMode?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const narrow = width < 520;
  const BEAT_W = printMode ? 44 : narrow ? 52 : 60;
  const LABEL_W = narrow ? 58 : 76;
  const edit = song.parts[editIdx] ?? song.parts[0];
  const bpm = song.beatsPerMeasure;
  const measureW = bpm * BEAT_W + 8;
  const usable = printMode ? 700 : width; // 印刷では A4 の幅に合わせる
  const perLine = Math.max(1, Math.floor((usable - LABEL_W - 4) / measureW));
  const lines: number[][] = [];
  for (let m = 0; m < song.measures; m += perLine) {
    lines.push(Array.from({ length: Math.min(perLine, song.measures - m) }, (_, i) => m + i));
  }
  const playIdx = playBeat === null ? null : Math.floor(playBeat);

  return (
    <div className={`score${printMode ? ' print' : ''}`} ref={ref}>
      {lines.map((ms, li) => (
        <div className="system" key={li}>
          <div className="system-labels" style={{ width: LABEL_W }}>
            <div className="measure-num-spacer" />
            {song.parts.map((p, pi) => (
              <div key={p.id} className={`row-label ${edit.instrument}${pi === editIdx ? ' editing' : ''}${p.muted ? ' muted' : ''}`}>
                <span className="swatch" style={{ background: PART_COLORS[pi % PART_COLORS.length] }} />
                <span className="row-label-text">{p.name || `パート${pi + 1}`}</span>
              </div>
            ))}
          </div>
          {ms.map((m) => (
            <div className="measure" key={m} style={{ width: measureW }}>
              <div className="measure-num">{m + 1}</div>
              {song.parts.map((p, pi) => (
                <div key={p.id} className={`row ${edit.instrument}${pi === editIdx ? ' editing' : ''}${p.muted ? ' muted' : ''}`}>
                  {edit.instrument === 'shamisen' && <div className="bunka-lines" aria-hidden="true" />}
                  {Array.from({ length: bpm }, (_, bi) => {
                    const beatIdx = m * bpm + bi;
                    const beat = p.beats[beatIdx];
                    return (
                      <BeatCell
                        key={bi}
                        width={BEAT_W}
                        beat={beat}
                        part={p}
                        edit={edit}
                        playing={playIdx === beatIdx}
                        cursorSlot={cursor && cursor.part === pi && cursor.beat === beatIdx ? cursor.slot : null}
                        onSelect={(slot) => onSelect({ part: pi, beat: beatIdx, slot })}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function BeatCell({
  width,
  beat,
  part,
  edit,
  playing,
  cursorSlot,
  onSelect,
}: {
  width: number;
  beat: Beat;
  part: Part;
  edit: Part;
  playing: boolean;
  cursorSlot: number | null;
  onSelect: (slot: number) => void;
}) {
  return (
    <div className={`beat div${beat.div}${playing ? ' playing' : ''}`} style={{ width }}>
      {beat.slots.map((s, si) => (
        <button
          key={si}
          type="button"
          className={`slot${cursorSlot === si ? ' cursor' : ''}`}
          onClick={() => onSelect(si)}
        >
          <SlotMark slot={s} part={part} edit={edit} />
        </button>
      ))}
      {beat.div > 1 && (
        <span className={`beat-bar bars${beat.div === 4 ? 2 : 1}`} aria-hidden="true">
          {beat.div === 3 && <span className="triplet">3</span>}
        </span>
      )}
    </div>
  );
}

function SlotMark({ slot, part, edit }: { slot: Slot; part: Part; edit: Part }) {
  const { settings } = useApp();
  if (!slot) return null;
  const sham = edit.instrument === 'shamisen';
  if (slot.k === 'r') return <span className={`mark rest${sham ? ' on-line1' : ''}`}>○</span>;
  if (slot.k === 'x') return <span className={`mark ext${sham ? ' on-line1' : ''}`}>ー</span>;
  // 同じ楽器ならそのパート自身の寸法・調弦、違う楽器なら編集中のパートを基準にする
  const ref = part.instrument === edit.instrument ? part : edit;
  if (sham) {
    const f = fingeringFor(slot.midi, ref.sun, ref.tuning, part.instrument === 'shamisen' ? slot.str : undefined);
    if (!f) return <span className="mark out">{noteName(slot.midi, settings.nameStyle)}</span>;
    // 線の位置：0＝上の線
    const line = settings.bunkaTop === 'san' ? 2 - f.string : f.string;
    return <span className={`mark pos on-line${line}`}>{POSITION_LABELS[f.pos]}</span>;
  }
  const k = kinkoFor(slot.midi, ref.sun);
  if (!k) return <span className="mark out">{noteName(slot.midi, settings.nameStyle)}</span>;
  return (
    <span className="mark kin">
      <KinkoText note={k} />
    </span>
  );
}
