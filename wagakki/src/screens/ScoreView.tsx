// 楽譜の表示：編集中のパートの楽器の表記で全パートを書く
// 三味線：横書きの文化譜（3本の線）。尺八：縦書きの琴古譜（右の行から左へ、上から下へ読む）
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
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

interface ViewProps {
  song: Song;
  editIdx: number;
  cursor: Cursor | null;
  playBeat: number | null;
  onSelect: (c: Cursor) => void;
  printMode?: boolean;
}

function chunk(total: number, per: number): number[][] {
  const lines: number[][] = [];
  for (let m = 0; m < total; m += per) lines.push(Array.from({ length: Math.min(per, total - m) }, (_, i) => m + i));
  return lines;
}

export function ScoreView(props: ViewProps) {
  const edit = props.song.parts[props.editIdx] ?? props.song.parts[0];
  return edit.instrument === 'shakuhachi' ? <VerticalScore {...props} /> : <HorizontalScore {...props} />;
}

// ---------------- 横書き（文化譜） ----------------

function HorizontalScore({ song, editIdx, cursor, playBeat, onSelect, printMode }: ViewProps) {
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
  const playIdx = playBeat === null ? null : Math.floor(playBeat);

  return (
    <div className={`score horizontal${printMode ? ' print' : ''}`} ref={ref}>
      {chunk(song.measures, perLine).map((ms, li) => (
        <div className="system" key={li}>
          <div className="system-labels" style={{ width: LABEL_W }}>
            <div className="measure-num-spacer" />
            {song.parts.map((p, pi) => (
              <div key={p.id} className={`row-label shamisen${pi === editIdx ? ' editing' : ''}${p.muted ? ' muted' : ''}`}>
                <span className="swatch" style={{ background: PART_COLORS[pi % PART_COLORS.length] }} />
                <span className="row-label-text">{p.name || `パート${pi + 1}`}</span>
              </div>
            ))}
          </div>
          {ms.map((m) => (
            <div className="measure" key={m} style={{ width: measureW }}>
              <div className="measure-num">{m + 1}</div>
              {song.parts.map((p, pi) => (
                <div key={p.id} className={`row shamisen${p.muted ? ' muted' : ''}`}>
                  <div className="bunka-lines" aria-hidden="true" />
                  {Array.from({ length: bpm }, (_, bi) => {
                    const beatIdx = m * bpm + bi;
                    return (
                      <BeatCell
                        key={bi}
                        size={BEAT_W}
                        beat={p.beats[beatIdx]}
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

// ---------------- 縦書き（琴古譜） ----------------

function VerticalScore({ song, editIdx, cursor, playBeat, onSelect, printMode }: ViewProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(600);
  useEffect(() => {
    const scroller = ref.current?.parentElement;
    if (!scroller) return;
    const ro = new ResizeObserver(() => setHeight(scroller.clientHeight));
    ro.observe(scroller);
    setHeight(scroller.clientHeight);
    return () => ro.disconnect();
  }, []);

  const BEAT_H = printMode ? 46 : 60;
  const HEAD_H = 52; // パート名の欄
  const edit = song.parts[editIdx] ?? song.parts[0];
  const bpm = song.beatsPerMeasure;
  const measureH = bpm * BEAT_H + 1;
  const usable = printMode ? 940 : height - 24; // 印刷では A4 の高さに合わせる
  const perLine = Math.max(1, Math.floor((usable - HEAD_H - 20) / measureH));
  const lines = chunk(song.measures, perLine);
  const playIdx = playBeat === null ? null : Math.floor(playBeat);

  // 縦譜は右から読むので、最初は右端を見せる
  useLayoutEffect(() => {
    const scroller = ref.current?.parentElement;
    if (scroller && !printMode) scroller.scrollLeft = scroller.scrollWidth;
  }, [printMode]);

  // カーソルのある行が見えるようにする
  const cursorLine = cursor ? Math.floor(cursor.beat / bpm / perLine) : -1;
  useEffect(() => {
    if (cursorLine < 0 || printMode) return;
    const el = ref.current?.querySelector(`[data-line="${cursorLine}"]`);
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [cursorLine, printMode]);

  return (
    <div className={`score vertical${printMode ? ' print' : ''}`} ref={ref}>
      {lines.map((ms, li) => (
        <div className="vsystem" key={li} data-line={li}>
          <div className="vnums" aria-hidden="true">
            <div style={{ height: HEAD_H }} />
            {ms.map((m) => (
              <div key={m} className="vnum" style={{ height: measureH }}>
                {m + 1}
              </div>
            ))}
          </div>
          {song.parts.map((p, pi) => (
            <div key={p.id} className={`vcol${pi === editIdx ? ' editing' : ''}${p.muted ? ' muted' : ''}`}>
              <div className="vhead" style={{ height: HEAD_H }}>
                <span className="swatch" style={{ background: PART_COLORS[pi % PART_COLORS.length] }} />
                <span className="vhead-text">{p.name || `パート${pi + 1}`}</span>
              </div>
              {ms.map((m) => (
                <div key={m} className="vmeasure" style={{ height: measureH }}>
                  {Array.from({ length: bpm }, (_, bi) => {
                    const beatIdx = m * bpm + bi;
                    return (
                      <BeatCell
                        key={bi}
                        vertical
                        size={BEAT_H}
                        beat={p.beats[beatIdx]}
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

// ---------------- 拍とマス ----------------

function BeatCell({
  size,
  vertical,
  beat,
  part,
  edit,
  playing,
  cursorSlot,
  onSelect,
}: {
  size: number;
  vertical?: boolean;
  beat: Beat;
  part: Part;
  edit: Part;
  playing: boolean;
  cursorSlot: number | null;
  onSelect: (slot: number) => void;
}) {
  const slotSize = size / beat.div;
  return (
    <div className={`beat div${beat.div}${playing ? ' playing' : ''}`} style={vertical ? { height: size } : { width: size }}>
      {beat.slots.map((s, si) => (
        <button key={si} type="button" className={`slot${cursorSlot === si ? ' cursor' : ''}`} onClick={() => onSelect(si)}>
          <SlotMark slot={s} part={part} edit={edit} vertical={vertical} slotSize={slotSize} />
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

function SlotMark({ slot, part, edit, vertical, slotSize }: { slot: Slot; part: Part; edit: Part; vertical?: boolean; slotSize: number }) {
  const { settings, kinkoFont } = useApp();
  if (!slot) return null;
  const sham = edit.instrument === 'shamisen';
  if (slot.k === 'r') return <span className={`mark rest${sham ? ' on-line1' : ''}`}>○</span>;
  if (slot.k === 'x') return <span className={`mark ext${sham ? ' on-line1' : ''}`}>{vertical ? '｜' : 'ー'}</span>;
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
  // 縦書きでは、マスの高さに収まる文字の大きさにする
  const size = !vertical
    ? undefined
    : kinkoFont
      ? Math.min(22, slotSize - 4 - (k.register === '乙' ? 0 : 11)) / 1.15 // フォントの文字は1文字
      : Math.max(8, Math.min(20, (slotSize - 6 - (k.register === '乙' ? 0 : 11)) / k.name.length));
  return (
    <span className="mark kin">
      <KinkoText note={k} size={size} />
    </span>
  );
}
