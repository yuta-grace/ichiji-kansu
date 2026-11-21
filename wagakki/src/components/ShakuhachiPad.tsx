// 尺八：琴古の名前のボタン（押している間鳴る）
import { useApp } from '../context';
import { noteName, tsutsuneMidi } from '../lib/pitch';
import { KINKO_NOTES, type Register } from '../lib/shakuhachi';
import { KinkoText } from './KinkoText';

const REGISTERS: Register[] = ['乙', '甲', '大甲'];

export function ShakuhachiPad({
  sun,
  active,
  onDown,
  onUp,
}: {
  sun: number;
  active: Set<number>;
  onDown: (midi: number, pointerId: number) => void;
  onUp: (pointerId: number) => void;
}) {
  const { settings, kinkoFont } = useApp();
  const base = tsutsuneMidi(sun);
  return (
    <div className="pad">
      {REGISTERS.map((r) => (
        <section key={r} className="pad-section">
          <h3 className="pad-title">{r}</h3>
          <div className="pad-grid">
            {KINKO_NOTES.filter((n) => n.register === r).map((n) => {
              const midi = base + n.rel;
              const basic = !/メリ|サン/.test(n.name);
              return (
                <button
                  key={n.rel}
                  type="button"
                  className={`pad-btn${basic ? ' basic' : ''}${active.has(midi) ? ' lit' : ''}`}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    const el = e.target as HTMLElement;
                    // タッチは押した要素に捕まるので外す（指を滑らせたら離したことにするため）
                    if (el.hasPointerCapture?.(e.pointerId)) el.releasePointerCapture(e.pointerId);
                    onDown(midi, e.pointerId);
                  }}
                  onPointerUp={(e) => onUp(e.pointerId)}
                  onPointerLeave={(e) => onUp(e.pointerId)}
                  onPointerCancel={(e) => onUp(e.pointerId)}
                  onContextMenu={(e) => e.preventDefault()}
                  aria-label={`${r}の${n.name}（${noteName(midi, settings.nameStyle, true)}）`}
                >
                  <KinkoText note={n} showRegister={false} />
                  {kinkoFont && <span className="pad-sub">{n.name}</span>}
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
