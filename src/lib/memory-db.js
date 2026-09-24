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

// gas/Main.gs の CacheService の代わり（管理者パスの連続失敗の回数）。now は現在時刻（ミリ秒）を返す関数
export function createMemoryCache(now = () => Date.now()) {
  const store = {}
  return {
    get(key) {
      const e = store[key]
      return e && e.expires > now() ? e.value : null
    },
    put(key, value, seconds) {
      store[key] = { value: String(value), expires: now() + seconds * 1000 }
    },
    remove(key) {
      delete store[key]
    },
  }
}

// gas/*.gs のソース文字列を評価して、handleRequest などを取り出す
export function loadGasCore({ schema, mockData, core }) {
  // eslint-disable-next-line no-new-func
  return new Function(`${schema}\n${mockData}\n${core}\nreturn { handleRequest, seedTables, archiveLogs, SCHEMA, MOCK_DATA, MOCK_DOCUMENTS }`)()
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

function toBase64(text) {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

const escapeXml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// gas/Main.gs の FilesAdapter の代わり。画像はメモリ上（store）に置く
export function createMockFiles(store = {}) {
  let seq = Object.keys(store).length
  return {
    store,
    saveImage({ fileName, mimeType, base64 }) {
      const id = `MOCK_IMAGE_${++seq}`
      store[id] = { fileName, mimeType, base64 }
      return id
    },
    readImage(fileId) {
      const f = store[fileId]
      if (!f) {
        const e = new Error(`画像が見つかりません（ID：${fileId}）`)
        e.appCode = 'IMAGE_NOT_FOUND'
        throw e
      }
      return { mimeType: f.mimeType, base64: f.base64 }
    },
  }
}

// gas/Main.gs の SlidesAdapter の代わり。雛形は documents から読み、スライドごとに SVG 画像を返す（本番は PNG）
export function createMockSlides(documents, files) {
  const docs = createMockDocs(documents)
  return {
    readText: (fileId) => docs.readText(fileId),
    render({ fileId, replacements, images, fileName }) {
      const slides = docs.readText(fileId).split('\n---\n')
      return {
        docUrl: '',
        images: slides.map((slide, i) => {
          const parts = []
          let y = 150
          for (let line of slide.split('\n')) {
            const imageToken = Object.keys(images).find((t) => line.includes(t))
            if (imageToken) {
              const id = images[imageToken]
              if (id) {
                const img = files.readImage(id)
                parts.push(`<image href="data:${img.mimeType};base64,${img.base64}" x="540" y="${y - 60}" width="120" height="120" preserveAspectRatio="xMidYMid meet"/>`)
                y += 110
              }
              continue
            }
            for (const [token, value] of Object.entries(replacements)) line = line.split(token).join(value)
            parts.push(`<text x="600" y="${y}" font-size="${i === 0 && y < 300 ? 48 : 30}" fill="#fff" text-anchor="middle" font-family="sans-serif">${escapeXml(line)}</text>`)
            y += 64
          }
          const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675"><rect width="1200" height="675" fill="#102c56"/>${parts.join('')}<text x="1180" y="655" font-size="18" fill="#9fb6d6" text-anchor="end" font-family="sans-serif">モックモード：本番は PNG で出力されます</text></svg>`
          return { fileName: `${fileName}${slides.length > 1 ? `_${i + 1}` : ''}.svg`, mimeType: 'image/svg+xml', base64: toBase64(svg) }
        }),
      }
    },
  }
}
