/**
 * 解き方を見せた問題と同じ種類の問題を、後でもう一度出す（5.5）。
 * 問題を追加するのではなく、まだ出していない同じ種類の問題を前に寄せる。
 * gap：見せた問題から何問後に出すか（2なら、間に1問はさむ）
 */
export function moveSameTypeCloser<T>(queue: T[], pos: number, typeOf: (q: T) => string, gap: number): T[] {
  const type = typeOf(queue[pos]);
  const next = queue.findIndex((q, i) => i > pos && typeOf(q) === type);
  const target = Math.min(pos + gap, queue.length - 1);
  if (next < 0 || next <= target) return queue;
  const out = queue.slice();
  const [item] = out.splice(next, 1);
  out.splice(target, 0, item);
  return out;
}
