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
        <IconButton
          icon={settings.readLayout === 'columns' ? 'rows' : 'columns'}
          label={settings.readLayout === 'columns' ? '横に並べる（音を左から右へ）' : '縦に並べる（音を上から下へ）'}
          onClick={() => update({ readLayout: settings.readLayout === 'columns' ? 'rows' : 'columns' })}
        />
        <IconButton icon="edit" label="表示する書き方と寸法を選ぶ" onClick={() => setOpen(true)} />
      </BarSlot>

      <div className="read-chips" role="group" aria-label="表示する書き方">
        {COLUMNS.map((c) => (
          <button key={c.id} type="button" className={`chip-btn${cols.includes(c.id) ? ' on' : ''}`} aria-pressed={cols.includes(c.id)} onClick={() => toggle(c.id)}>
            {c.label}
          </button>
        ))}
      </div>

      {settings.readLayout === 'columns' ? (
        <div className="read-scroll">
          <table className="read-table">
            <thead>
              <tr>
                {cols.map((c) => (
                  <th key={c}>{COLUMNS.find((x) => x.id === c)!.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m} className={`${lit === m ? 'lit' : ''}${m % 12 === 0 ? ' octave' : ''}`} onClick={() => play(m)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && play(m)}>
                  {cols.map((c) => (
                    <td key={c}>
                      <Cell col={c} midi={m} settings={settings} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        // 横向き：横書きの楽譜と同じく、音を左から右へ。書き方ごとに1行
        <div className="read-scroll horizontal">
          <table className="read-table across">
            <tbody>
              {cols.map((c) => (
                <tr key={c}>
                  <th scope="row">{COLUMNS.find((x) => x.id === c)!.label.replace(/（.*）/, '')}</th>
                  {rows.map((m) => (
                    <td
                      key={m}
                      className={`${lit === m ? 'lit' : ''}${m % 12 === 0 ? ' octave' : ''}`}
                      onClick={() => play(m)}
                      tabIndex={c === cols[0] ? 0 : -1}
                      onKeyDown={(e) => e.key === 'Enter' && play(m)}
                    >
                      <Cell col={c} midi={m} settings={settings} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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

/** 小さな五線譜（C4 より下はヘ音記号） */
function MiniStaff({ midi }: { midi: number }) {
  const sp = spell(midi);
  const dn = sp.octave * 7 + 'CDEFGAB'.indexOf(sp.step); // 白鍵で数えた高さ
  const bass = midi < 60;
  const bottom = bass ? 2 * 7 + 4 : 4 * 7 + 2; // 一番下の線：G2 / E4
  const lineY = (i: number) => 34 - i * 6; // i=0 が一番下の線
  const y = 34 - (dn - bottom) * 3;
  const ledgers: number[] = [];
  for (let d = bottom - 2; d >= dn; d -= 2) ledgers.push(34 - (d - bottom) * 3);
  for (let d = bottom + 10; d <= dn; d += 2) ledgers.push(34 - (d - bottom) * 3);
  const h = Math.max(46, 40 + Math.max(0, y - 34), 40 + Math.max(0, 6 - y));
  const top = Math.min(0, y - 8);
  return (
    <svg className="mini-staff" width="74" height={h} viewBox={`0 ${top} 74 ${h}`} aria-label={noteName(midi, 'cde', true)}>
      <text x="2" y={bass ? 24 : 36} className="mini-clef">
        {bass ? '𝄢' : '𝄞'}
      </text>
      {[0, 1, 2, 3, 4].map((i) => (
        <line key={i} x1="0" x2="74" y1={lineY(i)} y2={lineY(i)} />
      ))}
      {ledgers.map((ly) => (
        <line key={ly} x1="38" x2="56" y1={ly} y2={ly} />
      ))}
      {sp.alter > 0 && (
        <text x="30" y={y + 4} className="mini-acc">
          ♯
        </text>
      )}
      <ellipse cx="47" cy={y} rx="4.4" ry="3.2" transform={`rotate(-20 47 ${y})`} />
    </svg>
  );
}
