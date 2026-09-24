/**
 * Webアプリの入口。「自分として実行」「全員（匿名ユーザーを含む）」でデプロイする。
 *
 * スクリプトプロパティ（プロジェクトの設定 → スクリプト プロパティ）:
 *   USER_KEY        利用者キー（フロントのビルド時に GAS_KEY として埋め込み、StatiCrypt で暗号化される）
 *   ADMIN_PASSWORD  管理者パスワード（画面で入力。フロントには埋め込まない）
 *   SPREADSHEET_ID  データのスプレッドシートID（スプレッドシートに紐づいたスクリプトなら省略可）
 *   LOGO_FOLDER_ID  団体ロゴなどの画像を保存するフォルダID（一般公開しない。告知画像の {{ロゴ}} はここの画像だけを使う）
 *   OUTPUT_FOLDER_ID 書類・告知画像を出力したときの控えを残すフォルダID（省略時は控えを残さない）
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
    slides: new SlidesAdapter(props.getProperty('OUTPUT_FOLDER_ID'), new FilesAdapter(props.getProperty('LOGO_FOLDER_ID'))),
    files: new FilesAdapter(props.getProperty('LOGO_FOLDER_ID')),
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

/**
 * ロゴなどの画像を LOGO_FOLDER_ID のフォルダに保存・読み出すアダプタ。
 * フォルダ外のファイルは読まない（利用者がドライブ上の別のファイルを指定して読み出せないようにする）。
 */
function FilesAdapter(folderId) {
  this.folderId = folderId || '';
}

FilesAdapter.prototype.folder_ = function () {
  if (!this.folderId) throw appError_('SERVER_NOT_CONFIGURED', 'スクリプトプロパティ LOGO_FOLDER_ID（画像の保存先フォルダ）が未設定です');
  return DriveApp.getFolderById(this.folderId);
};

FilesAdapter.prototype.file_ = function (fileId) {
  var file;
  try {
    file = DriveApp.getFileById(fileId);
  } catch (e) {
    throw appError_('IMAGE_NOT_FOUND', '画像が見つかりません（ID：' + fileId + '）');
  }
  var folderId = this.folder_().getId();
  var parents = file.getParents();
  while (parents.hasNext()) if (parents.next().getId() === folderId) return file;
  throw appError_('IMAGE_NOT_FOUND', '画像は画像フォルダ（LOGO_FOLDER_ID）に保存したものだけ使えます（ID：' + fileId + '）');
};

FilesAdapter.prototype.saveImage = function (opts) {
  var blob = Utilities.newBlob(Utilities.base64Decode(opts.base64), opts.mimeType, opts.fileName);
  return this.folder_().createFile(blob).getId();
};

FilesAdapter.prototype.getBlob = function (fileId) {
  return this.file_(fileId).getBlob();
};

FilesAdapter.prototype.readImage = function (fileId) {
  var blob = this.getBlob(fileId);
  return { mimeType: blob.getContentType(), base64: Utilities.base64Encode(blob.getBytes()) };
};

/**
 * Google スライドの雛形から告知画像を作るアダプタ。
 * テキストの {{項目}} は差し込み、{{ロゴ}} などの画像用の差し込みを書いた図形は画像に置き換え、スライドごとに PNG で書き出す。
 */
function SlidesAdapter(outputFolderId, files) {
  this.outputFolderId = outputFolderId || '';
  this.files = files;
}

SlidesAdapter.prototype.open_ = function (fileId) {
  try {
    return SlidesApp.openById(fileId);
  } catch (e) {
    throw appError_('DOC_NOT_FOUND', '雛形のGoogleスライドを開けません（ID：' + fileId + '）。PowerPoint の場合はドライブで「Google スライドとして保存」したものの ID を指定してください');
  }
};

// 図形・表・グループの中の文字を集める
function slideTexts_(elements, out) {
  elements.forEach(function (el) {
    var type = el.getPageElementType();
    if (type === SlidesApp.PageElementType.SHAPE) {
      out.push(el.asShape().getText().asString().replace(/\n$/, ''));
    } else if (type === SlidesApp.PageElementType.TABLE) {
      var table = el.asTable();
      for (var r = 0; r < table.getNumRows(); r++) {
        for (var c = 0; c < table.getNumColumns(); c++) {
          try {
            out.push(table.getCell(r, c).getText().asString().replace(/\n$/, ''));
          } catch (e) {
            // 結合セルは読み飛ばす
          }
        }
      }
    } else if (type === SlidesApp.PageElementType.GROUP) {
      slideTexts_(el.asGroup().getChildren(), out);
    }
  });
  return out;
}

SlidesAdapter.prototype.readText = function (fileId) {
  return this.open_(fileId).getSlides()
    .map(function (slide) { return slideTexts_(slide.getPageElements(), []).filter(String).join('\n'); })
    .join('\n---\n');
};

// 画像用の差し込みを書いた図形を画像に置き換える（画像が無ければ差し込みを消す）
SlidesAdapter.prototype.replaceImages_ = function (elements, images) {
  var self = this;
  elements.forEach(function (el) {
    var type = el.getPageElementType();
    if (type === SlidesApp.PageElementType.GROUP) {
      self.replaceImages_(el.asGroup().getChildren(), images);
      return;
    }
    if (type !== SlidesApp.PageElementType.SHAPE) return;
    var shape = el.asShape();
    var text = shape.getText().asString();
    Object.keys(images).forEach(function (token) {
      if (text.indexOf(token) < 0) return;
      if (images[token]) shape.replaceWithImage(self.files.getBlob(images[token]));
      else shape.getText().replaceAllText(token, '');
    });
  });
};

SlidesAdapter.prototype.render = function (opts) {
  this.open_(opts.fileId);
  var src = DriveApp.getFileById(opts.fileId);
  var folder = this.outputFolderId ? DriveApp.getFolderById(this.outputFolderId) : null;
  var copy = folder ? src.makeCopy(opts.fileName, folder) : src.makeCopy(opts.fileName);
  var self = this;
  try {
    var pres = SlidesApp.openById(copy.getId());
    var slideIds = pres.getSlides().map(function (slide) {
      self.replaceImages_(slide.getPageElements(), opts.images);
      return slide.getObjectId();
    });
    Object.keys(opts.replacements).forEach(function (token) {
      pres.replaceAllText(token, opts.replacements[token]);
    });
    pres.saveAndClose();
    var token = ScriptApp.getOAuthToken();
    var images = slideIds.map(function (pageId, i) {
      var url = 'https://docs.google.com/presentation/d/' + copy.getId() + '/export/png?pageid=' + pageId;
      var blob = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + token } }).getBlob();
      return {
        fileName: opts.fileName + (slideIds.length > 1 ? '_' + (i + 1) : '') + '.png',
        mimeType: 'image/png',
        base64: Utilities.base64Encode(blob.getBytes()),
      };
    });
    return { images: images, docUrl: folder ? copy.getUrl() : '' };
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
