/**
 * シート定義。
 * cols は [APIでのプロパティ名, シートのヘッダー名]。行とオブジェクトの変換はヘッダー名で行うので、
 * シート上で列の順番を入れ替えても動く。
 * このファイルはフロントのモックモードとテストでも読み込むため、GAS 固有の API は使わない。
 */
var SCHEMA = {
  templates: {
    sheet: 'テンプレート', idPrefix: 'T', key: 'id',
    cols: [['id', 'テンプレID'], ['name', 'テンプレ名'], ['setId', 'セットID'], ['mediaId', '媒体ID'], ['rank', 'ランク'], ['format', '出力形式'], ['fileId', '雛形ファイルID'], ['active', '有効'], ['updatedAt', '更新日時']],
  },
  templateFields: {
    sheet: 'テンプレート欄', parent: 'templates', parentProp: 'templateId',
    cols: [['templateId', 'テンプレID'], ['fieldKey', '欄キー'], ['content', '内容']],
  },
  media: {
    sheet: '媒体', idPrefix: 'M', key: 'id',
    cols: [['id', '媒体ID'], ['name', '媒体名'], ['order', '並び順'], ['active', '有効']],
  },
  mediaFields: {
    sheet: '媒体欄', parent: 'media', parentProp: 'mediaId',
    cols: [['mediaId', '媒体ID'], ['fieldKey', '欄キー'], ['label', '表示名'], ['limit', '文字数上限'], ['countMode', '数え方'], ['splitRule', '分割ルール'], ['order', '並び順']],
  },
  sets: {
    sheet: 'セット', idPrefix: 'S', key: 'id',
    cols: [['id', 'セットID'], ['name', 'セット名'], ['description', '説明'], ['order', '並び順'], ['active', '有効']],
  },
  ranks: {
    sheet: 'ランク', key: 'name',
    cols: [['name', 'ランク名'], ['order', '並び順'], ['active', '有効']],
  },
  items: {
    sheet: '入力項目', key: 'key',
    cols: [['key', '項目キー'], ['label', '表示名'], ['category', '区分'], ['type', '入力タイプ'], ['options', '選択肢'], ['format', '書式'], ['required', '必須'], ['defaultValue', '初期値'], ['example', '入力例'], ['order', '並び順'], ['active', '有効']],
  },
  dateFormats: {
    sheet: '日付書式', key: 'format',
    cols: [['label', '表示名'], ['format', '書式'], ['order', '並び順'], ['active', '有効']],
  },
  // 団体マスタは「区分＝団体」の入力項目が 団体ID と ロゴファイルID の間に列として並ぶ（values に入る）
  orgs: {
    sheet: '団体マスタ', idPrefix: 'O', key: 'id', dynamic: true, dynamicBefore: 'ロゴファイルID',
    cols: [['id', '団体ID'], ['logoFileId', 'ロゴファイルID'], ['active', '有効'], ['updatedAt', '更新日時']],
  },
  settings: {
    sheet: '共通設定', key: 'key',
    cols: [['key', '項目キー'], ['value', '値'], ['description', '説明']],
  },
  // よく使う文章（署名ブロックなど）。テンプレートから {{部品:パーツ名}} で差し込む
  parts: {
    sheet: '共通パーツ', key: 'name',
    cols: [['name', 'パーツ名'], ['content', '内容'], ['description', '説明'], ['order', '並び順'], ['active', '有効']],
  },
  history: {
    sheet: '履歴', idPrefix: 'H', key: 'id',
    cols: [['id', '履歴ID'], ['createdAt', '作成日時'], ['author', '作成者'], ['orgId', '団体ID'], ['orgName', '団体名（作成時点）'], ['setId', 'セットID'], ['rank', 'ランク'], ['values', '入力値（JSON）'], ['status', 'ステータス']],
  },
  historyOutputs: {
    sheet: '履歴出力', parent: 'history', parentProp: 'historyId',
    cols: [['historyId', '履歴ID'], ['mediaId', '媒体ID'], ['templateId', 'テンプレID'], ['fieldKey', '欄キー'], ['text', '最終文面'], ['edited', '修正あり']],
  },
  // テンプレートを保存するたびの内容（変更履歴・元に戻す用）。書き込みは GAS だけが行う
  templateRevisions: {
    sheet: 'テンプレート履歴',
    cols: [['templateId', 'テンプレID'], ['at', '保存日時'], ['actor', '保存者'], ['snapshot', '内容（JSON）']],
  },
  // 変更の記録（追加・編集・無効化・削除）。書き込みは GAS だけが行う
  logs: {
    sheet: '操作ログ',
    cols: [['at', '日時'], ['actor', '操作者'], ['role', '権限'], ['action', '操作'], ['entity', '種類'], ['key', '対象'], ['detail', '内容']],
  },
};

var BOOL_PROPS = { active: true, required: true, edited: true };
var NUMBER_PROPS = { order: true, limit: true };
var TIMESTAMP_PROPS = { updatedAt: true, createdAt: true, at: true };

// 利用者が新規追加できるシート（create）。子シートは親と一緒に保存する
var CREATABLE = { templates: 'templateFields', media: 'mediaFields', sets: null, ranks: null, items: null, dateFormats: null, orgs: null, settings: null, parts: null };

// 操作ログの「種類」に書く名前
var ENTITY_LABELS = { templates: 'テンプレート', media: '媒体', sets: 'セット', ranks: 'ランク', items: '入力項目', dateFormats: '日付書式', orgs: '団体', settings: '共通設定', parts: '共通パーツ', history: '履歴' };

var COMMON_RANK = '共通';
var ITEM_CATEGORIES = ['団体', '案件'];
var ITEM_TYPES = ['短文', '長文', '日付', '選択', '数値', 'URL', '画像'];
var OUTPUT_FORMATS = ['テキスト', 'PDF', 'Docx', '画像'];
// Google ドキュメントの雛形に差し込んで書き出す形式
var DOCUMENT_FORMATS = ['PDF', 'Docx'];
// Google スライドの雛形に差し込んで PNG で書き出す形式
var IMAGE_FORMAT = '画像';
// 雛形の図形をロゴ画像に置き換える差し込み（団体マスタのロゴファイルID）
var LOGO_TOKEN = '{{ロゴ}}';
var COUNT_MODES = ['通常', 'X方式'];
var SPLIT_RULES = ['なし', 'スレッド分割'];
