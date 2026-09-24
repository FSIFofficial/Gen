// gas/SheetDb.gs と同じインターフェースのメモリ上DB。モックモードとテストで使う。
export class MemoryDb {
  constructor(sheets = {}) {
    this.sheets = sheets
  }

  static fromJSON(json) {
    return new MemoryDb(JSON.parse(json))
  }

  toJSON() {
    return this.sheets
  }

  sheet(name) {
    const sh = this.sheets[name]
    if (!sh) {
      const e = new Error(`シート「${name}」がありません`)
      e.appCode = 'SHEET_MISSING'
      throw e
    }
    return sh
  }

  readTable(name) {
    const sh = this.sheet(name)
    return { headers: [...sh.headers], rows: sh.rows.map((r) => sh.headers.map((_, i) => (r[i] === undefined ? '' : r[i]))) }
  }

  appendRows(name, rows) {
    this.sheet(name).rows.push(...rows.map((r) => [...r]))
  }

  updateRow(name, index, row) {
    this.sheet(name).rows[index] = [...row]
  }

  deleteRows(name, indices) {
    const sh = this.sheet(name)
    ;[...indices].sort((a, b) => b - a).forEach((i) => sh.rows.splice(i, 1))
  }

  insertColumnBefore(name, beforeHeader, header) {
    const sh = this.sheet(name)
    const at = sh.headers.indexOf(beforeHeader)
    const pos = at < 0 ? sh.headers.length : at
    sh.headers.splice(pos, 0, header)
    sh.rows.forEach((r) => {
      while (r.length < pos) r.push('')
      r.splice(pos, 0, '')
    })
  }

  ensureSheet(name, headers) {
    if (!this.sheets[name]) this.sheets[name] = { headers: [], rows: [] }
    const sh = this.sheets[name]
    if (!sh.headers.length) sh.headers = [...headers]
    else sh.headers.push(...headers.filter((h) => !sh.headers.includes(h)))
  }
}

// gas/*.gs のソース文字列を評価して、handleRequest などを取り出す
export function loadGasCore({ schema, mockData, core }) {
  // eslint-disable-next-line no-new-func
  return new Function(`${schema}\n${mockData}\n${core}\nreturn { handleRequest, seedTables, SCHEMA, MOCK_DATA, MOCK_DOCUMENTS }`)()
}

// gas/Main.gs の DocsAdapter の代わり。雛形は MOCK_DOCUMENTS から読み、差し込んだ結果をテキストファイルで返す
export function createMockDocs(documents) {
  const notFound = (fileId) => {
    const e = new Error(`雛形のGoogleドキュメントを開けません（ID：${fileId}）`)
    e.appCode = 'DOC_NOT_FOUND'
    return e
  }
  return {
    readText(fileId) {
      if (!(fileId in documents)) throw notFound(fileId)
      return documents[fileId]
    },
    render({ fileId, replacements, format, fileName }) {
      let text = this.readText(fileId)
      for (const [token, value] of Object.entries(replacements)) text = text.split(token).join(value)
      text = `【モックモード：本番では${format}で出力されます】\n\n${text}`
      const bytes = new TextEncoder().encode(text)
      let binary = ''
      for (const b of bytes) binary += String.fromCharCode(b)
      return { fileName: `${fileName}.txt`, mimeType: 'text/plain;charset=utf-8', base64: btoa(binary), docUrl: '' }
    },
  }
}
