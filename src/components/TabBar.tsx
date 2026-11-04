import home from '../content/home.json';

export type TabId = 'learn' | 'note' | 'later';
const TABS: TabId[] = ['learn', 'note', 'later'];

/** 画面の下のタブ（学ぶ／ノート／後で聞く）。問題を解いている間は出さない */
export default function TabBar({ tab, onChange }: { tab: TabId; onChange: (t: TabId) => void }) {
  return (
    <nav className="tabbar">
      {TABS.map((t) => (
        <button
          key={t}
          type="button"
          className={`tab ${tab === t ? 'active' : ''}`}
          aria-current={tab === t ? 'page' : undefined}
          onClick={() => onChange(t)}
        >
          <TabIcon id={t} />
          <span>{home.tabs[t]}</span>
        </button>
      ))}
    </nav>
  );
}

/** 線だけの簡単なアイコン（装飾を増やさない） */
function TabIcon({ id }: { id: TabId }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="tab-icon">
      {id === 'learn' && <path d="M3 20 L21 4 M3 20 H21 M3 20 V4" />}
      {id === 'note' && <path d="M6 3 H18 V21 H6 Z M9 8 H15 M9 12 H15 M9 16 H13" />}
      {id === 'later' && <path d="M12 3 A9 9 0 1 0 12.01 3 M10 9.5 A2.2 2.2 0 1 1 12 12 V14 M12 17.2 V17.4" />}
    </svg>
  );
}
