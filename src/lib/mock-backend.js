// モックモード：GAS と同じ Core.gs をブラウザ内で動かす。データはこのブラウザの localStorage のみ。
import schema from '../../gas/Schema.gs'
import mockData from '../../gas/MockData.gs'
import core from '../../gas/Core.gs'
import { MemoryDb, loadGasCore } from './memory-db.js'

const STORAGE_KEY = 'pg-mock-db'
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

  const env = {
    db,
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
    } catch {
      // 保存できなくてもメモリ上では動く
    }
    return JSON.parse(JSON.stringify(res))
  }
}

export function resetMockData() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // noop
  }
}
