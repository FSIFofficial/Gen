// テンプレートエンジン：差し込み、日付書式、ランク別テンプレ選択、X分割・X文字数計算

export const COMMON_RANK = '共通'
export const DEFAULT_DATE_FORMAT = 'YYYY年M月D日'
export const X_LIMIT = 280
export const X_URL_WEIGHT = 23

// {{項目名}} または {{項目名:書式}}
const PLACEHOLDER_RE = /\{\{\s*([^{}:]+?)\s*(?::\s*([^{}]*?)\s*)?\}\}/g

export function extractPlaceholders(text) {
  const found = []
  for (const m of String(text ?? '').matchAll(PLACEHOLDER_RE)) {
    found.push({ key: m[1], format: m[2] || '', raw: m[0], start: m.index, end: m.index + m[0].length })
  }
  return found
}

// 複数テキストから項目キーを出現順・重複なしで取り出す
export function extractKeys(texts) {
  const keys = []
  for (const text of texts) {
    for (const { key } of extractPlaceholders(text)) if (!keys.includes(key)) keys.push(key)
  }
  return keys
}

// カーソル位置にある {{ }} を返す（テンプレ編集で書式を変更するため）
export function placeholderAt(text, pos) {
  return extractPlaceholders(text).find((p) => pos > p.start && pos < p.end) || null
}

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

export function parseDate(value) {
  if (value instanceof Date && !isNaN(value)) return { y: value.getFullYear(), m: value.getMonth() + 1, d: value.getDate() }
  const m = /^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?/.exec(String(value ?? '').trim())
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const check = new Date(Date.UTC(y, mo - 1, d))
  if (check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null
  return { y, m: mo, d }
}

export function formatDate(value, format = DEFAULT_DATE_FORMAT) {
  const p = parseDate(value)
  if (!p) return String(value ?? '')
  const w = WEEKDAYS[new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()]
  const pad = (n) => String(n).padStart(2, '0')
  return (format || DEFAULT_DATE_FORMAT).replace(/YYYY|MM|M|DD|D|曜/g, (t) => ({ YYYY: String(p.y), MM: pad(p.m), M: String(p.m), DD: pad(p.d), D: String(p.d), 曜: w })[t])
}

// items: { [項目キー]: 入力項目 }, settings: { [項目キー]: 値 }
export function resolveValue(key, format, { values = {}, items = {}, settings = {} }) {
  const item = items[key]
  let v = values[key]
  if ((v === undefined || v === null || v === '') && !item && key in settings) v = settings[key]
  if (v === undefined || v === null || v === '') return null
  v = String(v)
  if ((item?.type === '日付' || format) && parseDate(v)) return formatDate(v, format || item?.format || DEFAULT_DATE_FORMAT)
  return v
}

// プレビューで差し込み部分を強調するため、文字列を区切って返す
// { text } は地の文、{ text, key } は差し込み値、{ text, key, missing: true } は未入力
export function renderSegments(template, ctx) {
  const text = String(template ?? '')
  const segments = []
  let last = 0
  for (const p of extractPlaceholders(text)) {
    if (p.start > last) segments.push({ text: text.slice(last, p.start) })
    const v = resolveValue(p.key, p.format, ctx)
    segments.push(v === null ? { text: `［${p.key}］`, key: p.key, missing: true } : { text: v, key: p.key })
    last = p.end
  }
  if (last < text.length) segments.push({ text: text.slice(last) })
  return segments
}

// 出力用。差し込みがすべて未入力の行は「今回のポイント：」のような見出しごと消し、
// 空行が3行以上続いたら詰める
export function renderTemplate(template, ctx) {
  const lines = []
  for (const line of String(template ?? '').split('\n')) {
    const segments = renderSegments(line, ctx)
    const inserted = segments.filter((s) => s.key)
    if (inserted.length && inserted.every((s) => s.missing)) continue
    lines.push(segments.map((s) => (s.missing ? '' : s.text)).join(''))
  }
  return tidy(lines.join('\n'))
}

export function tidy(text) {
  return text.replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim()
}

// セット×ランクから媒体ごとのテンプレを選ぶ。ランク専用を優先し、なければ「共通」
export function pickTemplates(templates, setId, rank) {
  const picked = {}
  for (const t of templates) {
    if (!t.active || t.setId !== setId) continue
    const current = picked[t.mediaId]
    if (t.rank === rank && (!current || current.rank !== rank)) picked[t.mediaId] = t
    else if (t.rank === COMMON_RANK && !current) picked[t.mediaId] = t
  }
  return picked
}

// ---------- 文字数 ----------

const URL_RE = /https?:\/\/[^\s　]+/g

// X（twitter-text v3）の重み：Latin 等は1、それ以外（日本語・絵文字など）は2
function xWeight(cp) {
  return cp <= 0x10ff || (cp >= 0x2000 && cp <= 0x200d) || (cp >= 0x2010 && cp <= 0x201f) || (cp >= 0x2032 && cp <= 0x2037) ? 1 : 2
}

function weigh(text) {
  let total = 0
  for (const ch of text) total += xWeight(ch.codePointAt(0))
  return total
}

// URL は長さに関係なく一律23
export function countX(text) {
  const s = String(text ?? '').normalize('NFC')
  let total = 0
  let last = 0
  for (const m of s.matchAll(URL_RE)) {
    total += weigh(s.slice(last, m.index)) + X_URL_WEIGHT
    last = m.index + m[0].length
  }
  return total + weigh(s.slice(last))
}

export function countPlain(text) {
  return [...String(text ?? '')].length
}

export function countText(text, mode) {
  return mode === 'X方式' ? countX(text) : countPlain(text)
}

// ---------- X スレッド分割 ----------

// 単独行の --- で分割
export function splitBySeparator(text) {
  const parts = [[]]
  for (const line of String(text ?? '').split(/\r?\n/)) {
    if (line.trim() === '---') parts.push([])
    else parts[parts.length - 1].push(line)
  }
  return parts.map((lines) => lines.join('\n').trim()).filter(Boolean)
}

// 上限を超えた投稿を、改行・句点の位置で分割（それでも長い場合は文字単位）
function fitPost(text, limit, count) {
  if (count(text) <= limit) return [text]
  const pieces = text.match(/[^\n。！？!?]*(?:[。！？!?]+|\n|$)/g).filter(Boolean)
  const posts = []
  let cur = ''
  const flush = () => {
    if (cur.trim()) posts.push(cur.trim())
    cur = ''
  }
  for (const piece of pieces) {
    if (count(cur + piece) <= limit) {
      cur += piece
      continue
    }
    flush()
    if (count(piece.trim()) <= limit) {
      cur = piece
      continue
    }
    for (const ch of piece) {
      if (count(cur + ch) > limit) flush()
      cur += ch
    }
  }
  flush()
  return posts
}

export function splitXThread(text, { limit = X_LIMIT, numbering = false } = {}) {
  const chunks = splitBySeparator(text)
  let reserve = 0
  let posts = []
  for (;;) {
    posts = chunks.flatMap((c) => fitPost(c, limit - reserve, countX))
    if (!numbering) break
    const need = countX(`\n(${posts.length}/${posts.length})`)
    if (need <= reserve) break
    reserve = need
  }
  const n = posts.length
  return posts.map((p, i) => {
    const t = numbering && n > 1 ? `${p}\n(${i + 1}/${n})` : p
    const c = countX(t)
    return { text: t, count: c, over: c > limit }
  })
}

// ---------- 生成 ----------

export function buildContext({ values, items, settings }) {
  return {
    values,
    items: Object.fromEntries(items.map((i) => [i.key, i])),
    settings: Object.fromEntries(settings.map((s) => [s.key, s.value])),
  }
}

// 媒体ごとに、媒体欄の定義に沿って文面を作る
// 戻り値: { [mediaId]: { templateId, fields: { [欄キー]: 文面 } } }
export function generateOutputs({ picked, mediaIds, media, ctx }) {
  const out = {}
  for (const mediaId of mediaIds) {
    const t = picked[mediaId]
    const m = media.find((x) => x.id === mediaId)
    if (!t || !m) continue
    const fields = {}
    const keys = m.fields.length ? m.fields.map((f) => f.fieldKey) : Object.keys(t.fields)
    for (const key of keys) fields[key] = renderTemplate(t.fields[key] ?? '', ctx)
    out[mediaId] = { templateId: t.id, fields }
  }
  return out
}

// 入力フォームに出す項目：選んだテンプレで使われている {{ }} だけ
export function formItemsFor({ picked, mediaIds, items, settings }) {
  const texts = mediaIds.flatMap((id) => Object.values(picked[id]?.fields || {}))
  const keys = extractKeys(texts)
  const byKey = Object.fromEntries(items.map((i) => [i.key, i]))
  const settingKeys = new Set(settings.map((s) => s.key))
  const used = keys.filter((k) => byKey[k]).map((k) => byKey[k]).sort((a, b) => (a.order === '' ? Infinity : a.order) - (b.order === '' ? Infinity : b.order))
  return {
    orgItems: used.filter((i) => i.category === '団体'),
    caseItems: used.filter((i) => i.category !== '団体'),
    settingKeys: keys.filter((k) => !byKey[k] && settingKeys.has(k)),
    unknownKeys: keys.filter((k) => !byKey[k] && !settingKeys.has(k)),
  }
}

// テンプレ編集プレビュー用のモック値
export function mockValues(items) {
  const today = new Date()
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  return Object.fromEntries(
    items.map((i) => [i.key, i.example || i.defaultValue || (i.type === '日付' ? iso : i.type === '数値' ? '1' : i.type === 'URL' ? 'https://example.com' : `（${i.label || i.key}）`)]),
  )
}
