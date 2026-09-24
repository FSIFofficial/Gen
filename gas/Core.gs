/**
 * リクエスト処理の本体。GAS 固有の API には触らず、env 経由で DB・設定・ロックを受け取る。
 *   env = { db, docs, props: { userKey, adminPassword }, withLock(fn), now() }
 *   docs は Google ドキュメントの雛形を扱うアダプタ：readText(fileId) / render({ fileId, replacements, format, fileName })
 * GAS では Main.gs が SheetDb で env を組み立てる。フロントのモックモードとテストでは MemoryDb を使う。
 */

var ACTIONS = {
  init: { fn: actionInit_ },
  listHistory: { fn: actionListHistory_ },
  getHistory: { fn: actionGetHistory_ },
  saveHistory: { fn: actionSaveHistory_, write: true },
  create: { fn: actionCreate_, write: true },
  verifyAdmin: { fn: actionVerifyAdmin_ },
  update: { fn: actionUpdate_, write: true, admin: true },
  deactivate: { fn: actionDeactivate_, write: true, admin: true },
  deleteHistory: { fn: actionDeleteHistory_, write: true, admin: true },
  readDocument: { fn: actionReadDocument_ },
  renderDocument: { fn: actionRenderDocument_ },
};

function handleRequest(req, env) {
  try {
    if (!req || typeof req !== 'object') return fail_('BAD_REQUEST');
    var def = ACTIONS[req.action];
    if (!def) return fail_('UNKNOWN_ACTION');
    if (!env.props.userKey || !env.props.adminPassword) return fail_('SERVER_NOT_CONFIGURED');
    if (!safeEqual_(req.key, env.props.userKey)) return fail_('UNAUTHORIZED');
    if (def.admin && !safeEqual_(req.adminPass, env.props.adminPassword)) return fail_('ADMIN_REQUIRED');
    var payload = req.payload && typeof req.payload === 'object' ? req.payload : {};
    var run = function () { return def.fn(payload, env, req); };
    return { ok: true, data: def.write ? env.withLock(run) : run() };
  } catch (e) {
    if (e && e.appCode) return fail_(e.appCode, e.message);
    return fail_('SERVER_ERROR', String((e && e.message) || e));
  }
}

function appError_(code, message) {
  var e = new Error(message || code);
  e.appCode = code;
  return e;
}

function fail_(code, message) {
  var res = { ok: false, error: code };
  if (message && message !== code) res.message = message;
  return res;
}

function safeEqual_(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !b || a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ---------- テーブル操作 ----------

function schemaHeaders_(entity, dynamicKeys) {
  var s = SCHEMA[entity];
  var headers = s.cols.map(function (c) { return c[1]; });
  if (!s.dynamic) return headers;
  var at = headers.indexOf(s.dynamicBefore);
  return headers.slice(0, at).concat(dynamicKeys || [], headers.slice(at));
}

function fixedHeaderMap_(s) {
  var map = {};
  s.cols.forEach(function (c) { map[c[1]] = c[0]; });
  return map;
}

function loadTable_(env, entity) {
  var s = SCHEMA[entity];
  var t = env.db.readTable(s.sheet);
  var headers = t.headers.map(function (h) { return String(h == null ? '' : h).trim(); });
  var fixed = fixedHeaderMap_(s);
  var records = [];
  t.rows.forEach(function (row, index) {
    if (isBlankRow_(row)) return;
    var obj = {};
    if (s.dynamic) obj.values = {};
    headers.forEach(function (h, i) {
      if (!h) return;
      if (fixed[h]) obj[fixed[h]] = normalizeCell_(fixed[h], row[i]);
      else if (s.dynamic) obj.values[h] = normalizeCell_('', row[i]);
    });
    s.cols.forEach(function (c) { if (!(c[0] in obj)) obj[c[0]] = normalizeCell_(c[0], ''); });
    records.push({ index: index, obj: obj });
  });
  var dynamicKeys = s.dynamic ? headers.filter(function (h) { return h && !fixed[h]; }) : [];
  return { entity: entity, schema: s, headers: headers, fixed: fixed, records: records, dynamicKeys: dynamicKeys };
}

function isBlankRow_(row) {
  for (var i = 0; i < row.length; i++) if (row[i] !== '' && row[i] !== null && row[i] !== undefined) return false;
  return true;
}

function isDate_(v) {
  return Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime());
}

function pad2_(n) { return (n < 10 ? '0' : '') + n; }

function normalizeCell_(prop, v) {
  if (isDate_(v)) {
    if (TIMESTAMP_PROPS[prop]) return v.toISOString();
    return v.getFullYear() + '-' + pad2_(v.getMonth() + 1) + '-' + pad2_(v.getDate());
  }
  if (BOOL_PROPS[prop]) return toBool_(v, prop === 'active');
  if (NUMBER_PROPS[prop]) {
    if (v === '' || v === null || v === undefined) return '';
    var n = Number(v);
    return isFinite(n) ? n : '';
  }
  return v === null || v === undefined ? '' : String(v);
}

// 空欄は「有効」なら TRUE 扱い（手でシートに行を足した場合に備える）、それ以外は FALSE
function toBool_(v, blankValue) {
  if (v === true || v === false) return v;
  if (v === '' || v === null || v === undefined) return blankValue;
  var s = String(v).trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes' || s === 'はい' || s === '○';
}

function toRow_(table, obj) {
  return table.headers.map(function (h) {
    var prop = table.fixed[h];
    var v = prop ? obj[prop] : (table.schema.dynamic && obj.values ? obj.values[h] : '');
    if (v === undefined || v === null) return '';
    if (prop && TIMESTAMP_PROPS[prop] && typeof v === 'string' && v) {
      var d = new Date(v);
      return isNaN(d.getTime()) ? v : d;
    }
    return v;
  });
}

function findRecord_(table, keyValue) {
  var prop = table.schema.key;
  for (var i = 0; i < table.records.length; i++) {
    if (String(table.records[i].obj[prop]) === String(keyValue)) return table.records[i];
  }
  return null;
}

function nextId_(prefix, records) {
  var max = 0;
  var re = new RegExp('^' + prefix + '(\\d+)$');
  records.forEach(function (r) {
    var m = re.exec(String(r.obj.id || ''));
    if (m) max = Math.max(max, Number(m[1]));
  });
  var num = String(max + 1);
  while (num.length < 3) num = '0' + num;
  return prefix + num;
}

function hasCol_(s, prop) {
  return s.cols.some(function (c) { return c[0] === prop; });
}

function sortByOrder_(list) {
  return list.slice().sort(function (a, b) {
    var ao = a.order === '' ? Infinity : a.order;
    var bo = b.order === '' ? Infinity : b.order;
    return ao === bo ? 0 : ao < bo ? -1 : 1;
  });
}

// 親に紐づく子シートの行を置き換える
function replaceChildren_(env, childEntity, parentId, rows) {
  var table = loadTable_(env, childEntity);
  var s = table.schema;
  var indices = table.records
    .filter(function (r) { return String(r.obj[s.parentProp]) === String(parentId); })
    .map(function (r) { return r.index; });
  if (indices.length) env.db.deleteRows(s.sheet, indices);
  if (!rows.length) return;
  var fresh = loadTable_(env, childEntity);
  env.db.appendRows(s.sheet, rows.map(function (row) {
    var obj = {};
    s.cols.forEach(function (c) { obj[c[0]] = row[c[0]]; });
    obj[s.parentProp] = parentId;
    return toRow_(fresh, obj);
  }));
}

function ensureOrgColumn_(env, key) {
  var table = loadTable_(env, 'orgs');
  if (table.headers.indexOf(key) >= 0) return;
  env.db.insertColumnBefore(SCHEMA.orgs.sheet, SCHEMA.orgs.dynamicBefore, key);
}

// ---------- 入力値の検証 ----------

function str_(v) { return v === undefined || v === null ? '' : String(v).trim(); }

var EDITABLE_PROPS = {
  templates: ['name', 'setId', 'mediaId', 'rank', 'format', 'fileId'],
  media: ['name', 'order'],
  sets: ['name', 'description', 'order'],
  ranks: ['name', 'order'],
  items: ['key', 'label', 'category', 'type', 'options', 'format', 'required', 'defaultValue', 'example', 'order'],
  dateFormats: ['label', 'format', 'order'],
  orgs: ['logoFileId'],
  settings: ['key', 'value', 'description'],
};

function pickData_(entity, data) {
  var out = {};
  EDITABLE_PROPS[entity].forEach(function (p) {
    if (!(p in data)) return;
    if (BOOL_PROPS[p]) out[p] = toBool_(data[p], false);
    else if (NUMBER_PROPS[p]) out[p] = normalizeCell_(p, data[p]);
    else out[p] = p === 'value' || p === 'description' ? String(data[p] == null ? '' : data[p]) : str_(data[p]);
  });
  if (entity === 'orgs' && data.values && typeof data.values === 'object') {
    out.values = {};
    Object.keys(data.values).forEach(function (k) { out.values[k] = String(data.values[k] == null ? '' : data.values[k]); });
  }
  return out;
}

function requireText_(value, label) {
  if (!str_(value)) throw appError_('VALIDATION', label + 'を入力してください');
}

function oneOf_(value, list, label) {
  if (list.indexOf(value) < 0) throw appError_('VALIDATION', label + 'は「' + list.join('／') + '」のいずれかにしてください');
}

function validate_(entity, obj, env, table, isCreate) {
  var s = table.schema;
  var duplicate = function (label) {
    if (isCreate && findRecord_(table, obj[s.key])) throw appError_('DUPLICATE', label + '「' + obj[s.key] + '」はすでに登録されています');
  };
  switch (entity) {
    case 'templates': {
      requireText_(obj.name, 'テンプレ名');
      requireText_(obj.setId, 'セット');
      requireText_(obj.mediaId, '媒体');
      requireText_(obj.rank, 'ランク');
      if (!obj.format) obj.format = 'テキスト';
      oneOf_(obj.format, OUTPUT_FORMATS, '出力形式');
      if (obj.format === '画像') throw appError_('VALIDATION', '画像の出力は今後対応予定です');
      if (isDocumentFormat_(obj.format)) requireText_(obj.fileId, '雛形ファイルID');
      if (!findRecord_(loadTable_(env, 'sets'), obj.setId)) throw appError_('VALIDATION', 'セットが見つかりません');
      if (!findRecord_(loadTable_(env, 'media'), obj.mediaId)) throw appError_('VALIDATION', '媒体が見つかりません');
      if (obj.rank !== COMMON_RANK && !findRecord_(loadTable_(env, 'ranks'), obj.rank)) throw appError_('VALIDATION', 'ランクが見つかりません');
      break;
    }
    case 'media':
      requireText_(obj.name, '媒体名');
      break;
    case 'sets':
      requireText_(obj.name, 'セット名');
      break;
    case 'ranks':
      requireText_(obj.name, 'ランク名');
      if (obj.name === COMMON_RANK) throw appError_('VALIDATION', '「' + COMMON_RANK + '」はランク名に使えません');
      duplicate('ランク');
      break;
    case 'items': {
      requireText_(obj.key, '項目キー');
      if (/[{}:\n\r]/.test(obj.key)) throw appError_('VALIDATION', '項目キーに { } : や改行は使えません');
      var reserved = fixedHeaderMap_(SCHEMA.orgs);
      if (reserved[obj.key]) throw appError_('VALIDATION', '「' + obj.key + '」は団体マスタの予約列名なので使えません');
      if (!obj.label) obj.label = obj.key;
      if (!obj.category) obj.category = '案件';
      if (!obj.type) obj.type = '短文';
      oneOf_(obj.category, ITEM_CATEGORIES, '区分');
      oneOf_(obj.type, ITEM_TYPES, '入力タイプ');
      duplicate('項目キー');
      break;
    }
    case 'dateFormats':
      requireText_(obj.format, '書式');
      if (!obj.label) obj.label = obj.format;
      duplicate('書式');
      break;
    case 'orgs':
      requireText_(obj.values && obj.values['団体名'], '団体名');
      break;
    case 'settings':
      requireText_(obj.key, '項目キー');
      if (/[{}:\n\r]/.test(obj.key)) throw appError_('VALIDATION', '項目キーに { } : や改行は使えません');
      duplicate('項目キー');
      break;
  }
}

function childRows_(entity, children) {
  if (entity === 'templates') {
    var fields = children.fields || {};
    return Object.keys(fields).map(function (k) { return { fieldKey: str_(k), content: String(fields[k] == null ? '' : fields[k]) }; })
      .filter(function (r) { return r.fieldKey; });
  }
  if (entity === 'media') {
    return (children.fields || []).map(function (f, i) {
      var countMode = str_(f.countMode) || '通常';
      var splitRule = str_(f.splitRule) || 'なし';
      oneOf_(countMode, COUNT_MODES, '数え方');
      oneOf_(splitRule, SPLIT_RULES, '分割ルール');
      return {
        fieldKey: str_(f.fieldKey), label: str_(f.label) || str_(f.fieldKey), limit: normalizeCell_('limit', f.limit),
        countMode: countMode, splitRule: splitRule, order: f.order === '' || f.order == null ? i + 1 : normalizeCell_('order', f.order),
      };
    }).filter(function (r) { return r.fieldKey; });
  }
  return [];
}

// ---------- action ----------

function actionVerifyAdmin_(payload, env, req) {
  return { valid: safeEqual_(req.adminPass, env.props.adminPassword) };
}

function actionInit_(payload, env) {
  var all = {};
  ['templates', 'templateFields', 'media', 'mediaFields', 'sets', 'ranks', 'items', 'dateFormats', 'settings'].forEach(function (e) {
    all[e] = loadTable_(env, e).records.map(function (r) { return r.obj; });
  });
  var orgTable = loadTable_(env, 'orgs');
  var templates = all.templates.map(function (t) {
    var fields = {};
    all.templateFields.forEach(function (f) { if (f.templateId === t.id) fields[f.fieldKey] = f.content; });
    t.fields = fields;
    return t;
  });
  var media = sortByOrder_(all.media).map(function (m) {
    m.fields = sortByOrder_(all.mediaFields.filter(function (f) { return f.mediaId === m.id; }));
    return m;
  });
  return {
    templates: templates,
    media: media,
    sets: sortByOrder_(all.sets),
    ranks: sortByOrder_(all.ranks),
    items: sortByOrder_(all.items),
    dateFormats: sortByOrder_(all.dateFormats),
    settings: all.settings,
    orgs: orgTable.records.map(function (r) { return r.obj; }),
    orgColumns: orgTable.dynamicKeys,
  };
}

function actionCreate_(payload, env) {
  var entity = payload.entity;
  if (!Object.prototype.hasOwnProperty.call(CREATABLE, entity)) throw appError_('BAD_REQUEST', '追加できない種類です: ' + entity);
  var table = loadTable_(env, entity);
  var s = table.schema;
  var obj = pickData_(entity, payload.data || {});
  validate_(entity, obj, env, table, true);
  var children = entity === 'templates' && isDocumentFormat_(obj.format)
    ? documentChildren_(env, obj.fileId)
    : CREATABLE[entity] && payload.children ? childRows_(entity, payload.children) : null;
  if (s.idPrefix) obj.id = nextId_(s.idPrefix, table.records);
  if (hasCol_(s, 'active')) obj.active = true;
  if (hasCol_(s, 'updatedAt')) obj.updatedAt = env.now();
  if (entity === 'items' && obj.category === '団体') ensureOrgColumn_(env, obj.key);
  env.db.appendRows(s.sheet, [toRow_(table, obj)]);
  if (children) replaceChildren_(env, CREATABLE[entity], obj[s.key], children);
  return { key: obj[s.key] };
}

function actionUpdate_(payload, env) {
  var entity = payload.entity;
  if (!Object.prototype.hasOwnProperty.call(CREATABLE, entity)) throw appError_('BAD_REQUEST', '更新できない種類です: ' + entity);
  var table = loadTable_(env, entity);
  var s = table.schema;
  var rec = findRecord_(table, payload.key);
  if (!rec) throw appError_('NOT_FOUND', '対象のデータが見つかりません');
  var data = pickData_(entity, payload.data || {});
  delete data[s.key]; // キーは変更不可（履歴やテンプレ本文から参照されるため）
  var obj = JSON.parse(JSON.stringify(rec.obj));
  Object.keys(data).forEach(function (k) {
    if (k === 'values') Object.keys(data.values).forEach(function (vk) { obj.values[vk] = data.values[vk]; });
    else obj[k] = data[k];
  });
  validate_(entity, obj, env, table, false);
  var children = entity === 'templates' && isDocumentFormat_(obj.format)
    ? documentChildren_(env, obj.fileId)
    : CREATABLE[entity] && payload.children ? childRows_(entity, payload.children) : null;
  if (hasCol_(s, 'updatedAt')) obj.updatedAt = env.now();
  if (entity === 'items' && obj.category === '団体') ensureOrgColumn_(env, obj.key);
  env.db.updateRow(s.sheet, rec.index, toRow_(table, obj));
  if (children) replaceChildren_(env, CREATABLE[entity], obj[s.key], children);
  return { key: obj[s.key] };
}

function actionDeactivate_(payload, env) {
  var entity = payload.entity;
  if (!Object.prototype.hasOwnProperty.call(CREATABLE, entity) || !hasCol_(SCHEMA[entity], 'active')) throw appError_('BAD_REQUEST', '無効化できない種類です: ' + entity);
  var table = loadTable_(env, entity);
  var rec = findRecord_(table, payload.key);
  if (!rec) throw appError_('NOT_FOUND', '対象のデータが見つかりません');
  var obj = JSON.parse(JSON.stringify(rec.obj));
  obj.active = payload.active === true; // 既定は無効化。active: true を渡すと再度有効にする
  if (hasCol_(table.schema, 'updatedAt')) obj.updatedAt = env.now();
  env.db.updateRow(table.schema.sheet, rec.index, toRow_(table, obj));
  return { key: payload.key, active: obj.active };
}

function historyFromRecord_(obj) {
  var values = {};
  try { values = obj.values ? JSON.parse(obj.values) : {}; } catch (e) { values = {}; }
  return {
    id: obj.id, createdAt: obj.createdAt, author: obj.author, orgId: obj.orgId, orgName: obj.orgName,
    setId: obj.setId, rank: obj.rank, values: values, status: obj.status,
  };
}

function actionListHistory_(payload, env) {
  return loadTable_(env, 'history').records
    .map(function (r) { return historyFromRecord_(r.obj); })
    .sort(function (a, b) { return a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0; });
}

function actionGetHistory_(payload, env) {
  var rec = findRecord_(loadTable_(env, 'history'), payload.id);
  if (!rec) throw appError_('NOT_FOUND', '履歴が見つかりません');
  var history = historyFromRecord_(rec.obj);
  history.outputs = loadTable_(env, 'historyOutputs').records
    .map(function (r) { return r.obj; })
    .filter(function (o) { return o.historyId === history.id; });
  return history;
}

function actionSaveHistory_(payload, env) {
  var h = payload.history || {};
  var table = loadTable_(env, 'history');
  var rec = h.id ? findRecord_(table, h.id) : null;
  if (h.id && !rec) throw appError_('NOT_FOUND', '上書きする履歴が見つかりません');
  var obj = {
    id: rec ? rec.obj.id : nextId_('H', table.records),
    createdAt: rec ? rec.obj.createdAt : env.now(),
    author: str_(h.author), orgId: str_(h.orgId), orgName: str_(h.orgName), setId: str_(h.setId), rank: str_(h.rank),
    values: JSON.stringify(h.values || {}),
    status: rec ? rec.obj.status : '',
  };
  if (rec) env.db.updateRow(SCHEMA.history.sheet, rec.index, toRow_(table, obj));
  else env.db.appendRows(SCHEMA.history.sheet, [toRow_(table, obj)]);
  var outputs = (payload.outputs || []).map(function (o) {
    return { mediaId: str_(o.mediaId), templateId: str_(o.templateId), fieldKey: str_(o.fieldKey), text: String(o.text == null ? '' : o.text), edited: o.edited === true };
  });
  replaceChildren_(env, 'historyOutputs', obj.id, outputs);
  return { id: obj.id, createdAt: isDate_(obj.createdAt) ? obj.createdAt.toISOString() : obj.createdAt };
}

function actionDeleteHistory_(payload, env) {
  var table = loadTable_(env, 'history');
  var rec = findRecord_(table, payload.id);
  if (!rec) throw appError_('NOT_FOUND', '履歴が見つかりません');
  replaceChildren_(env, 'historyOutputs', rec.obj.id, []);
  env.db.deleteRows(SCHEMA.history.sheet, [rec.index]);
  return { id: rec.obj.id };
}

// ---------- 書類（PDF / Docx） ----------

function isDocumentFormat_(format) {
  return DOCUMENT_FORMATS.indexOf(format) >= 0;
}

function docs_(env) {
  if (!env.docs) throw appError_('DOCS_UNAVAILABLE', '書類の出力に対応していない環境です');
  return env.docs;
}

// 雛形ドキュメントの本文を読んで「本文」欄に写す。画面はこれを使って入力フォームとプレビューを作る
function documentChildren_(env, fileId) {
  return [{ fieldKey: '本文', content: docs_(env).readText(fileId) }];
}

function actionReadDocument_(payload, env) {
  requireText_(payload.fileId, '雛形ファイルID');
  return { text: docs_(env).readText(str_(payload.fileId)) };
}

// replacements は画面側で解決済みの { '{{団体名}}': 'サンプル団体', '{{締結日:M/D}}': '9/24', ... }
function actionRenderDocument_(payload, env) {
  var rec = findRecord_(loadTable_(env, 'templates'), payload.templateId);
  if (!rec) throw appError_('NOT_FOUND', 'テンプレートが見つかりません');
  var t = rec.obj;
  if (!isDocumentFormat_(t.format) || !t.fileId) throw appError_('VALIDATION', 'このテンプレートは書類の出力に対応していません');
  var format = payload.format || t.format;
  oneOf_(format, DOCUMENT_FORMATS, '出力形式');
  var replacements = {};
  var src = payload.replacements && typeof payload.replacements === 'object' ? payload.replacements : {};
  Object.keys(src).forEach(function (k) {
    if (/^\{\{[^{}]+\}\}$/.test(k)) replacements[k] = String(src[k] == null ? '' : src[k]);
  });
  var fileName = str_(payload.fileName).replace(/[\\/:*?"<>|]/g, '_') || t.name;
  return docs_(env).render({ fileId: t.fileId, replacements: replacements, format: format, fileName: fileName });
}

// ---------- 初期化 ----------

/** 全シートとヘッダーを用意し、空のシートにだけモックデータを入れる（既存データは消さない） */
function seedTables(db, now) {
  var orgKeys = MOCK_DATA.items.filter(function (i) { return i.category === '団体'; }).map(function (i) { return i.key; });
  var env = { db: db };
  var seeded = [];
  Object.keys(SCHEMA).forEach(function (entity) {
    var s = SCHEMA[entity];
    db.ensureSheet(s.sheet, schemaHeaders_(entity, orgKeys));
    var table = loadTable_(env, entity);
    var mock = MOCK_DATA[entity] || [];
    if (table.records.length || !mock.length) return;
    db.appendRows(s.sheet, mock.map(function (o) {
      var copy = JSON.parse(JSON.stringify(o));
      if (hasCol_(s, 'updatedAt') && !copy.updatedAt) copy.updatedAt = now;
      return toRow_(table, copy);
    }));
    seeded.push(s.sheet);
  });
  return seeded;
}
