import { useState } from 'react';
import content from '../../content/dungeon.json';
import type { DungeonProblem, MethodId } from '../../lib/dungeon';
import { learnMethod, methodInfo } from '../../lib/notebook';
import NameMethod from './NameMethod';
import Walkthrough from './Walkthrough';

const N = content.lines.note;
export const exampleProblem = (m: MethodId) =>
  (content.problems as DungeonProblem[]).find((p) => p.id === methodInfo(m).example)!;

/**
 * まだ知らない解き方を例題で1つずつ学ぶ → ノートに保存 → 名前を付けてみる？
 * from は記録用（ノートから／ヒントから／他のやり方から／博士の提案から）
 */
export default function LearnMethod({ method, from, onDone }: { method: MethodId; from: string; onDone: () => void }) {
  const [saved, setSaved] = useState(false);
  if (saved) return <NameMethod method={method} lines={N.saved} onDone={onDone} />;
  return (
    <Walkthrough
      problem={exampleProblem(method)}
      method={method}
      intro={N.learnIntro}
      onDone={() => {
        learnMethod(method, from);
        setSaved(true);
      }}
    />
  );
}
