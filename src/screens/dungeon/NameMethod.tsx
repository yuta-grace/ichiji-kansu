import { useState } from 'react';
import { Hakase } from '../../components/Hakase';
import content from '../../content/dungeon.json';
import type { MethodId } from '../../lib/dungeon';
import { NAME_MAX, methodInfo, nameMethod } from '../../lib/notebook';
import { fill } from '../../lib/text';

const N = content.lines.note;
const L = content.lines;

/** 解き方に名前を付ける（おすすめの名前を2つほど出す）。付けずに先へ進んでもよい */
export default function NameMethod({ method, lines, initial = '', onDone }: { method: MethodId; lines: string[]; initial?: string; onDone: () => void }) {
  const [name, setName] = useState(initial);
  const [result, setResult] = useState<string[] | null>(null);

  if (result) {
    return (
      <div className="step">
        <Hakase lines={result} />
        <div className="work" />
        <div className="actions">
          <button type="button" className="btn primary" onClick={onDone}>{L.next}</button>
        </div>
      </div>
    );
  }
  const save = () => {
    if (!name.trim()) return;
    nameMethod(method, name);
    setResult(N.named.map((t) => fill(t, { name: name.trim().slice(0, NAME_MAX) })));
  };
  return (
    <div className="step">
      <Hakase lines={lines} />
      <form
        className="work name-form"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <input
          className="text-input"
          value={name}
          maxLength={NAME_MAX}
          placeholder={N.placeholder}
          aria-label={N.placeholder}
          onChange={(e) => setName(e.target.value)}
        />
        <div className="name-suggest">
          <span className="muted small">{N.suggestLabel}</span>
          {methodInfo(method).suggest.map((s) => (
            <button key={s} type="button" className="btn small" onClick={() => setName(s)}>
              {s}
            </button>
          ))}
        </div>
      </form>
      <div className="actions">
        <button type="button" className="btn primary" disabled={!name.trim()} onClick={save}>{N.save}</button>
        <button type="button" className="btn ghost" onClick={() => setResult(N.notNamed)}>{N.later}</button>
      </div>
    </div>
  );
}
