import { useEffect, useState } from 'preact/hooks'
import { ArrowLeft, ArrowRight, Clipboard, Printer, Save } from 'lucide-preact'
import { countText, splitXThread } from '../lib/engine.js'
import { Alert, Badge, Button, Eyebrow, Spinner, card, copyText, cx, useApp } from '../ui/ui.jsx'

const fieldCls = 'mt-2 w-full rounded-xl border border-[#dce5f2] p-4 font-normal leading-7 outline-none focus:border-[#3b8dd9] focus:ring-2 focus:ring-blue-100'

// 媒体全体をまとめてコピーするときの形式
export function mediaText(media, fields) {
  const defs = media?.fields?.length ? media.fields : Object.keys(fields).map((k) => ({ fieldKey: k, label: k }))
  const parts = defs.filter((f) => fields[f.fieldKey]).map((f) => (defs.length > 1 && f.fieldKey !== '本文' ? `${f.label}：${fields[f.fieldKey]}` : fields[f.fieldKey]))
  return parts.join('\n\n')
}

const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function Output({ outputs, original, mediaIds, meta, saving, onSave, onBack, onChange }) {
  const { data, notify } = useApp()
  const [active, setActive] = useState(mediaIds[0])
  const [numbering, setNumbering] = useState(false)
  const dirty = JSON.stringify(outputs) !== JSON.stringify(original)
  const media = data.media.find((m) => m.id === active)
  const out = outputs[active]
  const mediaName = (id) => data.media.find((m) => m.id === id)?.name || id

  useEffect(() => {
    if (!dirty) return
    const warn = (e) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const update = (fieldKey, text) => onChange({ ...outputs, [active]: { ...out, fields: { ...out.fields, [fieldKey]: text } } })

  const printAll = () => {
    const w = window.open('', '_blank')
    if (!w) return
    const body = mediaIds.map((id) => `<h2>${escapeHtml(mediaName(id))}</h2><pre>${escapeHtml(mediaText(data.media.find((m) => m.id === id), outputs[id].fields))}</pre>`).join('')
    w.document.write(`<html><head><title>${escapeHtml(meta.orgName || '発信物')}｜生成結果</title><style>body{font-family:system-ui,sans-serif;line-height:1.9;max-width:780px;margin:48px auto;color:#172033}h1{font-size:24px}h2{font-size:16px;margin-top:32px;border-bottom:1px solid #dbe5f0;padding-bottom:8px}pre{white-space:pre-wrap;font:inherit}</style></head><body><p>FSIF｜発信物ジェネレーター</p><h1>${escapeHtml(meta.orgName || '生成結果')}｜${escapeHtml(meta.setName || '')}</h1>${body}<script>window.onload=()=>window.print()<\/script></body></html>`)
    w.document.close()
  }

  const fieldDefs = media?.fields?.length ? media.fields : Object.keys(out?.fields || {}).map((k) => ({ fieldKey: k, label: k }))

  return (
    <section class="space-y-6">
      <div class="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <Eyebrow>GENERATED / READY TO USE</Eyebrow>
          <h1 class="mt-2 text-3xl font-bold tracking-tight">生成結果を確認する</h1>
          <p class="mt-2 text-sm text-slate-500">媒体ごとの文面を確認・修正して、欄ごとにコピーできます。修正はテンプレートには影響しません。</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <Button variant="outline" icon={ArrowLeft} onClick={onBack}>入力に戻る</Button>
          <Button variant="outline" icon={Printer} onClick={printAll}>印刷・PDF保存</Button>
          <Button icon={saving ? Spinner : Save} onClick={() => onSave(outputs)} disabled={!dirty || saving}>修正を保存</Button>
        </div>
      </div>
      <Alert>公開前に団体名・日付・公開範囲を確認してください。{dirty && <strong class="ml-1">未保存の修正があります。</strong>}</Alert>

      <div class="grid gap-6 lg:grid-cols-[230px_minmax(0,1fr)]">
        <aside class={`${card} h-fit p-3`}>
          <p class="px-3 py-2 text-xs font-bold tracking-widest text-slate-400">作成した媒体</p>
          <div class="mt-1 grid gap-1">
            {mediaIds.map((id) => (
              <button key={id} onClick={() => setActive(id)} class={cx('flex items-center justify-between rounded-xl px-3 py-3 text-left text-sm font-semibold', active === id ? 'bg-[#eaf4ff] text-[#1261af]' : 'text-slate-600 hover:bg-slate-50')}>
                <span>{mediaName(id)}</span>
                <ArrowRight class="size-4" />
              </button>
            ))}
          </div>
          <div class="mt-6 rounded-xl bg-[#f6f8fc] p-3 text-xs leading-5 text-slate-500">
            <p class="font-bold text-slate-700">案件情報</p>
            <p class="mt-1">{meta.orgName}</p>
            <p>{meta.setName} · {meta.rank}</p>
            {meta.historyId && <p>履歴ID：{meta.historyId}</p>}
            {meta.author && <p>作成者：{meta.author}</p>}
          </div>
        </aside>

        {out && (
          <div class={`overflow-hidden ${card}`}>
            <div class="flex items-center justify-between gap-3 border-b border-[#edf1f7] px-6 py-4">
              <div>
                <span class="text-xs font-bold tracking-widest text-[#1671c9]">{mediaName(active)}</span>
                <h2 class="mt-1 text-lg font-bold">公開用の文面</h2>
              </div>
              <div class="flex items-center gap-2">
                <Badge tone="green">編集可能</Badge>
                <Button variant="outline" size="sm" icon={Clipboard} onClick={() => copyText(mediaText(media, out.fields), notify)}>すべてコピー</Button>
              </div>
            </div>
            <div class="space-y-6 p-6">
              {fieldDefs.map((f) =>
                f.splitRule === 'スレッド分割' ? (
                  <ThreadField key={`${active}/${f.fieldKey}`} def={f} value={out.fields[f.fieldKey] ?? ''} onInput={(v) => update(f.fieldKey, v)} numbering={numbering} setNumbering={setNumbering} />
                ) : (
                  <TextField key={`${active}/${f.fieldKey}`} def={f} value={out.fields[f.fieldKey] ?? ''} onInput={(v) => update(f.fieldKey, v)} />
                ),
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

function Counter({ count, limit }) {
  if (!limit) return <span class="text-xs text-slate-400">{count}文字</span>
  return <span class={cx('text-xs', count > limit ? 'font-bold text-red-600' : 'text-slate-400')}>{count} / {limit}</span>
}

function TextField({ def, value, onInput }) {
  const { notify } = useApp()
  // 入力中に input と textarea が切り替わるとフォーカスが外れるので、最初の文面で決める
  const [single] = useState(!value.includes('\n') && value.length < 80)
  const count = countText(value, def.countMode)
  return (
    <div>
      <div class="flex items-center justify-between gap-3">
        <span class="text-sm font-semibold">{def.label}</span>
        <div class="flex items-center gap-3">
          <Counter count={count} limit={Number(def.limit) || 0} />
          <Button variant="outline" size="sm" icon={Clipboard} onClick={() => copyText(value, notify)}>コピー</Button>
        </div>
      </div>
      {single ? (
        <input value={value} onInput={(e) => onInput(e.currentTarget.value)} class={cx(fieldCls, 'h-11 py-0')} />
      ) : (
        <textarea value={value} onInput={(e) => onInput(e.currentTarget.value)} class={cx(fieldCls, 'min-h-[320px]')} />
      )}
      {Number(def.limit) > 0 && count > Number(def.limit) && <p class="mt-2 text-sm text-red-600">文字数の上限を超えています。</p>}
    </div>
  )
}

// X：全文を編集し、分割結果を投稿ごとにコピー
function ThreadField({ def, value, onInput, numbering, setNumbering }) {
  const { notify } = useApp()
  const limit = Number(def.limit) || undefined
  const posts = splitXThread(value, { limit, numbering })
  return (
    <div>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <span class="text-sm font-semibold">{def.label}（全文）</span>
        <span class="text-xs text-slate-400">単独行の「---」で投稿を区切ります</span>
      </div>
      <textarea value={value} onInput={(e) => onInput(e.currentTarget.value)} class={cx(fieldCls, 'min-h-[260px]')} />
      <div class="mt-5 flex flex-wrap items-center justify-between gap-3">
        <p class="text-sm font-semibold">スレッド（{posts.length}投稿）</p>
        <label class="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" class="size-4 accent-[#1261af]" checked={numbering} onChange={(e) => setNumbering(e.currentTarget.checked)} />
          (1/3) 形式の番号を付ける
        </label>
      </div>
      <div class="mt-3 grid gap-3">
        {posts.map((p, i) => (
          <div key={i} class={cx('rounded-xl border p-4', p.over ? 'border-red-200 bg-red-50' : 'border-[#e7edf5] bg-[#f9fbfe]')}>
            <div class="flex items-center justify-between gap-3">
              <span class="text-xs font-bold text-slate-500">投稿 {i + 1}</span>
              <div class="flex items-center gap-3">
                <Counter count={p.count} limit={limit || 280} />
                <Button variant="outline" size="sm" icon={Clipboard} onClick={() => copyText(p.text, notify)}>コピー</Button>
              </div>
            </div>
            <p class="mt-2 text-sm leading-6 whitespace-pre-wrap text-slate-700">{p.text}</p>
          </div>
        ))}
      </div>
      <p class="mt-2 text-xs text-slate-400">文字数はX方式（全角2・半角1・URLは23）。上限を超えた投稿は改行・句点の位置で自動分割しています。</p>
    </div>
  )
}
