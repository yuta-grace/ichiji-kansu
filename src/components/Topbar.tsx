import home from '../content/home.json';

/** 学習中の画面の上のバー：学ぶへ戻るボタンと進み具合 */
export default function Topbar({ onExit, progress }: { onExit: () => void; progress: number }) {
  return (
    <header className="topbar">
      <button type="button" className="btn small ghost" onClick={onExit}>{home.back}</button>
      <div className="progress" aria-hidden="true">
        <div style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>
    </header>
  );
}
