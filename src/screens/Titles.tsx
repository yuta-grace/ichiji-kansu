// 称号一覧：解き方ごとに「使える」「慣れた」「タイム」。3つそろったら「○○マスター」
import { Hakase } from '../components/Hakase';
import content from '../content/dungeon.json';
import { isMaster, methodName, newProgress } from '../lib/dungeon';
import type { MethodId, TitleKey } from '../lib/dungeon';
import { load } from '../lib/storage';
import settings from '../content/settings.json';
import { fill } from '../lib/text';

const T = content.lines.titles;
const LEVELS: TitleKey[] = ['usable', 'familiar', 'time'];

export default function Titles({ onExit }: { onExit: () => void }) {
  const methods = load().dungeon?.methods ?? {};
  const any = Object.values(methods).some((p) => p && Object.values(p.titles).some(Boolean));
  return (
    <div className="screen">
      <header className="topbar">
        <button type="button" className="btn small ghost" onClick={onExit}>ホーム</button>
        <h2 className="menu-title">{T.heading}</h2>
      </header>
      {!any && <Hakase lines={T.empty} />}
      <div className="titles">
        {content.methods.map(({ id }) => {
          const p = methods[id as MethodId] ?? newProgress();
          const master = isMaster(p);
          return (
            <section key={id} className={`title-card ${master ? 'master' : ''}`}>
              <h3>{master ? fill(T.master, { name: methodName(id) }) : methodName(id)}</h3>
              {LEVELS.map((k) => (
                <div key={k} className="title-row">
                  <span className={`badge ${p.titles[k] ? 'got' : ''}`}>{T.levels[k]}</span>
                  <span className="cond">{fill(T.conditions[k], { n: settings.dungeon.titleFamiliarCount })}</span>
                </div>
              ))}
            </section>
          );
        })}
      </div>
    </div>
  );
}
