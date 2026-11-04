# 公開の手順（GitHub Pages）

生徒が自分のスマートフォンから URL で開けるように、サーバーなしの静的サイトとして公開します。
GitHub Pages を使います（無料。公開リポジトリの場合）。リポジトリに変更を送る（push する）と、自動でテスト・ビルド・公開が行われます（`.github/workflows/deploy.yml`）。

## 最初に一度だけ行うこと（ご自身での操作が必要です）

### 1. GitHub のアカウントを作る
1. https://github.com/signup を開き、メールアドレス・パスワード・ユーザー名を登録する
2. 届いたメールで確認する

ユーザー名は公開 URL に入ります（例：`https://ユーザー名.github.io/...`）。

### 2. リポジトリを作る
1. GitHub の右上「＋」→「New repository」
2. Repository name：例 `ichiji-kansu`（URL の後半になります）
3. **Public** を選ぶ（無料のプランで Pages を使うには Public が必要です）
4. 「Add a README」などのチェックは入れずに「Create repository」

**Public にすると、プログラムと台詞・問題は誰でも見られます。** 生徒の記録はリポジトリには入りません（記録は各端末の中だけにあります）。

### 3. Pages の公開方法を設定する
1. 作ったリポジトリの「Settings」→ 左の「Pages」
2. 「Build and deployment」の「Source」で **GitHub Actions** を選ぶ

### 4. このフォルダを GitHub に送る
`git init` と最初のコミットは済んでいます（main ブランチ）。Mac のターミナルで、このフォルダ（`数学ウェブアプリ`）に移動して、次の2行を実行します。`ユーザー名` と `ichiji-kansu` はご自身のものに置きかえてください。

```sh
git remote add origin https://github.com/ユーザー名/ichiji-kansu.git
git push -u origin main
```

`git push` で GitHub へのログインを求められます。パスワードの代わりに「Personal access token」が必要な場合は、GitHub の Settings → Developer settings → Personal access tokens で作れます。うまくいかない場合は「GitHub Desktop」（https://desktop.github.com/）を使うと、画面の操作だけで送れます。

### 5. 公開されたか確かめる
1. リポジトリの「Actions」タブで、`deploy` が緑のチェックになるのを待つ（数分）
2. 公開 URL：`https://ユーザー名.github.io/ichiji-kansu/`
3. 講師用画面：`https://ユーザー名.github.io/ichiji-kansu/#/teacher`

生徒には公開 URL を伝えます（QR コードにすると楽です）。スマートフォンのホーム画面に追加してもらうと、次から開きやすくなります。

## 2回目からの更新

変更したら、次の3行で送るだけで、自動で公開し直されます。テストが通らないときは公開されません（Actions タブに赤い×が出ます）。

```sh
git add .
git commit -m "変更の内容"
git push
```

## 知っておいてほしいこと

- **記録は端末とブラウザごと**です。同じ生徒でも、スマートフォンと Mac では別の記録になります。Safari と Chrome でも別です。
- **ブラウザの履歴・サイトデータを消すと、記録も消えます。** プライベートブラウズでは記録が残りません。
- 1台を複数の生徒で使うときは、ニックネームで記録を分けます。ニックネームの削除は講師用画面からだけできます。
- 講師用画面にはパスワードがありません（設計書の方針どおり）。URL を知っていれば開けます。
- 公開 URL を変えると（リポジトリ名を変えるなど）、それまでの記録は新しい URL からは見えなくなります。

## コミットの名前について

このフォルダのコミットには、名前 `yuta_grace`・メールアドレス `294204241+yuta-grace@users.noreply.github.com` を設定しています（このフォルダだけの設定）。変えたいときは次のように実行します。

```sh
git config user.name "表示したい名前"
git config user.email "GitHub に登録したメールアドレス"
```
