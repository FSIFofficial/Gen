import { useState } from 'preact/hooks'
import { Download, RotateCcw, Search, Trash2 } from 'lucide-preact'
import { toCsv } from '../lib/csv.js'
import { Button, Empty, Eyebrow, card, downloadText, formatDateTime, useApp } from '../ui/ui.jsx'

// 作成日時（ISO）→ 日本時間の YYYY-MM-DD（期間の絞り込み用）
function localDate(iso) {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const filterCls = 'h-10 rounded-lg border border-[#dce5f2] bg-white px-3 text-sm'

export function HistoryView() {
  // 一覧はページを開いたとき（main.jsx の go）とヘッダーの「最新に更新」で読み込み直す
  const { data, history, setHistory, startCreate, adminCall, notify } = useApp()
  const [query, setQuery] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [author, setAuthor] = useState('')
  const [setId, setSetId] = useState('')
  const setName = (id) => data.sets.find((s) => s.id === id)?.name || id

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

  const all = history || []
  const authors = [...new Set(all.map((h) => h.author).filter(Boolean))].sort()
  const q = query.trim()
  const items = all.filter((h) => {
    const day = localDate(h.createdAt)
    if (from && day < from) return false
    if (to && day > to) return false
    if (author && h.author !== author) return false
    if (setId && h.setId !== setId) return false
    return !q || [h.id, h.orgName, setName(h.setId), h.rank, h.author, ...Object.values(h.values || {})].some((v) => String(v ?? '').includes(q))
  })
  const filtered = Boolean(q || from || to || author || setId)

  // 絞り込んだ一覧を CSV に。入力値は項目ごとの列にする（項目の並び順、その後に登録の無い項目）
  const exportCsv = () => {
    const used = new Set(items.flatMap((h) => Object.keys(h.values || {})))
    const keys = [...data.items.map((i) => i.key).filter((k) => used.delete(k)), ...used]
    const label = (k) => data.items.find((i) => i.key === k)?.label || k
    const rows = [
      ['履歴ID', '作成日時', '作成者', '団体ID', '団体名', 'セット', 'ランク', ...keys.map(label)],
      ...items.map((h) => [h.id, formatDateTime(h.createdAt), h.author, h.orgId, h.orgName, setName(h.setId), h.rank, ...keys.map((k) => h.values?.[k] ?? '')]),
    ]
    const stamp = localDate(new Date().toISOString()).replace(/-/g, '')
    downloadText(toCsv(rows), `作成履歴_${stamp}.csv`, 'text/csv;charset=utf-8')
  }

  return (
    <section>
      <div class="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <Eyebrow>ARCHIVE / HISTORY</Eyebrow>
          <h1 class="mt-2 text-3xl font-bold">作成履歴</h1>
        </div>
        <Button variant="outline" icon={Download} onClick={exportCsv} disabled={!items.length}>CSV（{items.length}件）</Button>
      </div>
      <div class="mt-6 flex flex-wrap items-end gap-2">
        <div class="relative w-full sm:w-72">
          <Search class="absolute top-3 left-3 size-4 text-slate-400" />
          <input value={query} onInput={(e) => setQuery(e.currentTarget.value)} placeholder="団体名・入力内容などで検索" class={`${filterCls} w-full pl-9`} />
        </div>
        <label class="text-xs font-medium text-slate-500">
          期間
          <span class="mt-1 flex items-center gap-1">
            <input type="date" value={from} onInput={(e) => setFrom(e.currentTarget.value)} aria-label="期間（から）" class={filterCls} />
            <span class="text-slate-400">〜</span>
            <input type="date" value={to} onInput={(e) => setTo(e.currentTarget.value)} aria-label="期間（まで）" class={filterCls} />
          </span>
        </label>
        <select value={author} onChange={(e) => setAuthor(e.currentTarget.value)} aria-label="作成者" class={filterCls}>
          <option value="">すべての作成者</option>
          {authors.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={setId} onChange={(e) => setSetId(e.currentTarget.value)} aria-label="セット" class={filterCls}>
          <option value="">すべてのセット</option>
          {data.sets.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        {filtered && (
          <button onClick={() => { setQuery(''); setFrom(''); setTo(''); setAuthor(''); setSetId('') }} class="h-10 px-2 text-sm font-medium text-[#1261af]">
            条件をクリア
          </button>
        )}
      </div>
      <div class={`mt-4 overflow-hidden ${card}`}>
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
          <Empty>{filtered ? '条件に合う履歴はありません。' : '保存された履歴はまだありません。'}</Empty>
        )}
      </div>
    </section>
  )
}
