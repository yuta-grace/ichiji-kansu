import { useState } from 'react';
import settings from '../content/settings.json';
import { entryLabel, formatTime, recentStats, resultsOf } from '../lib/results';
import type { ProblemResult } from '../lib/results';
import MathText from '../components/MathText';
import content from '../content/profile.json';
import { checkTeacherPin, deleteProfile, hasTeacherPin, listProfiles, loadProfileData, setTeacherPin, updateProfileData } from '../lib/storage';
import { fill } from '../lib/text';
import { laterLabel } from './Later';

const T = content.teacher;
const ST = T.stats;
type By = 'type' | 'entry';

/** 直近の問題の系統別タイム（5.12）。平均時間は正解した問題だけ。3問未満の系統は薄く */
function RecentStats({ results, n, by }: { results: ProblemResult[]; n: number; by: By }) {
  if (results.length === 0) return <p className="muted small">{ST.empty}</p>;
  const rows = recentStats(results, n, by);
  return (
    <table className="stats">
      <thead>
        <tr>
          <th>{ST.colGroup}</th>
          <th>{ST.colTime}</th>
          <th>{ST.colRate}</th>
          <th>{ST.colCount}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} className={r.count < settings.teacher.faintBelow ? 'faint' : ''}>
            <td>{by === 'type' ? r.key : entryLabel(r.key)}</td>
            <td>{r.avgMs === null ? ST.none : formatTime(r.avgMs)}</td>
            <td>{r.count ? `${Math.round((r.correct / r.count) * 100)}%` : ST.none}</td>
            <td>
              {r.count}
              {r.hinted > 0 && <small>（{fill(ST.hinted, { n: r.hinted })}）</small>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
const isPin = (s: string) => /^\d{4}$/.test(s);

/** 最初に開いたときに、4桁の暗証番号を決めてもらう */
function PinSetup({ onDone }: { onDone: () => void }) {
  const [pin, setPin] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState('');
  return (
    <form
      className="profile-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!isPin(pin)) return setError(T.pinFormat);
        if (pin !== again) return setError(T.pinMismatch);
        await setTeacherPin(pin);
        onDone();
      }}
    >
      <p>{T.pinSetup}</p>
      <input className="text-input" type="password" inputMode="numeric" maxLength={4} placeholder={T.pinPlaceholder} value={pin} onChange={(e) => setPin(e.target.value)} aria-label={T.pinPlaceholder} />
      <input className="text-input" type="password" inputMode="numeric" maxLength={4} placeholder={T.pinConfirm} value={again} onChange={(e) => setAgain(e.target.value)} aria-label={T.pinConfirm} />
      {error && <p className="error">{error}</p>}
      <button type="submit" className="btn primary">{T.pinSave}</button>
    </form>
  );
}

/** 削除のときだけ暗証番号を聞く */
function DeleteProfile({ id, name, onDeleted }: { id: string; name: string; onDeleted: () => void }) {
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  if (!open) {
    return (
      <button type="button" className="btn small ghost danger" onClick={() => setOpen(true)}>
        {T.delete}
      </button>
    );
  }
  return (
    <form
      className="pin-row"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!(await checkTeacherPin(pin))) return setError(T.pinWrong);
        if (!window.confirm(fill(T.confirmDelete, { name }))) return;
        deleteProfile(id);
        onDeleted();
      }}
    >
      <input className="text-input" type="password" inputMode="numeric" maxLength={4} placeholder={T.pinPlaceholder} value={pin} onChange={(e) => { setPin(e.target.value); setError(''); }} aria-label={`${name}の削除の暗証番号`} autoFocus />
      <button type="submit" className="btn small danger">{T.pinAsk}</button>
      <button type="button" className="btn small ghost" onClick={() => setOpen(false)}>{T.cancel}</button>
      {error && <p className="error">{error}</p>}
    </form>
  );
}

// 講師用画面（博士のアイコンを3秒以内に5回タップ、または URL の末尾 #/teacher）
// 一覧を見る・「聞いた」チェックは暗証番号なし。ニックネームの削除だけ暗証番号を聞く
export default function Teacher({ onExit }: { onExit: () => void }) {
  const [, refresh] = useState(0);
  const [pinReady, setPinReady] = useState(hasTeacherPin());
  // 集計の範囲（直近 n 問。0 は全部）と分け方
  const [n, setN] = useState(settings.teacher.recentDefault);
  const [by, setBy] = useState<By>('type');
  const profiles = listProfiles();

  return (
    <div className="screen teacher">
      <header className="topbar">
        <button type="button" className="btn small ghost" onClick={onExit}>{T.close}</button>
        <h2 className="menu-title">{T.title}</h2>
      </header>
      {!pinReady ? (
        <PinSetup onDone={() => setPinReady(true)} />
      ) : (
        <>
          <p className="muted small">{T.intro}</p>
          <div className="stats-controls">
            <span className="muted small">{ST.title}：</span>
            <div className="seg-small" role="group" aria-label={ST.recent}>
              {settings.teacher.recentChoices.map((c) => (
                <button key={c} type="button" className={n === c ? 'active' : ''} onClick={() => setN(c)}>
                  {c === 0 ? ST.all : `${ST.recent}${fill(ST.count, { n: c })}`}
                </button>
              ))}
            </div>
            <div className="seg-small" role="group">
              {(['type', 'entry'] as By[]).map((b) => (
                <button key={b} type="button" className={by === b ? 'active' : ''} onClick={() => setBy(b)}>
                  {b === 'type' ? ST.byType : ST.byEntry}
                </button>
              ))}
            </div>
            <p className="muted small">{ST.note}</p>
          </div>
          {profiles.length === 0 && <p>{T.noProfiles}</p>}
          {profiles.map((p) => {
            const data = loadProfileData(p.id);
            const items = data.later;
            return (
              <section key={p.id} className="title-card">
                <h3>{p.name}</h3>
                <h4 className="stats-title">{T.laterTitle}</h4>
                {items.length === 0 && <p className="muted small">{T.none}</p>}
                {items.map((it) => {
                  const label = laterLabel(it, data);
                  return (
                    <label key={it.id} className={`teacher-item ${it.asked ? 'asked' : ''}`}>
                      <input
                        type="checkbox"
                        checked={!!it.asked}
                        onChange={(e) => {
                          updateProfileData(p.id, (d) => {
                            d.later = d.later.map((l) => (l.id === it.id ? { ...l, asked: e.target.checked } : l));
                          });
                          refresh((n) => n + 1);
                        }}
                      />
                      <span>
                        <MathText text={label.title} />　{label.sub}
                        <small className="muted"> {new Date(it.at).toLocaleDateString('ja-JP')}</small>
                      </span>
                      <span className="muted small">{T.asked}</span>
                    </label>
                  );
                })}
                <h4 className="stats-title">{ST.title}</h4>
                <RecentStats results={resultsOf(data)} n={n} by={by} />
                <DeleteProfile id={p.id} name={p.name} onDeleted={() => refresh((n) => n + 1)} />
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}
