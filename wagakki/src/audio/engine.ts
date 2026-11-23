// Web Audio による三味線・尺八の合成
import { freq } from '../lib/pitch';
import type { Instrument } from '../lib/score';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
const noiseBufs = new WeakMap<BaseAudioContext, AudioBuffer>();
const fluteWaves = new WeakMap<BaseAudioContext, PeriodicWave>();

export interface PlayOpts {
  when?: number;
  gain?: number;
  dest?: AudioNode;
  a4?: number;
  /** 画面に出さずに録音するときの AudioContext（WAV の書き出し） */
  ctx?: BaseAudioContext;
}

function target(opts: PlayOpts): { c: BaseAudioContext; out: AudioNode } {
  if (opts.ctx) return { c: opts.ctx, out: opts.dest ?? opts.ctx.destination };
  const { ctx: c, master } = audio();
  return { c, out: opts.dest ?? master };
}

export function audio(): { ctx: AudioContext; master: GainNode } {
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new AC({ latencyHint: 'interactive' });
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(comp).connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return { ctx, master: master! };
}

function noise(c: BaseAudioContext): AudioBuffer {
  const hit = noiseBufs.get(c);
  if (hit) return hit;
  const len = c.sampleRate * 2;
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  noiseBufs.set(c, buf);
  return buf;
}

export interface Voice {
  stop(when?: number): void;
}

// ---------------- 三味線 ----------------

const pluckCache = new Map<string, AudioBuffer>();

/** Karplus-Strong で弦の音を作る（さわりのビリつきを少し足す） */
function pluckBuffer(c: BaseAudioContext, f: number): AudioBuffer {
  const key = `${c.sampleRate}:${f.toFixed(2)}`;
  const hit = pluckCache.get(key);
  if (hit) return hit;
  const sr = c.sampleRate;
  const seconds = 3.6;
  const len = Math.floor(sr * seconds);
  const buf = c.createBuffer(1, len, sr);
  const out = buf.getChannelData(0);
  const period = sr / f;
  const N = Math.max(2, Math.floor(period));
  const frac = period - N; // 小数部は一次の補間で合わせる
  const line = new Float32Array(N + 2);
  // 撥（ばち）で強く弾いた明るい励振：雑音＋のこぎり波
  for (let i = 0; i < line.length; i++) {
    const saw = 1 - (2 * i) / line.length;
    line[i] = (Math.random() * 2 - 1) * 0.7 + saw * 0.5;
  }
  // 低い音ほどゆっくり減衰させる
  const decay = Math.min(0.9995, 0.996 + 0.0035 * Math.min(1, 200 / f));
  let idx = 0;
  let prev = 0;
  for (let i = 0; i < len; i++) {
    const a = line[idx];
    const b = line[(idx + 1) % N];
    let v = (a * (1 - frac) + b * frac) * 0.5 + prev * 0.5;
    v = decay * (0.5 * v + 0.5 * a);
    // さわり：振幅が大きい間だけ、少し折り返してビリつかせる
    const sawari = Math.abs(v) > 0.25 ? Math.sign(v) * (0.25 + (Math.abs(v) - 0.25) * 0.6) : v;
    line[idx] = sawari;
    prev = a;
    out[i] = sawari;
    idx = (idx + 1) % N;
  }
  // 頭の部分の音量をそろえる
  let peak = 0;
  for (let i = 0; i < Math.min(len, 4000); i++) peak = Math.max(peak, Math.abs(out[i]));
  const g = peak > 0 ? 0.8 / peak : 1;
  for (let i = 0; i < len; i++) out[i] *= g;
  pluckCache.set(key, buf);
  return buf;
}

export function playShamisen(midi: number, opts: PlayOpts = {}): Voice {
  const { c, out: m } = target(opts);
  const t = opts.when ?? c.currentTime;
  const f = freq(midi, opts.a4 ?? 440);
  const src = c.createBufferSource();
  src.buffer = pluckBuffer(c, f);
  // 胴（皮）の響き：中域を持ち上げ、高域を少し削る
  const body = c.createBiquadFilter();
  body.type = 'peaking';
  body.frequency.value = 900;
  body.Q.value = 1.2;
  body.gain.value = 5;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = Math.min(9000, f * 18);
  const g = c.createGain();
  const vol = (opts.gain ?? 0.8) * 0.9;
  // 自然に小さくなって消える（音源の終わりで急に途切れないよう、最後はなめらかに 0 へ）
  g.gain.setValueAtTime(vol, t);
  g.gain.setTargetAtTime(vol * 0.5, t + 0.4, 0.6);
  g.gain.setTargetAtTime(0, t + 1.6, 0.45);
  src.connect(body).connect(lp).connect(g).connect(m);

  // 撥が皮を打つ音
  const click = c.createBufferSource();
  click.buffer = noise(c);
  const hp = c.createBiquadFilter();
  hp.type = 'bandpass';
  hp.frequency.value = 2500;
  hp.Q.value = 0.8;
  const cg = c.createGain();
  cg.gain.setValueAtTime(vol * 0.5, t);
  cg.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
  click.connect(hp).connect(cg).connect(m);
  click.start(t, Math.random());
  click.stop(t + 0.05);

  src.start(t);
  src.stop(t + 3.6);
  return {
    stop(when) {
      const s = Math.max(when ?? c.currentTime, t + 0.02);
      // 押さえを離したように、短く減衰させて止める
      const gp = g.gain as AudioParam & { cancelAndHoldAtTime?: (t: number) => void };
      if (gp.cancelAndHoldAtTime) gp.cancelAndHoldAtTime(s);
      else gp.cancelScheduledValues(s);
      g.gain.setTargetAtTime(0, s, 0.06);
      try {
        src.stop(s + 0.5);
      } catch {
        /* 既に止まっている */
      }
    },
  };
}

// ---------------- 尺八 ----------------

export function playShakuhachi(midi: number, opts: PlayOpts = {}): Voice {
  const { c, out: dest } = target(opts);
  const t = opts.when ?? c.currentTime;
  const f = freq(midi, opts.a4 ?? 440);
  const vol = (opts.gain ?? 0.8) * 0.55;
  let wave = fluteWaves.get(c);
  if (!wave) {
    const harm = [0, 1, 0.42, 0.16, 0.09, 0.04, 0.025, 0.012];
    wave = c.createPeriodicWave(new Float32Array(harm.length), new Float32Array(harm));
    fluteWaves.set(c, wave);
  }
  const osc = c.createOscillator();
  osc.setPeriodicWave(wave);
  // 吹き始めは少し低いところから音程が上がる
  osc.frequency.setValueAtTime(f * Math.pow(2, -35 / 1200), t);
  osc.frequency.exponentialRampToValueAtTime(f, t + 0.09);

  // ビブラート（少し遅れて深くなる）
  const lfo = c.createOscillator();
  lfo.frequency.value = 5.2;
  const lfoG = c.createGain();
  lfoG.gain.setValueAtTime(0, t);
  lfoG.gain.linearRampToValueAtTime(0, t + 0.45);
  lfoG.gain.linearRampToValueAtTime(f * 0.006, t + 1.2);
  lfo.connect(lfoG).connect(osc.frequency);

  const tone = c.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = Math.min(8000, f * 5);
  tone.Q.value = 0.7;

  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol * 1.15, t + 0.07);
  g.gain.linearRampToValueAtTime(vol, t + 0.25);
  osc.connect(tone).connect(g).connect(dest);

  // 息の音
  const br = c.createBufferSource();
  br.buffer = noise(c);
  br.loop = true;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = Math.min(6000, f * 2);
  bp.Q.value = 1.4;
  const bg = c.createGain();
  bg.gain.setValueAtTime(0, t);
  bg.gain.linearRampToValueAtTime(vol * 0.55, t + 0.04);
  bg.gain.linearRampToValueAtTime(vol * 0.16, t + 0.3);
  br.connect(bp).connect(bg).connect(dest);

  osc.start(t);
  lfo.start(t);
  br.start(t, Math.random());
  let stopped = false;
  return {
    stop(when) {
      if (stopped) return;
      stopped = true;
      const s = Math.max(when ?? c.currentTime, t + 0.05);
      for (const gp of [g.gain, bg.gain]) {
        gp.cancelScheduledValues(s);
        gp.setValueAtTime(gp === g.gain ? vol : vol * 0.16, s);
        gp.linearRampToValueAtTime(0, s + 0.14);
      }
      osc.stop(s + 0.2);
      lfo.stop(s + 0.2);
      br.stop(s + 0.2);
    },
  };
}

// ---------------- ピアノ ----------------

/** 倍音を重ねたピアノに近い音。打鍵で始まり、押している間ゆっくり減衰、離すと止まる */
export function playPiano(midi: number, opts: PlayOpts = {}): Voice {
  const { c, out } = target(opts);
  const t = opts.when ?? c.currentTime;
  const f = freq(midi, opts.a4 ?? 440);
  const vol = (opts.gain ?? 0.8) * 0.32;
  const g = c.createGain();
  // 高い音ほど早く減衰する
  const decay = Math.max(0.6, 3.2 - (midi - 48) * 0.05);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.006);
  g.gain.exponentialRampToValueAtTime(vol * 0.35, t + 0.25);
  g.gain.exponentialRampToValueAtTime(0.0008, t + decay);
  const tone = c.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.setValueAtTime(Math.min(12000, f * 10), t);
  tone.frequency.exponentialRampToValueAtTime(Math.min(6000, f * 3), t + 0.4);
  tone.connect(g).connect(out);
  const partials: [number, number, OscillatorType][] = [
    [1, 1, 'triangle'],
    [2, 0.35, 'sine'],
    [3, 0.12, 'sine'],
    [4, 0.06, 'sine'],
  ];
  const oscs = partials.map(([k, amp, type]) => {
    const o = c.createOscillator();
    o.type = type;
    o.frequency.value = f * k * (1 + (k - 1) * 0.0008); // 少しずつずらして弦らしく
    const og = c.createGain();
    og.gain.value = amp;
    o.connect(og).connect(tone);
    o.start(t);
    o.stop(t + decay + 0.1);
    return o;
  });
  let stopped = false;
  return {
    stop(when) {
      if (stopped) return;
      stopped = true;
      const s = Math.max(when ?? c.currentTime, t + 0.03);
      g.gain.cancelScheduledValues(s);
      g.gain.setTargetAtTime(0, s, 0.06);
      for (const o of oscs) {
        try {
          o.stop(s + 0.4);
        } catch {
          /* 既に止まっている */
        }
      }
    },
  };
}

export function playNote(inst: Instrument, midi: number, opts: PlayOpts = {}): Voice {
  if (inst === 'shamisen') return playShamisen(midi, opts);
  if (inst === 'piano') return playPiano(midi, opts);
  return playShakuhachi(midi, opts);
}
