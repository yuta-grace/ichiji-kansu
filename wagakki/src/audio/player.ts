// 楽譜の再生。繰り返し記号・ジャンプ記号は「演奏の順番」（playorder.ts）に沿って鳴らす
import { audio, playNote, type Voice } from './engine';
import { perfBeatFor, perfMap, perfNotes, playOrder, writtenBeat } from '../lib/playorder';
import type { Song } from '../lib/score';

interface Sched {
  partId: string;
  inst: Song['parts'][number]['instrument'];
  start: number; // 拍（演奏の時間）
  dur: number;
  midi: number;
  nextStart: number | null; // 同じパートの次の音の開始（三味線を止める位置）
}

export class Player {
  private timer: number | null = null;
  private raf: number | null = null;
  private gains = new Map<string, GainNode>();
  private voices: Voice[] = [];
  playing = false;

  /**
   * fromWritten：再生を始める楽譜の時刻（拍）。
   * onBeat：いま鳴っている楽譜の時刻（拍）。終わったら null
   */
  start(song: Song, fromWritten: number, a4: number, onBeat: (writtenBeat: number | null) => void, loop = false) {
    this.stop();
    const { ctx, master } = audio();
    const spb = 60 / song.tempo;
    const order = playOrder(song).measures;
    const map = perfMap(song, order);
    const total = map.totalBeats;
    const list: Sched[] = [];
    for (const p of song.parts) {
      const g = ctx.createGain();
      g.gain.value = p.muted ? 0 : p.volume;
      g.connect(master);
      this.gains.set(p.id, g);
      const ev = perfNotes(song, p, order);
      ev.forEach((e, i) => {
        list.push({ partId: p.id, inst: p.instrument, start: e.start, dur: e.dur, midi: e.midi, nextStart: ev[i + 1]?.start ?? null });
      });
    }
    list.sort((a, b) => a.start - b.start);
    const fromBeat = perfBeatFor(map, fromWritten);
    let t0 = ctx.currentTime + 0.08 - fromBeat * spb;
    let idx = list.findIndex((e) => e.start >= fromBeat - 1e-6);
    if (idx < 0) idx = list.length;
    this.playing = true;

    const tick = () => {
      const horizon = ctx.currentTime + 0.25;
      while (idx < list.length && t0 + list[idx].start * spb < horizon) {
        const e = list[idx++];
        const when = t0 + e.start * spb;
        const v = playNote(e.inst, e.midi, { when, gain: 0.9, dest: this.gains.get(e.partId), a4 });
        if (e.inst !== 'shamisen') v.stop(when + e.dur * spb - 0.03);
        else if (e.nextStart !== null) v.stop(t0 + e.nextStart * spb);
        this.voices.push(v);
        if (this.voices.length > 64) this.voices.shift();
      }
      const endT = t0 + total * spb;
      if (idx >= list.length && ctx.currentTime > endT) {
        if (loop && total > 0) {
          t0 = endT;
          idx = 0;
        } else {
          this.stop();
          onBeat(null);
        }
      }
    };
    tick();
    this.timer = window.setInterval(tick, 40);
    const frame = () => {
      if (!this.playing) return;
      const b = (ctx.currentTime - t0) / spb;
      const w = writtenBeat(map, Math.max(0, b));
      if (w !== null) onBeat(w);
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  setPart(partId: string, volume: number, muted: boolean) {
    const g = this.gains.get(partId);
    if (g) g.gain.value = muted ? 0 : volume;
  }

  stop() {
    this.playing = false;
    if (this.timer !== null) clearInterval(this.timer);
    if (this.raf !== null) cancelAnimationFrame(this.raf);
    this.timer = null;
    this.raf = null;
    for (const v of this.voices) v.stop();
    this.voices = [];
    for (const g of this.gains.values()) {
      const c = g.context;
      g.gain.setTargetAtTime(0, c.currentTime, 0.05);
      setTimeout(() => g.disconnect(), 400);
    }
    this.gains.clear();
  }
}
