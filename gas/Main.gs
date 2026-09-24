/**
 * Webアプリの入口。「自分として実行」「全員（匿名ユーザーを含む）」でデプロイする。
 *
 * スクリプトプロパティ（プロジェクトの設定 → スクリプト プロパティ）:
 *   USER_KEY        利用者キー（フロントのビルド時に GAS_KEY として埋め込み、StatiCrypt で暗号化される）
 *   ADMIN_PASSWORD  管理者パスワード（画面で入力。フロントには埋め込まない）
 *   SPREADSHEET_ID  データのスプレッドシートID（スプレッドシートに紐づいたスクリプトなら省略可）
 *   LOGO_FOLDER_ID  ロゴ保存フォルダID（将来用）
 *   OUTPUT_FOLDER_ID 書類（PDF / Docx）を出力したときの控えを残すフォルダID（省略時は控えを残さない）
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
    docs: new DocsAdapter(props.getProperty('OUTPUT_FOLDER_ID')),
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

/**
 * Google ドキュメントの雛形を読み書きするアダプタ。
 * 雛形は「{{団体名}}」のような差し込みを書いた Google ドキュメント（Word ファイルはドライブで Google ドキュメントとして保存しておく）。
 */
function DocsAdapter(outputFolderId) {
  this.outputFolderId = outputFolderId || '';
}

DocsAdapter.prototype.open_ = function (fileId) {
  try {
    return DocumentApp.openById(fileId);
  } catch (e) {
    throw appError_('DOC_NOT_FOUND', '雛形のGoogleドキュメントを開けません（ID：' + fileId + '）。Word ファイルの場合はドライブで「Google ドキュメントとして保存」したものの ID を指定してください');
  }
};

DocsAdapter.prototype.readText = function (fileId) {
  var doc = this.open_(fileId);
  return [doc.getHeader(), doc.getBody(), doc.getFooter()]
    .filter(function (section) { return section; })
    .map(function (section) { return section.getText(); })
    .join('\n');
};

// 雛形を複製して差し込み、PDF / Docx に書き出して base64 で返す
DocsAdapter.prototype.render = function (opts) {
  this.open_(opts.fileId);
  var src = DriveApp.getFileById(opts.fileId);
  var folder = this.outputFolderId ? DriveApp.getFolderById(this.outputFolderId) : null;
  var copy = folder ? src.makeCopy(opts.fileName, folder) : src.makeCopy(opts.fileName);
  try {
    var doc = DocumentApp.openById(copy.getId());
    var escape = function (s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); };
    [doc.getHeader(), doc.getBody(), doc.getFooter()].forEach(function (section) {
      if (!section) return;
      Object.keys(opts.replacements).forEach(function (token) {
        // 改行はドキュメント内の段落内改行にする
        section.replaceText(escape(token), opts.replacements[token].replace(/\r?\n/g, '\r'));
      });
    });
    doc.saveAndClose();
    var blob;
    var ext;
    if (opts.format === 'PDF') {
      blob = copy.getAs(MimeType.PDF);
      ext = '.pdf';
    } else {
      var url = 'https://docs.google.com/document/d/' + copy.getId() + '/export?format=docx';
      blob = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() } }).getBlob();
      ext = '.docx';
    }
    return {
      fileName: opts.fileName + ext,
      mimeType: blob.getContentType(),
      base64: Utilities.base64Encode(blob.getBytes()),
      docUrl: folder ? copy.getUrl() : '',
    };
  } finally {
    if (!folder) copy.setTrashed(true);
  }
};

/** GASエディタから手動実行：全シートとヘッダーを作成し、空のシートにモックデータを投入する */
function setup() {
  var seeded = seedTables(new SheetDb(getSpreadsheet_()), new Date());
  var props = PropertiesService.getScriptProperties();
  ['USER_KEY', 'ADMIN_PASSWORD'].forEach(function (k) {
    if (!props.getProperty(k)) Logger.log('スクリプトプロパティ ' + k + ' が未設定です');
  });
  Logger.log('モックデータを投入したシート: ' + (seeded.length ? seeded.join(', ') : 'なし（既存データを保持）'));
}
