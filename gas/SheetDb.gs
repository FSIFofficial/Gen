/**
 * スプレッドシートを読み書きするアダプタ。Core.gs はこのインターフェースだけを使う
 * （フロントのモックとテストでは同じ形の MemoryDb を使う）。
 * rows のインデックスは「ヘッダー行を除いた 0 始まり」。シート上の行番号は index + 2。
 */
function SheetDb(ss) {
  this.ss = ss;
}

SheetDb.prototype.sheet_ = function (name) {
  var sh = this.ss.getSheetByName(name);
  if (!sh) throw appError_('SHEET_MISSING', 'シート「' + name + '」がありません。GASエディタで setup() を実行してください');
  return sh;
};

SheetDb.prototype.readTable = function (name) {
  var sh = this.sheet_(name);
  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  if (lastRow === 0 || lastCol === 0) return { headers: [], rows: [] };
  var values = sh.getRange(1, 1, lastRow, lastCol).getValues();
  return { headers: values[0], rows: values.slice(1) };
};

// 文字列は先頭に ' を付けて書き込む。日付・数値への自動変換（電話番号の先頭0が消える等）と、
// = で始まる文字列が数式として解釈されるのを防ぐ。' はセルの値には含まれない。
SheetDb.escape_ = function (v) {
  return typeof v === 'string' && v !== '' ? "'" + v : v;
};

SheetDb.prototype.appendRows = function (name, rows) {
  if (!rows.length) return;
  var sh = this.sheet_(name);
  var width = rows[0].length;
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, width).setValues(rows.map(function (r) { return r.map(SheetDb.escape_); }));
};

SheetDb.prototype.updateRow = function (name, index, row) {
  this.sheet_(name).getRange(index + 2, 1, 1, row.length).setValues([row.map(SheetDb.escape_)]);
};

SheetDb.prototype.deleteRows = function (name, indices) {
  var sh = this.sheet_(name);
  indices.slice().sort(function (a, b) { return b - a; }).forEach(function (i) { sh.deleteRow(i + 2); });
};

SheetDb.prototype.insertColumnBefore = function (name, beforeHeader, header) {
  var sh = this.sheet_(name);
  var headers = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0].map(String);
  var at = headers.indexOf(beforeHeader);
  if (at < 0) {
    sh.getRange(1, headers.length + 1).setValue(header);
    return;
  }
  sh.insertColumnBefore(at + 1);
  sh.getRange(1, at + 1).setValue(header);
};

SheetDb.prototype.ensureSheet = function (name, headers) {
  var sh = this.ss.getSheetByName(name) || this.ss.insertSheet(name);
  var lastCol = sh.getLastColumn();
  var current = lastCol ? sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String) : [];
  var missing = headers.filter(function (h) { return current.indexOf(h) < 0; });
  if (!current.filter(String).length) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  } else if (missing.length) {
    sh.getRange(1, lastCol + 1, 1, missing.length).setValues([missing]);
  }
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, sh.getLastColumn()).setFontWeight('bold');
};
