// 楽譜作成モード
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../context';
import { Player } from '../audio/player';
import { renderWav } from '../audio/render';
import { InstrumentPanel } from '../components/InstrumentPanel';
import { InstrumentSelect, SunSelect, TuningSelect } from '../components/controls';
import { Button, Dialog, IconButton, Segmented, Select, Switch } from '../components/ui';
import { Icon } from '../components/icons';
import { SUN_MAX, SUN_MIN, sunLabel } from '../lib/pitch';
import {
  addTuplet,
  changeSun,
  deleteMeasureAt,
  deleteNoteAt,
  deleteRange,
  eventAt,
  extendAt,
  insertMeasureAt,
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
  type Part,
  type Song,
} from '../lib/score';
import { buildMidi, buildMusicXml } from '../lib/exporters';
import { buildPdf, ON_CLAUDE_PAGE, safeName, saveFile, type SaveResult } from '../lib/save';
import { currentSongId, deleteSong, loadSongs, saveSong, type Settings } from '../lib/storage';
import { PART_COLORS, ScoreView, type Cursor, type ScoreNotation, type Selection } from './ScoreView';

function initialSong(): Song {
  const id = currentSongId();
  const songs = loadSongs();
  return songs.find((s) => s.id === id) ?? songs[0] ?? newSong();
}

// 音の長さ（1拍＝480）
const BASES: { v: number; label: string; key: string }[] = [
  { v: 1920, label: '4拍', key: '5' },
  { v: 960, label: '2拍', key: '4' },
  { v: 480, label: '1拍', key: '3' },
  { v: 240, label: '½拍', key: '2' },
  { v: 120, label: '¼拍', key: '1' },
];

const HISTORY = 200;

type ExportKind = 'midi' | 'xml' | 'wav' | 'pdf' | 'json';

export function ScoreScreen() {
  const { settings, update, toast } = useApp();
  const [song, setSong] = useState<Song>(initialSong);
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
  const [dlg, setDlg] = useState<null | 'part' | 'song' | 'files' | 'add'>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [pdfStage, setPdfStage] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const player = useRef(new Player());
  const past = useRef<Song[]>([]);
  const future = useRef<Song[]>([]);
  const clip = useRef<Ev[] | null>(null);
  const [, bump] = useState(0); // 元に戻す・やり直しのボタンの状態を描き直す

  const edit = song.parts[editIdx] ?? song.parts[0];
  const notation: ScoreNotation =
    settings.scoreView === 'auto' ? (edit.instrument === 'shamisen' ? 'bunka' : 'kinko') : settings.scoreView;
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

  const onNote = (midi: number, str?: number) =>
    writeHere(edit.instrument === 'shamisen' && str !== undefined ? { midi, str } : { midi });

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

  return (
    <div className="screen score-screen">
      <div className="toolbar score-toolbar">
        <IconButton icon="folder" label="曲（新規・開く・書き出し）" onClick={() => setDlg('files')} />
        <button type="button" className="title-btn" onClick={() => setDlg('song')}>
          <span className="song-title">{song.title}</span>
          <span className="song-meta">
            ♩={song.tempo}・{song.beatsPerMeasure}拍子・{song.measures}小節
          </span>
        </button>
        <span className="spacer" />
        <Select<Settings['scoreView']>
          label="表示する楽譜"
          value={settings.scoreView}
          onChange={(v) => update({ scoreView: v })}
          options={[
            { value: 'auto', label: '自動' },
            { value: 'bunka', label: '文化譜' },
            { value: 'kinko', label: '琴古譜' },
            { value: 'staff', label: '五線譜' },
          ]}
        />
        <IconButton icon="loop" label="くり返し再生" variant="outlined" selected={loop} onClick={() => setLoop((l) => !l)} />
        <IconButton icon={playing ? 'stop' : 'play'} label={playing ? '停止（スペース）' : 'カーソルから再生（スペース）'} variant="filled" onClick={togglePlay} />
      </div>

      <div className="parts-bar" role="tablist" aria-label="パート">
        {song.parts.map((p, i) => (
          <div key={p.id} className={`part-chip${i === editIdx ? ' on' : ''}`}>
            <button
              type="button"
              role="tab"
              aria-selected={i === editIdx}
              className="part-chip-main"
              onClick={() => {
                if (i === editIdx) setDlg('part');
                setEditIdx(i);
                setSelection(null);
                setCursor((c) => ({ part: i, t: c.t }));
              }}
            >
              <span className="swatch" style={{ background: PART_COLORS[i % PART_COLORS.length] }} />
              <span>{p.name || `パート${i + 1}`}</span>
              <span className="part-chip-sub">
                {p.instrument === 'shamisen' ? '三味線' : '尺八'}・{sunLabel(p.sun)}
              </span>
              {i === editIdx && <Icon name="edit" size={16} />}
            </button>
            <button
              type="button"
              className="part-chip-mute"
              aria-label={p.muted ? `${p.name}の消音を解除` : `${p.name}を消音`}
              aria-pressed={p.muted}
              onClick={() => mutate((s) => ({ ...s, parts: s.parts.map((x, j) => (j === i ? { ...x, muted: !x.muted } : x)) }))}
            >
              <Icon name={p.muted ? 'volumeOff' : 'volumeOn'} size={18} />
            </button>
          </div>
        ))}
        {song.parts.length < MAX_PARTS && (
          <button type="button" className="part-add" onClick={() => setDlg('add')}>
            <Icon name="add" size={18} />
            パート
          </button>
        )}
      </div>

      <div className="score-scroll">
        <ScoreView {...viewProps} cursor={cursor} selection={selection} playBeat={playBeat} onSelect={select} />
      </div>

      <div className={`input-dock${panelOpen ? '' : ' closed'}`}>
        <div className="edit-bar">
          <span className="edit-bar-label">長さ</span>
          <div className="dur-group" role="radiogroup" aria-label="音の長さ">
            {BASES.map((b) => (
              <button
                key={b.v}
                type="button"
                role="radio"
                aria-checked={base === b.v}
                className={`dur-btn${base === b.v ? ' on' : ''}`}
                onClick={() => setBase(b.v)}
                title={`${b.label}（${b.key} キー）`}
              >
                {b.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className={`chip-btn${dotted ? ' on' : ''}`}
            aria-pressed={dotted}
            onClick={() => {
              setDotted((d) => !d);
              setTriplet(false);
            }}
            title="付点（. キー）"
          >
            付点
          </button>
          <button
            type="button"
            className={`chip-btn${triplet ? ' on' : ''}`}
            aria-pressed={triplet}
            onClick={() => {
              setTriplet((d) => !d);
              setDotted(false);
            }}
            title="3連符（, キー）：選んだ長さ2つ分の時間に3つ入れる"
          >
            3連
          </button>
          <span className="spacer" />
          <IconButton icon={panelOpen ? 'expand' : 'collapse'} label={panelOpen ? '楽器の画面を隠す' : '楽器の画面を出す'} onClick={() => setPanelOpen((o) => !o)} />
        </div>
        <div className="edit-bar">
          <IconButton icon="left" label="前へ（←）" onClick={() => select(cursor.part, stepFrom(cursor.part, cursor.t, -1), false)} />
          <IconButton icon="right" label="次へ（→）" onClick={() => select(cursor.part, stepFrom(cursor.part, cursor.t, 1), false)} />
          <button type="button" className="chip-btn" onClick={() => writeHere({})} title="休み（0 キー）">
            ○ 休み
          </button>
          <button type="button" className="chip-btn" onClick={() => writeHere({}, true)} title="伸ばし（- キー）">
            ー 伸ばし
          </button>
          <IconButton icon="backspace" label="消す（Delete）" onClick={clearHere} />
          <span className="bar-sep" />
          <IconButton icon="undo" label="元に戻す（Ctrl+Z）" onClick={undo} disabled={!past.current.length} />
          <IconButton icon="redo" label="やり直す（Ctrl+Shift+Z）" onClick={redo} disabled={!future.current.length} />
          <span className="bar-sep" />
          <button
            type="button"
            className={`chip-btn${rangeMode ? ' on' : ''}`}
            aria-pressed={rangeMode}
            onClick={() => {
              setRangeMode((m) => !m);
              setSelection(null);
              setAnchor(cursor.t);
            }}
            title="範囲を選ぶ（Shift を押しながら選んでも同じ）"
          >
            範囲
          </button>
          <IconButton icon="copy" label="コピー（Ctrl+C）" onClick={() => copy(false)} />
          <IconButton icon="cut" label="切り取り（Ctrl+X）" onClick={() => copy(true)} />
          <IconButton icon="paste" label="貼り付け（Ctrl+V）" onClick={paste} />
          <span className="bar-sep" />
          <button type="button" className="chip-btn" onClick={insertMeasure} title="カーソルのある小節の前に1小節入れる">
            小節＋
          </button>
          <button type="button" className="chip-btn" onClick={deleteMeasure} title="カーソルのある小節を消す">
            小節−
          </button>
        </div>
        {panelOpen && edit && (
          <InstrumentPanel instrument={edit.instrument} sun={edit.sun} tuning={edit.tuning} external={sounding} onNote={onNote} volume={edit.volume} />
        )}
      </div>

      {busy && (
        <div className="busy" role="status">
          {busy}
        </div>
      )}

      <PartDialog
        open={dlg === 'part'}
        part={edit}
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
        onAdd={(inst, sun, tuning) => {
          const n = song.parts.length;
          mutate((s) => ({ ...s, parts: [...s.parts, newPart(inst, sun, tuning, songLen(s), `${inst === 'shamisen' ? '三味線' : '尺八'}${n + 1}`)] }));
          setEditIdx(n);
          setCursor({ part: n, t: 0 });
          setAnchor(0);
          setDlg(null);
        }}
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
        toast={toast}
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
  canDelete,
  onClose,
  onChange,
  onDelete,
}: {
  open: boolean;
  part: Part;
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
      <div className="field-row">
        <span className="field-label">楽器</span>
        <InstrumentSelect value={part.instrument} onChange={(v) => onChange((p) => ({ ...p, instrument: v }))} />
      </div>
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
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  defaults: Part;
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
      <div className="field-row">
        <span className="field-label">楽器</span>
        <InstrumentSelect value={inst} onChange={setInst} />
      </div>
      <SunSelect instrument={inst} value={sun} onChange={setSun} />
      {inst === 'shamisen' && (
        <div className="field-row">
          <span className="field-label">調弦</span>
          <TuningSelect value={tuning} onChange={setTuning} />
        </div>
      )}
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
  toast,
}: {
  open: boolean;
  song: Song;
  onClose: () => void;
  onOpen: (s: Song) => void;
  onExport: (kind: ExportKind) => void;
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
          onClick={() => {
            saveSong(song);
            onOpen(newSong(song.parts[0]?.instrument, song.parts[0]?.sun, song.parts[0]?.tuning));
          }}
        >
          新しい曲
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
