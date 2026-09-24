import { render } from 'preact'
import { useCallback, useEffect, useRef, useState } from 'preact/hooks'
import { Check, History as HistoryIcon, Home as HomeIcon, Plus, RefreshCw, Settings, ShieldCheck, X } from 'lucide-preact'
import { checkInitData, createApi } from './lib/api.js'
import { resetMockData } from './lib/mock-backend.js'
import { AppContext, Alert, Button, Label, Modal, Spinner, cx, inputCls } from './ui/ui.jsx'
import { Home } from './views/Home.jsx'
import { Create } from './views/Create.jsx'
import { HistoryView } from './views/History.jsx'
import { Admin } from './views/Admin.jsx'

const config = window.APP_CONFIG || { mock: true }
const api = createApi(config)

function App() {
  const [data, setData] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [view, setView] = useState('home')
  const [seed, setSeed] = useState({ id: 0 })
  const [toast, setToast] = useState(null)
  const [adminPrompt, setAdminPrompt] = useState(null)
  const [isAdmin, setIsAdmin] = useState(api.hasAdmin())
  const [history, setHistory] = useState(null)
  const toastTimer = useRef(null)

  const notify = useCallback((message, tone = 'ok') => {
    clearTimeout(toastTimer.current)
    setToast({ message, tone })
    toastTimer.current = setTimeout(() => setToast(null), tone === 'error' ? 6000 : 2500)
  }, [])

  // 読み込みが重なったとき、遅れて返ってきた古い応答で新しいデータを上書きしないよう、最後に始めた読み込みだけを反映する
  const dataSeq = useRef(0)
  const historySeq = useRef(0)

  const reload = useCallback(async () => {
    const n = ++dataSeq.current
    const d = checkInitData(await api.call('init'))
    if (n === dataSeq.current) setData(d)
    return d
  }, [])

  const loadHistory = useCallback(async () => {
    const n = ++historySeq.current
    const res = await api.call('listHistory')
    const list = Array.isArray(res) ? res : []
    if (n === historySeq.current) setHistory(list)
    return list
  }, [])

  useEffect(() => {
    reload().catch((e) => setLoadError(e.message))
    loadHistory().catch(() => setHistory([]))
  }, [])

  // 管理者パスを要求する。すでに入力済みならそのまま通す
  const requireAdmin = useCallback(() => {
    if (api.hasAdmin()) return Promise.resolve(true)
    return new Promise((resolve) => setAdminPrompt({ resolve }))
  }, [])

  // 管理者操作の共通処理：パス確認 → 実行 → パス誤りなら再入力を促す
  const adminCall = useCallback(async (action, payload) => {
    if (!(await requireAdmin())) return null
    try {
      return await api.call(action, payload, { admin: true })
    } catch (e) {
      if (e.code === 'ADMIN_REQUIRED') setIsAdmin(false)
      throw e
    }
  }, [])

  // スプレッドシートの内容を読み込み直して最新にする（ページの再読み込みは不要）。
  // ボタンから押したときは結果を知らせ、ページ移動やタブに戻ったときは裏で静かに行う
  const [refreshing, setRefreshing] = useState(false)
  const lastRefresh = useRef(Date.now())
  const refresh = useCallback(async ({ quiet = false } = {}) => {
    setRefreshing(true)
    lastRefresh.current = Date.now()
    try {
      await Promise.all([reload(), loadHistory()])
      if (!quiet) notify('最新のデータに更新しました')
    } catch (e) {
      if (!quiet) notify(e.message, 'error')
    } finally {
      setRefreshing(false)
    }
  }, [])

  // ページ移動のたびに裏で最新にする
  const go = (next) => {
    setView(next)
    refresh({ quiet: true })
  }

  // スプレッドシートなど別のタブから戻ってきたときも最新にする（30秒以内に更新済みなら省略）
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && data && Date.now() - lastRefresh.current > 30000) refresh({ quiet: true })
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [data])

  const startCreate = (preset = {}) => {
    setSeed({ ...preset, id: Date.now() })
    go('create')
  }

  const ctx = { api, data, reload, notify, requireAdmin, adminCall, isAdmin, history, loadHistory, setHistory, startCreate, setView: go, refreshing }

  const nav = [
    ['home', 'ホーム', HomeIcon, () => go('home')],
    ['create', '新規作成', Plus, () => startCreate()],
    ['history', '履歴', HistoryIcon, () => go('history')],
    ['admin', '管理', Settings, () => go('admin')],
  ]

  return (
    <AppContext.Provider value={ctx}>
      <div class="min-h-screen bg-[#f6f8fc] text-[#12233f]">
        <header class="border-b border-[#dce5f2] bg-white">
          <div class="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 px-5 py-4 lg:px-10">
            <button onClick={() => go('home')} class="flex items-center gap-3 text-left">
              <span class="flex size-9 items-center justify-center rounded-xl bg-[#102c56] text-sm font-bold text-white">F</span>
              <span>
                <span class="block text-[15px] font-bold tracking-tight">FSIF｜発信物ジェネレーター</span>
                <span class="hidden text-xs text-slate-500 sm:block">Internal communication workspace</span>
              </span>
            </button>
            <div class="flex items-center gap-2">
              {data && (
                <button
                  onClick={() => refresh()}
                  disabled={refreshing}
                  title="スプレッドシートから最新のデータを読み込み直します"
                  aria-label="最新に更新"
                  class="flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-medium text-slate-500 hover:bg-[#f3f6fb] hover:text-slate-700 disabled:opacity-60"
                >
                  <RefreshCw class={cx('size-4', refreshing && 'animate-spin')} />
                  <span class="hidden md:inline">{refreshing ? '更新中…' : '最新に更新'}</span>
                </button>
              )}
              {isAdmin && (
                <button
                  onClick={() => {
                    api.setAdminPass('')
                    setIsAdmin(false)
                    notify('管理者モードを終了しました')
                  }}
                  title="クリックで管理者モードを終了"
                  class="hidden items-center gap-1 rounded-full bg-[#effcf6] px-3 py-1.5 text-xs font-bold text-[#17634f] sm:flex"
                >
                  <ShieldCheck class="size-3.5" />
                  管理者モード
                </button>
              )}
              <nav class="flex items-center gap-1 rounded-xl bg-[#f3f6fb] p-1 text-sm font-medium">
                {nav.map(([key, label, Icon, onClick]) => (
                  <button key={key} onClick={onClick} aria-label={label} class={cx('flex items-center gap-1 rounded-lg px-3 py-2', view === key ? 'bg-white text-[#1261af] shadow-sm' : 'text-slate-500 hover:text-slate-700')}>
                    <Icon class="size-4" />
                    <span class="hidden sm:inline">{label}</span>
                  </button>
                ))}
              </nav>
            </div>
          </div>
        </header>

        <main class="mx-auto max-w-[1440px] px-5 py-8 lg:px-10">
          {loadError ? (
            <div class="mx-auto max-w-xl py-16">
              <Alert tone="red">
                <p class="font-bold">データを読み込めませんでした</p>
                <p class="mt-1">{loadError}</p>
              </Alert>
              <Button class="mt-4" onClick={() => location.reload()}>再読み込み</Button>
            </div>
          ) : !data ? (
            <div class="flex flex-col items-center justify-center gap-3 py-32 text-slate-500">
              <Spinner class="size-6 text-[#1261af]" />
              <p class="text-sm">データを読み込んでいます…</p>
              <p class="text-xs text-slate-400">しばらく使われていないと、最初の読み込みに数秒かかることがあります</p>
            </div>
          ) : (
            <>
              {view === 'home' && <Home />}
              {view === 'create' && <Create key={seed.id} seed={seed} />}
              {view === 'history' && <HistoryView />}
              {view === 'admin' && <Admin />}
            </>
          )}
        </main>

        <footer class="mx-auto flex max-w-[1440px] flex-wrap items-center gap-3 px-5 pb-8 text-xs text-slate-400 lg:px-10">
          {api.mock ? (
            <>
              <span>モックモード｜データはこのブラウザにのみ保存されます（管理者パス：{api.mockAdminPassword}）</span>
              <button
                class="underline"
                onClick={() => {
                  if (confirm('モックデータを初期状態に戻しますか？')) {
                    resetMockData()
                    location.reload()
                  }
                }}
              >
                モックデータを初期化
              </button>
            </>
          ) : (
            <span>データは管理用スプレッドシートに保存されます。</span>
          )}
        </footer>

        {toast && (
          <div class={cx('fixed bottom-5 left-1/2 z-50 flex max-w-[90vw] -translate-x-1/2 items-center gap-2 rounded-full px-5 py-3 text-sm font-medium text-white shadow-xl', toast.tone === 'error' ? 'bg-red-700' : 'bg-[#102c56]')}>
            {toast.tone === 'error' ? <X class="size-4" /> : <Check class="size-4" />}
            {toast.message}
            <button onClick={() => setToast(null)} aria-label="閉じる">
              <X class="size-4" />
            </button>
          </div>
        )}

        {adminPrompt && (
          <AdminPrompt
            onDone={(ok) => {
              adminPrompt.resolve(ok)
              setAdminPrompt(null)
              if (ok) {
                setIsAdmin(true)
                notify('管理者として認証しました')
              }
            }}
          />
        )}
      </div>
    </AppContext.Provider>
  )
}

function AdminPrompt({ onDone }) {
  const [pass, setPass] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e) => {
    e?.preventDefault()
    if (!pass) return
    setBusy(true)
    setError('')
    try {
      if (await api.verifyAdmin(pass)) onDone(true)
      else setError('管理者パスワードが違います')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      title="管理者パスワード"
      onClose={() => onDone(false)}
      footer={
        <>
          <Button variant="outline" onClick={() => onDone(false)}>キャンセル</Button>
          <Button onClick={submit} disabled={!pass || busy}>{busy ? <Spinner /> : null}確認</Button>
        </>
      }
    >
      <form onSubmit={submit}>
        <p class="mb-4 text-sm text-slate-500">既存データの編集・無効化、履歴の削除には管理者パスワードが必要です。一度入力すると、このタブを閉じるまで再入力は不要です。</p>
        <Label label="パスワード">
          <input type="password" value={pass} onInput={(e) => setPass(e.currentTarget.value)} class={inputCls} autocomplete="current-password" />
        </Label>
        {error && <p class="mt-2 text-sm text-red-600">{error}</p>}
      </form>
    </Modal>
  )
}

render(<App />, document.getElementById('app'))
