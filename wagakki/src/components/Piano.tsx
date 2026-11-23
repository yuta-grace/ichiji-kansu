// ピアノ鍵盤：鳴っている音を光らせ、押すとその音を入力・演奏する
import { useEffect, useRef } from 'react';
import { useApp } from '../context';
import { isBlackKey, movableName, noteName, pc } from '../lib/pitch';

const WHITE_W = 40;

export function Piano({
  big,
  keyHints,
  range,
  active,
  basePc,
  inRange,
  onDown,
  onUp,
}: {
  /** ピアノが主役のとき（大きく表示） */
  big?: boolean;
  /** PC のキーの位置（音 → キーの名前） */
  keyHints?: Record<number, string>;
  range: [number, number];
  active: Set<number>;
  /** 移動ドの「ド」 */
  basePc: number;
  /** 楽器で出せる音か */
  inRange: (midi: number) => boolean;
  onDown: (midi: number, pointerId: number) => void;
  onUp: (pointerId: number) => void;
}) {
  const { settings } = useApp();
  // 白鍵から始まり白鍵で終わるように広げる
  let lo = range[0];
  let hi = range[1];
  while (isBlackKey(lo)) lo--;
  while (isBlackKey(hi)) hi++;
  const keys: number[] = [];
  for (let m = lo; m <= hi; m++) keys.push(m);
  const whites = keys.filter((m) => !isBlackKey(m));
  const scroller = useRef<HTMLDivElement>(null);

  // 最初は真ん中のド（C4）が中央に来るようにする（音域の外なら音域の真ん中）
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const target = 60 >= lo && 60 <= hi ? 60 : Math.round((lo + hi) / 2);
    const wi = whites.findIndex((w) => w >= target);
    el.scrollLeft = Math.max(0, wi * WHITE_W - el.clientWidth / 2 + WHITE_W / 2);
  }, [lo, hi]); // eslint-disable-line react-hooks/exhaustive-deps

  // 光った鍵が見えるようにスクロールする
  const firstActive = [...active][0];
  useEffect(() => {
    const el = scroller.current;
    if (!el || firstActive === undefined) return;
    const wi = whites.findIndex((w) => w >= firstActive);
    if (wi < 0) return;
    const x = wi * WHITE_W;
    if (x < el.scrollLeft + 20 || x > el.scrollLeft + el.clientWidth - 60) {
      el.scrollTo({ left: x - el.clientWidth / 2, behavior: 'smooth' });
    }
  }, [firstActive]); // eslint-disable-line react-hooks/exhaustive-deps

  const label = (m: number) => {
    if (settings.doremi === 'movable') return movableName(m, basePc);
    return noteName(m, settings.nameStyle);
  };

  const handlers = (m: number) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      const el = e.target as HTMLElement;
      // タッチは押した要素に捕まるので外す（指を滑らせたら離したことにするため）
      if (el.hasPointerCapture?.(e.pointerId)) el.releasePointerCapture(e.pointerId);
      onDown(m, e.pointerId);
    },
    onPointerUp: (e: React.PointerEvent) => onUp(e.pointerId),
    onPointerLeave: (e: React.PointerEvent) => onUp(e.pointerId),
    onPointerCancel: (e: React.PointerEvent) => onUp(e.pointerId),
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });

  return (
    <div className={`piano-wrap${big ? ' big' : ''}`} ref={scroller}>
      <div className="piano" style={{ width: whites.length * WHITE_W }}>
        {whites.map((m, i) => (
          <button
            key={m}
            type="button"
            className={`key white${active.has(m) ? ' lit' : ''}${inRange(m) ? '' : ' out'}${settings.doremi === 'movable' && pc(m - basePc) === 0 ? ' tonic' : ''}`}
            style={{ left: i * WHITE_W, width: WHITE_W }}
            aria-label={noteName(m, settings.nameStyle, true)}
            {...handlers(m)}
          >
            {keyHints?.[m] && <kbd className="key-hint">{keyHints[m]}</kbd>}
            <span className="key-label">{label(m)}</span>
            {pc(m) === 0 && <span className="key-oct">{noteName(m, 'cde', true)}</span>}
          </button>
        ))}
        {keys
          .filter((m) => isBlackKey(m))
          .map((m) => {
            const wi = whites.findIndex((w) => w > m);
            return (
              <button
                key={m}
                type="button"
                className={`key black${active.has(m) ? ' lit' : ''}${inRange(m) ? '' : ' out'}`}
                style={{ left: wi * WHITE_W - WHITE_W * 0.32, width: WHITE_W * 0.64 }}
                aria-label={noteName(m, settings.nameStyle, true)}
                {...handlers(m)}
              >
                {keyHints?.[m] && <kbd className="key-hint">{keyHints[m]}</kbd>}
                <span className="key-label">{label(m)}</span>
              </button>
            );
          })}
      </div>
    </div>
  );
}
