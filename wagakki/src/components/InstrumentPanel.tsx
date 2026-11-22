// 楽器の画面＋ピアノ鍵盤。押すと鳴らし、onNote で知らせる（楽譜の入力に使う）
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../context';
import { playNote, type Voice } from '../audio/engine';
import { pc } from '../lib/pitch';
import { fingeringFor, type Tuning } from '../lib/shamisen';
import { instrumentDef } from '../lib/instruments';
import type { Instrument } from '../lib/score';
import { ShamisenNeck } from './ShamisenNeck';
import { ShakuhachiPad } from './ShakuhachiPad';
import { Piano } from './Piano';

const KEY_ROW = ['a', 'w', 's', 'e', 'd', 'f', 't', 'g', 'y', 'h', 'u', 'j', 'k', 'o', 'l', 'p', ';'];

export function InstrumentPanel({
  instrument,
  sun,
  tuning,
  external,
  onNote,
  volume = 0.85,
}: {
  instrument: Instrument;
  sun: number;
  tuning: Tuning;
  /** 外から光らせる音（再生中の音など） */
  external?: Set<number>;
  onNote?: (midi: number, string?: number) => void;
  volume?: number;
}) {
  const { settings } = useApp();
  const voices = useRef(new Map<number, Voice>());
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
      v.stop();
      voices.current.delete(pointerId);
    }
    setHeld((h) => {
      if (!h.has(pointerId)) return h;
      const n = new Map(h);
      n.delete(pointerId);
      return n;
    });
  };

  // PC のキーボード：A W S E D F T G Y H U J K O L P ; で基準の音（筒音・一の糸）から半音ずつ。Z / X でオクターブ
  const [oct, setOct] = useState(0);
  const downRef = useRef(down);
  const upRef = useRef(up);
  downRef.current = down;
  upRef.current = up;
  useEffect(() => {
    const keysDown = new Set<string>();
    const base = instrumentDef(instrument).base(sun);
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, dialog') || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (e.type === 'keydown' && (k === 'z' || k === 'x')) {
        setOct((o) => Math.max(-1, Math.min(2, o + (k === 'z' ? -1 : 1))));
        return;
      }
      const i = KEY_ROW.indexOf(k);
      if (i < 0) return;
      e.preventDefault();
      const id = 2000 + i;
      if (e.type === 'keydown') {
        if (keysDown.has(k)) return;
        keysDown.add(k);
        const midi = base + i + oct * 12;
        const hint = instrument === 'shamisen' ? fingeringFor(midi, sun, tuning)?.string : undefined;
        downRef.current(midi, id, hint);
      } else {
        keysDown.delete(k);
        upRef.current(id);
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
    };
  }, [instrument, sun, tuning, oct]);

  const basePc = pc(instrumentDef(instrument).base(sun));

  return (
    <div className="instrument-panel">
      {oct !== 0 && <div className="oct-badge">キーボード：{oct > 0 ? `+${oct}` : oct} オクターブ</div>}
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
