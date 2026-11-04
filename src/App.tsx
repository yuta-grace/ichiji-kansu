import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import TabBar from './components/TabBar';
import type { TabId } from './components/TabBar';
import Diagnostic from './screens/Diagnostic';
import Dungeon from './screens/dungeon/Dungeon';
import Home from './screens/Home';
import type { PartId } from './screens/Home';
import Later, { LaterView } from './screens/Later';
import Note from './screens/Note';
import Practice from './screens/practice/Practice';
import ProfileSelect from './screens/ProfileSelect';
import Teacher from './screens/Teacher';
import Understanding from './screens/understanding/Understanding';
import { currentProfile, update } from './lib/storage';
import type { LaterItem } from './lib/storage';
import home from './content/home.json';

export default function App() {
  const [hash, setHash] = useState(window.location.hash);
  const [profileId, setProfileId] = useState<string | undefined>(currentProfile()?.id);
  const [tab, setTab] = useState<TabId>('learn');
  // 入口に入っている間はタブを隠す。resume：「続きから」カードから入った（続きから始めるかを聞かない）
  const [part, setPart] = useState<{ id: PartId; resume: boolean } | null>(null);
  // 「後で聞く」の1件・ノートの例題などを見ている間もタブを隠す（close を渡して中身を作る）
  const [overlay, setOverlay] = useState<{ render: (close: () => void) => ReactNode } | null>(null);
  const showOverlay = (render: (close: () => void) => ReactNode) => setOverlay({ render });
  const viewLater = (it: LaterItem) => showOverlay((close) => <LaterView item={it} onDone={close} />);

  useEffect(() => {
    const onHash = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const toLearn = () => {
    setPart(null);
    setTab('learn');
    window.scrollTo(0, 0);
  };
  const open = (id: PartId, resume = false) => {
    update((d) => {
      d.lastPart = id;
    });
    setPart({ id, resume });
  };

  // 講師用画面（博士のアイコンを3秒以内に5回タップ、または URL の末尾 #/teacher）
  if (hash === '#/teacher') {
    return (
      <Teacher
        onExit={() => {
          history.replaceState(null, '', window.location.pathname + window.location.search);
          setHash('');
          // 削除されたニックネームを選んでいたら、選び直す
          setProfileId(currentProfile()?.id);
        }}
      />
    );
  }

  // 開くたびにニックネームを選ぶ（2回目からは「○○で続ける」）
  if (!profileId) return <ProfileSelect onSelected={() => setProfileId(currentProfile()?.id)} />;

  const key = profileId;
  if (part?.id === 'understanding') return <Understanding key={key} onExit={toLearn} resume={part.resume} />;
  if (part?.id === 'diagnostic') return <Diagnostic key={key} onExit={toLearn} />;
  if (part?.id === 'practice') return <Practice key={key} onExit={toLearn} resume={part.resume} />;
  if (part?.id === 'dungeon') return <Dungeon key={key} onExit={toLearn} />;
  if (overlay) {
    const close = () => setOverlay(null);
    return (
      <div className="screen fit">
        <header className="topbar">
          <button type="button" className="btn small ghost" onClick={close}>{home.back}</button>
        </header>
        {overlay.render(close)}
      </div>
    );
  }

  return (
    <>
      {tab === 'learn' && (
        <Home
          key={key}
          onOpen={open}
          onViewLater={viewLater}
          onSwitchProfile={() => {
            setPart(null);
            setProfileId(undefined);
          }}
        />
      )}
      {tab === 'note' && <Note key={key} onOverlay={showOverlay} />}
      {tab === 'later' && <Later key={key} onView={viewLater} />}
      <TabBar tab={tab} onChange={(t) => {
        setTab(t);
        window.scrollTo(0, 0);
      }} />
    </>
  );
}
