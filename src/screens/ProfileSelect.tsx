import { useState } from 'react';
import { Hakase } from '../components/Hakase';
import content from '../content/profile.json';
import { createProfile, lastProfile, listProfiles, selectProfile } from '../lib/storage';
import { fill } from '../lib/text';

const T = content.profile;

// ニックネームを選ぶ／新しく作る。1台を複数の生徒で使うため、記録はニックネームごとに分ける
export default function ProfileSelect({ onSelected }: { onSelected: () => void }) {
  const profiles = listProfiles();
  const last = lastProfile();
  const [creating, setCreating] = useState(profiles.length === 0);
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const pick = (id: string) => {
    selectProfile(id);
    onSelected();
  };

  if (creating) {
    const make = () => {
      if (!name.trim()) return setError(T.empty);
      if (!createProfile(name)) return setError(T.duplicate);
      onSelected();
    };
    return (
      <div className="screen">
        <Hakase lines={profiles.length === 0 ? T.askFirst : T.ask} />
        <form
          className="profile-form"
          onSubmit={(e) => {
            e.preventDefault();
            make();
          }}
        >
          <input
            className="text-input"
            value={name}
            maxLength={T.maxLength}
            placeholder={T.placeholder}
            autoComplete="off"
            autoFocus
            onChange={(e) => {
              setName(e.target.value);
              setError('');
            }}
            aria-label={T.placeholder}
          />
          <p className="notice">{T.notice}</p>
          {error && <p className="error">{error}</p>}
          <button type="submit" className="btn primary">{T.make}</button>
          {profiles.length > 0 && (
            <button type="button" className="btn ghost" onClick={() => setCreating(false)}>{T.back}</button>
          )}
        </form>
      </div>
    );
  }

  const others = profiles.filter((p) => p.id !== last?.id);
  return (
    <div className="screen">
      <Hakase lines={T.ask} />
      {last && (
        <button type="button" className="btn primary big-continue" onClick={() => pick(last.id)}>
          {fill(T.continue, { name: last.name })}
        </button>
      )}
      {others.length > 0 && (
        <>
          <h2 className="menu-title">{T.others}</h2>
          <ul className="menu">
            {others.map((p) => (
              <li key={p.id}>
                <button type="button" className="menu-item" onClick={() => pick(p.id)}>
                  <span className="menu-label">{p.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <button type="button" className="btn" onClick={() => setCreating(true)}>{T.create}</button>
    </div>
  );
}
