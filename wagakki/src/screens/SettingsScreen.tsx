// 設定
import { useRef, useState } from 'react';
import { useApp } from '../context';
import { Button, Segmented, Select, Switch } from '../components/ui';
import { KinkoText } from '../components/KinkoText';
import { KeymapEditor } from '../components/KeymapEditor';
import { InstrumentSelect, SunSelect, TuningSelect } from '../components/controls';
import { guessKind, loadFontFile, removeLoaded, setLoadedKind } from '../lib/fonts';
import { KINKO_NOTES, type KinkoFontKind } from '../lib/shakuhachi';

export function SettingsScreen() {
  const { settings, update, installedFonts, loadedFont, setLoadedFont, kinkoFont, toast } = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const fontOptions = [
    { value: 'auto', label: '自動（見つかったフォント）' },
    { value: 'kana', label: 'カタカナ（明朝体）' },
    ...installedFonts.map((f) => ({ value: f.family, label: `${f.label}（端末にインストール済み）` })),
    ...(loadedFont ? [{ value: loadedFont.family, label: `${loadedFont.label}（読み込み済み）` }] : []),
  ];

  return (
    <div className="screen settings">
      <section className="card">
        <h2>音</h2>
        <label className="field">
          <span className="field-label">基準ピッチ A4 ＝ {settings.a4} Hz</span>
          <input type="range" min={430} max={450} step={1} value={settings.a4} onChange={(e) => update({ a4: Number(e.target.value) })} />
        </label>
        <div className="chips">
          {[440, 442].map((v) => (
            <button key={v} type="button" className={`chip-btn${settings.a4 === v ? ' on' : ''}`} onClick={() => update({ a4: v })}>
              {v} Hz
            </button>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>ドレミ</h2>
        <Switch label="ピアノ鍵盤を表示する" checked={settings.showPiano} onChange={(v) => update({ showPiano: v })} />
        <div className="field-row">
          <span className="field-label">ドの位置</span>
          <Segmented
            value={settings.doremi}
            onChange={(v) => update({ doremi: v })}
            options={[
              { value: 'fixed', label: '固定ド（実際の音）' },
              { value: 'movable', label: '移動ド（一の糸・筒音＝ド）' },
            ]}
          />
        </div>
        <div className="field-row">
          <span className="field-label">音名の書き方</span>
          <Segmented
            value={settings.nameStyle}
            onChange={(v) => update({ nameStyle: v })}
            options={[
              { value: 'doremi', label: 'ドレミ' },
              { value: 'cde', label: 'CDE' },
            ]}
          />
        </div>
      </section>

      <section className="card">
        <h2>自分の楽器</h2>
        <p className="hint">演奏の画面と、新しい楽譜で使います（演奏の画面で選び直しても変わります）。</p>
        <div className="field-row">
          <span className="field-label">楽器</span>
          <InstrumentSelect value={settings.instrument} onChange={(v) => update({ instrument: v })} />
        </div>
        {settings.instrument === 'shamisen' && (
          <>
            <SunSelect instrument="shamisen" value={settings.shamisenSun} onChange={(v) => update({ shamisenSun: v })} />
            <div className="field-row">
              <span className="field-label">調弦</span>
              <TuningSelect value={settings.shamisenTuning} onChange={(v) => update({ shamisenTuning: v })} />
            </div>
          </>
        )}
        {settings.instrument === 'shakuhachi' && <SunSelect instrument="shakuhachi" value={settings.shakuhachiSun} onChange={(v) => update({ shakuhachiSun: v })} />}
      </section>

      <section className="card">
        <h2>楽譜</h2>
        <Switch
          label="複数のパートを同じ画面に出す（本手と替手など）"
          checked={settings.multiPart}
          onChange={(v) => update({ multiPart: v })}
        />
      </section>

      <section className="card">
        <h2>三味線</h2>
        <div className="field-row">
          <span className="field-label">調子の書き方</span>
          <Segmented
            value={settings.shamisenLabel}
            onChange={(v) => update({ shamisenLabel: v })}
            options={[
              { value: 'sun', label: '寸法（1尺8寸）' },
              { value: 'hon', label: '本（6本）' },
            ]}
          />
        </div>
        <div className="field-row">
          <span className="field-label">文化譜の上の線</span>
          <Segmented
            value={settings.bunkaTop}
            onChange={(v) => update({ bunkaTop: v })}
            options={[
              { value: 'san', label: '三の糸' },
              { value: 'ichi', label: '一の糸' },
            ]}
          />
        </div>
      </section>

      <section className="card">
        <h2>尺八のフォント（琴古流）</h2>
        <Select label="使うフォント" value={settings.kinkoFont} onChange={(v) => update({ kinkoFont: v })} options={fontOptions} />
        <div className="font-preview" aria-label="表示の例">
          {KINKO_NOTES.filter((n) => [0, 3, 5, 7, 10, 12, 22, 24].includes(n.rel)).map((n) => (
            <span key={n.rel} className="font-preview-cell">
              <KinkoText note={n} size={28} />
            </span>
          ))}
        </div>
        <p className="hint">
          いま使っているもの：{kinkoFont ? kinkoFont.label : 'カタカナ'}
          <br />
          端末にインストール済みと判定したもの：{installedFonts.length ? installedFonts.map((f) => f.label).join('、') : 'なし'}
        </p>
        <div className="file-actions">
          <Button variant="tonal" icon="upload" disabled={busy} onClick={() => fileRef.current?.click()}>
            フォントファイル（.ttf）を読み込む
          </Button>
          {loadedFont && (
            <>
              <Select<KinkoFontKind>
                label="読み込んだフォントの種類"
                value={loadedFont.kind}
                onChange={async (k) => {
                  await setLoadedKind(k);
                  setLoadedFont({ ...loadedFont, kind: k });
                }}
                options={[
                  { value: 'tachibana', label: 'ShakuhachiKinko / Kinko_Font 1' },
                  { value: 'senshu', label: 'SenshuTK（泉州）' },
                ]}
              />
              <Button
                variant="outlined"
                icon="delete"
                onClick={async () => {
                  await removeLoaded();
                  setLoadedFont(null);
                  toast('読み込んだフォントを削除しました');
                }}
              >
                読み込んだフォントを削除
              </Button>
            </>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".ttf,.otf,font/ttf,font/otf"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            setBusy(true);
            try {
              const font = await loadFontFile(f, guessKind(f.name));
              setLoadedFont(font);
              update({ kinkoFont: font.family });
              toast(`「${font.label}」を読み込みました`);
            } catch {
              toast('フォントを読み込めませんでした');
            } finally {
              setBusy(false);
            }
          }}
        />
        <p className="hint">
          琴古流のフォントは、立花 宏さんの「MuseScoreで尺八譜と篠笛譜」のページで配布されている ShakuhachiPluginFonts（ShakuhachiKinko・Kinko_Font_1・SenshuTK）に対応しています。
          フォントはアプリには含めていません。端末にインストールすれば自動で使われ、スマホなどではここから読み込めます（このブラウザの中にだけ保存されます）。
          Safari（iPhone・Mac）では、端末にインストールしたフォントがWebページで使えないことがあります。その場合は読み込みを使ってください。
        </p>
      </section>

      <section className="card">
        <h2>画面</h2>
        <div className="field-row">
          <span className="field-label">色</span>
          <Segmented
            value={settings.theme}
            onChange={(v) => update({ theme: v })}
            options={[
              { value: 'system', label: '端末に合わせる' },
              { value: 'light', label: 'ライト' },
              { value: 'dark', label: 'ダーク' },
            ]}
          />
        </div>
      </section>

      <section className="card">
        <h2>キーボード（PC）</h2>
        <p className="hint">
          鳴らす・書くの画面で、キーボードで音を出せます。三味線は左手（勘所）を押さえたまま右手（バチ）で弾き、尺八は指（ロツレチリ）に、メリ・カリ・甲などを押しながら組み合わせます。
        </p>
        <KeymapEditor />
        <ul className="hint keys">
          <li>書く：← → で移動、↑ ↓ でパート、Delete・Backspace で消す（前の音へ）、Enter で再生・停止、Alt＋1〜5 で音の長さ</li>
          <li>楽器のキーと重ならなければ：1〜5 で音の長さ、. で付点、, で3連、0 で休み、- で伸ばし、スペースで再生・停止</li>
        </ul>
      </section>
    </div>
  );
}
