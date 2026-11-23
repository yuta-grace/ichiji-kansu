// 楽器の画面＋ピアノ鍵盤。押すと鳴らし、onNote で知らせる（楽譜の入力に使う）
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../context';
import { playNote, type Voice } from '../audio/engine';
import { pc } from '../lib/pitch';
import { fingeringFor, openStrings, type Tuning } from '../lib/shamisen';
import { actionOf, keyLabel, keymapFor, SHAKU_FINGERS, SHAKU_MODS } from '../lib/keymaps';
import { instrumentDef } from '../lib/instruments';
import type { Instrument } from '../lib/score';
import { ShamisenNeck } from './ShamisenNeck';
import { ShakuhachiPad } from './ShakuhachiPad';
import { Piano } from './Piano';

export function InstrumentPanel({
  instrument,
  sun,
  tuning,
  external,
  onNote,
  volume = 0.85,
  hidden,
}: {
  instrument: Instrument;
  sun: number;
  tuning: Tuning;
  /** 外から光らせる音（再生中の音など） */
  external?: Set<number>;
  onNote?: (midi: number, string?: number) => void;
  volume?: number;
  /** 画面には出さず、PC のキーボードでだけ使う（キーパッドを出しているとき） */
  hidden?: boolean;
}) {
  const { settings } = useApp();
  const voices = useRef(new Map<number, Voice>());
  const pedalVoices = useRef<Voice[]>([]);
  const [held, setHeld] = useState<Map<number, number>>(new Map()); // pointerId → midi
  const [pressed, setPressed] = useState<{ string: number; pos: number } | null>(null);
  const [flash, setFlash] = useState<number | null>(null);

  useEffect(() => {
    const v = voices.current;
    return () => {
      for (const x of v.values()) x.stop();
      v.clear();
    };
  }, []);

  const range = useMemo<[number, number]>(() => instrumentDef(instrument).range(sun, tuning), [instrument, sun, tuning]);
  const inRange = useCallback((m: number) => m >= range[0] && m <= range[1], [range]);

  const active = useMemo(() => {
    const s = new Set<number>(held.values());
    if (flash !== null) s.add(flash);
    external?.forEach((m) => s.add(m));
    return s;
  }, [held, flash, external]);

  const down = (midi: number, pointerId: number, str?: number) => {
    const v = playNote(instrument, midi, { gain: volume, a4: settings.a4 });
    if (instrument === 'shamisen') {
      // 同じ糸を弾き直したら前の音は止まる
      if (str !== undefined) {
        voices.current.get(1000 + str)?.stop();
        voices.current.set(1000 + str, v);
      }
      // 三味線は弾いたら離しても鳴り続ける。光は少しだけ
      setFlash(midi);
      window.setTimeout(() => setFlash((f) => (f === midi ? null : f)), 350);
    } else {
      voices.current.get(pointerId)?.stop();
      voices.current.set(pointerId, v);
      setHeld((h) => new Map(h).set(pointerId, midi));
    }
    onNote?.(midi, str);
  };

  const up = (pointerId: number) => {
    const v = voices.current.get(pointerId);
    if (v) {
      // ピアノのペダルを踏んでいる間は、離しても自然に消えるまで鳴らす
      if (instrument === 'piano' && settings.pianoPedal) pedalVoices.current.push(v);
      else v.stop();
      voices.current.delete(pointerId);
    }
    setHeld((h) => {
      if (!h.has(pointerId)) return h;
      const n = new Map(h);
      n.delete(pointerId);
      return n;
    });
  };

  // PC のキーボード（楽器ごとの割り当て。設定で変えられる。src/lib/keymaps.ts）
  const [oct, setOct] = useState(0);
  const downRef = useRef(down);
  const upRef = useRef(up);
  downRef.current = down;
  upRef.current = up;
  useEffect(() => {
    const map = keymapFor(instrument, settings.keymaps);
    const held = new Set<string>(); // 押しているキー（code）
    const heldPos = new Set<number>(); // 三味線：押さえている勘所
    const heldMods = new Set<string>(); // 尺八：押しているメリ・カリ・甲など
    const [lo, hi] = instrumentDef(instrument).range(sun, tuning);
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, dialog') || document.querySelector('.sheet') || e.metaKey || e.ctrlKey || e.altKey) return;
      const action = actionOf(map, e.code);
      if (!action) return;
      e.preventDefault();
      const down = e.type === 'keydown';
      if (down && held.has(e.code)) return; // 押しっぱなしの繰り返しは無視
      if (down) held.add(e.code);
      else held.delete(e.code);
      const id = 2000 + Object.keys(map).indexOf(action);

      if (instrument === 'piano') {
        if (action === 'octDown' || action === 'octUp') {
          if (down) setOct((o) => Math.max(-4, Math.min(3, o + (action === 'octDown' ? -1 : 1))));
          return;
        }
        const i = Number(action.slice(1));
        if (down) {
          const midi = 60 + i + oct * 12;
          if (midi >= lo && midi <= hi) downRef.current(midi, id);
        } else upRef.current(id);
        return;
      }

      if (instrument === 'shamisen') {
        if (action.startsWith('pos')) {
          const p = Number(action.slice(3));
          if (down) heldPos.add(p);
          else heldPos.delete(p);
          return;
        }
        if (down && action.startsWith('str')) {
          const s = Number(action.slice(3));
          const pos = heldPos.size ? Math.max(...heldPos) : 0; // 押さえていなければ開放弦
          const midi = openStrings(sun, tuning)[s] + pos;
          setPressed({ string: s, pos });
          window.setTimeout(() => setPressed((x) => (x && x.string === s && x.pos === pos ? null : x)), 350);
          downRef.current(midi, id, s);
        }
        return;
      }

      // 尺八：指（ロツレチリ）＋押しながらの変化（メリ・カリ・甲・大甲）
      const mod = SHAKU_MODS.find((m) => m.id === action);
      if (mod) {
        if (down) heldMods.add(mod.id);
        else heldMods.delete(mod.id);
        return;
      }
      const finger = SHAKU_FINGERS.find((f) => f.id === action);
      if (!finger) return;
      if (down) {
        const shift = SHAKU_MODS.filter((m) => heldMods.has(m.id)).reduce((a, m) => a + m.shift, 0);
        const midi = instrumentDef('shakuhachi').base(sun) + finger.rel + shift;
        if (midi >= lo && midi <= hi) downRef.current(midi, id);
      } else upRef.current(id);
    };
    const reset = () => {
      held.clear();
      heldPos.clear();
      heldMods.clear();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    window.addEventListener('blur', reset);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      window.removeEventListener('blur', reset);
    };
  }, [instrument, sun, tuning, oct, settings.keymaps]);

  // ペダルを離したら、鳴り続けていた音を止める
  useEffect(() => {
    if (settings.pianoPedal) return;
    pedalVoices.current.forEach((v) => v.stop());
    pedalVoices.current = [];
  }, [settings.pianoPedal]);

  // 画面の鍵盤に、PC のキーの位置を表示する（オクターブを変えると一緒に動く）
  const keyHints = useMemo(() => {
    if (instrument !== 'piano') return undefined;
    const map = keymapFor('piano', settings.keymaps);
    const out: Record<number, string> = {};
    for (const [a, code] of Object.entries(map)) if (/^n\d+$/.test(a)) out[60 + Number(a.slice(1)) + oct * 12] = keyLabel(code);
    return out;
  }, [instrument, settings.keymaps, oct]);

  const basePc = pc(instrumentDef(instrument).base(sun));
  if (hidden) return null;

  return (
    <div className="instrument-panel">
      {instrument === 'piano' && oct !== 0 && <div className="oct-badge">キーボードの A ＝ C{4 + oct}</div>}
      {instrument !== 'piano' && (
      <div className="instrument-body">
        {instrument === 'shamisen' ? (
          <ShamisenNeck
            sun={sun}
            tuning={tuning}
            active={active}
            pressed={pressed}
            onPress={(midi, s, p) => {
              setPressed({ string: s, pos: p });
              window.setTimeout(() => setPressed((x) => (x && x.string === s && x.pos === p ? null : x)), 350);
              down(midi, -1, s);
            }}
          />
        ) : (
          <ShakuhachiPad sun={sun} active={active} onDown={(m, id) => down(m, id)} onUp={up} />
        )}
      </div>
      )}
      {(settings.showPiano || instrument === 'piano') && (
        <Piano
          big={instrument === 'piano'}
          keyHints={keyHints}
          range={instrument === 'piano' ? range : [range[0] - 2, range[1] + 2]}
          active={active}
          basePc={basePc}
          inRange={inRange}
          onDown={(m, id) => {
            const hint = instrument === 'shamisen' ? fingeringFor(m, sun, tuning)?.string : undefined;
            down(m, id, hint);
          }}
          onUp={up}
        />
      )}
    </div>
  );
}
