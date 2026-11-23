// 楽譜作成モード
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../context';
import { Player } from '../audio/player';
import { renderWav } from '../audio/render';
import { InstrumentPanel } from '../components/InstrumentPanel';
import { InstrumentSelect, SunSelect, TuningSelect } from '../components/controls';
import { Button, Dialog, IconButton, Segmented, Select, Switch } from '../components/ui';
import { Icon } from '../components/icons';
import { honLabel, noteName, SUN_MAX, SUN_MIN, sunLabelWithNote } from '../lib/pitch';
import { tuningOf } from '../lib/shamisen';
import { instrumentDef, INSTRUMENT_LIST } from '../lib/instruments';

const NOTATION_LABEL: Record<ScoreNotation, string> = { bunka: '文化譜', kinko: '琴古譜', staff: '五線譜' };
import { BarSlot } from '../components/BarSlot';
import { useMedia } from '../components/useMedia';
import { AuditionBar, scratchLabel, type ScratchNote } from '../components/Audition';
import { playNote } from '../audio/engine';
import {
  addTuplet,
  changeSun,
  deleteMeasureAt,
  deleteNoteAt,
  deleteRange,
  eventAt,
  extendAt,
  insertMeasureAt,
  isNote,
  MAX_PARTS,
  measureLen,
  newPart,
  newSong,
  normalize,
  parseSong,
  partEvents,
  pasteAt,
  placed,
  PPQ,
  shiftAllSun,
  sliceEvents,
  songLen,
  tupletAt,
  withEvents,
  writeAt,
  type Ev,
  type Instrument,
  type JumpKind,
  type MeasureMarks,
  type Part,
  type Song,
} from '../lib/score';
import { buildMidi, buildMusicXml } from '../lib/exporters';
import { playOrder } from '../lib/playorder';
import { JUMP_LABEL, setMarks } from '../lib/marks';
import { buildPdf, ON_CLAUDE_PAGE, safeName, saveFile, type SaveResult } from '../lib/save';
import { currentSongId, deleteSong, loadSongs, saveSong, type Settings } from '../lib/storage';
import { PART_COLORS, ScoreView, type Cursor, type ScoreNotation, type Selection } from './ScoreView';

/** 前回の曲。まだ曲がなければ「自分の楽器」で新しい楽譜を作る（楽器を毎回は聞かない） */
function initialSong(settings: Settings): Song {
  const id = currentSongId();
  const songs = loadSongs();
  return songs.find((s) => s.id === id) ?? songs[0] ?? newSong(settings.instrument, mySun(settings), settings.shamisenTuning);
}

const mySun = (st: Settings) => (st.instrument === 'shamisen' ? st.shamisenSun : st.shakuhachiSun);

// 音の長さ（1拍＝480）
const BASES: { v: number; label: string; key: string; icon: string }[] = [
  { v: 1920, label: '4拍（全音符）', key: '5', icon: 'noteWhole' },
  { v: 960, label: '2拍（2分音符）', key: '4', icon: 'noteHalf' },
  { v: 480, label: '1拍（4分音符）', key: '3', icon: 'noteQuarter' },
  { v: 240, label: '½拍（8分音符）', key: '2', icon: 'noteEighth' },
  { v: 120, label: '¼拍（16分音符）', key: '1', icon: 'note16' },
];

/** 道具の列のボタン（アイコンか短い文字） */
function Tool({
  icon,
  text,
  label,
  active,
  disabled,
  onClick,
  role,
}: {
  icon?: string;
  text?: string;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  role?: 'radio';
}) {
  return (
    <button
      type="button"
      className={`tool${active ? ' on' : ''}${text ? ' text' : ''}`}
      title={label}
      aria-label={label}
      role={role}
      aria-checked={role === 'radio' ? !!active : undefined}
      aria-pressed={role ? undefined : active}
      disabled={disabled}
      onClick={onClick}
    >
      {icon ? <Icon name={icon} size={22} /> : <span>{text}</span>}
    </button>
  );
}

const HISTORY = 200;

type ExportKind = 'midi' | 'xml' | 'wav' | 'pdf' | 'json';

export function ScoreScreen() {
  const { settings, update, toast } = useApp();
  const [song, setSong] = useState<Song>(() => initialSong(settings));
  const [editIdx, setEditIdx] = useState(0);
  const [cursor, setCursor] = useState<Cursor>({ part: 0, t: 0 });
  const [selection, setSelection] = useState<Selection | null>(null);
  const [anchor, setAnchor] = useState<number | null>(0);
  const [rangeMode, setRangeMode] = useState(false);
  const [base, setBase] = useState(480);
  const [dotted, setDotted] = useState(false);
  const [triplet, setTriplet] = useState(false);
  const [playBeat, setPlayBeat] = useState<number | null>(null);
  const [loop, setLoop] = useState(false);
  const [dlg, setDlg] = useState<null | 'part' | 'song' | 'files' | 'add' | 'new' | 'marks'>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [moreOpen, setMoreOpen] = useState(false);
  const [audition, setAudition] = useState(false);
  const [scratch, setScratch] = useState<ScratchNote[]>([]);
  const [pdfStage, setPdfStage] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const player = useRef(new Player());
  const past = useRef<Song[]>([]);
  const future = useRef<Song[]>([]);
  const clip = useRef<Ev[] | null>(null);
  const [, bump] = useState(0); // 元に戻す・やり直しのボタンの状態を描き直す

  const edit = song.parts[editIdx] ?? song.parts[0];
  const wide = useMedia('(min-width: 900px)');
  // 楽器に合う記譜方式だけ選べる。前の形式の「合奏」の曲（楽器が混ざっている）は全部選べる
  const mixed = song.parts.some((p) => p.instrument !== song.instrument);
  const allowed: ScoreNotation[] = mixed ? ['bunka', 'kinko', 'staff'] : instrumentDef(song.instrument).notations;
  const autoNotation = instrumentDef(edit.instrument).notations[0];
  const notation: ScoreNotation =
    settings.scoreView === 'auto' || !allowed.includes(settings.scoreView) ? autoNotation : settings.scoreView;
  // 3連のときは付点を使わない（付点の3連は普通の長さと区別できないため）
  const dur = triplet ? Math.round((base * 2) / 3) : Math.round(base * (dotted ? 1.5 : 1));

  // ---- 保存 ----
  const latest = useRef(song);
  const dirty = useRef(false);
  useEffect(() => {
    latest.current = song;
    dirty.current = true;
    const t = window.setTimeout(() => {
      saveSong(song);
      dirty.current = false;
    }, 400);
    return () => clearTimeout(t);
  }, [song]);
  useEffect(() => {
    const p = player.current;
    const flush = () => {
      if (dirty.current) saveSong(latest.current);
      dirty.current = false;
    };
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
      p.stop();
    };
  }, []);

  // ---- 変更と履歴 ----
  const commit = useCallback((next: Song) => {
    past.current.push(latest.current);
    if (past.current.length > HISTORY) past.current.shift();
    future.current = [];
    const n = normalize({ ...next, updatedAt: Date.now() });
    latest.current = n;
    setSong(n);
    bump((x) => x + 1);
  }, []);
  const mutate = useCallback((f: (s: Song) => Song) => commit(f(latest.current)), [commit]);

  const restore = (s: Song) => {
    latest.current = s;
    setSong(s);
    setEditIdx((i) => Math.min(i, s.parts.length - 1));
    setCursor((c) => ({ part: Math.min(c.part, s.parts.length - 1), t: Math.min(c.t, songLen(s) - 1) }));
    setSelection(null);
    bump((x) => x + 1);
  };
  const undo = () => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(latest.current);
    restore(prev);
  };
  const redo = () => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(latest.current);
    restore(next);
  };

  // 音を書き換えるときは必ずここを通す（3連符の区間を保つ）
  const setPartEvents = (s: Song, pi: number, events: Ev[]): Song => ({
    ...s,
    parts: s.parts.map((p, i) => (i === pi ? withEvents(p, events) : p)),
  });

  /** 曲の終わりを超えるなら小節を足す */
  const grow = (s: Song, end: number): Song => {
    if (end < songLen(s)) return s;
    return normalize({ ...s, measures: Math.ceil((end + 1) / measureLen(s)) });
  };

  // ---- カーソル ----
  const stepFrom = (pi: number, t: number, dir: 1 | -1): number => {
    const ps = placed(latest.current.parts[pi].events);
    if (dir === 1) {
      const next = ps.find((p) => p.start > t);
      return Math.min(next ? next.start : Infinity, t + dur, songLen(latest.current) - 1);
    }
    const prev = [...ps].reverse().find((p) => p.start < t);
    return Math.max(prev ? prev.start : 0, t - dur, 0);
  };

  const rangeEnd = (pi: number, t: number) => {
    const e = eventAt(latest.current.parts[pi].events, t);
    return e ? e.start + e.dur : t + dur;
  };

  const select = (pi: number, t: number, extend: boolean) => {
    // 楽譜の音を押したら鳴らして確かめる（再生中は鳴らさない）
    const p = latest.current.parts[pi];
    const hit = p ? eventAt(p.events, t) : null;
    if (hit && isNote(hit) && hit.start === t && playBeat === null) {
      const v = playNote(p.instrument, hit.midi, { gain: p.volume, a4: settings.a4 });
      if (p.instrument !== 'shamisen') window.setTimeout(() => v.stop(), 450);
    }
    const samePart = pi === cursor.part;
    if (pi !== editIdx) setEditIdx(pi);
    if ((extend || rangeMode) && samePart && anchor !== null) {
      setSelection({ part: pi, a: Math.min(anchor, t), b: rangeEnd(pi, Math.max(anchor, t)) });
    } else {
      setAnchor(t);
      setSelection(rangeMode ? { part: pi, a: t, b: rangeEnd(pi, t) } : null);
    }
    setCursor({ part: pi, t });
  };

  // ---- 入力 ----
  const writeHere = (ev: Omit<Ev, 'dur'>, extend = false) => {
    const pi = editIdx;
    const t = cursor.part === pi ? cursor.t : 0;
    let s = latest.current;
    // 3連符：区間の中ならそのマスの長さ。3連のモードで区間の外なら、ここに区間を作る
    let d = dur;
    const inside = tupletAt(s.parts[pi].tuplets, t);
    if (inside) d = inside.span / 3;
    else if (triplet) {
      const span = base * 2;
      s = grow(s, t + span);
      s = { ...s, parts: s.parts.map((p, i) => (i === pi ? addTuplet(p, t, span) : p)) };
      d = span / 3;
    }
    s = grow(s, t + d);
    const evs = s.parts[pi].events;
    s = setPartEvents(s, pi, extend ? extendAt(evs, t, d) : writeAt(evs, t, d, ev));
    commit(grow(s, t + d));
    setSelection(null);
    setAnchor(t + d);
    setCursor({ part: pi, t: t + d });
  };

  const onNote = (midi: number, str?: number) => {
    // 試聴のときは楽譜に入れず、下書きの並びに足す
    if (audition) {
      setScratch((n) => [...n, str !== undefined ? { midi, str } : { midi }]);
      return;
    }
    writeHere(edit.instrument === 'shamisen' && str !== undefined ? { midi, str } : { midi });
  };

  /**
   * 削除：選んだ範囲、なければカーソルの音（休みの上なら直前の音）を消す。
   * カーソルは直前の音へ移るので、続けて押すと後ろから順に消える。直したいときは消さずに上書きする。
   */
  const clearHere = () => {
    const pi = cursor.part;
    const evs = latest.current.parts[pi].events;
    const r = selection && selection.part === pi ? deleteRange(evs, selection.a, selection.b) : deleteNoteAt(evs, cursor.t);
    if (r.events !== evs) commit(setPartEvents(latest.current, pi, r.events));
    setSelection(null);
    setAnchor(r.t);
    setCursor({ part: pi, t: r.t });
  };

  const copy = (cut: boolean) => {
    const pi = cursor.part;
    const evs = latest.current.parts[pi].events;
    let range: { a: number; b: number } | null = selection && selection.part === pi ? selection : null;
    if (!range) {
      const e = eventAt(evs, cursor.t);
      range = e ? { a: e.start, b: e.start + e.dur } : null;
    }
    if (!range) return;
    clip.current = sliceEvents(evs, range.a, range.b);
    if (cut) commit(setPartEvents(latest.current, pi, writeAt(evs, range.a, range.b - range.a, {})));
    toast(cut ? '切り取りました' : 'コピーしました');
  };

  const paste = () => {
    if (!clip.current) {
      toast('先にコピーしてください');
      return;
    }
    const pi = editIdx;
    const t = cursor.t;
    const len = clip.current.reduce((a, e) => a + e.dur, 0);
    let s = grow(latest.current, t + len);
    s = setPartEvents(s, pi, pasteAt(s.parts[pi].events, t, clip.current));
    commit(s);
    setSelection(null);
    setCursor({ part: pi, t: Math.min(t + len, songLen(s) - 1) });
  };

  const insertMeasure = () => {
    const s = latest.current;
    const m = Math.floor(cursor.t / measureLen(s));
    commit(insertMeasureAt(s, m));
    toast(`${m + 1}小節目の前に1小節入れました`);
  };

  const deleteMeasure = () => {
    const s = latest.current;
    if (s.measures <= 1) return;
    const mLen = measureLen(s);
    const m = Math.floor(cursor.t / mLen);
    commit(deleteMeasureAt(s, m));
    setCursor((c) => ({ ...c, t: Math.max(0, Math.min(m * mLen, songLen(s) - mLen - 1)) }));
    setSelection(null);
    toast(`${m + 1}小節目を消しました`);
  };

  // ---- 再生 ----
  const playing = playBeat !== null;
  const togglePlay = () => {
    if (playing) {
      player.current.stop();
      setPlayBeat(null);
      return;
    }
    const from = cursor.t / PPQ;
    let last = -1;
    player.current.start(
      song,
      from,
      settings.a4,
      (b) => {
        if (b === null) {
          setPlayBeat(null);
          return;
        }
        const q = Math.floor(b * 12) / 12;
        if (q !== last) {
          last = q;
          setPlayBeat(q);
        }
      },
      loop,
    );
  };
  useEffect(() => {
    song.parts.forEach((p) => player.current.setPart(p.id, p.volume, p.muted));
  }, [song.parts]);

  const sounding = useMemo(() => {
    const s = new Set<number>();
    if (playBeat === null || !edit) return s;
    for (const e of partEvents(edit)) if (playBeat >= e.start && playBeat < e.start + e.dur) s.add(e.midi);
    return s;
  }, [playBeat, edit]);

  // ---- 書き出し ----
  const report = (r: SaveResult, what: string) => {
    if (r === 'saved') toast(`${what}を保存しました`);
    else if (r === 'declined') toast('保存をやめました');
    else toast('この画面では保存できませんでした');
  };
  const exportAs = async (kind: ExportKind) => {
    const name = safeName(song.title);
    try {
      if (kind === 'midi') report(await saveFile(`${name}.mid`, buildMidi(song)), 'MIDI');
      else if (kind === 'xml') report(await saveFile(`${name}.musicxml`, buildMusicXml(song)), 'MusicXML');
      else if (kind === 'json') report(await saveFile(`${name}.wagakki.json`, JSON.stringify(song)), '楽譜ファイル');
      else if (kind === 'wav') {
        setBusy('WAV を作っています…');
        const wav = await renderWav(song, settings.a4);
        setBusy(null);
        report(await saveFile(`${name}.wav`, wav), 'WAV');
      } else {
        setBusy('PDF を作っています…');
        setPdfStage(true);
      }
    } catch (e) {
      setBusy(null);
      toast(e instanceof Error ? e.message : '書き出せませんでした');
    }
  };
  // PDF：画面の外に印刷用の楽譜を描いてから画像にする
  const stageRef = useRef<HTMLDivElement>(null);
  const exportRef = useRef({ notation, title: song.title });
  exportRef.current = { notation, title: song.title };
  useEffect(() => {
    if (!pdfStage) return;
    let cancelled = false;
    (async () => {
      try {
        const root = stageRef.current!;
        for (let i = 0; i < 100 && !root.querySelector('[data-block]'); i++) await new Promise((r) => setTimeout(r, 100));
        await document.fonts.ready;
        await new Promise((r) => setTimeout(r, 250));
        const pdf = await buildPdf(root, exportRef.current.notation === 'kinko');
        if (cancelled) return;
        setPdfStage(false);
        setBusy(null);
        report(await saveFile(`${safeName(exportRef.current.title)}.pdf`, pdf), 'PDF');
      } catch (e) {
        setPdfStage(false);
        setBusy(null);
        toast(e instanceof Error ? e.message : 'PDF を作れませんでした');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pdfStage]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- キーボード ----
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyRef.current = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest('input, textarea, select, dialog')) return;
    const k = e.key;
    const mod = e.metaKey || e.ctrlKey;
    const done = () => e.preventDefault();
    if (mod) {
      const lk = k.toLowerCase();
      if (lk === 'z' && !e.shiftKey) (done(), undo());
      else if ((lk === 'z' && e.shiftKey) || lk === 'y') (done(), redo());
      else if (lk === 'c') (done(), copy(false));
      else if (lk === 'x') (done(), copy(true));
      else if (lk === 'v') (done(), paste());
      return;
    }
    if (e.altKey) return;
    if (k === 'ArrowRight' || k === 'ArrowLeft') {
      done();
      select(cursor.part, stepFrom(cursor.part, cursor.t, k === 'ArrowRight' ? 1 : -1), e.shiftKey);
    } else if (k === 'ArrowDown' || k === 'ArrowUp') {
      done();
      const n = Math.max(0, Math.min(song.parts.length - 1, cursor.part + (k === 'ArrowDown' ? 1 : -1)));
      setEditIdx(n);
      setSelection(null);
      setAnchor(cursor.t);
      setCursor({ part: n, t: cursor.t });
    } else if (k === '-' || k === 'ー') (done(), writeHere({}, true));
    else if (k === '0' || k === 'r') (done(), writeHere({}));
    else if (k === 'Delete' || k === 'Backspace') (done(), clearHere());
    else if (k === ' ') (done(), togglePlay());
    else if (k === '.') (done(), setDotted((d) => !d), setTriplet(false));
    else if (k === ',') (done(), setTriplet((d) => !d), setDotted(false));
    else if (k === 'Escape') {
      setSelection(null);
      setRangeMode(false);
    } else {
      const b = BASES.find((x) => x.key === k);
      if (b) (done(), setBase(b.v));
    }
  };
  useEffect(() => {
    const f = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, []);

  const viewProps = { song, notation, editIdx };
  const def = instrumentDef(edit.instrument);
  const mLen = measureLen(song);
  const curMeasure = Math.floor(cursor.t / mLen) + 1;
  const curBeat = (cursor.t % mLen) / PPQ + 1;
  const beatText = Number.isInteger(curBeat) ? `${curBeat}拍` : `${Math.floor(curBeat)}拍＋${Math.round((curBeat % 1) * 12)}/12`;
  const durText = `${BASES.find((x) => x.v === base)?.label ?? ''}${dotted ? '・付点' : ''}${triplet ? '・3連' : ''}`;
  const instText = [
    def.label,
    def.usesSun ? (edit.instrument === 'shamisen' && settings.shamisenLabel === 'hon' ? honLabel(edit.sun) : sunLabelWithNote(edit.sun)) : null,
    def.usesTuning ? tuningOf(edit.tuning).label : null,
  ]
    .filter(Boolean)
    .join('　');
  const showParts = settings.multiPart || song.parts.length > 1;
  const cursorEv = eventAt(edit.events, cursor.t);
  const cursorNote = cursorEv && isNote(cursorEv) ? { midi: cursorEv.midi, str: cursorEv.str } : null;
  const compact = settings.scoreDensity === 'auto' ? wide : settings.scoreDensity === 'compact';
  const order = playOrder(song);

  const durTools = (
    <div className="tool-group" role="radiogroup" aria-label="音の長さ">
      {BASES.map((b) => (
        <Tool key={b.v} icon={b.icon} label={`${b.label}（${b.key} キー）`} active={base === b.v} onClick={() => setBase(b.v)} role="radio" />
      ))}
      <Tool
        icon="dot"
        label="付点（. キー）"
        active={dotted}
        onClick={() => {
          setDotted((d) => !d);
          setTriplet(false);
        }}
      />
      <Tool
        text="3"
        label="3連符（, キー）：選んだ長さ2つ分の時間に3つ入れる"
        active={triplet}
        onClick={() => {
          setTriplet((d) => !d);
          setDotted(false);
        }}
      />
    </div>
  );
  const writeTools = (
    <div className="tool-group">
      <Tool icon="restQ" label="休み（0 キー）" onClick={() => writeHere({})} />
      <Tool icon="tie" label="伸ばし：前の音を延ばす（- キー）" onClick={() => writeHere({}, true)} />
      <Tool icon="backspace" label="消す：カーソルの音を消して前の音へ（Delete・Backspace）" onClick={clearHere} />
    </div>
  );
  const editTools = (
    <>
      <div className="tool-group">
        <Tool
          icon="select"
          label="範囲を選ぶ（Shift を押しながら選んでも同じ）"
          active={rangeMode}
          onClick={() => {
            setRangeMode((m) => !m);
            setSelection(null);
            setAnchor(cursor.t);
          }}
        />
        <Tool icon="copy" label="コピー（Ctrl+C）" onClick={() => copy(false)} />
        <Tool icon="cut" label="切り取り（Ctrl+X）" onClick={() => copy(true)} />
        <Tool icon="paste" label="貼り付け（Ctrl+V）" onClick={paste} />
      </div>
      <div className="tool-group">
        <Tool icon="measureAdd" label="カーソルのある小節の前に1小節入れる" onClick={insertMeasure} />
        <Tool icon="measureDel" label="カーソルのある小節を消す" onClick={deleteMeasure} />
        <Tool icon="repeat" label="繰り返し・ジャンプの記号（カーソルのある小節）" active={dlg === 'marks'} onClick={() => setDlg('marks')} />
      </div>
    </>
  );

  return (
    <div className="screen score-screen">
      <BarSlot>
        <button type="button" className="bar-title" onClick={() => setDlg('song')} title="曲の設定（曲名・テンポ・拍子・小節）">
          <span className="bar-title-main">{song.title}</span>
          <span className="bar-title-sub">{mixed ? '合奏' : instrumentDef(song.instrument).label}</span>
        </button>
        <span className="spacer" />
        <div className="bar-group hide-narrow">
          <IconButton icon="undo" label="元に戻す（Ctrl+Z）" onClick={undo} disabled={!past.current.length} />
          <IconButton icon="redo" label="やり直す（Ctrl+Shift+Z）" onClick={redo} disabled={!future.current.length} />
        </div>
        {allowed.length > 1 && (
          <div className="bar-group">
            <Select<Settings['scoreView']>
              label="表示する楽譜"
              value={allowed.includes(settings.scoreView as ScoreNotation) ? settings.scoreView : 'auto'}
              onChange={(v) => update({ scoreView: v })}
              options={[
                { value: 'auto', label: '自動' },
                ...allowed.map((n) => ({ value: n, label: NOTATION_LABEL[n] })),
              ]}
            />
          </div>
        )}
        <IconButton
          icon="compact"
          label={compact ? '編集しやすい表示にする' : '仕上がり表示にする（小節を詰めて1行に多く）'}
          selected={compact}
          onClick={() => update({ scoreDensity: compact ? 'edit' : 'compact' })}
        />
        <div className="bar-group transport">
          <button type="button" className="tempo-btn hide-narrow" onClick={() => setDlg('song')} title="テンポ">
            ♩={song.tempo}
          </button>
          <span className="hide-small">
            <IconButton icon="loop" label="くり返し再生" selected={loop} onClick={() => setLoop((l) => !l)} />
          </span>
          <IconButton icon={playing ? 'stop' : 'play'} label={playing ? '停止（スペース）' : 'カーソルから再生（スペース）'} variant="filled" onClick={togglePlay} />
        </div>
        <IconButton icon="folder" label="ファイル（新規・開く・書き出し）" onClick={() => setDlg('files')} />
      </BarSlot>

      <div className="editor">
        <aside className="toolrail" aria-label="入力の道具">
          {durTools}
          {writeTools}
          <div className="rail-wide">{editTools}</div>
          <div className="rail-narrow tool-group">
            <Tool icon="undo" label="元に戻す" onClick={undo} disabled={!past.current.length} />
            <Tool icon="more" label="ほかの操作" active={moreOpen} onClick={() => setMoreOpen((o) => !o)} />
          </div>
        </aside>
        {moreOpen && (
          <div className="popover" role="menu" onClick={() => setMoreOpen(false)}>
            <div className="tool-group">
              <Tool icon="redo" label="やり直す" onClick={redo} disabled={!future.current.length} />
              <Tool icon="loop" label="くり返し再生" active={loop} onClick={() => setLoop((l) => !l)} />
            </div>
            {editTools}
          </div>
        )}

        <div className="canvas">
          {showParts && (
            <div className="part-tabs" role="tablist" aria-label="パート">
              {song.parts.map((p, i) => (
                <div key={p.id} className={`part-tab${i === editIdx ? ' on' : ''}${p.muted ? ' muted' : ''}`}>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={i === editIdx}
                    onClick={() => {
                      if (i === editIdx) setDlg('part');
                      setEditIdx(i);
                      setSelection(null);
                      setCursor((c) => ({ part: i, t: c.t }));
                    }}
                    title={i === editIdx ? 'もう一度押すとパートの設定' : undefined}
                  >
                    <span className="swatch" style={{ background: PART_COLORS[i % PART_COLORS.length] }} />
                    {p.name || `パート${i + 1}`}
                  </button>
                  <button
                    type="button"
                    className="part-mute"
                    aria-label={p.muted ? `${p.name}の消音を解除` : `${p.name}を消音`}
                    aria-pressed={p.muted}
                    onClick={() => mutate((s) => ({ ...s, parts: s.parts.map((x, j) => (j === i ? { ...x, muted: !x.muted } : x)) }))}
                  >
                    <Icon name={p.muted ? 'volumeOff' : 'volumeOn'} size={16} />
                  </button>
                </div>
              ))}
              {song.parts.length < MAX_PARTS && (
                <button type="button" className="part-add" onClick={() => setDlg('add')} title="パートを追加">
                  <Icon name="add" size={16} />
                </button>
              )}
            </div>
          )}
          <div className="score-scroll">
            <ScoreView {...viewProps} cursor={cursor} selection={selection} playBeat={playBeat} onSelect={select} compact={compact} />
          </div>
        </div>
      </div>

      <section className={`dock${panelOpen ? '' : ' closed'}`} aria-label="入力">
        <div className="dock-head">
          <button type="button" className="dock-title" onClick={() => setDlg('part')} title="楽器の設定（寸法・調弦）">
            {instText}
          </button>
          <span className="spacer" />
          <div className="dock-modes" role="radiogroup" aria-label="押した音の行き先">
            <button type="button" role="radio" aria-checked={!audition} className={!audition ? 'on' : ''} onClick={() => setAudition(false)}>
              楽譜に入力
            </button>
            <button type="button" role="radio" aria-checked={audition} className={audition ? 'on' : ''} onClick={() => setAudition(true)}>
              試聴
            </button>
          </div>
          {edit.instrument !== 'piano' && (
            <IconButton icon="piano" label="ピアノ鍵盤の表示" selected={settings.showPiano} onClick={() => update({ showPiano: !settings.showPiano })} />
          )}
          <IconButton icon={panelOpen ? 'expand' : 'collapse'} label={panelOpen ? '入力の画面をしまう' : '入力の画面を出す'} onClick={() => setPanelOpen((o) => !o)} />
        </div>
        {panelOpen && audition && (
          <AuditionBar
            notes={scratch}
            setNotes={setScratch}
            instrument={edit.instrument}
            sun={edit.sun}
            tuning={edit.tuning}
            beatSeconds={(60 / song.tempo) * Math.max(0.25, dur / PPQ)}
          />
        )}
        {panelOpen && edit && (
          <InstrumentPanel instrument={edit.instrument} sun={edit.sun} tuning={edit.tuning} external={sounding} onNote={onNote} volume={edit.volume} />
        )}
      </section>

      <footer className="statusbar" aria-live="polite">
        <span>
          {curMeasure}小節 {beatText}
        </span>
        <span>長さ {tupletAt(edit.tuplets, cursor.t) ? '3連の中（1/3ずつ）' : durText}</span>
        {cursorNote && (
          <span className="status-note">
            {scratchLabel(cursorNote, edit.instrument, edit.sun, edit.tuning, settings.nameStyle)}
            {edit.instrument !== 'piano' && `（${noteName(cursorNote.midi, settings.nameStyle, true)}）`}
          </span>
        )}
        {selection && <span>範囲選択中</span>}
        {order.warnings.length > 0 && (
          <button type="button" className="status-warn" onClick={() => setDlg('marks')}>
            記号の注意 {order.warnings.length}
          </button>
        )}
        <span className="spacer" />
        <span className="hide-narrow">
          {song.beatsPerMeasure}拍子・{song.measures}小節
        </span>
      </footer>

      {busy && (
        <div className="busy" role="status">
          {busy}
        </div>
      )}

      <PartDialog
        open={dlg === 'part'}
        part={edit}
        canChangeInstrument={mixed}
        canDelete={song.parts.length > 1}
        onClose={() => setDlg(null)}
        onChange={(f) => mutate((s) => ({ ...s, parts: s.parts.map((p, i) => (i === editIdx ? f(p) : p)) }))}
        onDelete={() => {
          mutate((s) => ({ ...s, parts: s.parts.filter((_, i) => i !== editIdx) }));
          setEditIdx(0);
          setCursor((c) => ({ ...c, part: 0 }));
          setDlg(null);
        }}
      />
      <AddPartDialog
        open={dlg === 'add'}
        onClose={() => setDlg(null)}
        defaults={edit}
        only={mixed ? undefined : [song.instrument]}
        onAdd={(inst, sun, tuning) => {
          const n = song.parts.length;
          mutate((s) => ({ ...s, parts: [...s.parts, newPart(inst, sun, tuning, songLen(s), `${inst === 'shamisen' ? '三味線' : '尺八'}${n + 1}`)] }));
          setEditIdx(n);
          setCursor({ part: n, t: 0 });
          setAnchor(0);
          setDlg(null);
        }}
      />
      <MarksDialog
        open={dlg === 'marks'}
        song={song}
        measure={curMeasure - 1}
        order={order}
        onClose={() => setDlg(null)}
        onChange={(patch) => mutate((s) => setMarks(s, curMeasure - 1, patch))}
      />
      <SongDialog open={dlg === 'song'} song={song} onClose={() => setDlg(null)} mutate={mutate} toast={toast} />
      <FilesDialog
        open={dlg === 'files'}
        song={song}
        onClose={() => setDlg(null)}
        onOpen={(s) => {
          player.current.stop();
          setPlayBeat(null);
          past.current = [];
          future.current = [];
          restore(s);
          setEditIdx(0);
          setCursor({ part: 0, t: 0 });
          setDlg(null);
        }}
        onExport={(k) => {
          setDlg(null);
          void exportAs(k);
        }}
        onNew={() => setDlg('new')}
        toast={toast}
      />
      <NewSongDialog
        open={dlg === 'new'}
        defaults={{ ...edit, instrument: settings.instrument, sun: mySun(settings), tuning: settings.shamisenTuning }}
        onClose={() => setDlg(null)}
        onCreate={(s) => {
          saveSong(latest.current);
          player.current.stop();
          setPlayBeat(null);
          past.current = [];
          future.current = [];
          restore(s);
          setEditIdx(0);
          setCursor({ part: 0, t: 0 });
          setAnchor(0);
          update({ scoreView: 'auto' });
          setDlg(null);
        }}
      />
      <div className="print-only">
        <h1 className="print-title">{song.title}</h1>
        <p className="print-meta">
          ♩={song.tempo}　{song.beatsPerMeasure}拍子
        </p>
        <ScoreView {...viewProps} cursor={null} selection={null} playBeat={null} onSelect={() => {}} printMode />
      </div>
      {pdfStage && (
        <div className="pdf-stage" ref={stageRef} aria-hidden="true">
          <div data-head className="pdf-head">
            <h1 className="print-title">{song.title}</h1>
            <p className="print-meta">
              ♩={song.tempo}　{song.beatsPerMeasure}拍子
            </p>
          </div>
          <ScoreView {...viewProps} cursor={null} selection={null} playBeat={null} onSelect={() => {}} printMode />
        </div>
      )}
    </div>
  );
}

function PartDialog({
  open,
  part,
  canChangeInstrument,
  canDelete,
  onClose,
  onChange,
  onDelete,
}: {
  open: boolean;
  part: Part;
  canChangeInstrument: boolean;
  canDelete: boolean;
  onClose: () => void;
  onChange: (f: (p: Part) => Part) => void;
  onDelete: () => void;
}) {
  const [keep, setKeep] = useState(true);
  const [armed, setArmed] = useState(false);
  useEffect(() => setArmed(false), [open, part?.id]);
  if (!part) return null;
  return (
    <Dialog open={open} title="パートの設定" onClose={onClose} actions={<Button onClick={onClose}>閉じる</Button>}>
      <label className="field">
        <span className="field-label">名前</span>
        <input id="part-name" value={part.name} maxLength={20} onChange={(e) => onChange((p) => ({ ...p, name: e.target.value }))} />
      </label>
      {canChangeInstrument && (
        <div className="field-row">
          <span className="field-label">楽器</span>
          <InstrumentSelect value={part.instrument} onChange={(v) => onChange((p) => ({ ...p, instrument: v }))} />
        </div>
      )}
      {instrumentDef(part.instrument).usesSun && (
        <>
          <SunSelect instrument={part.instrument} value={part.sun} onChange={(v) => onChange((p) => changeSun(p, v, keep))} />
          <Segmented<'keep' | 'pitch'>
            dense
            label="寸法を変えたとき"
            value={keep ? 'keep' : 'pitch'}
            onChange={(v) => setKeep(v === 'keep')}
            options={[
              { value: 'keep', label: '指使いを保つ（音が動く）' },
              { value: 'pitch', label: '音の高さを保つ' },
            ]}
          />
        </>
      )}
      {part.instrument === 'shamisen' && (
        <div className="field-row">
          <span className="field-label">調弦</span>
          <TuningSelect value={part.tuning} onChange={(v) => onChange((p) => ({ ...p, tuning: v }))} />
        </div>
      )}
      <label className="field">
        <span className="field-label">音量 {Math.round(part.volume * 100)}</span>
        <input id="part-volume" type="range" min={0} max={1} step={0.05} value={part.volume} onChange={(e) => onChange((p) => ({ ...p, volume: Number(e.target.value) }))} />
      </label>
      <Switch label="消音" checked={part.muted} onChange={(v) => onChange((p) => ({ ...p, muted: v }))} />
      {canDelete && (
        <div className="danger-zone">
          <Button variant={armed ? 'filled' : 'outlined'} icon="delete" onClick={() => (armed ? onDelete() : setArmed(true))}>
            {armed ? `もう一度押すと「${part.name}」を削除` : 'このパートを削除'}
          </Button>
        </div>
      )}
    </Dialog>
  );
}

function AddPartDialog({
  open,
  onClose,
  defaults,
  only,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  defaults: Part;
  only?: Instrument[];
  onAdd: (inst: Instrument, sun: number, tuning: Part['tuning']) => void;
}) {
  const [inst, setInst] = useState<Instrument>(defaults?.instrument ?? 'shamisen');
  const [sun, setSun] = useState(defaults?.sun ?? 18);
  const [tuning, setTuning] = useState<Part['tuning']>(defaults?.tuning ?? 'honchoshi');
  return (
    <Dialog
      open={open}
      title="パートを追加"
      onClose={onClose}
      actions={
        <>
          <Button variant="text" onClick={onClose}>
            やめる
          </Button>
          <Button onClick={() => onAdd(inst, sun, tuning)}>追加</Button>
        </>
      }
    >
      {(!only || only.length > 1) && (
        <div className="field-row">
          <span className="field-label">楽器</span>
          <InstrumentSelect value={inst} onChange={setInst} only={only} />
        </div>
      )}
      {instrumentDef(inst).usesSun && <SunSelect instrument={inst} value={sun} onChange={setSun} />}
      {instrumentDef(inst).usesTuning && (
        <div className="field-row">
          <span className="field-label">調弦</span>
          <TuningSelect value={tuning} onChange={setTuning} />
        </div>
      )}
    </Dialog>
  );
}

/** 新しい楽譜：楽器を1つ選ぶ（楽器ごとに記譜方式と入力の画面が決まる） */
function NewSongDialog({
  open,
  defaults,
  onClose,
  onCreate,
}: {
  open: boolean;
  defaults: Part;
  onClose: () => void;
  onCreate: (s: Song) => void;
}) {
  const [inst, setInst] = useState<Instrument>(defaults?.instrument ?? 'shamisen');
  const [sun, setSun] = useState(defaults?.sun ?? 18);
  const [tuning, setTuning] = useState<Part['tuning']>(defaults?.tuning ?? 'honchoshi');
  const [title, setTitle] = useState('');
  const def = instrumentDef(inst);
  return (
    <Dialog
      open={open}
      title="新しい楽譜"
      onClose={onClose}
      actions={
        <>
          <Button variant="text" onClick={onClose}>
            やめる
          </Button>
          <Button
            onClick={() => {
              const s = newSong(inst, sun, tuning);
              if (title.trim()) s.title = title.trim();
              onCreate(s);
              setTitle('');
            }}
          >
            作る
          </Button>
        </>
      }
    >
      <div className="inst-cards" role="radiogroup" aria-label="楽器">
        {INSTRUMENT_LIST.map((d) => (
          <button key={d.id} type="button" role="radio" aria-checked={inst === d.id} className={`inst-card${inst === d.id ? ' on' : ''}`} onClick={() => setInst(d.id)}>
            <span className="inst-card-name">{d.label}</span>
            <span className="inst-card-sub">{d.notations.map((n) => NOTATION_LABEL[n]).join('・')}</span>
          </button>
        ))}
      </div>
      <label className="field">
        <span className="field-label">曲名</span>
        <input id="new-title" value={title} maxLength={40} placeholder="無題の曲" onChange={(e) => setTitle(e.target.value)} />
      </label>
      {def.usesSun && <SunSelect instrument={inst} value={sun} onChange={setSun} />}
      {def.usesTuning && (
        <div className="field-row">
          <span className="field-label">調弦</span>
          <TuningSelect value={tuning} onChange={setTuning} />
        </div>
      )}
      <p className="hint">{NEW_HINT[inst]}</p>
    </Dialog>
  );
}

const NEW_HINT: Record<Instrument, string> = {
  piano: '五線譜（ト音記号）で書きます。いまは単音のみです（和音と大譜表はあとで対応します）。',
  shakuhachi: '琴古流の縦譜で書きます。五線譜にも切り替えられます。',
  shamisen: '文化譜（津軽の勘所の数字）で書きます。五線譜にも切り替えられます。',
};

const ENDINGS: { key: string; nums: number[] | null; label: string }[] = [
  { key: '-', nums: null, label: 'なし' },
  { key: '1', nums: [1], label: '1.' },
  { key: '2', nums: [2], label: '2.' },
  { key: '3', nums: [3], label: '3.' },
  { key: '1,2', nums: [1, 2], label: '1.2.' },
];

/** 小節の記号（繰り返し・番括弧・ジャンプ） */
function MarksDialog({
  open,
  song,
  measure,
  order,
  onClose,
  onChange,
}: {
  open: boolean;
  song: Song;
  measure: number;
  order: ReturnType<typeof playOrder>;
  onClose: () => void;
  onChange: (patch: Partial<MeasureMarks>) => void;
}) {
  const mk: MeasureMarks = song.marks[measure] ?? {};
  const endingKey = mk.ending ? mk.ending.numbers.join(',') : '-';
  const preview = order.measures.slice(0, 48).map((m) => m + 1);
  return (
    <Dialog open={open} title={`${measure + 1}小節目の記号`} onClose={onClose} actions={<Button onClick={onClose}>閉じる</Button>}>
      <div className="field-row">
        <span className="field-label">繰り返し</span>
        <button type="button" className={`chip-btn${mk.repeatStart ? ' on' : ''}`} aria-pressed={!!mk.repeatStart} onClick={() => onChange({ repeatStart: !mk.repeatStart })}>
          ‖: 始まり（頭）
        </button>
      </div>
      <div className="field-row">
        <span className="field-label">:‖ 終わり（終わり）</span>
        <Segmented<number>
          dense
          label="繰り返しの終わり"
          value={mk.repeatEnd ?? 0}
          onChange={(v) => onChange({ repeatEnd: v || undefined })}
          options={[
            { value: 0, label: 'なし' },
            { value: 2, label: '2回' },
            { value: 3, label: '3回' },
            { value: 4, label: '4回' },
          ]}
        />
      </div>
      <div className="field-row">
        <span className="field-label">番括弧（ここから）</span>
        <Segmented<string>
          dense
          label="番括弧"
          value={endingKey}
          onChange={(k) => {
            const e = ENDINGS.find((x) => x.key === k)!;
            onChange({ ending: e.nums ? { numbers: e.nums, length: mk.ending?.length ?? 1 } : undefined });
          }}
          options={ENDINGS.map((e) => ({ value: e.key, label: e.label }))}
        />
      </div>
      {mk.ending && (
        <div className="field-row">
          <span className="field-label">括弧の長さ</span>
          <Segmented<number>
            dense
            label="括弧の長さ"
            value={mk.ending.length}
            onChange={(v) => onChange({ ending: { numbers: mk.ending!.numbers, length: v } })}
            options={[1, 2, 3, 4].map((v) => ({ value: v, label: `${v}小節` }))}
          />
        </div>
      )}
      <div className="field-row">
        <span className="field-label">目印（頭）</span>
        <button type="button" className={`chip-btn${mk.segno ? ' on' : ''}`} aria-pressed={!!mk.segno} onClick={() => onChange({ segno: !mk.segno })}>
          <span className="music-glyph">𝄋</span> セーニョ
        </button>
        <button type="button" className={`chip-btn${mk.coda ? ' on' : ''}`} aria-pressed={!!mk.coda} onClick={() => onChange({ coda: !mk.coda })}>
          <span className="music-glyph">𝄌</span> コーダ
        </button>
      </div>
      <div className="field-row">
        <span className="field-label">終わりに書く</span>
        <button type="button" className={`chip-btn${mk.toCoda ? ' on' : ''}`} aria-pressed={!!mk.toCoda} onClick={() => onChange({ toCoda: !mk.toCoda })}>
          To Coda
        </button>
        <button type="button" className={`chip-btn${mk.fine ? ' on' : ''}`} aria-pressed={!!mk.fine} onClick={() => onChange({ fine: !mk.fine })}>
          Fine
        </button>
      </div>
      <Select<JumpKind | ''>
        label="戻る指示（小節の終わり）"
        value={mk.jump ?? ''}
        onChange={(v) => onChange({ jump: v || undefined })}
        options={[{ value: '', label: 'なし' }, ...(Object.keys(JUMP_LABEL) as JumpKind[]).map((k) => ({ value: k, label: JUMP_LABEL[k] }))]}
      />
      {order.warnings.length > 0 && (
        <ul className="warn-list">
          {order.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
      <p className="hint">
        演奏の順番：{preview.join(' → ')}
        {order.measures.length > preview.length ? ' …' : ''}
      </p>
      <p className="hint">D.C.・D.S. で戻ったあとは繰り返しを省き、番括弧は最後の括弧だけを弾きます。</p>
    </Dialog>
  );
}

function SongDialog({
  open,
  song,
  onClose,
  mutate,
  toast,
}: {
  open: boolean;
  song: Song;
  onClose: () => void;
  mutate: (f: (s: Song) => Song) => void;
  toast: (m: string) => void;
}) {
  const shift = (steps: number) => {
    if (song.parts.some((p) => p.sun - steps < SUN_MIN || p.sun - steps > SUN_MAX)) {
      toast('寸法の範囲（1尺3寸〜2尺4寸）を超えるパートがあるため変えられません');
      return;
    }
    mutate((s) => shiftAllSun(s, steps, SUN_MIN, SUN_MAX));
    toast(steps > 0 ? '全パートを半音上げました（寸法を1寸短く）' : '全パートを半音下げました（寸法を1寸長く）');
  };
  return (
    <Dialog open={open} title="曲の設定" onClose={onClose} actions={<Button onClick={onClose}>閉じる</Button>}>
      <label className="field">
        <span className="field-label">曲名</span>
        <input id="song-title" value={song.title} maxLength={40} onChange={(e) => mutate((s) => ({ ...s, title: e.target.value }))} />
      </label>
      <label className="field">
        <span className="field-label">テンポ（1分間の拍数）{song.tempo}</span>
        <input id="song-tempo" type="range" min={30} max={240} value={song.tempo} onChange={(e) => mutate((s) => ({ ...s, tempo: Number(e.target.value) }))} />
      </label>
      <div className="field-row">
        <span className="field-label">拍子</span>
        <Segmented
          dense
          label="拍子"
          value={song.beatsPerMeasure}
          onChange={(v) => mutate((s) => ({ ...s, beatsPerMeasure: v, measures: Math.max(1, Math.ceil(songLen(s) / (v * PPQ))) }))}
          options={[2, 3, 4].map((v) => ({ value: v, label: `${v}拍` }))}
        />
      </div>
      <div className="field-row">
        <span className="field-label">小節の数 {song.measures}</span>
        <Button variant="outlined" onClick={() => mutate((s) => ({ ...s, measures: Math.max(1, s.measures - 1) }))}>
          −1
        </Button>
        <Button variant="outlined" onClick={() => mutate((s) => ({ ...s, measures: Math.min(400, s.measures + 1) }))}>
          ＋1
        </Button>
        <Button variant="outlined" onClick={() => mutate((s) => ({ ...s, measures: Math.min(400, s.measures + 4) }))}>
          ＋4
        </Button>
      </div>
      <div className="field-row">
        <span className="field-label">寸法の一括変更（移調）</span>
        <Button variant="tonal" onClick={() => shift(-1)}>
          半音下げる（1寸長く）
        </Button>
        <Button variant="tonal" onClick={() => shift(1)}>
          半音上げる（1寸短く）
        </Button>
      </div>
      <p className="hint">一括変更では、勘所やロツレチはそのままで、音の高さだけが並行移動します。</p>
    </Dialog>
  );
}

function FilesDialog({
  open,
  song,
  onClose,
  onOpen,
  onExport,
  onNew,
  toast,
}: {
  open: boolean;
  song: Song;
  onClose: () => void;
  onOpen: (s: Song) => void;
  onExport: (kind: ExportKind) => void;
  onNew: () => void;
  toast: (m: string) => void;
}) {
  const [list, setList] = useState<Song[]>([]);
  const [armedId, setArmedId] = useState<string | null>(null);
  const [pasted, setPasted] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) setList(loadSongs());
    setArmedId(null);
  }, [open]);

  const importText = (text: string) => {
    try {
      const s = parseSong(JSON.parse(text));
      if (loadSongs().some((x) => x.id === s.id)) s.id = Math.random().toString(36).slice(2);
      saveSong(s);
      onOpen(s);
      toast(`「${s.title}」を読み込みました`);
    } catch (err) {
      toast(err instanceof Error ? err.message : '読み込めませんでした');
    }
  };

  const copyText = async () => {
    const text = JSON.stringify(song);
    try {
      await navigator.clipboard.writeText(text);
      toast('楽譜をコピーしました。メモなどに貼り付けて残せます');
    } catch {
      setPasted(text);
      toast('コピーできなかったので、下の欄の文字を選んでコピーしてください');
    }
  };

  return (
    <Dialog open={open} title="曲" onClose={onClose}>
      <div className="file-actions">
        <Button
          icon="add"
          variant="tonal"
          onClick={onNew}
        >
          新しい楽譜
        </Button>
        <Button icon="upload" variant="tonal" onClick={() => fileRef.current?.click()}>
          ファイルから読み込み
        </Button>
        {ON_CLAUDE_PAGE ? (
          <Button icon="copy" variant="tonal" onClick={copyText}>
            楽譜をコピー
          </Button>
        ) : (
          <Button icon="download" variant="tonal" onClick={() => onExport('json')}>
            楽譜ファイルに保存
          </Button>
        )}
        {!ON_CLAUDE_PAGE && (
          <Button
            icon="print"
            variant="tonal"
            onClick={() => {
              onClose();
              setTimeout(() => window.print(), 150);
            }}
          >
            印刷
          </Button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) importText(await f.text());
          }}
        />
      </div>

      <h3 className="list-title">書き出し</h3>
      <div className="file-actions">
        <Button icon="download" variant="outlined" onClick={() => onExport('pdf')}>
          PDF
        </Button>
        <Button icon="download" variant="outlined" onClick={() => onExport('midi')}>
          MIDI
        </Button>
        <Button icon="download" variant="outlined" onClick={() => onExport('wav')}>
          WAV（音）
        </Button>
        <Button icon="download" variant="outlined" onClick={() => onExport('xml')}>
          MusicXML
        </Button>
      </div>
      <p className="hint">
        PDF はいま表示している楽譜で作ります。MusicXML は MuseScore や JapoScore で開けます。
        {ON_CLAUDE_PAGE && ' このページでは、MIDI・WAV・MusicXML は zip にまとめて保存します。'}
      </p>

      {ON_CLAUDE_PAGE && (
        <label className="field">
          <span className="field-label">コピーした楽譜の文字を貼り付けて読み込む</span>
          <textarea id="paste-score" rows={3} value={pasted} onChange={(e) => setPasted(e.target.value)} />
          <span>
            <Button variant="outlined" disabled={!pasted.trim()} onClick={() => importText(pasted)}>
              貼り付けた楽譜を読み込む
            </Button>
          </span>
        </label>
      )}

      <h3 className="list-title">保存した曲（自動で保存されます）</h3>
      <ul className="song-list">
        {list.map((s) => (
          <li key={s.id} className={s.id === song.id ? 'current' : ''}>
            <button type="button" className="song-open" onClick={() => onOpen(s)}>
              <span className="song-title">{s.title}</span>
              <span className="song-meta">
                {s.parts.length}パート・{s.measures}小節・{new Date(s.updatedAt).toLocaleString('ja-JP')}
              </span>
            </button>
            {s.id !== song.id &&
              (armedId === s.id ? (
                <Button
                  variant="filled"
                  onClick={() => {
                    deleteSong(s.id);
                    setList(loadSongs());
                    setArmedId(null);
                  }}
                >
                  削除する
                </Button>
              ) : (
                <IconButton icon="delete" label={`「${s.title}」を削除`} onClick={() => setArmedId(s.id)} />
              ))}
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
