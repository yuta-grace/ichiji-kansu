// 楽譜の表示。表記は「文化譜（横）」「琴古譜（縦）」「五線譜」のどれでも、同じ曲のデータから書く。
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useApp } from '../context';
import { noteName } from '../lib/pitch';
import { fingeringFor, POSITION_LABELS } from '../lib/shamisen';
import { kinkoFor } from '../lib/shakuhachi';
import { beatGrid, lastNoteEnd, type GridSlot } from '../lib/notation';
import { PPQ, type Part, type Song } from '../lib/score';
import { KinkoText } from '../components/KinkoText';
import { StaffView } from './StaffView';
import { measureDecor, type Decor } from '../lib/marks';

export type ScoreNotation = 'bunka' | 'kinko' | 'staff';

export interface Cursor {
  part: number;
  t: number;
}

export interface Selection {
  part: number;
  a: number;
  b: number;
}

export const PART_COLORS = ['#415f91', '#8f4c38', '#3b6939', '#6b5778', '#7c5800', '#006a6a', '#984061', '#5b5f71'];

export interface ViewProps {
  song: Song;
  notation: ScoreNotation;
  editIdx: number;
  cursor: Cursor | null;
  selection: Selection | null;
  playBeat: number | null;
  onSelect: (part: number, t: number, extend: boolean) => void;
  printMode?: boolean;
}

/** 別の楽器のパートを、この表記で書くときの基準（寸法・調弦） */
export function referenceFor(song: Song, editIdx: number, notation: ScoreNotation, p: Part): Part {
  const want = notation === 'bunka' ? 'shamisen' : notation === 'kinko' ? 'shakuhachi' : null;
  if (!want || p.instrument === want) return p;
  const edit = song.parts[editIdx];
  if (edit?.instrument === want) return edit;
  return song.parts.find((x) => x.instrument === want) ?? { ...p, tuning: 'honchoshi' };
}

function chunk(total: number, per: number): number[][] {
  const lines: number[][] = [];
  for (let m = 0; m < total; m += per) lines.push(Array.from({ length: Math.min(per, total - m) }, (_, i) => m + i));
  return lines;
}

export function ScoreView(props: ViewProps) {
  if (props.notation === 'staff') return <StaffView {...props} />;
  return props.notation === 'kinko' ? <VerticalScore {...props} /> : <HorizontalScore {...props} />;
}

// ---------------- 横書き（文化譜） ----------------

function HorizontalScore({ song, editIdx, cursor, selection, playBeat, onSelect, printMode }: ViewProps) {
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
  const bpm = song.beatsPerMeasure;
  const measureW = bpm * BEAT_W + 8;
  const usable = printMode ? 700 : width;
  const perLine = Math.max(1, Math.floor((usable - LABEL_W - 4) / measureW));
  const ends = song.parts.map((p) => lastNoteEnd(p.events));

  return (
    <div className={`score horizontal${printMode ? ' print' : ''}`} ref={ref}>
      {chunk(song.measures, perLine).map((ms, li) => (
        <div className="system" key={li} data-block>
          <div className="system-labels" style={{ width: LABEL_W }}>
            <div className="measure-num-spacer" />
            {song.parts.map((p, pi) => (
              <div key={p.id} className={`row-label shamisen${pi === editIdx ? ' editing' : ''}${p.muted ? ' muted' : ''}`}>
                <span className="swatch" style={{ background: PART_COLORS[pi % PART_COLORS.length] }} />
                <span className="row-label-text">{p.name || `パート${pi + 1}`}</span>
              </div>
            ))}
          </div>
          {ms.map((m) => {
            const d = measureDecor(song, m);
            return (
            <div className={`measure${d.repStart ? ' rep-start' : ''}${d.repEnd ? ' rep-end' : ''}`} key={m} style={{ width: measureW }}>
              <MeasureHead m={m} d={d} />
              {song.parts.map((p, pi) => (
                <div key={p.id} className={`row shamisen${p.muted ? ' muted' : ''}`}>
                  <div className="bunka-lines" aria-hidden="true" />
                  {d.repStart && <span className="rep-dots start" aria-hidden="true" />}
                  {d.repEnd > 0 && <span className="rep-dots end" aria-hidden="true" />}
                  {Array.from({ length: bpm }, (_, bi) => {
                    const beat = m * bpm + bi;
                    return (
                      <BeatCell
                        key={bi}
                        size={BEAT_W}
                        song={song}
                        editIdx={editIdx}
                        notation="bunka"
                        part={p}
                        pi={pi}
                        beatStart={beat * PPQ}
                        lastEnd={ends[pi]}
                        playing={playBeat !== null && Math.floor(playBeat) === beat}
                        cursor={cursor}
                        selection={selection}
                        onSelect={onSelect}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/** 小節の上の帯：小節番号・セーニョ・コーダ・番括弧・終わりの指示 */
function MeasureHead({ m, d }: { m: number; d: Decor }) {
  return (
    <div className="measure-num">
      {d.volta && <span className={`volta${d.volta.start ? ' start' : ''}${d.volta.end ? ' end' : ''}`}>{d.volta.start ? d.volta.label : ''}</span>}
      <span className="m-left">
        {m + 1}
        {d.segno && <span className="music-glyph" title="セーニョ">𝄋</span>}
        {d.coda && <span className="music-glyph" title="コーダ">𝄌</span>}
        {d.repEnd > 2 && <span className="rep-times">×{d.repEnd}</span>}
      </span>
      {d.right.length > 0 && <span className="m-right">{d.right.join('　')}</span>}
    </div>
  );
}

// ---------------- 縦書き（琴古譜） ----------------

function VerticalScore({ song, editIdx, cursor, selection, playBeat, onSelect, printMode }: ViewProps) {
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
  const HEAD_H = 52;
  const bpm = song.beatsPerMeasure;
  const measureH = bpm * BEAT_H + 1;
  const usable = printMode ? 940 : height - 24;
  const perLine = Math.max(1, Math.floor((usable - HEAD_H - 20) / measureH));
  const lines = chunk(song.measures, perLine);
  const ends = song.parts.map((p) => lastNoteEnd(p.events));

  // 縦譜は右から読むので、最初は右端を見せる
  useLayoutEffect(() => {
    const scroller = ref.current?.parentElement;
    if (scroller && !printMode) scroller.scrollLeft = scroller.scrollWidth;
  }, [printMode]);

  const cursorLine = cursor ? Math.floor(cursor.t / PPQ / bpm / perLine) : -1;
  useEffect(() => {
    if (cursorLine < 0 || printMode) return;
    ref.current?.querySelector(`[data-line="${cursorLine}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [cursorLine, printMode]);

  return (
    <div className={`score vertical${printMode ? ' print' : ''}`} ref={ref}>
      {lines.map((ms, li) => (
        <div className="vsystem" key={li} data-line={li} data-block>
          <div className="vnums" aria-hidden="true">
            <div style={{ height: HEAD_H }} />
            {ms.map((m) => {
              const d = measureDecor(song, m);
              return (
                <div key={m} className={`vnum${d.volta ? ' in-volta' : ''}${d.volta?.start ? ' volta-start' : ''}`} style={{ height: measureH }}>
                  <span>{m + 1}</span>
                  {d.volta?.start && <span className="vmark">{d.volta.label}</span>}
                  {d.segno && <span className="music-glyph vmark">𝄋</span>}
                  {d.coda && <span className="music-glyph vmark">𝄌</span>}
                  {d.repEnd > 2 && <span className="vmark">×{d.repEnd}</span>}
                  {d.right.length > 0 && <span className="vmark vtext">{d.right.join('　')}</span>}
                </div>
              );
            })}
          </div>
          {song.parts.map((p, pi) => (
            <div key={p.id} className={`vcol${pi === editIdx ? ' editing' : ''}${p.muted ? ' muted' : ''}`}>
              <div className="vhead" style={{ height: HEAD_H }}>
                <span className="swatch" style={{ background: PART_COLORS[pi % PART_COLORS.length] }} />
                <span className="vhead-text">{p.name || `パート${pi + 1}`}</span>
              </div>
              {ms.map((m) => {
                const d = measureDecor(song, m);
                return (
                <div key={m} className={`vmeasure${d.repStart ? ' rep-start' : ''}${d.repEnd ? ' rep-end' : ''}`} style={{ height: measureH }}>
                  {d.repStart && <span className="rep-dots start" aria-hidden="true" />}
                  {d.repEnd > 0 && <span className="rep-dots end" aria-hidden="true" />}
                  {Array.from({ length: bpm }, (_, bi) => {
                    const beat = m * bpm + bi;
                    return (
                      <BeatCell
                        key={bi}
                        vertical
                        size={BEAT_H}
                        song={song}
                        editIdx={editIdx}
                        notation="kinko"
                        part={p}
                        pi={pi}
                        beatStart={beat * PPQ}
                        lastEnd={ends[pi]}
                        playing={playBeat !== null && Math.floor(playBeat) === beat}
                        cursor={cursor}
                        selection={selection}
                        onSelect={onSelect}
                      />
                    );
                  })}
                </div>
                );
              })}
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
  song,
  editIdx,
  notation,
  part,
  pi,
  beatStart,
  lastEnd,
  playing,
  cursor,
  selection,
  onSelect,
}: {
  size: number;
  vertical?: boolean;
  song: Song;
  editIdx: number;
  notation: 'bunka' | 'kinko';
  part: Part;
  pi: number;
  beatStart: number;
  lastEnd: number;
  playing: boolean;
  cursor: Cursor | null;
  selection: Selection | null;
  onSelect: (part: number, t: number, extend: boolean) => void;
}) {
  const grid = beatGrid(part.events, beatStart, lastEnd);
  const ref = referenceFor(song, editIdx, notation, part);
  const bars = grid.div === 1 ? 0 : grid.div === 2 || grid.div === 3 ? 1 : grid.div === 4 || grid.div === 6 ? 2 : 3;
  return (
    <div className={`beat div${grid.div}${playing ? ' playing' : ''}`} style={vertical ? { height: size } : { width: size }}>
      {grid.slots.map((s) => {
        const isCursor = cursor?.part === pi && cursor.t >= s.t && cursor.t < s.t + s.len;
        const isSel = selection?.part === pi && s.t >= selection.a && s.t < selection.b;
        return (
          <button
            key={s.t}
            type="button"
            className={`slot${isCursor ? ' cursor' : ''}${isSel ? ' selected' : ''}`}
            onClick={(e) => onSelect(pi, s.t, e.shiftKey)}
          >
            <SlotMark slot={s} part={part} ref_={ref} notation={notation} vertical={vertical} slotSize={size / grid.div} />
          </button>
        );
      })}
      {bars > 0 && (
        <span className={`beat-bar bars${bars}`} aria-hidden="true">
          {grid.div % 3 === 0 && <span className="triplet">3</span>}
        </span>
      )}
    </div>
  );
}

function SlotMark({
  slot,
  part,
  ref_,
  notation,
  vertical,
  slotSize,
}: {
  slot: GridSlot;
  part: Part;
  ref_: Part;
  notation: 'bunka' | 'kinko';
  vertical?: boolean;
  slotSize: number;
}) {
  const { settings, kinkoFont } = useApp();
  const sham = notation === 'bunka';
  if (slot.kind === 'blank') return null;
  if (slot.kind === 'rest') return <span className={`mark rest${sham ? ' on-line1' : ''}`}>○</span>;
  if (slot.kind === 'cont') return <span className={`mark ext${sham ? ' on-line1' : ''}`}>{vertical ? '｜' : 'ー'}</span>;
  const midi = slot.ev!.midi!;
  if (sham) {
    const f = fingeringFor(midi, ref_.sun, ref_.tuning, part.instrument === 'shamisen' ? slot.ev!.str : undefined);
    if (!f) return <span className="mark out">{noteName(midi, settings.nameStyle)}</span>;
    const line = settings.bunkaTop === 'san' ? 2 - f.string : f.string;
    return <span className={`mark pos on-line${line}`}>{POSITION_LABELS[f.pos]}</span>;
  }
  const k = kinkoFor(midi, ref_.sun);
  if (!k) return <span className="mark out">{noteName(midi, settings.nameStyle)}</span>;
  const reg = k.register === '乙' ? 0 : 11;
  const size = !vertical
    ? undefined
    : kinkoFont
      ? Math.min(22, slotSize - 4 - reg) / 1.15
      : Math.max(8, Math.min(20, (slotSize - 6 - reg) / k.name.length));
  return (
    <span className="mark kin">
      <KinkoText note={k} size={size} />
    </span>
  );
}
