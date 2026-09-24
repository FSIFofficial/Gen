/**
 * Webアプリの入口。「自分として実行」「全員（匿名ユーザーを含む）」でデプロイする。
 *
 * スクリプトプロパティ（プロジェクトの設定 → スクリプト プロパティ）:
 *   USER_KEY        利用者キー（フロントのビルド時に GAS_KEY として埋め込み、StatiCrypt で暗号化される）
 *   ADMIN_PASSWORD  管理者パスワード（画面で入力。フロントには埋め込まない）
 *   SPREADSHEET_ID  データのスプレッドシートID（スプレッドシートに紐づいたスクリプトなら省略可）
 *   LOGO_FOLDER_ID  ロゴ保存フォルダID（将来用）
 *
 * フロントは CORS のプリフライトを避けるため Content-Type: text/plain で JSON 文字列を POST する。
 */
function doPost(e) {
  var req;
  try {
    req = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: 'BAD_REQUEST' });
  }
  return json_(handleRequest(req, createEnv_()));
}

function doGet() {
  return json_({ ok: true, data: { service: 'partner-generator', status: 'running' } });
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function getSpreadsheet_() {
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  var ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw appError_('SERVER_NOT_CONFIGURED', 'SPREADSHEET_ID が未設定です');
  return ss;
}

function createEnv_() {
  var props = PropertiesService.getScriptProperties();
  return {
    db: new SheetDb(getSpreadsheet_()),
    props: {
      userKey: props.getProperty('USER_KEY'),
      adminPassword: props.getProperty('ADMIN_PASSWORD'),
      logoFolderId: props.getProperty('LOGO_FOLDER_ID'),
    },
    withLock: function (fn) {
      var lock = LockService.getScriptLock();
      if (!lock.tryLock(20000)) throw appError_('BUSY', 'ほかの保存処理が混み合っています。少し待ってから再度お試しください');
      try {
        return fn();
      } finally {
        lock.releaseLock();
      }
    },
    now: function () { return new Date(); },
  };
}

/** GASエディタから手動実行：全シートとヘッダーを作成し、空のシートにモックデータを投入する */
function setup() {
  var seeded = seedTables(new SheetDb(getSpreadsheet_()), new Date());
  var props = PropertiesService.getScriptProperties();
  ['USER_KEY', 'ADMIN_PASSWORD'].forEach(function (k) {
    if (!props.getProperty(k)) Logger.log('スクリプトプロパティ ' + k + ' が未設定です');
  });
  Logger.log('モックデータを投入したシート: ' + (seeded.length ? seeded.join(', ') : 'なし（既存データを保持）'));
}
