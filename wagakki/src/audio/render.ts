// 曲を画面に出さずに録音して WAV にする
import { playNote } from './engine';
import { encodeWav } from '../lib/exporters';
import { partEvents, type Song } from '../lib/score';

export async function renderWav(song: Song, a4: number): Promise<Uint8Array> {
  const spb = 60 / song.tempo;
  const seconds = song.beatsPerMeasure * song.measures * spb + 2.5; // 最後の音の響きの分
  const sr = 44100;
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * sr), sr);
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 4;
  const master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(comp).connect(ctx.destination);
  for (const p of song.parts) {
    if (p.muted) continue;
    const g = ctx.createGain();
    g.gain.value = p.volume;
    g.connect(master);
    const ev = partEvents(p);
    ev.forEach((e, i) => {
      const when = 0.05 + e.start * spb;
      const v = playNote(p.instrument, e.midi, { ctx, dest: g, when, gain: 0.9, a4 });
      // 再生と同じ決まり：尺八は長さの分、三味線は次の音で止める
      if (p.instrument === 'shakuhachi') v.stop(when + e.dur * spb - 0.03);
      else if (ev[i + 1]) v.stop(0.05 + ev[i + 1].start * spb);
    });
  }
  const buf = await ctx.startRendering();
  return encodeWav(buf);
}
