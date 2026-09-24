import { useEffect, useState } from 'preact/hooks'
import { RefreshCw, RotateCcw, Search, Trash2 } from 'lucide-preact'
import { Button, Empty, Eyebrow, card, formatDateTime, useApp } from '../ui/ui.jsx'

export function HistoryView() {
  const { data, history, loadHistory, setHistory, startCreate, adminCall, notify } = useApp()
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const setName = (id) => data.sets.find((s) => s.id === id)?.name || id

  const refresh = async () => {
    setLoading(true)
    try {
      await loadHistory()
    } catch (e) {
      notify(e.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  const remove = async (item) => {
    if (!confirm(`「${item.orgName}」の履歴（${item.id}）を削除しますか？この操作は取り消せません。`)) return
    try {
      if (!(await adminCall('deleteHistory', { id: item.id }))) return
      setHistory(history.filter((h) => h.id !== item.id))
      notify('履歴を削除しました')
    } catch (e) {
      notify(e.message, 'error')
    }
  }

  const q = query.trim()
  const items = (history || []).filter((h) => !q || [h.id, h.orgName, setName(h.setId), h.rank, h.author, ...Object.values(h.values || {})].some((v) => String(v ?? '').includes(q)))

  return (
    <section>
      <div class="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <Eyebrow>ARCHIVE / HISTORY</Eyebrow>
          <h1 class="mt-2 text-3xl font-bold">作成履歴</h1>
        </div>
        <div class="flex gap-2">
          <div class="relative">
            <Search class="absolute top-3 left-3 size-4 text-slate-400" />
            <input value={query} onInput={(e) => setQuery(e.currentTarget.value)} placeholder="団体名・セット・作成者で検索" class="h-10 w-full rounded-lg border border-[#dce5f2] bg-white pr-3 pl-9 text-sm md:w-72" />
          </div>
          <Button variant="outline" icon={RefreshCw} onClick={refresh} disabled={loading} aria-label="再読み込み" />
        </div>
      </div>
      <div class={`mt-8 overflow-hidden ${card}`}>
        {history === null ? (
          <Empty>読み込み中…</Empty>
        ) : items.length ? (
          items.map((item) => (
            <div key={item.id} class="flex flex-col gap-3 border-b border-[#edf1f7] p-5 last:border-0 sm:flex-row sm:items-center sm:justify-between">
              <button onClick={() => startCreate({ historyId: item.id })} class="text-left">
                <p class="font-semibold">{item.orgName || '団体未設定'}</p>
                <p class="mt-1 text-xs text-slate-500">
                  {formatDateTime(item.createdAt)} · {setName(item.setId)} · {item.rank}
                  {item.author && ` · ${item.author}`} · {item.id}
                </p>
              </button>
              <div class="flex items-center gap-2 self-end sm:self-auto">
                <Button variant="outline" size="sm" onClick={() => startCreate({ historyId: item.id })}>開く</Button>
                <Button variant="outline" size="sm" icon={RotateCcw} onClick={() => startCreate({ rebuildFrom: item.id })}>これを元に作り直す</Button>
                <button onClick={() => remove(item)} class="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" title="削除（管理者）" aria-label="削除">
                  <Trash2 class="size-4" />
                </button>
              </div>
            </div>
          ))
        ) : (
          <Empty>該当する履歴はありません。</Empty>
        )}
      </div>
    </section>
  )
}
