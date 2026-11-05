// 称号一覧（ノートの「称号」）（5.10）
// 入口ごとに「解いた数」（段階的）と「スピード」（挑戦は解いた数だけ）。単元全体で「一次関数クリア」と「一次関数マスター」の進み具合
import { Hakase } from '../components/Hakase';
import settings from '../content/settings.json';
import titles from '../content/titles.json';
import { TITLE_ENTRIES, formatTime, masterState, resultsOf, targetSec, titleState } from '../lib/results';
import { load } from '../lib/storage';
import { fill } from '../lib/text';

const T = settings.titles;

export default function Titles() {
  const results = resultsOf(load());
  const m = masterState(results);
  const top = titles.solved[titles.solved.length - 1];
  return (
    <>
      <Hakase lines={titles.intro} />
      {/* 一番上：クリアまでの進み具合。クリアした後は、マスターまでの進み具合 */}
      <section className={`title-card master-card ${m.master ? 'master' : m.clear ? 'complete' : ''}`}>
        {!m.clear ? (
          <>
            <h3>{titles.clear}</h3>
            <div className="title-row">
              <span className="cond">{fill(titles.masterEntries, { done: m.done, total: m.total })}</span>
            </div>
            <div className="title-row">
              <span className="cond">{fill(titles.clearUnsolved, { n: m.unsolved })}</span>
            </div>
            <p className="muted small">{fill(titles.clearCond, { top })}</p>
          </>
        ) : (
          <>
            <h3>{m.master ? titles.masterGot : titles.clearGot}</h3>
            {!m.master && (
              <>
                <div className="title-row">
                  <span className="cond">{fill(titles.masterUnsolved, { n: m.challengeUnsolved })}</span>
                </div>
                <p className="muted small">{titles.masterCond}</p>
              </>
            )}
          </>
        )}
      </section>
      <div className="titles">
        {TITLE_ENTRIES.map((e) => {
          const s = titleState(results, e.id);
          return (
            <section key={e.id} className={`title-card ${s.complete ? 'complete' : ''}`}>
              <h3>
                {e.level && <span className="level">{e.level}</span>} {e.label}
                {s.complete && <span className="complete-mark">{titles.entryComplete}</span>}
              </h3>
              <div className="title-row">
                <span className="title-kind">{titles.solvedLabel}</span>
                <span className="cond">{fill(titles.solvedNow, { n: s.solved })}</span>
              </div>
              <div className="title-badges">
                {s.steps.map((st) => (
                  <span key={st.n} className={`badge ${st.got ? 'got' : ''}`}>
                    {st.name}
                    <small>{fill(titles.solvedCond, { n: st.n })}</small>
                  </span>
                ))}
              </div>
              {s.hasSpeed && (
                <>
                  <div className="title-row">
                    <span className="title-kind">{titles.speedLabel}</span>
                    <span className="cond">{fill(titles.speedNow, { n: Math.min(s.speed, T.speedCount), need: T.speedCount })}</span>
                  </div>
                  <div className="title-badges">
                    <span className={`badge ${s.speedGot ? 'got' : ''}`}>
                      {titles.speed}
                      <small>{fill(titles.speedCond, { t: formatTime(targetSec(e.level ?? '') * 1000), n: T.speedCount })}</small>
                    </span>
                  </div>
                </>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
