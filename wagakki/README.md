# 和楽器（三味線・尺八）

三味線（津軽の勘所表記）と尺八（琴古流）の音を鳴らし、複数パートの楽譜を作る Web アプリ。
設計書：[docs/concept.md](docs/concept.md)

## 動かし方

```sh
cd wagakki
npm install
npm run dev      # 開発用サーバー（同じ Wi-Fi のスマホからも開ける URL が表示される）
npm test         # 単体テスト
npm run build    # dist/ に静的ファイルを出力
```

## 琴古流フォント

フォントはこのリポジトリに含めていない（再配布しないため）。
「MuseScoreで尺八譜と篠笛譜」（立花 宏さん）のページの `ShakuhachiPluginFonts_v47.zip` に入っている
ShakuhachiKinko・Kinko_Font_1・SenshuTK に対応している。

- 端末にインストールすれば自動で使われる。
- スマホなどでは「設定 → 尺八のフォント → フォントファイルを読み込む」から読み込む（そのブラウザの中にだけ保存される）。

## 中身の編集

| ファイル | 内容 |
|---|---|
| `src/lib/shakuhachi.ts` | 琴古の音の名前と音域、フォントの文字の割り当て |
| `src/lib/shamisen.ts` | 調弦、勘所の表記 |
| `src/lib/pitch.ts` | 寸法と音の高さの対応 |
| `src/audio/engine.ts` | 音の合成 |
