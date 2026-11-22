// 寸法・調弦の選択
import { useApp } from '../context';
import { honLabel, SUN_LIST, sunLabelWithNote } from '../lib/pitch';
import { TUNINGS, type Tuning } from '../lib/shamisen';
import type { Instrument } from '../lib/score';
import { Segmented, Select } from './ui';

/** おすすめの寸法（尺八の標準管） */
const RECOMMENDED: Record<Instrument, number[]> = { piano: [], shakuhachi: [18], shamisen: [] };

export function SunSelect({ instrument, value, onChange, label }: { instrument: Instrument; value: number; onChange: (v: number) => void; label?: string }) {
  const { settings } = useApp();
  const hon = instrument === 'shamisen' && settings.shamisenLabel === 'hon';
  return (
    <Select
      label={label ?? (hon ? '調子（本）' : '寸法')}
      value={value}
      onChange={onChange}
      options={SUN_LIST.map((s) => ({
        value: s,
        label: (hon ? honLabel(s) : sunLabelWithNote(s)) + (RECOMMENDED[instrument].includes(s) ? '　標準' : ''),
      }))}
    />
  );
}

export function TuningSelect({ value, onChange }: { value: Tuning; onChange: (v: Tuning) => void }) {
  return <Segmented label="調弦" value={value} onChange={onChange} options={TUNINGS.map((t) => ({ value: t.id, label: t.label }))} />;
}

export function InstrumentSelect({ value, onChange }: { value: Instrument; onChange: (v: Instrument) => void }) {
  return (
    <Segmented
      label="楽器"
      value={value}
      onChange={onChange}
      options={[
        { value: 'shamisen', label: '三味線' },
        { value: 'shakuhachi', label: '尺八' },
      ]}
    />
  );
}
