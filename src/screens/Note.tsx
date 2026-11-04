import { useState } from 'react';
import type { ReactNode } from 'react';
import { Hakase } from '../components/Hakase';
import dungeon from '../content/dungeon.json';
import home from '../content/home.json';
import { isLearned, noteOrder } from '../lib/notebook';
import { load } from '../lib/storage';
import LearnMethod, { exampleProblem } from './dungeon/Learn';
import MethodCard from './dungeon/MethodCard';
import NameMethod from './dungeon/NameMethod';
import Walkthrough from './dungeon/Walkthrough';
import Titles from './Titles';

const N = home.note;
const DN = dungeon.lines.note;
type NoteTab = 'methods' | 'titles';

// ノート：上部で「解き方」と「称号」を切り替える
// 解き方ごとに、番号・名前（変更できる）・概要・「例題を見る」。まだ知らない解き方はもやつきで、タップすると学べる
export default function Note({ onOverlay }: { onOverlay: (render: (close: () => void) => ReactNode) => void }) {
  const [tab, setTab] = useState<NoteTab>('methods');
  const d = load();
  return (
    <div className="screen tabbed">
      <div className="segmented" role="tablist">
        {(['methods', 'titles'] as NoteTab[]).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
            {N[t]}
          </button>
        ))}
      </div>
      {tab === 'titles' ? (
        <Titles />
      ) : (
        <>
          <Hakase lines={noteOrder(d).some((m) => isLearned(d, m)) ? DN.intro : DN.empty} />
          <div className="method-list">
            {noteOrder(d).map((m) =>
              isLearned(d, m) ? (
                <MethodCard key={m} d={d} method={m}>
                  <button
                    type="button"
                    className="btn small"
                    onClick={() =>
                      onOverlay((close) => (
                        <Walkthrough problem={exampleProblem(m)} method={m} intro={DN.exampleIntro} onDone={close} />
                      ))
                    }
                  >
                    {DN.example}
                  </button>
                  <button
                    type="button"
                    className="btn small ghost"
                    onClick={() =>
                      onOverlay((close) => <NameMethod method={m} lines={DN.renameAsk} initial={d.notebook?.[m]?.name ?? ''} onDone={close} />)
                    }
                  >
                    {DN.rename}
                  </button>
                </MethodCard>
              ) : (
                <MethodCard key={m} d={d} method={m} onClick={() => onOverlay((close) => <LearnMethod method={m} from="ノート" onDone={close} />)} />
              ),
            )}
          </div>
        </>
      )}
    </div>
  );
}
