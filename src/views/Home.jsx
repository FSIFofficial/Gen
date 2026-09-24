import { ArrowRight, Sparkles } from 'lucide-preact'
import { Button, Eyebrow, activeOnly, card, formatDateTime, useApp } from '../ui/ui.jsx'

const CARD_COLORS = ['bg-[#e9f4ff]', 'bg-[#eef0ff]', 'bg-[#effcf6]', 'bg-[#fff6e9]']

export function Home() {
  const { data, history, startCreate, setView } = useApp()
  const sets = activeOnly(data.sets)
  const setName = (id) => data.sets.find((s) => s.id === id)?.name || id
  return (
    <section class="py-8">
      <div class="flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          <p class="mb-3 text-sm font-semibold text-[#1671c9]">WORKSPACE / HOME</p>
          <h1 class="text-3xl font-bold tracking-tight md:text-4xl">発信物を、ひとつの入力から。</h1>
          <p class="mt-3 max-w-xl text-slate-500">団体とセットを選んで案件情報を入力すると、媒体ごとの文面をまとめて作成できます。</p>
        </div>
        <Button size="lg" icon={Sparkles} onClick={() => startCreate()}>新しい発信物を作成</Button>
      </div>

      <div class="mt-10 grid gap-5 md:grid-cols-2">
        {sets.map((s, i) => (
          <button key={s.id} onClick={() => startCreate({ setId: s.id })} class={`rounded-2xl border border-[#dce5f2] ${CARD_COLORS[i % CARD_COLORS.length]} p-6 text-left transition hover:border-[#3b8dd9]`}>
            <span class="text-xs font-bold tracking-[0.2em] text-[#1261af]">SET {s.id}</span>
            <h2 class="mt-8 text-xl font-bold">{s.name}</h2>
            <p class="mt-2 text-sm text-slate-600">{s.description}</p>
            <div class="mt-8 flex items-center gap-2 text-sm font-semibold text-[#1261af]">
              このセットで作成 <ArrowRight class="size-4" />
            </div>
          </button>
        ))}
      </div>

      <div class="mt-12 flex items-center justify-between">
        <h2 class="text-lg font-bold">最近の作成履歴</h2>
        <button onClick={() => setView('history')} class="text-sm font-semibold text-[#1261af]">すべて見る →</button>
      </div>
      <div class={`mt-4 overflow-hidden ${card}`}>
        {history === null ? (
          <p class="px-5 py-8 text-sm text-slate-400">読み込み中…</p>
        ) : history.length ? (
          history.slice(0, 5).map((item) => (
            <button key={item.id} onClick={() => startCreate({ historyId: item.id })} class="flex w-full items-center justify-between border-b border-[#edf1f7] px-5 py-4 text-left last:border-0 hover:bg-slate-50">
              <div>
                <p class="font-semibold">{item.orgName || '団体未設定'}</p>
                <p class="mt-1 text-xs text-slate-500">{setName(item.setId)} · {item.rank}{item.author ? ` · ${item.author}` : ''}</p>
              </div>
              <span class="text-xs text-slate-400">{formatDateTime(item.createdAt)}</span>
            </button>
          ))
        ) : (
          <p class="px-5 py-8 text-sm text-slate-500">保存された履歴はまだありません。「新しい発信物を作成」から試してみましょう。</p>
        )}
      </div>
    </section>
  )
}
