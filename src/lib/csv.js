// CSV / TSV の読み込み（団体の一括登録用）。スプレッドシートからのコピー（タブ区切り）と CSV ファイルの両方を受け付ける

// 1行目にタブがあればタブ区切り、なければカンマ区切り。"..." の中の区切り文字・改行・"" に対応する
export function parseDelimited(text) {
  const src = String(text ?? '').replace(/^﻿/, '')
  const firstLine = src.split(/\r?\n/, 1)[0] || ''
  const sep = firstLine.includes('\t') ? '\t' : ','
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"'
          i++
        } else quoted = false
      } else cell += c
    } else if (c === '"' && cell === '') quoted = true
    else if (c === sep) {
      row.push(cell)
      cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += c
  }
  if (cell !== '' || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

// 見出し行の各列を団体マスタの列（項目キー）に対応づける。項目キーか表示名が一致すれば対応、しなければ null
export function mapOrgColumns(headers, orgColumns, items = []) {
  const byLabel = {}
  for (const i of items) if (orgColumns.includes(i.key) && i.label) byLabel[i.label.trim()] = i.key
  const used = new Set()
  return headers.map((h) => {
    const name = String(h ?? '').trim()
    const key = orgColumns.includes(name) ? name : byLabel[name]
    if (!key || used.has(key)) return null
    used.add(key)
    return key
  })
}

// 表（1行目が見出し）→ bulkCreate に送る rows
export function orgRowsFromTable(table, mapping) {
  return table.slice(1).map((r) => {
    const values = {}
    mapping.forEach((key, i) => {
      if (key) values[key] = String(r[i] ?? '').trim()
    })
    return { values }
  })
}
