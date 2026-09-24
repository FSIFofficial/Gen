// GAS クライアント。利用者キーを全リクエストに、管理者パスは管理者操作に付与する。
import { createMockBackend, MOCK_ADMIN_PASSWORD } from './mock-backend.js'
import { readAuthor } from './storage.js'

const ADMIN_PASS_KEY = 'pg-admin-pass'

const MESSAGES = {
  UNAUTHORIZED: '利用者キーが正しくありません。管理者に連絡してください。',
  ADMIN_REQUIRED: '管理者パスワードが正しくないか、入力されていません。',
  ADMIN_LOCKED: '管理者パスワードを続けて間違えたため、しばらく受け付けません。時間をおいてから入力してください。',
  SERVER_NOT_CONFIGURED: 'GAS のスクリプトプロパティ（USER_KEY / ADMIN_PASSWORD）が未設定です。',
  SHEET_MISSING: 'スプレッドシートにシートがありません。GAS エディタで setup() を実行してください。',
  BUSY: 'ほかの保存処理が混み合っています。少し待ってから再度お試しください。',
  NOT_FOUND: '対象のデータが見つかりません。',
  NETWORK: '通信に失敗しました。ネットワーク接続を確認して、もう一度お試しください。',
  BAD_RESPONSE: 'サーバーから想定外の応答がありました。GAS のデプロイ設定を確認してください。',
  // 画面からの POST が途中で GET に変わり、doGet の応答が返ってきたとき
  USE_POST: 'GAS に正しく届きませんでした。Google に複数のアカウントでログインしているとこうなることがあります。シークレットウィンドウ（または使うアカウントだけでログインしたブラウザ）で開き直してください。直らない場合は GitHub の Secrets の GAS_URL が現在のウェブアプリの URL（末尾 /exec）か確認してください。',
}

// init の応答に必ず入っている一覧。欠けていたら GAS 以外の応答（doGet など）が返ってきている
const INIT_LISTS = ['templates', 'media', 'sets', 'ranks', 'items', 'dateFormats', 'settings', 'orgs', 'orgColumns']

export function checkInitData(d) {
  if (!d || typeof d !== 'object' || INIT_LISTS.some((k) => !Array.isArray(d[k]))) throw new ApiError('USE_POST')
  return d
}

export class ApiError extends Error {
  constructor(code, detail) {
    super(detail || MESSAGES[code] || `エラーが発生しました（${code}）`)
    this.code = code
  }
}

function readSession(key) {
  try {
    return sessionStorage.getItem(key) || ''
  } catch {
    return ''
  }
}

function writeSession(key, value) {
  try {
    if (value) sessionStorage.setItem(key, value)
    else sessionStorage.removeItem(key)
  } catch {
    // 保存できなくても画面のメモリには保持している
  }
}

export function createApi(config) {
  const mock = config.mock ? createMockBackend() : null
  const key = config.mock ? 'mock' : config.key
  let adminPass = readSession(ADMIN_PASS_KEY)

  async function send(body) {
    if (mock) return mock(body)
    let res
    try {
      res = await fetch(config.gasUrl, {
        method: 'POST',
        // text/plain にして CORS のプリフライトを避ける
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(body),
        redirect: 'follow',
      })
    } catch {
      throw new ApiError('NETWORK')
    }
    try {
      return await res.json()
    } catch {
      throw new ApiError('BAD_RESPONSE')
    }
  }

  async function call(action, payload = {}, { admin = false, adminPassOverride } = {}) {
    // actor は操作ログに残す名前（作成者名。本人確認ではなく記録用）
    const body = { action, key, payload, actor: readAuthor() }
    const pass = adminPassOverride ?? (admin ? adminPass : '')
    if (pass) body.adminPass = pass
    const res = await send(body)
    if (!res || typeof res !== 'object') throw new ApiError('BAD_RESPONSE')
    if (!res.ok) {
      if (res.error === 'ADMIN_REQUIRED') setAdminPass('')
      // USE_POST は画面側の説明（対処法つき）を出す
      throw new ApiError(res.error, res.error === 'USE_POST' ? '' : res.message)
    }
    return res.data
  }

  function setAdminPass(pass) {
    adminPass = pass
    writeSession(ADMIN_PASS_KEY, pass)
  }

  return {
    mock: Boolean(mock),
    mockAdminPassword: mock ? MOCK_ADMIN_PASSWORD : '',
    call,
    hasAdmin: () => Boolean(adminPass),
    setAdminPass,
    // 管理者パスを照合し、合っていれば保持する
    async verifyAdmin(pass) {
      const { valid } = await call('verifyAdmin', {}, { adminPassOverride: pass })
      if (valid) setAdminPass(pass)
      return valid
    },
  }
}
