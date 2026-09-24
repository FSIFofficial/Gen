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
  return new Function(`${schema}\n${mockData}\n${core}\nreturn { handleRequest, seedTables, SCHEMA, MOCK_DATA }`)()
}
