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

## セキュリティの考え方

- 画面は CSS・JS・設定をすべて `index.html` 1枚にまとめ、StatiCrypt でまるごと暗号化する。GAS の URL と利用者キーは暗号化された HTML の中にだけある
- 管理者パスワードは画面に埋め込まず、編集・無効化のときに入力する。GAS 側で毎回照合する
- スプレッドシート自体は非公開。データは必ず GAS を通して読み書きする
