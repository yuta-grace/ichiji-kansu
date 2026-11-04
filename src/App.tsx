import { useEffect, useState } from 'react';
import Diagnostic from './screens/Diagnostic';
import Dungeon from './screens/dungeon/Dungeon';
import Home from './screens/Home';
import type { PartId } from './screens/Home';
import Later from './screens/Later';
import Practice from './screens/practice/Practice';
import ProfileSelect from './screens/ProfileSelect';
import Teacher from './screens/Teacher';
import Titles from './screens/Titles';
import Understanding from './screens/understanding/Understanding';
import { currentProfile } from './lib/storage';

export default function App() {
  const [hash, setHash] = useState(window.location.hash);
  const [profileId, setProfileId] = useState<string | undefined>(currentProfile()?.id);
  const [part, setPart] = useState<PartId | null>(null);

  useEffect(() => {
    const onHash = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const home = () => {
    setPart(null);
    window.scrollTo(0, 0);
  };

  // 講師用画面（博士のアイコンを5秒長押し、または URL の末尾 #/teacher）
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
  if (part === 'understanding') return <Understanding key={key} onExit={home} />;
  if (part === 'diagnostic') return <Diagnostic key={key} onExit={home} />;
  if (part === 'practice') return <Practice key={key} onExit={home} />;
  if (part === 'dungeon') return <Dungeon key={key} onExit={home} />;
  if (part === 'titles') return <Titles key={key} onExit={home} />;
  if (part === 'later') return <Later key={key} onExit={home} />;
  return (
    <Home
      key={key}
      onOpen={setPart}
      onSwitchProfile={() => {
        setPart(null);
        setProfileId(undefined);
      }}
    />
  );
}
