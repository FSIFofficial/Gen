# FSIF｜発信物ジェネレーター

パートナー締結時の発信物（メール・X・Instagram・note・HPニュース）を、団体ごとに変わる部分だけ入力して一括生成する社内ツール。
設計・決定事項は [CLAUDE.md](CLAUDE.md) を参照。

## ローカルで動かす

```bash
npm install
npm run dev     # http://localhost:5173（モックモード。管理者パスは admin）
npm test
```

実際の GAS につなぐ場合は、リポジトリ直下に `config.local.json`（git 管理外）を置く。

```json
{ "gasUrl": "https://script.google.com/macros/s/xxxx/exec", "key": "利用者キー" }
```

## 初回セットアップ

### 1. スプレッドシートと GAS

1. 管理メンバーだけで共有するスプレッドシートを作成し、「拡張機能 → Apps Script」を開く
2. `gas/` の `.gs` ファイルと `appsscript.json` をすべてコピーする（または [clasp](https://github.com/google/clasp) で `gas/` を push）
3. 「プロジェクトの設定 → スクリプト プロパティ」に以下を追加
   | プロパティ | 内容 |
   | --- | --- |
   | `USER_KEY` | 利用者キー（推測されにくい長いランダム文字列） |
   | `ADMIN_PASSWORD` | 管理者パスワード |
   | `SPREADSHEET_ID` | スプレッドシートに紐づくスクリプトなら不要 |
   | `OUTPUT_FOLDER_ID` | 書類の控えを残すフォルダID（空なら控えを残さない） |
   | `LOGO_FOLDER_ID` | 将来用（空でよい） |
4. エディタで `setup` を実行 → 12シートとヘッダー、モックデータが作られる（既にデータがあるシートには触らない）
5. 「デプロイ → 新しいデプロイ → ウェブアプリ」、実行ユーザー「自分」、アクセス「全員」でデプロイし、URL を控える

### 2. GitHub

1. Settings → Pages → Source を **GitHub Actions** にする
2. Settings → Secrets and variables → Actions に以下を登録
   | Secret | 内容 |
   | --- | --- |
   | `GAS_URL` | 上で控えた Web アプリの URL |
   | `GAS_KEY` | `USER_KEY` と同じ値 |
   | `SITE_PASSWORD` | 画面を開くときの利用者パスワード（StatiCrypt） |
3. main に push すると、テスト → ビルド → 暗号化 → 平文漏れ検査 → デプロイ の順に実行される

### 3. 書類（契約書・申込書）を使う場合

1. 雛形にする Word ファイルをドライブにアップロードし、開いて「ファイル → Google ドキュメントとして保存」。差し込みたい箇所に `{{項目名}}` を書く
2. 管理画面 → テンプレート → 新規追加で、出力形式を PDF か Docx にし、Google ドキュメントの URL を貼って「読み込む」→ 追加
3. 雛形に書いた `{{項目名}}` が入力フォームに出るようになる。雛形を直したら、テンプレートを開いて保存し直す
4. 出力した書類の控えをドライブに残したい場合は、スクリプトプロパティ `OUTPUT_FOLDER_ID` にフォルダIDを設定する

GAS のコードを更新したときは、エディタで一度関数を実行して権限を承認し、「デプロイを管理 → 編集 → 新しいバージョン」で再デプロイする。

## セキュリティの考え方

- 画面は CSS・JS・設定をすべて `index.html` 1枚にまとめ、StatiCrypt でまるごと暗号化する。GAS の URL と利用者キーは暗号化された HTML の中にだけある
- 管理者パスワードは画面に埋め込まず、編集・無効化のときに入力する。GAS 側で毎回照合する
- スプレッドシート自体は非公開。データは必ず GAS を通して読み書きする
