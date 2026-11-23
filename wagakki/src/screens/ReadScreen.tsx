// 読み替え：1つの音を、選んだ書き方（勘所・ロツレチ・ドレミ・CDE・五線譜）で並べて見る。押すと鳴る
import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../context';
import { BarSlot } from '../components/BarSlot';
import { KinkoText } from '../components/KinkoText';
import { SunSelect, TuningSelect } from '../components/controls';
import { Button, Dialog, IconButton } from '../components/ui';
import { playNote, type Voice } from '../audio/engine';
import { honLabel, noteName, sunLabelWithNote } from '../lib/pitch';
import { openStrings, POSITION_LABELS, rangeOf, STRING_LABELS, tuningOf, MAX_POS } from '../lib/shamisen';
import { kinkoFor, shakuhachiRange } from '../lib/shakuhachi';
import { spell } from '../lib/notation';
import type { Settings } from '../lib/storage';
import type { Instrument } from '../lib/instruments';

export type ReadColumn = 'shamisen' | 'shakuhachi' | 'doremi' | 'cde' | 'staff';

export const COLUMNS: { id: ReadColumn; label: string }[] = [
  { id: 'shamisen', label: '三味線（勘所）' },
  { id: 'shakuhachi', label: '尺八（ロツレチ）' },
  { id: 'doremi', label: 'ドレミ' },
  { id: 'cde', label: 'CDE' },
  { id: 'staff', label: '五線譜' },
];

export function ReadScreen() {
  const { settings, update } = useApp();
  const cols = settings.readColumns.length ? settings.readColumns : (['shamisen', 'shakuhachi', 'doremi'] as ReadColumn[]);
  const [open, setOpen] = useState(false);
  const [lit, setLit] = useState<number | null>(null);
  const voice = useRef<Voice | null>(null);
  useEffect(() => () => voice.current?.stop(), []);

  // 並べる音の範囲：選んだ楽器の音域を合わせたもの（楽器が無ければ C3〜C6）
  const range = useMemo<[number, number]>(() => {
    const rs: [number, number][] = [];
    if (cols.includes('shamisen')) rs.push(rangeOf(settings.shamisenSun, settings.shamisenTuning));
    if (cols.includes('shakuhachi')) rs.push(shakuhachiRange(settings.shakuhachiSun));
    if (!rs.length) return [48, 84];
    return [Math.min(...rs.map((r) => r[0])), Math.max(...rs.map((r) => r[1]))];
  }, [cols, settings.shamisenSun, settings.shamisenTuning, settings.shakuhachiSun]);

  // 鳴らす音色：選んだ楽器の列の最初（無ければ自分の楽器）
  const sound: Instrument = cols.includes('shamisen') ? 'shamisen' : cols.includes('shakuhachi') ? 'shakuhachi' : settings.instrument;

  const play = (midi: number) => {
    voice.current?.stop();
    const v = playNote(sound, midi, { gain: 0.85, a4: settings.a4 });
    voice.current = v;
    if (sound !== 'shamisen') window.setTimeout(() => v.stop(), 700);
    setLit(midi);
    window.setTimeout(() => setLit((x) => (x === midi ? null : x)), 500);
  };

  const rows: number[] = [];
  for (let m = range[0]; m <= range[1]; m++) rows.push(m);
  const frame = staffFrame(range[0], range[1]);

  const toggle = (c: ReadColumn) => {
    const next = cols.includes(c) ? cols.filter((x) => x !== c) : COLUMNS.map((x) => x.id).filter((x) => x === c || cols.includes(x));
    if (next.length) update({ readColumns: next });
  };

  const summary = [
    cols.includes('shamisen') &&
      `三味線 ${settings.shamisenLabel === 'hon' ? honLabel(settings.shamisenSun) : sunLabelWithNote(settings.shamisenSun)}・${tuningOf(settings.shamisenTuning).label}`,
    cols.includes('shakuhachi') && `尺八 ${sunLabelWithNote(settings.shakuhachiSun)}`,
  ]
    .filter(Boolean)
    .join('　');

  return (
    <div className="screen read">
      <BarSlot>
        <button type="button" className="bar-title" onClick={() => setOpen(true)} title="表示する書き方と寸法を選ぶ">
          <span className="bar-title-main">{summary || '表示する書き方を選ぶ'}</span>
          <span className="bar-title-sub">押して寸法・調弦を変える</span>
        </button>
        <span className="spacer" />
        <IconButton icon="edit" label="表示する書き方と寸法を選ぶ" onClick={() => setOpen(true)} />
      </BarSlot>

      <div className="read-chips" role="group" aria-label="表示する書き方">
        {COLUMNS.map((c) => (
          <button key={c.id} type="button" className={`chip-btn${cols.includes(c.id) ? ' on' : ''}`} aria-pressed={cols.includes(c.id)} onClick={() => toggle(c.id)}>
            {c.label}
          </button>
        ))}
      </div>

      {/* 横書きの楽譜と同じく、音を左から右へ。書き方ごとに1行。五線譜の行は1本の続いた五線にする */}
      <div className="read-scroll horizontal">
        <table className="read-table across">
          <tbody>
            {cols.map((c) => (
              <tr key={c} className={c === 'staff' ? 'staff-row' : undefined}>
                <th scope="row">
                  {c === 'staff' ? (
                    <span className="staff-head">
                      <span>五線譜</span>
                      <span className="staff-head-clef" aria-hidden="true">
                        𝄞
                      </span>
                    </span>
                  ) : (
                    COLUMNS.find((x) => x.id === c)!.label.replace(/（.*）/, '')
                  )}
                </th>
                {rows.map((m) => (
                  <td
                    key={m}
                    className={`${lit === m ? 'lit' : ''}${m % 12 === 0 ? ' octave' : ''}`}
                    onClick={() => play(m)}
                    tabIndex={c === cols[0] ? 0 : -1}
                    onKeyDown={(e) => e.key === 'Enter' && play(m)}
                  >
                    {c === 'staff' ? <StaffNote midi={m} frame={frame} /> : <Cell col={c} midi={m} settings={settings} />}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={open} title="読み替えの設定" onClose={() => setOpen(false)} actions={<Button onClick={() => setOpen(false)}>閉じる</Button>}>
        <div className="read-chips in-dialog">
          {COLUMNS.map((c) => (
            <button key={c.id} type="button" className={`chip-btn${cols.includes(c.id) ? ' on' : ''}`} aria-pressed={cols.includes(c.id)} onClick={() => toggle(c.id)}>
              {c.label}
            </button>
          ))}
        </div>
        {cols.includes('shamisen') && (
          <>
            <SunSelect instrument="shamisen" label="三味線の調子" value={settings.shamisenSun} onChange={(v) => update({ shamisenSun: v })} />
            <div className="field-row">
              <span className="field-label">三味線の調弦</span>
              <TuningSelect value={settings.shamisenTuning} onChange={(v) => update({ shamisenTuning: v })} />
            </div>
          </>
        )}
        {cols.includes('shakuhachi') && (
          <SunSelect instrument="shakuhachi" label="尺八の寸法" value={settings.shakuhachiSun} onChange={(v) => update({ shakuhachiSun: v })} />
        )}
        <p className="hint">寸法・調弦は「自分の楽器」と同じものを使います。行を押すとその音が鳴ります。</p>
      </Dialog>
    </div>
  );
}

/** 1つの音を、指定の書き方で表示する（読み替え表・鳴らした音の表示で使う） */
export function Cell({ col, midi, settings }: { col: ReadColumn; midi: number; settings: Settings }) {
  if (col === 'doremi') return <span className="read-name">{noteName(midi, 'doremi')}</span>;
  if (col === 'cde') return <span className="read-name">{noteName(midi, 'cde', true)}</span>;
  if (col === 'staff') return <MiniStaff midi={midi} />;
  if (col === 'shakuhachi') {
    const k = kinkoFor(midi, settings.shakuhachiSun);
    return k ? <KinkoText note={k} /> : <span className="read-none">—</span>;
  }
  // 三味線：勘所の数字がいちばん小さい糸を大きく、ほかの糸で弾ける場所を小さく
  const opens = openStrings(settings.shamisenSun, settings.shamisenTuning);
  const all = opens
    .map((o, s) => ({ s, p: midi - o }))
    .filter((x) => x.p >= 0 && x.p <= MAX_POS)
    .sort((a, b) => a.p - b.p || b.s - a.s);
  if (!all.length) return <span className="read-none">—</span>;
  const [main, ...rest] = all;
  return (
    <span className="read-sham">
      <span className="read-sham-main">
        <span className="read-str">{STRING_LABELS[main.s]}</span>
        {POSITION_LABELS[main.p]}
      </span>
      {rest.map((x) => (
        <span key={x.s} className="read-sham-alt">
          {STRING_LABELS[x.s]} {POSITION_LABELS[x.p]}
        </span>
      ))}
    </span>
  );
}

// ---- 五線譜（いつもト音記号） ----

const LINE_GAP = 6; // 線の間隔
/** 白鍵で数えた高さ（C0 = 0） */
const diatonic = (midi: number) => {
  const sp = spell(midi);
  return sp.octave * 7 + 'CDEFGAB'.indexOf(sp.step);
};
const E4 = 4 * 7 + 2; // ト音記号の一番下の線
const G2 = 2 * 7 + 4; // ヘ音記号の一番下の線

interface Frame {
  bottomY: number;
  height: number;
  /** 一番下の線の音（白鍵で数えた高さ） */
  bottom: number;
}

/** 行全体で共通の、五線の上下の位置（低い音・高い音の加線が収まる高さ） */
function staffFrame(lo: number, hi: number, bass = false): Frame {
  const bottom = bass ? G2 : E4;
  const below = Math.max(0, bottom - diatonic(lo)) * (LINE_GAP / 2);
  const above = Math.max(0, diatonic(hi) - (bottom + 8)) * (LINE_GAP / 2);
  const bottomY = 4 * LINE_GAP + above + 10;
  return { bottomY, height: bottomY + below + 10, bottom };
}

/** 続いた五線の上の1音（読み替え表の五線譜の行） */
function StaffNote({ midi, frame }: { midi: number; frame: Frame }) {
  const sp = spell(midi);
  const dn = diatonic(midi);
  const B = frame.bottom;
  const y = frame.bottomY - (dn - B) * (LINE_GAP / 2);
  const ledgers: number[] = [];
  for (let d = B - 2; d >= dn; d -= 2) ledgers.push(frame.bottomY - (d - B) * (LINE_GAP / 2));
  for (let d = B + 10; d <= dn; d += 2) ledgers.push(frame.bottomY - (d - B) * (LINE_GAP / 2));
  return (
    <svg className="staff-note" width="100%" height={frame.height} aria-label={noteName(midi, 'cde', true)}>
      {[0, 1, 2, 3, 4].map((i) => (
        <line key={i} x1="0" x2="100%" y1={frame.bottomY - i * LINE_GAP} y2={frame.bottomY - i * LINE_GAP} />
      ))}
      {ledgers.map((ly) => (
        <line key={ly} x1="30%" x2="70%" y1={ly} y2={ly} />
      ))}
      {sp.alter > 0 && (
        <text x="22%" y={y + 4} className="mini-acc">
          ♯
        </text>
      )}
      <ellipse cx="50%" cy={y} rx="4.6" ry="3.3" />
    </svg>
  );
}

/** 1音だけの小さな五線譜（鳴らすの画面の表示用）。真ん中のドより低い音はヘ音記号 */
function MiniStaff({ midi }: { midi: number }) {
  const bass = midi < 60;
  const frame = staffFrame(midi, midi, bass);
  return (
    <span className="mini-staff-wrap">
      <span className={`mini-clef${bass ? ' bass' : ''}`} aria-hidden="true">
        {bass ? '𝄢' : '𝄞'}
      </span>
      <StaffNote midi={midi} frame={frame} />
    </span>
  );
}
