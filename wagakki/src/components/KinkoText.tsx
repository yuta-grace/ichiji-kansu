// 琴古の名前を表示する（フォントがあればフォントの文字、なければカタカナ）
import { useApp } from '../context';
import { kinkoGlyph, type KinkoNote } from '../lib/shakuhachi';

export function KinkoText({ note, showRegister = true, size }: { note: KinkoNote; showRegister?: boolean; size?: number }) {
  const { kinkoFont } = useApp();
  const glyph = kinkoFont ? kinkoGlyph(note.rel, kinkoFont.kind) : null;
  const mark = showRegister && note.register !== '乙' ? (note.register === '甲' ? '甲' : '大') : null;
  return (
    <span className="kinko" aria-label={`${note.register === '乙' ? '' : note.register}${note.name}`}>
      {mark && <span className={`kinko-reg ${note.register === '甲' ? 'kan' : 'daikan'}`}>{mark}</span>}
      {glyph ? (
        <span className="kinko-glyph" style={{ fontFamily: `"${kinkoFont!.family}"`, fontSize: size ? size * 1.15 : undefined }}>
          {glyph}
        </span>
      ) : (
        <span className={`kinko-kana len${Math.min(note.name.length, 4)}`} style={size ? { fontSize: size } : undefined}>
          {note.name}
        </span>
      )}
    </span>
  );
}
