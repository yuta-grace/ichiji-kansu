# 一次関数 学習Webアプリ

設計書：[docs/concept.md](docs/concept.md)（唯一の設計書）
公開の手順：[docs/deploy.md](docs/deploy.md)（GitHub Pages）

## 動かし方

```sh
npm install
npm run dev      # 開発用サーバー（同じ Wi-Fi のスマートフォンからも開ける URL が表示される）
npm test         # 単体テスト
npm run build    # dist/ に静的ファイルを出力
```

## 中身の編集

コードを触らずに変えられるもの：

| ファイル | 内容 |
|---|---|
| `src/content/understanding.json` | 理解パート（水そう）の数値と博士の台詞 |
| `src/content/home.json` | 入口の質問・メニュー名 |
| `src/content/diagnostic.json` | 準備運動の問題と台詞（式の中の `[2/3]` は縦の分数になる） |
| `src/content/practice.json` | 練習の9問（並び順＝出題順）と台詞 |
| `src/content/dungeon.json` | 解法ダンジョンの30問（best＝最も楽な解き方）・解き方の名前・途中の問い・台詞・称号 |
| `src/content/profile.json` | ニックネーム・あとで聞く・講師用画面の文言 |
| `src/content/settings.json` | 答えを見せるまでの回数、補助・注釈・称号の条件などの数値 |

台詞の中の `{start}` `{rate}` などは、数値に置きかわります。

## 入力

スマートフォンでは、入力欄を押すと画面の下にキーパッドが出ます。Mac では物理キーボードで数字・`-`・`/`・`.` を入力し、Enter で答え、Tab で次の欄に移ります。

## 保存とニックネーム

進み具合は端末のブラウザ内（localStorage）にだけ保存します。サーバーには送りません。
1台を複数の生徒で使えるよう、記録はニックネームごとに分かれます（本名は入れないよう画面で伝えます）。

## 講師用画面

博士のアイコンを5秒長押しするか、URL の末尾に `#/teacher` をつけて開きます。ニックネームごとの「あとで聞く」の一覧（「聞いた」チェック）と、ニックネームの削除ができます。
