// 楽譜を書くときの、楽器ごとの画面上のキーパッド（かな入力のようにフリックで選ぶ）
import { useState } from 'react';
import { useApp } from '../context';
import { noteName } from '../lib/pitch';
import { openStrings, POSITION_LABELS, STRING_LABELS, type Tuning } from '../lib/shamisen';
import { kinkoFor } from '../lib/shakuhachi';
import { instrumentDef, type Instrument } from '../lib/instruments';
import { SHAKU_FINGERS } from '../lib/keymaps';
import { FlickPad, type FlickItem, type FlickKey, type PadAction } from './FlickPad';
import { Icon } from './icons';
import { Segmented } from './ui';

export function ScoreKeypad({
  instrument,
  sun,
  tuning,
  onNote,
  onRest,
  onExtend,
  onDelete,
}: {
  instrument: Instrument;
  sun: number;
  tuning: Tuning;
  onNote: (midi: number, str?: number) => void;
  onRest: () => void;
  onExtend: () => void;
  onDelete: () => void;
}) {
  const { settings } = useApp();
  const [string, setString] = useState(2); // 三味線：弾く糸（初めは三の糸）
  const [register, setRegister] = useState<0 | 12 | 24>(0); // 尺八：乙・甲・大甲
  const [octave, setOctave] = useState(4); // ピアノ：ドの高さ
  const [lo, hi] = instrumentDef(instrument).range(sun, tuning);
  const ok = (m: number) => m >= lo && m <= hi;

  const actions: PadAction[] = [
    { id: 'del', label: <Icon name="backspace" size={22} />, title: '消す（前の音へ）', onPress: onDelete },
    { id: 'rest', label: <span className="flick-action-text">○ 休み</span>, title: '休み', onPress: onRest },
    { id: 'ext', label: <span className="flick-action-text">ー 伸ばし</span>, title: '伸ばし', onPress: onExtend },
  ];

  let header = null;
  let keys: FlickKey[] = [];

  if (instrument === 'shamisen') {
    const open = openStrings(sun, tuning)[string];
    const item = (pos: number): FlickItem | null => (pos >= 0 && pos < POSITION_LABELS.length ? { label: POSITION_LABELS[pos], midi: open + pos, str: string } : null);
    // 押すと 0〜♭、下にはらうと1オクターブ上（10〜1♭）。♭は上にはらうと 20
    keys = Array.from({ length: 12 }, (_, i) => ({ id: `p${i}`, center: item(i), down: item(i + 12), ...(i === 11 ? { up: item(24) } : {}) }));
    header = (
      <Segmented<number>
        dense
        label="弾く糸"
        value={string}
        onChange={setString}
        options={[0, 1, 2].map((s) => ({ value: s, label: `${STRING_LABELS[s]}の糸` }))}
      />
    );
  } else if (instrument === 'shakuhachi') {
    const base = instrumentDef('shakuhachi').base(sun);
    const item = (rel: number): FlickItem | null => {
      const k = kinkoFor(base + rel, sun);
      return k && ok(base + rel) ? { label: `${k.register === '乙' ? '' : k.register === '甲' ? '甲' : '大'}${k.name}`, midi: base + rel } : null;
    };
    // 押すと指（ロツレチリ）、左＝メリ、上＝大メリ、右＝カリ、下＝1オクターブ上
    keys = SHAKU_FINGERS.map((f) => {
      const r = f.rel + register;
      return { id: f.id, center: item(r), left: item(r - 1), up: item(r - 2), right: item(r + 1), down: item(r + 12) };
    });
    header = (
      <Segmented<0 | 12 | 24>
        dense
        label="音域"
        value={register}
        onChange={setRegister}
        options={[
          { value: 0, label: '乙' },
          { value: 12, label: '甲' },
          { value: 24, label: '大甲' },
        ]}
      />
    );
  } else {
    const c = (octave + 1) * 12;
    const name = (m: number) => noteName(m, settings.nameStyle);
    const item = (m: number, withOct = false): FlickItem | null => (ok(m) ? { label: withOct ? noteName(m, settings.nameStyle, true) : name(m), midi: m } : null);
    // 押すとドレミ、右＝♯、左＝♭、下＝1オクターブ上、上＝1オクターブ下
    const whites = [0, 2, 4, 5, 7, 9, 11, 12];
    keys = whites.map((w, i) => ({
      id: `w${i}`,
      center: item(c + w),
      right: [4, 11].includes(w % 12) ? null : item(c + w + 1),
      left: [0, 5].includes(w % 12) ? null : item(c + w - 1),
      down: item(c + w + 12, true),
      up: item(c + w - 12, true),
    }));
    header = (
      <div className="keypad-octave">
        <button type="button" className="chip-btn" onClick={() => setOctave((o) => Math.max(0, o - 1))} aria-label="1オクターブ下">
          ◀
        </button>
        <span>
          ド＝C{octave}
        </span>
        <button type="button" className="chip-btn" onClick={() => setOctave((o) => Math.min(7, o + 1))} aria-label="1オクターブ上">
          ▶
        </button>
      </div>
    );
  }

  return (
    <div className="score-keypad">
      <div className="keypad-head">
        {header}
        <span className="keypad-hint">押す：音　はらう：{instrument === 'shamisen' ? '下＝1オクターブ上' : instrument === 'shakuhachi' ? '左＝メリ・上＝大メリ・右＝カリ・下＝1オクターブ上' : '右＝♯・左＝♭・下上＝オクターブ'}</span>
      </div>
      <FlickPad keys={keys} actions={actions} onPick={(it) => onNote(it.midi, it.str)} />
    </div>
  );
}
