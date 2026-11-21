// 演奏モード
import { useState } from 'react';
import { useApp } from '../context';
import { InstrumentPanel } from '../components/InstrumentPanel';
import { InstrumentSelect, SunSelect, TuningSelect } from '../components/controls';
import { Button, Dialog, IconButton } from '../components/ui';
import { honLabel, sunLabelWithNote } from '../lib/pitch';
import { tuningOf } from '../lib/shamisen';

export function PlayScreen() {
  const { settings, update } = useApp();
  const [open, setOpen] = useState(false);
  const inst = settings.instrument;
  const sun = inst === 'shamisen' ? settings.shamisenSun : settings.shakuhachiSun;
  const sunText = inst === 'shamisen' && settings.shamisenLabel === 'hon' ? honLabel(sun) : sunLabelWithNote(sun);
  const summary = [inst === 'shamisen' ? '三味線' : '尺八', sunText, inst === 'shamisen' ? tuningOf(settings.shamisenTuning).label : null]
    .filter(Boolean)
    .join('・');

  return (
    <div className="screen play">
      <div className="toolbar play-toolbar">
        <button type="button" className="play-summary" onClick={() => setOpen(true)} aria-label={`楽器の設定（いまは ${summary}）`}>
          {summary}
        </button>
        <span className="spacer" />
        <IconButton icon="piano" label="ドレミ（ピアノ鍵盤）の表示" selected={settings.showPiano} variant="outlined" onClick={() => update({ showPiano: !settings.showPiano })} />
        <IconButton icon="settings" label="楽器・寸法・調弦の設定" variant="tonal" onClick={() => setOpen(true)} />
      </div>
      <InstrumentPanel instrument={inst} sun={sun} tuning={settings.shamisenTuning} />

      <Dialog open={open} title="楽器の設定" onClose={() => setOpen(false)} actions={<Button onClick={() => setOpen(false)}>閉じる</Button>}>
        <div className="field-row">
          <span className="field-label">楽器</span>
          <InstrumentSelect value={inst} onChange={(v) => update({ instrument: v })} />
        </div>
        {inst === 'shamisen' ? (
          <>
            <SunSelect instrument="shamisen" value={settings.shamisenSun} onChange={(v) => update({ shamisenSun: v })} />
            <div className="field-row">
              <span className="field-label">調弦</span>
              <TuningSelect value={settings.shamisenTuning} onChange={(v) => update({ shamisenTuning: v })} />
            </div>
          </>
        ) : (
          <SunSelect instrument="shakuhachi" value={settings.shakuhachiSun} onChange={(v) => update({ shakuhachiSun: v })} />
        )}
        <p className="hint">三味線と尺八の寸法は別々に覚えています。</p>
      </Dialog>
    </div>
  );
}
