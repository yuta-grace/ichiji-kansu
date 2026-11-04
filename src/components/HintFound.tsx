import MathText from './MathText';

/** ヒントで答えた値。元の問題に戻っても見えるように残す */
export default function HintFound({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="hint-found">
      <span className="hint-found-title">{title}</span>
      {items.map((t, i) => (
        <span key={i}>
          <MathText text={t} />
        </span>
      ))}
    </div>
  );
}
