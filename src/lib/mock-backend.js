// モックモード：GAS と同じ Core.gs をブラウザ内で動かす。データはこのブラウザの localStorage のみ。
import schema from '../../gas/Schema.gs'
import mockData from '../../gas/MockData.gs'
import core from '../../gas/Core.gs'
import { MemoryDb, createMockDocs, createMockFiles, createMockSlides, loadGasCore } from './memory-db.js'

const STORAGE_KEY = 'pg-mock-db'
const FILES_KEY = 'pg-mock-files'
export const MOCK_ADMIN_PASSWORD = 'admin'

export function createMockBackend() {
  const gas = loadGasCore({ schema, mockData, core })
  let db
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) db = MemoryDb.fromJSON(saved)
  } catch {
    db = null
  }
  if (!db) db = new MemoryDb()
  gas.seedTables(db, new Date())

  let fileStore = {}
  try {
    fileStore = JSON.parse(localStorage.getItem(FILES_KEY) || '{}')
  } catch {
    fileStore = {}
  }
  const files = createMockFiles(fileStore)

  const env = {
    db,
    docs: createMockDocs(gas.MOCK_DOCUMENTS),
    slides: createMockSlides(gas.MOCK_DOCUMENTS, files),
    files,
    props: { userKey: 'mock', adminPassword: MOCK_ADMIN_PASSWORD },
    withLock: (fn) => fn(),
    now: () => new Date(),
  }

  return async (body) => {
    // GAS の応答待ちを再現
    await new Promise((r) => setTimeout(r, 250))
    const res = gas.handleRequest(JSON.parse(JSON.stringify(body)), env)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(db))
      localStorage.setItem(FILES_KEY, JSON.stringify(fileStore))
    } catch {
      // 保存できなくてもメモリ上では動く
    }
    return JSON.parse(JSON.stringify(res))
  }
}

export function resetMockData() {
  try {
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(FILES_KEY)
  } catch {
    // noop
  }
}
