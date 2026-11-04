// 指で押しやすい数字入力。負号・分数・小数を入力できる（6章）。
// スマートフォンの標準キーボードは負号が出ないことがあるため、専用のキーパッドにする。

export type PadKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '-' | '/' | '.' | 'back';

/** キーを1つ押したあとの文字列 */
export function applyKey(value: string, key: PadKey): string {
  if (key === 'back') return value.slice(0, -1);
  if (key === '-') return value.startsWith('-') ? value.slice(1) : '-' + value;
  if (key === '/') {
    if (value.includes('/') || value.includes('.') || !/\d$/.test(value)) return value;
    return value + '/';
  }
  if (key === '.') {
    if (value.includes('.') || value.includes('/') || !/\d$/.test(value)) return value;
    return value + '.';
  }
  if (value.length >= 8) return value;
  return value + key;
}

// スマートフォンで画面を縦にスクロールさせないよう、2段に並べる
const KEYS: { key: PadKey; label: string }[] = [
  { key: '1', label: '1' }, { key: '2', label: '2' }, { key: '3', label: '3' }, { key: '4', label: '4' },
  { key: '5', label: '5' }, { key: '6', label: '6' }, { key: '7', label: '7' }, { key: '8', label: '8' },
  { key: '9', label: '9' }, { key: '0', label: '0' }, { key: '-', label: '−' }, { key: '/', label: '分数' },
  { key: '.', label: '.' }, { key: 'back', label: '⌫' },
];

interface PadProps {
  onKey: (k: PadKey) => void;
  /** 分数・小数のキーを出すか */
  allowFraction?: boolean;
}

export function NumberPad({ onKey, allowFraction = true }: PadProps) {
  return (
    <div className="pad">
      {KEYS.map(({ key, label }) => {
        const off = !allowFraction && (key === '/' || key === '.');
        return (
          <button
            key={key}
            type="button"
            className={`pad-key ${/^\d$/.test(key) ? '' : 'op'}`}
            disabled={off}
            // 押したときに入力欄のフォーカスが外れないように
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => onKey(key)}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

/** 物理キーボード（Mac）の入力をキーパッドのキーに変える */
export function keyFromKeyboard(e: KeyboardEvent): PadKey | 'enter' | 'tab' | null {
  if (e.metaKey || e.ctrlKey || e.altKey) return null;
  if (/^[0-9]$/.test(e.key)) return e.key as PadKey;
  switch (e.key) {
    case '-':
    case '−':
      return '-';
    case '/':
      return '/';
    case '.':
      return '.';
    case 'Backspace':
      return 'back';
    case 'Enter':
      return 'enter';
    case 'Tab':
      return 'tab';
    default:
      return null;
  }
}

/** 数字の入力欄の見た目。タップで選ぶと、キーパッドの入力先になる */
export function NumberField({
  value,
  active,
  onFocus,
  state,
  ariaLabel,
  wide,
}: {
  value: string;
  active: boolean;
  onFocus: () => void;
  state?: 'ok' | 'check' | 'clue';
  ariaLabel: string;
  wide?: boolean;
}) {
  const shown = value.replace('-', '−');
  return (
    <button
      type="button"
      className={`field ${active ? 'active' : ''} ${state ?? ''} ${wide ? 'wide' : ''}`}
      onClick={onFocus}
      aria-label={ariaLabel}
    >
      {shown ? <FracText text={shown} /> : <span className="field-empty">　</span>}
    </button>
  );
}

/** "−3/4" を縦の分数で表示する */
export function FracText({ text }: { text: string }) {
  const m = text.match(/^(−?)(\d*)\/(\d*)$/);
  if (!m) return <span>{text}</span>;
  return (
    <span className="frac-inline">
      {m[1]}
      <span className="frac">
        <span className="num">{m[2] || '□'}</span>
        <span className="den">{m[3] || '□'}</span>
      </span>
    </span>
  );
}
