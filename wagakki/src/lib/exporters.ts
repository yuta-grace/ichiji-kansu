// 書き出し：MIDI・MusicXML・zip（どれも曲のデータから直接作る）
import { measureItems, spell, type NoteValue } from './notation';
import { measureLen, PPQ, type Part, type Song } from './score';
import { instrumentDef } from './instruments';
import { perfNotes, playOrder } from './playorder';
import { JUMP_LABEL, measureDecor } from './marks';

// ---------------- MIDI（Standard MIDI File, format 1） ----------------


function vlq(n: number): number[] {
  const bytes = [n & 0x7f];
  while ((n >>= 7) > 0) bytes.unshift((n & 0x7f) | 0x80);
  return bytes;
}

const ascii = (s: string) => [...new TextEncoder().encode(s)];

function track(events: { t: number; data: number[] }[]): number[] {
  events.sort((a, b) => a.t - b.t || a.data[0] - b.data[0]); // 同時刻は note off(0x8_) を先に
  const body: number[] = [];
  let last = 0;
  for (const e of events) {
    body.push(...vlq(e.t - last), ...e.data);
    last = e.t;
  }
  body.push(0, 0xff, 0x2f, 0x00);
  const len = body.length;
  return [...ascii('MTrk'), (len >>> 24) & 255, (len >>> 16) & 255, (len >>> 8) & 255, len & 255, ...body];
}

const channelOf = (i: number) => (i >= 9 ? i + 1 : i); // 10ch（打楽器）を避ける

export function buildMidi(song: Song): Uint8Array {
  const tracks: number[][] = [];
  const order = playOrder(song).measures;
  const usPerBeat = Math.round(60_000_000 / song.tempo);
  const title = ascii(song.title);
  tracks.push(
    track([
      { t: 0, data: [0xff, 0x03, ...vlq(title.length), ...title] },
      { t: 0, data: [0xff, 0x51, 0x03, (usPerBeat >> 16) & 255, (usPerBeat >> 8) & 255, usPerBeat & 255] },
      { t: 0, data: [0xff, 0x58, 0x04, song.beatsPerMeasure, 2, 24, 8] },
    ]),
  );
  song.parts.forEach((p, i) => {
    const ch = channelOf(i);
    const name = ascii(p.name || `Part ${i + 1}`);
    const ev: { t: number; data: number[] }[] = [
      { t: 0, data: [0xff, 0x03, ...vlq(name.length), ...name] },
      { t: 0, data: [0xc0 | ch, instrumentDef(p.instrument).gmProgram] },
      { t: 0, data: [0xb0 | ch, 7, Math.round((p.muted ? 0 : p.volume) * 127)] },
    ];
    // MIDI は繰り返し記号を展開した演奏の順番で書く
    for (const e of perfNotes(song, p, order)) {
      const m = Math.max(0, Math.min(127, e.midi));
      const t = Math.round(e.start * PPQ);
      ev.push({ t, data: [0x90 | ch, m, 90] });
      ev.push({ t: t + Math.round(e.dur * PPQ), data: [0x80 | ch, m, 0] });
    }
    tracks.push(track(ev));
  });
  const header = [...ascii('MThd'), 0, 0, 0, 6, 0, 1, 0, tracks.length, (PPQ >> 8) & 255, PPQ & 255];
  return new Uint8Array([...header, ...tracks.flat()]);
}

// ---------------- MusicXML 4.0 ----------------

const TYPE: Record<NoteValue, string> = { w: 'whole', h: 'half', q: 'quarter', '8': 'eighth', '16': '16th', '32': '32nd' };

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function partXml(song: Song, p: Part, pi: number): string {
  const mLen = measureLen(song);
  const out: string[] = [`  <part id="P${pi + 1}">`];
  for (let m = 0; m < song.measures; m++) {
    out.push(`    <measure number="${m + 1}">`);
    if (m === 0) {
      out.push(
        '      <attributes>',
        `        <divisions>${PPQ}</divisions>`,
        '        <key><fifths>0</fifths></key>',
        `        <time><beats>${song.beatsPerMeasure}</beats><beat-type>4</beat-type></time>`,
        // 三味線はギターと同じく、1オクターブ上に書くト音記号
        instrumentDef(p.instrument).clef === 'treble8vb'
          ? '        <clef><sign>G</sign><line>2</line><clef-octave-change>-1</clef-octave-change></clef>'
          : '        <clef><sign>G</sign><line>2</line></clef>',
        '      </attributes>',
      );
      if (pi === 0) {
        out.push(
          '      <direction placement="above">',
          `        <direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${song.tempo}</per-minute></metronome></direction-type>`,
          `        <sound tempo="${song.tempo}"/>`,
          '      </direction>',
        );
      }
    }
    // 小節の頭の記号（繰り返しの始まり・番括弧の始まり・セーニョ・コーダ）
    const mk = song.marks[m] ?? {};
    const d = measureDecor(song, m);
    if (mk.repeatStart || (d.volta && d.volta.start)) {
      out.push('      <barline location="left">');
      if (mk.repeatStart) out.push('        <bar-style>heavy-light</bar-style>', '        <repeat direction="forward"/>');
      if (d.volta?.start && mk.ending) out.push(`        <ending number="${mk.ending.numbers.join(', ')}" type="start">${esc(d.volta.label)}</ending>`);
      out.push('      </barline>');
    }
    if (pi === 0) {
      if (mk.segno) out.push('      <direction placement="above"><direction-type><segno/></direction-type><sound segno="s1"/></direction>');
      if (mk.coda) out.push('      <direction placement="above"><direction-type><coda/></direction-type><sound coda="c1"/></direction>');
    }
    const { items, tuplets } = measureItems(p.events, m * mLen, mLen, p.tuplets);
    items.forEach((it, ii) => {
      const tStart = tuplets.find((g) => g.first === ii);
      const tStop = tuplets.find((g) => g.last === ii);
      const n: string[] = ['      <note>'];
      if (it.midi === undefined) n.push('        <rest/>');
      else {
        const sp = spell(it.midi);
        n.push(`        <pitch><step>${sp.step}</step>${sp.alter ? `<alter>${sp.alter}</alter>` : ''}<octave>${sp.octave}</octave></pitch>`);
      }
      n.push(`        <duration>${it.ticks}</duration>`);
      if (it.tieStop) n.push('        <tie type="stop"/>');
      if (it.tieStart) n.push('        <tie type="start"/>');
      n.push(`        <type>${TYPE[it.value]}</type>`);
      for (let d = 0; d < it.dots; d++) n.push('        <dot/>');
      if (it.triplet) n.push('        <time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>');
      const nots: string[] = [];
      if (it.tieStop) nots.push('<tied type="stop"/>');
      if (it.tieStart) nots.push('<tied type="start"/>');
      if (tStart) nots.push('<tuplet type="start" bracket="yes"/>');
      if (tStop) nots.push('<tuplet type="stop"/>');
      // 三味線の糸（MusicXML は高い糸が1）
      if (p.instrument === 'shamisen' && it.midi !== undefined && it.str !== undefined && !it.tieStop) {
        nots.push(`<technical><string>${3 - it.str}</string></technical>`);
      }
      if (nots.length) n.push(`        <notations>${nots.join('')}</notations>`);
      n.push('      </note>');
      out.push(...n);
    });
    // 小節の終わりの記号（Fine・To Coda・D.C. など、繰り返しの終わり・番括弧の終わり）
    if (pi === 0) {
      if (mk.toCoda) out.push('      <direction placement="above"><direction-type><words>To Coda</words></direction-type><sound tocoda="c1"/></direction>');
      if (mk.fine) out.push('      <direction placement="above"><direction-type><words>Fine</words></direction-type><sound fine="yes"/></direction>');
      if (mk.jump) {
        const snd = mk.jump.startsWith('DS') ? 'dalsegno="s1"' : 'dacapo="yes"';
        out.push(`      <direction placement="above"><direction-type><words>${JUMP_LABEL[mk.jump]}</words></direction-type><sound ${snd}/></direction>`);
      }
    }
    const endingHere = d.volta?.end ? endingStartingBefore(song, m) : null;
    if (mk.repeatEnd || endingHere) {
      out.push('      <barline location="right">');
      if (mk.repeatEnd) out.push('        <bar-style>light-heavy</bar-style>');
      if (endingHere) out.push(`        <ending number="${endingHere.join(', ')}" type="${mk.repeatEnd ? 'stop' : 'discontinue'}"/>`);
      if (mk.repeatEnd) out.push(`        <repeat direction="backward"${mk.repeatEnd > 2 ? ` times="${mk.repeatEnd}"` : ''}/>`);
      out.push('      </barline>');
    }
    out.push('    </measure>');
  }
  out.push('  </part>');
  return out.join('\n');
}

/** m 小節目で終わる番括弧の番号 */
function endingStartingBefore(song: Song, m: number): number[] | null {
  for (let s = m; s >= 0; s--) {
    const e = song.marks[s]?.ending;
    if (e) return s + e.length - 1 === m ? e.numbers : null;
  }
  return null;
}

export function buildMusicXml(song: Song): string {
  const list = song.parts
    .map(
      (p, i) => `    <score-part id="P${i + 1}">
      <part-name>${esc(p.name || `パート${i + 1}`)}</part-name>
      <score-instrument id="P${i + 1}-I1"><instrument-name>${{ piano: 'Piano', shamisen: 'Shamisen', shakuhachi: 'Shakuhachi' }[p.instrument]}</instrument-name></score-instrument>
      <midi-instrument id="P${i + 1}-I1"><midi-channel>${channelOf(i) + 1}</midi-channel><midi-program>${instrumentDef(p.instrument).gmProgram + 1}</midi-program></midi-instrument>
    </score-part>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <work><work-title>${esc(song.title)}</work-title></work>
  <identification><encoding><software>和楽器アプリ</software></encoding></identification>
  <part-list>
${list}
  </part-list>
${song.parts.map((p, i) => partXml(song, p, i)).join('\n')}
</score-partwise>
`;
}

// ---------------- zip（無圧縮） ----------------

let crcTable: Uint32Array | null = null;
function crc32(data: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = crcTable[(c ^ data[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** ファイルをまとめた zip（無圧縮）を作る */
export function buildZip(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const u16 = (v: DataView, o: number, x: number) => v.setUint16(o, x, true);
  const u32 = (v: DataView, o: number, x: number) => v.setUint32(o, x, true);
  for (const f of files) {
    const name = new TextEncoder().encode(f.name);
    const crc = crc32(f.data);
    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    u32(lv, 0, 0x04034b50);
    u16(lv, 4, 20);
    u16(lv, 6, 0x0800); // ファイル名は UTF-8
    u16(lv, 8, 0);
    u32(lv, 14, crc);
    u32(lv, 18, f.data.length);
    u32(lv, 22, f.data.length);
    u16(lv, 26, name.length);
    local.set(name, 30);
    const cen = new Uint8Array(46 + name.length);
    const cv = new DataView(cen.buffer);
    u32(cv, 0, 0x02014b50);
    u16(cv, 4, 20);
    u16(cv, 6, 20);
    u16(cv, 8, 0x0800);
    u32(cv, 16, crc);
    u32(cv, 20, f.data.length);
    u32(cv, 24, f.data.length);
    u16(cv, 28, name.length);
    u32(cv, 42, offset);
    cen.set(name, 46);
    chunks.push(local, f.data);
    central.push(cen);
    offset += local.length + f.data.length;
  }
  const cenSize = central.reduce((a, c) => a + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  u32(ev, 0, 0x06054b50);
  u16(ev, 8, files.length);
  u16(ev, 10, files.length);
  u32(ev, 12, cenSize);
  u32(ev, 16, offset);
  const all = [...chunks, ...central, end];
  const out = new Uint8Array(all.reduce((a, c) => a + c.length, 0));
  let pos = 0;
  for (const c of all) {
    out.set(c, pos);
    pos += c.length;
  }
  return out;
}

// ---------------- WAV ----------------

/** AudioBuffer を 16bit の WAV にする */
export function encodeWav(buf: { numberOfChannels: number; sampleRate: number; length: number; getChannelData(c: number): Float32Array }): Uint8Array {
  const ch = buf.numberOfChannels;
  const len = buf.length;
  const out = new Uint8Array(44 + len * ch * 2);
  const v = new DataView(out.buffer);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + len * ch * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, ch, true);
  v.setUint32(24, buf.sampleRate, true);
  v.setUint32(28, buf.sampleRate * ch * 2, true);
  v.setUint16(32, ch * 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, len * ch * 2, true);
  const data = Array.from({ length: ch }, (_, c) => buf.getChannelData(c));
  let o = 44;
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < ch; c++) {
      const s = Math.max(-1, Math.min(1, data[c][i]));
      v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      o += 2;
    }
  }
  return out;
}
