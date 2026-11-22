// 試聴：楽譜とは別に、音を並べて鳴らしてみる下書き（楽譜のデータには入らない）
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../context';
import { audio, playNote, type Voice } from '../audio/engine';
import { noteName } from '../lib/pitch';
import { fingeringFor, POSITION_LABELS, STRING_LABELS, type Tuning } from '../lib/shamisen';
import { kinkoFor } from '../lib/shakuhachi';
import type { Instrument } from '../lib/instruments';
import { IconButton } from './ui';

export interface ScratchNote {
  midi: number;
  str?: number;
}

/** 楽器の書き方での音の名前（三味線は糸と勘所、尺八は琴古の名前、ピアノは音名） */
export function scratchLabel(n: ScratchNote, inst: Instrument, sun: number, tuning: Tuning, nameStyle: 'doremi' | 'cde'): string {
  if (inst === 'shamisen') {
    const f = fingeringFor(n.midi, sun, tuning, n.str);
    if (f) return `${STRING_LABELS[f.string]}の糸 ${POSITION_LABELS[f.pos]}`;
  }
  if (inst === 'shakuhachi') {
    const k = kinkoFor(n.midi, sun);
    if (k) return `${k.register === '乙' ? '' : k.register}${k.name}`;
  }
  return noteName(n.midi, nameStyle, true);
}

export function AuditionBar({
  notes,
  setNotes,
  instrument,
  sun,
  tuning,
  beatSeconds,
}: {
  notes: ScratchNote[];
  setNotes: (f: (n: ScratchNote[]) => ScratchNote[]) => void;
  instrument: Instrument;
  sun: number;
  tuning: Tuning;
  /** 1音の長さ（秒） */
  beatSeconds: number;
}) {
  const { settings } = useApp();
  const [playingIdx, setPlayingIdx] = useState<number | null>(null);
  const voices = useRef<Voice[]>([]);
  const timers = useRef<number[]>([]);
  const listRef = useRef<HTMLOListElement>(null);

  const stop = () => {
    voices.current.forEach((v) => v.stop());
    timers.current.forEach((t) => clearTimeout(t));
    voices.current = [];
    timers.current = [];
    setPlayingIdx(null);
  };
  useEffect(() => stop, []);

  useEffect(() => {
    listRef.current?.lastElementChild?.scrollIntoView({ block: 'nearest', inline: 'end' });
  }, [notes.length]);

  const play = () => {
    stop();
    if (!notes.length) return;
    const { ctx } = audio();
    const t0 = ctx.currentTime + 0.05;
    notes.forEach((n, i) => {
      const when = t0 + i * beatSeconds;
      const v = playNote(instrument, n.midi, { when, gain: 0.85, a4: settings.a4 });
      if (instrument !== 'shamisen') v.stop(when + beatSeconds * 0.95);
      else if (i < notes.length - 1) v.stop(when + beatSeconds);
      voices.current.push(v);
      timers.current.push(window.setTimeout(() => setPlayingIdx(i), (when - ctx.currentTime) * 1000));
    });
    timers.current.push(window.setTimeout(() => setPlayingIdx(null), (t0 - ctx.currentTime + notes.length * beatSeconds) * 1000));
  };

  return (
    <div className="audition">
      <ol className="audition-list" ref={listRef} aria-label="試聴する音の並び">
        {notes.length === 0 && <li className="audition-empty">下の楽器を押すと、ここに音が並びます（楽譜には入りません）</li>}
        {notes.map((n, i) => (
          <li key={i} className={playingIdx === i ? 'on' : ''}>
            {scratchLabel(n, instrument, sun, tuning, settings.nameStyle)}
          </li>
        ))}
      </ol>
      <div className="audition-actions">
        <IconButton icon={playingIdx !== null ? 'stop' : 'play'} label={playingIdx !== null ? '止める' : '並べた音を鳴らす'} variant="filled" onClick={playingIdx !== null ? stop : play} disabled={!notes.length} />
        <IconButton icon="backspace" label="最後の音を消す" onClick={() => setNotes((n) => n.slice(0, -1))} disabled={!notes.length} />
        <IconButton
          icon="delete"
          label="全部消す"
          onClick={() => {
            stop();
            setNotes(() => []);
          }}
          disabled={!notes.length}
        />
      </div>
    </div>
  );
}
