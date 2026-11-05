import { useState } from 'react';
import { Hakase } from '../components/Hakase';
import diagnostic from '../content/diagnostic.json';
import home from '../content/home.json';
import practice from '../content/practice.json';
import profileText from '../content/profile.json';
import settings from '../content/settings.json';
import { mixEntries } from './Mix';
import { isTaskEntry, taskProblems } from '../lib/task';
import type { TaskEntryId } from '../lib/task';
import { addLog, currentProfile, load, openLater, sessionStartedAt, update } from '../lib/storage';
import type { LaterItem, SaveData } from '../lib/storage';
import { fill } from '../lib/text';

export type PartId = 'diagnostic' | 'understanding' | 'practice' | 'dungeon' | 'mix' | TaskEntryId;

const LT = profileText.later;
const P = home.progress;
/** 理解パートのおよその時間（分） */
const UNDERSTANDING_MINUTES = 7;
/** アプリを開いてから「後で聞く」を提案したニックネーム（開くたびに1回だけ） */
const laterOffered = new Set<string>();

interface Entry {
  id: string;
  label: string;
  level?: string;
  ready?: boolean;
}
const ENTRIES: Entry[] = home.groups.flatMap((g) => g.items as Entry[]);
const entryOf = (id: string) => ENTRIES.find((e) => e.id === id);
const isPart = (id: string): id is PartId => ['diagnostic', 'understanding', 'practice', 'dungeon', 'mix'].includes(id) || isTaskEntry(id);

/** 入口ごとの進み具合：一覧に出す文字と、「続きから」カードのボタン */
function status(id: PartId, d: SaveData): { note: string; done: boolean; button: string } {
  switch (id) {
    case 'diagnostic':
      return d.diagnostic?.done
        ? { note: P.done, done: true, button: home.card.start }
        : { note: fill(P.notStarted, { n: diagnostic.questions.length }), done: false, button: home.card.start };
    case 'understanding':
      if (d.understanding.done) return { note: P.done, done: true, button: home.card.start };
      if (d.understanding.stepId) return { note: P.midway, done: false, button: home.card.resume };
      return { note: fill(P.minutes, { n: UNDERSTANDING_MINUTES }), done: false, button: home.card.start };
    case 'practice': {
      const n = practice.problems.length;
      const pr = d.practice;
      if (pr?.done) return { note: P.done, done: true, button: home.card.start };
      if (pr && pr.pos > 0) return { note: fill(P.count, { done: pr.pos, n }), done: false, button: fill(home.card.fromN, { n: pr.pos + 1 }) };
      return { note: fill(P.notStarted, { n }), done: false, button: home.card.start };
    }
    case 'dungeon': {
      // 問題集を一周したら最初に戻るので、終わりはない
      const pos = d.dungeon?.pos ?? 0;
      return pos > 0
        ? { note: fill(P.solved, { n: pos }), done: false, button: fill(home.card.fromN, { n: pos + 1 }) }
        : { note: '', done: false, button: home.card.start };
    }
    case 'mix':
      return { note: fill(P.notStarted, { n: settings.mix.count }), done: false, button: home.card.start };
    default: {
      // 新しい入口：傾きと切片を読むと同じ（○問目から）
      const n = taskProblems(id).length;
      const t = d.tasks?.[id];
      if (t?.done) return { note: P.done, done: true, button: home.card.start };
      if (t && t.pos > 0) return { note: fill(P.count, { done: t.pos, n }), done: false, button: fill(home.card.fromN, { n: t.pos + 1 }) };
      return { note: fill(P.notStarted, { n }), done: false, button: home.card.start };
    }
  }
}

/** 「続きから」カードに出す入口：最後に入った入口が終わっていなければそこ。それ以外は博士のおすすめで、まだ終わっていないもの */
function cardPart(d: SaveData): PartId {
  if (d.lastPart && isPart(d.lastPart) && !status(d.lastPart, d).done) return d.lastPart;
  const suggested = (home.suggestFor[d.entryAnswer ?? 'some'] as string[]).filter(isPart);
  return suggested.find((id) => !status(id, d).done) ?? 'dungeon';
}

// 学ぶ（ホーム）：博士の一言 → 大きな「続きから」カード → 入口の一覧（5章）
// どの入口も最初から選べる（順番による解放はしない）
export default function Home({
  onOpen,
  onViewLater,
  onSwitchProfile,
}: {
  onOpen: (p: PartId, resume?: boolean) => void;
  onViewLater: (it: LaterItem) => void;
  onSwitchProfile: () => void;
}) {
  const profile = currentProfile();
  const data = load();
  const [entry, setEntry] = useState(data.entryAnswer);
  // 前に「後で聞く」にしたものがあれば、開いたときに1件だけ提案する
  const [offer, setOffer] = useState<LaterItem | null>(() => {
    if (!profile || laterOffered.has(profile.id)) return null;
    laterOffered.add(profile.id);
    return openLater(load()).find((l) => l.at < sessionStartedAt) ?? null;
  });

  const answer = (id: 'beginner' | 'some') => {
    update((d) => {
      d.entryAnswer = id;
    });
    addLog({ part: 'entry', step: '入口の質問', choice: id });
    setEntry(id);
  };

  if (!entry) {
    return (
      <div className="screen tabbed">
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
  const card = cardPart(data);
  const cardEntry = entryOf(card)!;
  const cardStatus = status(card, data);
  return (
    <div className="screen tabbed">
      <header className="topbar profile-bar">
        <span className="muted">{profile?.name}</span>
        <button type="button" className="btn small ghost" onClick={onSwitchProfile}>
          {profileText.profile.switch}
        </button>
      </header>

      {offer ? (
        <div className="offer">
          <Hakase lines={LT.offer} />
          <div className="choices">
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                setOffer(null);
                onViewLater(offer);
              }}
            >
              {LT.yes}
            </button>
            <button type="button" className="btn" onClick={() => setOffer(null)}>{LT.no}</button>
          </div>
        </div>
      ) : (
        <Hakase lines={data.lastPart ? home.welcomeBack : home.suggest[entry]} />
      )}

      <section className="continue-card">
        <div className="continue-name">
          {cardEntry.level && <span className="level">{cardEntry.level}</span>}
          <span>{cardEntry.label}</span>
        </div>
        <button type="button" className="btn primary big-continue" onClick={() => onOpen(card, true)}>
          {cardStatus.button}
        </button>
      </section>

      {home.groups.map((g) => (
        <section key={g.title} className="entry-group">
          <h2 className="menu-title">{g.title}</h2>
          <ul className="menu">
            {(g.items as Entry[]).map((m) => {
              // ミックスは、1問以上解いた入口があるときだけ選べる
              const mixLocked = m.id === 'mix' && mixEntries().length === 0;
              const ready = m.ready !== false && isPart(m.id) && !mixLocked;
              const note = mixLocked ? P.mixNotYet : !ready ? P.notReady : suggested.includes(m.id) && !data.lastPart ? home.suggestedMark : status(m.id as PartId, data).note;
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    className={`menu-item ${ready && suggested.includes(m.id) && !data.lastPart ? 'suggested' : ''}`}
                    disabled={!ready}
                    onClick={() => ready && onOpen(m.id as PartId)}
                  >
                    <span className="menu-label">
                      {m.level && <span className="level">{m.level}</span>}
                      {m.label}
                    </span>
                    <span className="menu-note">{note}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <button type="button" className="btn small ghost" onClick={() => setEntry(undefined)}>
        {home.changeAnswer}
      </button>
    </div>
  );
}
