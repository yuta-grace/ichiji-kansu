import { useState } from 'react';
import { Hakase } from '../components/Hakase';
import home from '../content/home.json';
import profileText from '../content/profile.json';
import { addLog, currentProfile, load, openLater, sessionStartedAt, update } from '../lib/storage';
import type { LaterItem } from '../lib/storage';
import { LaterView } from './Later';

export type PartId = 'diagnostic' | 'understanding' | 'practice' | 'dungeon' | 'titles' | 'later';

const LT = profileText.later;
/** アプリを開いてから「あとで聞く」を提案したニックネーム（開くたびに1回だけ） */
const laterOffered = new Set<string>();

// 入口：博士が「どれくらい知ってる？」と聞き、答えに応じて入口を提案する（5.0）
// どのパートも最初から選べる（順番による解放はしない）
export default function Home({ onOpen, onSwitchProfile }: { onOpen: (p: PartId) => void; onSwitchProfile: () => void }) {
  const profile = currentProfile();
  const [entry, setEntry] = useState(load().entryAnswer);
  // 前に「あとで聞く」にしたものがあれば、開いたときに1件だけ提案する
  const [offer, setOffer] = useState<LaterItem | null>(() => {
    if (!profile || laterOffered.has(profile.id)) return null;
    laterOffered.add(profile.id);
    return openLater(load()).find((l) => l.at < sessionStartedAt) ?? null;
  });
  const [viewing, setViewing] = useState<LaterItem | null>(null);

  const answer = (id: 'beginner' | 'some') => {
    update((d) => {
      d.entryAnswer = id;
    });
    addLog({ part: 'entry', step: '入口の質問', choice: id });
    setEntry(id);
  };

  if (viewing) {
    return (
      <div className="screen fit">
        <LaterView item={viewing} onDone={() => setViewing(null)} />
      </div>
    );
  }

  if (!entry) {
    return (
      <div className="screen">
        <Hakase lines={home.ask} />
        <div className="choices">
          {home.answers.map((a) => (
            <button key={a.id} type="button" className="btn choice" onClick={() => answer(a.id as 'beginner' | 'some')}>
              {a.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  const suggested = home.suggestFor[entry] as string[];
  return (
    <div className="screen">
      <header className="topbar profile-bar">
        <span className="muted">{profile?.name}</span>
        <button type="button" className="btn small ghost" onClick={onSwitchProfile}>
          {profileText.profile.switch}
        </button>
      </header>
      {offer ? (
        <>
          <Hakase lines={LT.offer} />
          <div className="choices">
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                setViewing(offer);
                setOffer(null);
              }}
            >
              {LT.yes}
            </button>
            <button type="button" className="btn" onClick={() => setOffer(null)}>{LT.no}</button>
          </div>
        </>
      ) : (
        <Hakase lines={home.suggest[entry]} />
      )}
      <h2 className="menu-title">{home.menuTitle}</h2>
      <ul className="menu">
        {home.menu.map((m) => {
          const isSuggested = suggested.includes(m.id);
          return (
            <li key={m.id}>
              <button type="button" className={`menu-item ${isSuggested ? 'suggested' : ''}`} onClick={() => onOpen(m.id as PartId)}>
                <span className="menu-label">{m.label}</span>
                <span className="menu-note">{isSuggested ? home.suggestedMark : m.note}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <button type="button" className="btn small ghost" onClick={() => setEntry(undefined)}>
        {home.changeAnswer}
      </button>
    </div>
  );
}
