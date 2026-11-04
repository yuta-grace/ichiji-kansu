import content from '../../content/dungeon.json';
import type { MethodId } from '../../lib/dungeon';
import { isLearned, methodInfo, methodLabel, methodNumber } from '../../lib/notebook';
import type { SaveData } from '../../lib/storage';
import { fill } from '../../lib/text';

const N = content.lines.note;

/**
 * 解き方を1つ表示する（ノート・ヒントの選択・他のやり方で共通）。
 * まだ知らない解き方は、内容にもやをかけて「まだ知らない解き方・タップして学ぶ」と出す
 */
export default function MethodCard({
  d,
  method,
  onClick,
  summary = true,
  children,
}: {
  d: SaveData;
  method: MethodId;
  /** カード全体を押したとき（まだ知らない解き方では「学ぶ」） */
  onClick?: () => void;
  /** 概要を出すか（ヒントの選択では出さない） */
  summary?: boolean;
  /** カードの下に並べるボタン（ノートの「例題を見る」など） */
  children?: React.ReactNode;
}) {
  const learned = isLearned(d, method);
  const body = (
    <>
      <span className="method-head">
        <span className="method-no">{fill(N.number, { n: methodNumber(d, method) })}</span>
        <span className="method-name">{learned ? methodLabel(d, method) : N.unknown}</span>
      </span>
      {(summary || !learned) && (
        <span className={`method-summary ${learned ? '' : 'fog'}`} aria-hidden={!learned}>
          {methodInfo(method).summary}
        </span>
      )}
      {!learned && <span className="fog-label">{`${N.unknown}・${N.tapToLearn}`}</span>}
    </>
  );
  return (
    <div className={`method-card ${learned ? '' : 'unknown'}`}>
      {onClick ? (
        <button type="button" className="method-body" onClick={onClick}>
          {body}
        </button>
      ) : (
        <div className="method-body">{body}</div>
      )}
      {children && <div className="method-actions">{children}</div>}
    </div>
  );
}
