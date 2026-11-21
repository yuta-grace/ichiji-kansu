// 三味線の棹：3本の糸と勘所。数字は端に一度だけ書き、糸の上には点を置く
import { useApp } from '../context';
import { noteName } from '../lib/pitch';
import { openStrings, POSITION_LABELS, STRING_LABELS, type Tuning } from '../lib/shamisen';
import { useMedia } from './useMedia';

/** よく使う勘所（3・4・6・9・10 とその1オクターブ上）。数字から点まで点線を引く */
const COMMON = new Set(['3', '4', '6', '9', '10', '13', '14', '16', '19', '20'].map((l) => POSITION_LABELS.indexOf(l)));

export function ShamisenNeck({
  sun,
  tuning,
  active,
  pressed,
  onPress,
}: {
  sun: number;
  tuning: Tuning;
  /** 光らせる音（ピアノや再生から） */
  active: Set<number>;
  /** いま押した場所 */
  pressed: { string: number; pos: number } | null;
  onPress: (midi: number, string: number, pos: number) => void;
}) {
  const { settings } = useApp();
  // PC（マウス）では横向き。スマホでも横に広い画面なら横向き
  const horizontal = useMedia('(pointer: fine), (min-width: 900px)');
  const opens = openStrings(sun, tuning);
  // 横向きのとき、上に来る糸の順（文化譜の設定に合わせる）
  const stringOrder = horizontal ? (settings.bunkaTop === 'san' ? [2, 1, 0] : [0, 1, 2]) : [0, 1, 2];
  const n = POSITION_LABELS.length;

  // 位置（行・列）：縦向きは行＝勘所、横向きは列＝勘所
  const at = (s: number | null, p: number | null) =>
    horizontal
      ? { gridRow: s === null ? 1 : stringOrder.indexOf(s) + 2, gridColumn: p === null ? 1 : p + 2 }
      : { gridRow: p === null ? 1 : p + 2, gridColumn: s === null ? 1 : s + 2 };

  return (
    <div className={`neck ${horizontal ? 'horizontal' : 'vertical'}`}>
      <div
        className="neck-grid"
        style={horizontal ? { gridTemplateColumns: `48px repeat(${n}, minmax(40px, 1fr))` } : undefined}
      >
        {/* よく使う勘所の点線（数字から糸の点まで） */}
        {POSITION_LABELS.map((_, p) =>
          COMMON.has(p) ? (
            <div
              key={`g${p}`}
              className="neck-guide"
              aria-hidden="true"
              style={horizontal ? { gridColumn: p + 2, gridRow: '1 / 5' } : { gridRow: p + 2, gridColumn: '1 / 5' }}
            />
          ) : null,
        )}
        {[0, 1, 2].map((s) => (
          <div key={`h${s}`} className="neck-head" style={at(s, null)}>
            <span className="neck-head-name">{STRING_LABELS[s]}</span>
            <span className="neck-head-note">{noteName(opens[s], settings.nameStyle, true)}</span>
          </div>
        ))}
        {POSITION_LABELS.map((l, p) => (
          <div key={`r${p}`} className={`neck-rowlabel${COMMON.has(p) ? ' common' : ''}`} style={at(null, p)}>
            <span>{l}</span>
          </div>
        ))}
        {[0, 1, 2].flatMap((s) =>
          POSITION_LABELS.map((l, p) => {
            const midi = opens[s] + p;
            const lit = active.has(midi);
            const isPressed = pressed?.string === s && pressed.pos === p;
            return (
              <button
                key={`${s}-${p}`}
                type="button"
                className={`neck-cell str${s}${lit ? ' lit' : ''}${isPressed ? ' pressed' : ''}${p === 0 ? ' open' : ''}`}
                style={at(s, p)}
                onPointerDown={(e) => {
                  e.preventDefault();
                  onPress(midi, s, p);
                }}
                aria-label={`${STRING_LABELS[s]}の糸 ${l}（${noteName(midi, settings.nameStyle, true)}）`}
              >
                <span className="string-line" />
                <span className="dot" />
              </button>
            );
          }),
        )}
      </div>
    </div>
  );
}
