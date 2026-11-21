// 三味線の棹：3本の糸と勘所
import { useApp } from '../context';
import { noteName } from '../lib/pitch';
import { openStrings, POSITION_LABELS, STRING_LABELS, type Tuning } from '../lib/shamisen';
import { useMedia } from './useMedia';

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
  const wide = useMedia('(min-width: 900px)');
  const opens = openStrings(sun, tuning);
  // 横向きのとき、上に来る糸の順（文化譜の設定に合わせる）
  const stringOrder = wide ? (settings.bunkaTop === 'san' ? [2, 1, 0] : [0, 1, 2]) : [0, 1, 2];

  const cell = (s: number, p: number) => {
    const midi = opens[s] + p;
    const on = active.has(midi);
    const isPressed = pressed?.string === s && pressed.pos === p;
    return (
      <button
        key={`${s}-${p}`}
        type="button"
        className={`neck-cell${on ? ' lit' : ''}${isPressed ? ' pressed' : ''}${p === 0 ? ' open' : ''}${p === 12 || p === 24 ? ' octave' : ''}`}
        style={wide ? { gridRow: stringOrder.indexOf(s) + 2, gridColumn: p + 2 } : { gridRow: p + 2, gridColumn: s + 2 }}
        onPointerDown={(e) => {
          e.preventDefault();
          onPress(midi, s, p);
        }}
        aria-label={`${STRING_LABELS[s]}の糸 ${POSITION_LABELS[p]}（${noteName(midi, settings.nameStyle, true)}）`}
      >
        <span className="string-line" />
        <span className="pos-label">{POSITION_LABELS[p]}</span>
      </button>
    );
  };

  return (
    <div className={`neck ${wide ? 'horizontal' : 'vertical'}`}>
      <div className="neck-grid" style={wide ? { gridTemplateColumns: `48px repeat(${POSITION_LABELS.length}, minmax(44px, 1fr))` } : undefined}>
        {[0, 1, 2].map((s) => (
          <div
            key={`h${s}`}
            className="neck-head"
            style={wide ? { gridRow: stringOrder.indexOf(s) + 2, gridColumn: 1 } : { gridRow: 1, gridColumn: s + 2 }}
          >
            <span className="neck-head-name">{STRING_LABELS[s]}</span>
            <span className="neck-head-note">{noteName(opens[s], settings.nameStyle, true)}</span>
          </div>
        ))}
        {POSITION_LABELS.map((l, p) => (
          <div key={`r${p}`} className="neck-rowlabel" style={wide ? { gridRow: 1, gridColumn: p + 2 } : { gridRow: p + 2, gridColumn: 1 }}>
            {l}
          </div>
        ))}
        {[0, 1, 2].flatMap((s) => POSITION_LABELS.map((_, p) => cell(s, p)))}
      </div>
    </div>
  );
}
