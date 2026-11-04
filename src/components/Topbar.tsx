/** 学習中の画面の上のバー：ホームへ戻るボタンと進み具合 */
export default function Topbar({ onExit, progress }: { onExit: () => void; progress: number }) {
  return (
    <header className="topbar">
      <button type="button" className="btn small ghost" onClick={onExit}>ホーム</button>
      <div className="progress" aria-hidden="true">
        <div style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>
    </header>
  );
}
