// キー割り当ての設定：動作を押してから、割り当てたいキーを押す
import { useEffect, useState } from 'react';
import { useApp } from '../context';
import { DEFAULT_KEYMAPS, KEY_ACTIONS, keyLabel, keymapFor } from '../lib/keymaps';
import type { Instrument } from '../lib/instruments';
import { InstrumentSelect } from './controls';
import { Button } from './ui';

export function KeymapEditor() {
  const { settings, update } = useApp();
  const [inst, setInst] = useState<Instrument>(settings.instrument);
  const [waiting, setWaiting] = useState<string | null>(null);
  const map = keymapFor(inst, settings.keymaps);
  const actions = KEY_ACTIONS[inst];
  const groups = [...new Set(actions.map((a) => a.group))];

  // 次に押されたキーを、選んだ動作に割り当てる（同じキーを使っていた動作とは入れ替える）
  useEffect(() => {
    if (!waiting) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.code === 'Escape') {
        setWaiting(null);
        return;
      }
      const next = { ...map };
      const old = next[waiting];
      for (const [a, c] of Object.entries(next)) if (c === e.code && a !== waiting) next[a] = old;
      next[waiting] = e.code;
      // 標準と違う分だけ持つ
      const diff: Record<string, string> = {};
      for (const [a, c] of Object.entries(next)) if (DEFAULT_KEYMAPS[inst][a] !== c) diff[a] = c;
      update({ keymaps: { ...settings.keymaps, [inst]: diff } });
      setWaiting(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [waiting, map, inst, settings.keymaps, update]);

  return (
    <div className="keymap">
      <div className="field-row">
        <span className="field-label">楽器</span>
        <InstrumentSelect value={inst} onChange={(v) => (setInst(v), setWaiting(null))} />
      </div>
      {groups.map((g) => (
        <div key={g} className="keymap-group">
          <h3 className="list-title">{g}</h3>
          <div className="keymap-grid">
            {actions
              .filter((a) => a.group === g)
              .map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className={`keymap-item${waiting === a.id ? ' waiting' : ''}`}
                  onClick={() => setWaiting(waiting === a.id ? null : a.id)}
                  title="押してから、割り当てたいキーを押す（Esc でやめる）"
                >
                  <span className="keymap-label">{a.label}</span>
                  <kbd>{waiting === a.id ? 'キーを押す…' : keyLabel(map[a.id])}</kbd>
                </button>
              ))}
          </div>
        </div>
      ))}
      <div className="file-actions">
        <Button variant="outlined" onClick={() => update({ keymaps: { ...settings.keymaps, [inst]: {} } })}>
          この楽器を標準の割り当てに戻す
        </Button>
      </div>
    </div>
  );
}
