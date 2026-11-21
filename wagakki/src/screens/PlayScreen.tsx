// 演奏モード
import { useApp } from '../context';
import { InstrumentPanel } from '../components/InstrumentPanel';
import { InstrumentSelect, SunSelect, TuningSelect } from '../components/controls';
import { IconButton } from '../components/ui';

export function PlayScreen() {
  const { settings, update } = useApp();
  const inst = settings.instrument;
  return (
    <div className="screen play">
      <div className="toolbar">
        <InstrumentSelect value={inst} onChange={(v) => update({ instrument: v })} />
        {inst === 'shamisen' ? (
          <>
            <SunSelect instrument="shamisen" value={settings.shamisenSun} onChange={(v) => update({ shamisenSun: v })} />
            <TuningSelect value={settings.shamisenTuning} onChange={(v) => update({ shamisenTuning: v })} />
          </>
        ) : (
          <SunSelect instrument="shakuhachi" value={settings.shakuhachiSun} onChange={(v) => update({ shakuhachiSun: v })} />
        )}
        <span className="spacer" />
        <IconButton icon="piano" label="ドレミ（ピアノ鍵盤）の表示" selected={settings.showPiano} variant="outlined" onClick={() => update({ showPiano: !settings.showPiano })} />
      </div>
      <InstrumentPanel
        instrument={inst}
        sun={inst === 'shamisen' ? settings.shamisenSun : settings.shakuhachiSun}
        tuning={settings.shamisenTuning}
      />
    </div>
  );
}
