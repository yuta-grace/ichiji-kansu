// 楽譜作成モード
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../context';
import { Player } from '../audio/player';
import { InstrumentPanel } from '../components/InstrumentPanel';
import { InstrumentSelect, SunSelect, TuningSelect } from '../components/controls';
import { Button, Dialog, IconButton, Segmented, Switch } from '../components/ui';
import { Icon } from '../components/icons';
import { SUN_MAX, SUN_MIN, sunLabel } from '../lib/pitch';
import {
  changeSun,
  MAX_PARTS,
  newPart,
  newSong,
  normalize,
  parseSong,
  partEvents,
  setDiv,
  shiftAllSun,
  totalBeats,
  type Div,
  type Instrument,
  type Part,
  type Slot,
  type Song,
} from '../lib/score';
import { currentSongId, deleteSong, loadSongs, saveSong } from '../lib/storage';
import { PART_COLORS, ScoreView, type Cursor } from './ScoreView';

/** claude.ai の非公開ページとして動いているか（ファイル保存・印刷ができない） */
const ON_CLAUDE_PAGE = import.meta.env.VITE_CLAUDE_PAGE === '1';

function initialSong(): Song {
  const id = currentSongId();
  const songs = loadSongs();
  return songs.find((s) => s.id === id) ?? songs[0] ?? newSong();
}

export function ScoreScreen() {
  const { settings, toast } = useApp();
  const [song, setSong] = useState<Song>(initialSong);
  const [editIdx, setEditIdx] = useState(0);
  const [cursor, setCursor] = useState<Cursor>({ part: 0, beat: 0, slot: 0 });
  const [playBeat, setPlayBeat] = useState<number | null>(null);
  const [dlg, setDlg] = useState<null | 'part' | 'song' | 'files' | 'add'>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const player = useRef(new Player());

  const edit = song.parts[editIdx] ?? song.parts[0];

  // 自動保存
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
  // 画面を切り替えたり閉じたりしたときも、保存していない変更を残す
  useEffect(() => {
    const flush = () => {
      if (dirty.current) saveSong(latest.current);
      dirty.current = false;
    };
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, []);

  useEffect(() => () => player.current.stop(), []);

  const mutate = useCallback((f: (s: Song) => Song) => setSong((s) => normalize({ ...f(s), updatedAt: Date.now() })), []);

  const updatePart = (idx: number, f: (p: Part) => Part) =>
    mutate((s) => ({ ...s, parts: s.parts.map((p, i) => (i === idx ? f(p) : p)) }));

  // ---- カーソル ----
  const step = (c: Cursor, dir: 1 | -1, s: Song = song): Cursor => {
    const p = s.parts[c.part];
    const b = p.beats[c.beat];
    if (dir === 1) {
      if (c.slot + 1 < b.div) return { ...c, slot: c.slot + 1 };
      return { ...c, beat: c.beat + 1, slot: 0 };
    }
    if (c.slot > 0) return { ...c, slot: c.slot - 1 };
    if (c.beat === 0) return c;
    return { ...c, beat: c.beat - 1, slot: p.beats[c.beat - 1].div - 1 };
  };

  const putSlot = (value: Slot, advance = true) => {
    const c = cursor;
    let next = song;
    next = {
      ...next,
      parts: next.parts.map((p, i) =>
        i !== c.part
          ? p
          : { ...p, beats: p.beats.map((b, bi) => (bi !== c.beat ? b : { ...b, slots: b.slots.map((x, si) => (si === c.slot ? value : x)) })) },
      ),
    };
    let nc = advance ? step(c, 1, next) : c;
    if (nc.beat >= totalBeats(next)) {
      next = normalize({ ...next, measures: next.measures + 1 });
    }
    setSong({ ...normalize(next), updatedAt: Date.now() });
    setCursor(nc);
  };

  const onNote = (midi: number, str?: number) => {
    if (cursor.part !== editIdx) setCursor((c) => ({ ...c, part: editIdx }));
    putSlot(edit.instrument === 'shamisen' && str !== undefined ? { k: 'n', midi, str } : { k: 'n', midi });
  };

  const setBeatDiv = (div: Div) => {
    updatePart(cursor.part, (p) => ({ ...p, beats: p.beats.map((b, i) => (i === cursor.beat ? setDiv(b, div) : b)) }));
    setCursor((c) => ({ ...c, slot: Math.min(c.slot, div - 1) }));
  };

  // ---- 再生 ----
  const playing = playBeat !== null;
  const togglePlay = () => {
    if (playing) {
      player.current.stop();
      setPlayBeat(null);
      return;
    }
    const from = cursor.beat >= totalBeats(song) - 1 ? 0 : cursor.beat;
    let last = -1;
    player.current.start(
      song,
      from,
      settings.a4,
      (b) => {
        if (b === null) return setPlayBeat(null);
        const q = Math.floor(b * 12) / 12; // 描き直しを減らす
        if (q !== last) {
          last = q;
          setPlayBeat(q);
        }
      },
    );
  };
  useEffect(() => {
    song.parts.forEach((p) => player.current.setPart(p.id, p.volume, p.muted));
  }, [song.parts]);

  // 再生中に編集中のパートで鳴っている音
  const sounding = useMemo(() => {
    const s = new Set<number>();
    if (playBeat === null || !edit) return s;
    for (const e of partEvents(edit)) if (playBeat >= e.start && playBeat < e.start + e.dur) s.add(e.midi);
    return s;
  }, [playBeat, edit]);

  // ---- キーボード ----
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyRef.current = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest('input, textarea, select, dialog') || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    const handled = () => e.preventDefault();
    if (k === 'ArrowRight') (handled(), setCursor((c) => step(c, 1)));
    else if (k === 'ArrowLeft') (handled(), setCursor((c) => step(c, -1)));
    else if (k === 'ArrowDown' || k === 'ArrowUp') {
      handled();
      const n = Math.max(0, Math.min(song.parts.length - 1, cursor.part + (k === 'ArrowDown' ? 1 : -1)));
      setEditIdx(n);
      setCursor((c) => ({ ...c, part: n, slot: Math.min(c.slot, song.parts[n].beats[c.beat].div - 1) }));
    } else if (k === '-' || k === 'ー') (handled(), putSlot({ k: 'x' }));
    else if (k === '.' || k === '0') (handled(), putSlot({ k: 'r' }));
    else if (k === 'Delete') (handled(), putSlot(null, false));
    else if (k === 'Backspace') {
      handled();
      const prev = step(cursor, -1);
      setCursor(prev);
      mutate((s) => ({
        ...s,
        parts: s.parts.map((p, i) =>
          i !== prev.part ? p : { ...p, beats: p.beats.map((b, bi) => (bi !== prev.beat ? b : { ...b, slots: b.slots.map((x, si) => (si === prev.slot ? null : x)) })) },
        ),
      }));
    } else if (k === ' ') (handled(), togglePlay());
    else if (['1', '2', '3', '4'].includes(k)) (handled(), setBeatDiv(Number(k) as Div));
  };
  useEffect(() => {
    const f = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, []);

  const curBeat = song.parts[cursor.part]?.beats[cursor.beat];

  return (
    <div className="screen score-screen">
      <div className="toolbar score-toolbar">
        <IconButton icon="folder" label="曲（新規・開く・書き出し・印刷）" onClick={() => setDlg('files')} />
        <button type="button" className="title-btn" onClick={() => setDlg('song')}>
          <span className="song-title">{song.title}</span>
          <span className="song-meta">
            ♩={song.tempo}・{song.beatsPerMeasure}拍子・{song.measures}小節
          </span>
        </button>
        <span className="spacer" />
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
                setCursor((c) => ({ ...c, part: i, slot: Math.min(c.slot, p.beats[c.beat].div - 1) }));
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
              onClick={() => updatePart(i, (x) => ({ ...x, muted: !x.muted }))}
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
        <ScoreView
          song={song}
          editIdx={editIdx}
          cursor={cursor}
          playBeat={playBeat}
          onSelect={(c) => {
            setCursor(c);
            setEditIdx(c.part);
          }}
        />
      </div>

      <div className={`input-dock${panelOpen ? '' : ' closed'}`}>
        <div className="edit-bar">
          <IconButton icon="left" label="前へ（←）" onClick={() => setCursor((c) => step(c, -1))} />
          <IconButton icon="right" label="次へ（→）" onClick={() => setCursor((c) => step(c, 1))} />
          <button type="button" className="chip-btn" onClick={() => putSlot({ k: 'r' })} title="休み（. キー）">
            ○ 休み
          </button>
          <button type="button" className="chip-btn" onClick={() => putSlot({ k: 'x' })} title="伸ばし（- キー）">
            ー 伸ばし
          </button>
          <IconButton icon="backspace" label="消す（Delete）" onClick={() => putSlot(null, false)} />
          <span className="edit-bar-label">拍の分割</span>
          <Segmented<Div>
            dense
            label="拍の分割"
            value={curBeat?.div ?? 1}
            onChange={setBeatDiv}
            options={[1, 2, 3, 4].map((d) => ({ value: d as Div, label: String(d) }))}
          />
          <span className="spacer" />
          <IconButton
            icon={panelOpen ? 'expand' : 'collapse'}
            label={panelOpen ? '楽器の画面を隠す' : '楽器の画面を出す'}
            onClick={() => setPanelOpen((o) => !o)}
          />
        </div>
        {panelOpen && edit && (
          <InstrumentPanel instrument={edit.instrument} sun={edit.sun} tuning={edit.tuning} external={sounding} onNote={onNote} volume={edit.volume} />
        )}
      </div>

      <PartDialog
        open={dlg === 'part'}
        part={edit}
        canDelete={song.parts.length > 1}
        onClose={() => setDlg(null)}
        onChange={(f) => updatePart(editIdx, f)}
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
          mutate((s) => ({ ...s, parts: [...s.parts, newPart(inst, sun, tuning, totalBeats(s), `${inst === 'shamisen' ? '三味線' : '尺八'}${n + 1}`)] }));
          setEditIdx(n);
          setCursor((c) => ({ ...c, part: n, slot: 0 }));
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
          setSong(s);
          setEditIdx(0);
          setCursor({ part: 0, beat: 0, slot: 0 });
          setDlg(null);
        }}
        toast={toast}
      />
      <div className="print-only">
        <h1 className="print-title">{song.title}</h1>
        <p className="print-meta">
          ♩={song.tempo}　{song.beatsPerMeasure}拍子　{edit.instrument === 'shamisen' ? '文化譜（三味線）' : '琴古譜（尺八）'}の表記
        </p>
        <ScoreView song={song} editIdx={editIdx} cursor={null} playBeat={null} onSelect={() => {}} printMode />
      </div>
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
        <input value={part.name} maxLength={20} onChange={(e) => onChange((p) => ({ ...p, name: e.target.value }))} />
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
        <input type="range" min={0} max={1} step={0.05} value={part.volume} onChange={(e) => onChange((p) => ({ ...p, volume: Number(e.target.value) }))} />
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
    const blocked = song.parts.some((p) => p.sun - steps < SUN_MIN || p.sun - steps > SUN_MAX);
    if (blocked) {
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
        <input value={song.title} maxLength={40} onChange={(e) => mutate((s) => ({ ...s, title: e.target.value }))} />
      </label>
      <label className="field">
        <span className="field-label">テンポ（1分間の拍数）{song.tempo}</span>
        <input type="range" min={30} max={240} value={song.tempo} onChange={(e) => mutate((s) => ({ ...s, tempo: Number(e.target.value) }))} />
      </label>
      <div className="field-row">
        <span className="field-label">拍子</span>
        <Segmented
          dense
          label="拍子"
          value={song.beatsPerMeasure}
          onChange={(v) => mutate((s) => ({ ...s, beatsPerMeasure: v, measures: Math.max(1, Math.ceil(totalBeats(s) / v)) }))}
          options={[2, 3, 4].map((v) => ({ value: v, label: `${v}拍` }))}
        />
      </div>
      <div className="field-row">
        <span className="field-label">小節の数 {song.measures}</span>
        <Button variant="outlined" onClick={() => mutate((s) => ({ ...s, measures: Math.max(1, s.measures - 1) }))}>
          −1
        </Button>
        <Button variant="outlined" onClick={() => mutate((s) => ({ ...s, measures: Math.min(200, s.measures + 1) }))}>
          ＋1
        </Button>
        <Button variant="outlined" onClick={() => mutate((s) => ({ ...s, measures: Math.min(200, s.measures + 4) }))}>
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
  toast,
}: {
  open: boolean;
  song: Song;
  onClose: () => void;
  onOpen: (s: Song) => void;
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

  // claude.ai のページではファイルを保存できないので、楽譜の文字をコピーする
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

  const exportFile = () => {
    const blob = new Blob([JSON.stringify(song, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${song.title || 'score'}.wagakki.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
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
        {ON_CLAUDE_PAGE ? (
          <Button icon="download" variant="tonal" onClick={copyText}>
            楽譜をコピー
          </Button>
        ) : (
          <Button icon="download" variant="tonal" onClick={exportFile}>
            ファイルに書き出し
          </Button>
        )}
        <Button icon="upload" variant="tonal" onClick={() => fileRef.current?.click()}>
          ファイルから読み込み
        </Button>
        {!ON_CLAUDE_PAGE && (
          <Button
            icon="print"
            variant="tonal"
            onClick={() => {
              onClose();
              setTimeout(() => window.print(), 150);
            }}
          >
            印刷・PDF
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
            if (!f) return;
            importText(await f.text());
          }}
        />
      </div>
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
            {s.id !== song.id && (
              armedId === s.id ? (
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
              )
            )}
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
