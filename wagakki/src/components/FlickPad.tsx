// かな入力のようなキーパッド：押すと真ん中、上下左右にはらうとそれぞれの音（フリック入力）
import { useRef, useState, type ReactNode } from 'react';

export interface FlickItem {
  label: ReactNode;
  midi: number;
  str?: number;
}

export interface FlickKey {
  id: string;
  center: FlickItem | null;
  up?: FlickItem | null;
  down?: FlickItem | null;
  left?: FlickItem | null;
  right?: FlickItem | null;
}

export interface PadAction {
  id: string;
  label: ReactNode;
  title: string;
  onPress: () => void;
}

type Dir = 'center' | 'up' | 'down' | 'left' | 'right';
const THRESHOLD = 18;

export function FlickPad({ keys, actions, onPick }: { keys: FlickKey[]; actions: PadAction[]; onPick: (item: FlickItem) => void }) {
  const [active, setActive] = useState<{ id: string; dir: Dir } | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);

  const dirOf = (dx: number, dy: number): Dir => {
    if (Math.hypot(dx, dy) < THRESHOLD) return 'center';
    return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
  };

  return (
    <div className="flickpad">
      <div className="flick-keys">
        {keys.map((k, ki) => {
          const isActive = active?.id === k.id;
          const col = ki % 3; // 端の列では、候補が画面の外に出ないように寄せる
          return (
            <button
              key={k.id}
              type="button"
              className={`flick-key${isActive ? ' pressed' : ''}${k.center ? '' : ' empty'}`}
              disabled={!k.center}
              onPointerDown={(e) => {
                e.preventDefault();
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                start.current = { x: e.clientX, y: e.clientY };
                setActive({ id: k.id, dir: 'center' });
              }}
              onPointerMove={(e) => {
                if (!start.current || !isActive) return;
                const d = dirOf(e.clientX - start.current.x, e.clientY - start.current.y);
                if (d !== active!.dir) setActive({ id: k.id, dir: d });
              }}
              onPointerUp={(e) => {
                if (!start.current) return;
                const d = dirOf(e.clientX - start.current.x, e.clientY - start.current.y);
                const item = (d === 'center' ? k.center : k[d]) ?? k.center;
                start.current = null;
                setActive(null);
                if (item) onPick(item);
              }}
              onPointerCancel={() => {
                start.current = null;
                setActive(null);
              }}
              onContextMenu={(e) => e.preventDefault()}
            >
              <span className="flick-center">{k.center?.label}</span>
              {/* はらう方向の音を、キーの端に小さく出す */}
              {k.up && <span className="flick-hint up">{k.up.label}</span>}
              {k.down && <span className="flick-hint down">{k.down.label}</span>}
              {k.left && <span className="flick-hint left">{k.left.label}</span>}
              {k.right && <span className="flick-hint right">{k.right.label}</span>}
              {/* 押している間は、上下左右の候補を大きく出す */}
              {isActive && (
                <span className={`flick-guide${col === 0 ? ' at-left' : col === 2 ? ' at-right' : ''}`} aria-hidden="true">
                  {(['up', 'left', 'center', 'right', 'down'] as Dir[]).map((d) => {
                    const it = d === 'center' ? k.center : k[d];
                    return (
                      <span key={d} className={`flick-guide-cell ${d}${active?.dir === d ? ' on' : ''}${it ? '' : ' none'}`}>
                        {it?.label}
                      </span>
                    );
                  })}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="flick-actions">
        {actions.map((a) => (
          <button key={a.id} type="button" className="flick-action" title={a.title} aria-label={a.title} onClick={a.onPress}>
            {a.label}
          </button>
        ))}
      </div>
    </div>
  );
}
