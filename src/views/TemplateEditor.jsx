import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { ArrowLeft, Calendar, FileText, Save, Scissors } from 'lucide-preact'
import { COMMON_RANK, DOCUMENT_FORMATS, buildContext, countText, extractKeys, formatDate, mockValues, placeholderAt, renderSegments, splitXThread } from '../lib/engine.js'
import { Alert, Badge, Button, Eyebrow, Label, Modal, Spinner, activeOnly, card, copyText, cx, inputCls, useApp } from '../ui/ui.jsx'
import { Segments } from './Create.jsx'

const ITEM_TYPES = ['短文', '長文', '日付', '選択', '数値', 'URL', '画像']
const SAMPLE_DATE = '2026-09-24'

// Google ドキュメントの URL でも ID でも受け付ける
export function docIdFrom(input) {
  const s = String(input || '').trim()
  const m = /\/d\/([a-zA-Z0-9_-]{10,})/.exec(s) || /[?&]id=([a-zA-Z0-9_-]{10,})/.exec(s)
  return m ? m[1] : s
}

export function TemplateEditor({ mode, template, onClose }) {
  const { api, data, adminCall, reload, notify } = useApp()
  const firstMedia = activeOnly(data.media)[0]
  const [meta, setMeta] = useState(() => ({
    name: template ? (mode === 'create' ? `${template.name}（コピー）` : template.name) : '',
    setId: template?.setId || activeOnly(data.sets)[0]?.id || '',
    mediaId: template?.mediaId || firstMedia?.id || '',
    rank: template?.rank || COMMON_RANK,
    format: template?.format || 'テキスト',
    fileId: template?.fileId || '',
  }))
  const [fields, setFields] = useState(() => ({ ...(template?.fields || {}) }))
  const [focus, setFocus] = useState(null) // { fieldKey, start, end }
  const [datePicker, setDatePicker] = useState(null) // { key, replace?: placeholder }
  const [unknownPrompt, setUnknownPrompt] = useState(null)
  const [busy, setBusy] = useState(false)
  const refs = useRef({})
  const pendingCaret = useRef(null)

  const isDocument = DOCUMENT_FORMATS.includes(meta.format)
  const media = data.media.find((m) => m.id === meta.mediaId)
  const fieldDefs = useMemo(() => {
    if (isDocument) return [{ fieldKey: '本文', label: '雛形の内容' }]
    const defs = media?.fields?.length ? [...media.fields] : [{ fieldKey: '本文', label: '本文' }]
    for (const k of Object.keys(fields)) if (!defs.some((d) => d.fieldKey === k)) defs.push({ fieldKey: k, label: `${k}（この媒体に無い欄）`, orphan: true })
    return defs
  }, [media, fields, isDocument])

  const items = activeOnly(data.items)
  const itemsByKey = Object.fromEntries(data.items.map((i) => [i.key, i]))
  const settingKeys = data.settings.map((s) => s.key)
  const ctx = buildContext({ values: mockValues(data.items), items: data.items, settings: data.settings })

  useEffect(() => {
    if (!pendingCaret.current) return
    const { fieldKey, pos } = pendingCaret.current
    const el = refs.current[fieldKey]
    if (el) {
      el.focus()
      el.setSelectionRange(pos, pos)
    }
    pendingCaret.current = null
  })

  const activeKey = focus?.fieldKey && fieldDefs.some((d) => d.fieldKey === focus.fieldKey) ? focus.fieldKey : fieldDefs[fieldDefs.length > 1 ? 1 : 0]?.fieldKey

  // カーソル位置に挿入（範囲選択中なら置き換え）。書類の場合は Google ドキュメントに貼り付けるためにコピーする
  const insert = (text, range) => {
    if (isDocument) return copyText(text.trim(), notify)
    const key = activeKey
    const cur = fields[key] ?? ''
    const start = range?.start ?? (focus?.fieldKey === key ? focus.start : cur.length)
    const end = range?.end ?? (focus?.fieldKey === key ? focus.end : cur.length)
    setFields({ ...fields, [key]: cur.slice(0, start) + text + cur.slice(end) })
    pendingCaret.current = { fieldKey: key, pos: start + text.length }
    setFocus({ fieldKey: key, start: start + text.length, end: start + text.length })
  }

  const trackCaret = (fieldKey) => (e) => {
    const el = e.currentTarget
    setFocus({ fieldKey, start: el.selectionStart, end: el.selectionEnd })
    // 挿入済みの日付項目をクリックしたら書式を選び直せるようにする
    if (e.type === 'click') {
      const p = placeholderAt(el.value, el.selectionStart)
      if (p && itemsByKey[p.key]?.type === '日付') setDatePicker({ key: p.key, replace: p, fieldKey })
    }
  }

  const clickItem = (item) => {
    if (item.type === '日付') setDatePicker({ key: item.key })
    else insert(`{{${item.key}}}`)
  }

  const chooseDateFormat = (fmt) => {
    const token = fmt ? `{{${datePicker.key}:${fmt}}}` : `{{${datePicker.key}}}`
    if (datePicker.replace) {
      const cur = fields[datePicker.fieldKey] ?? ''
      setFields({ ...fields, [datePicker.fieldKey]: cur.slice(0, datePicker.replace.start) + token + cur.slice(datePicker.replace.end) })
    } else insert(token)
    setDatePicker(null)
  }

  const usedKeys = extractKeys(Object.values(fields))
  const unknownKeys = usedKeys.filter((k) => !itemsByKey[k] && !settingKeys.includes(k))

  const save = async (skipUnknownCheck) => {
    if (!skipUnknownCheck && unknownKeys.length) {
      setUnknownPrompt(unknownKeys.map((k) => ({ key: k, register: true, category: '案件', type: '短文' })))
      return
    }
    setBusy(true)
    try {
      const cleaned = Object.fromEntries(Object.entries(fields).filter(([k, v]) => fieldDefs.some((d) => d.fieldKey === k && !d.orphan) || v.trim()))
      const payload = { entity: 'templates', data: meta, children: { fields: cleaned } }
      if (mode === 'edit') {
        if (!(await adminCall('update', { ...payload, key: template.id }))) return
      } else {
        await api.call('create', payload)
      }
      await reload()
      notify(mode === 'edit' ? 'テンプレートを更新しました' : 'テンプレートを追加しました')
      onClose()
    } catch (e) {
      notify(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const registerUnknown = async (rows) => {
    setBusy(true)
    try {
      for (const r of rows.filter((x) => x.register)) {
        await api.call('create', { entity: 'items', data: { key: r.key, label: r.key, category: r.category, type: r.type, order: '' } })
      }
      await reload()
      setUnknownPrompt(null)
    } catch (e) {
      notify(e.message, 'error')
      return
    } finally {
      setBusy(false)
    }
    await save(true)
  }

  const [loadingDoc, setLoadingDoc] = useState(false)
  const loadDocument = async () => {
    setLoadingDoc(true)
    try {
      const { text } = await api.call('readDocument', { fileId: meta.fileId })
      setFields({ 本文: text })
      notify('雛形を読み込みました')
    } catch (e) {
      notify(e.message, 'error')
    } finally {
      setLoadingDoc(false)
    }
  }

  const canSave = meta.name.trim() && meta.setId && meta.mediaId && meta.rank && !busy && (!isDocument || (meta.fileId && fields['本文']))
  const activeDef = fieldDefs.find((d) => d.fieldKey === activeKey)

  return (
    <section>
      <div class="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <button onClick={onClose} class="mb-3 flex items-center gap-1 text-sm font-semibold text-[#1261af]">
            <ArrowLeft class="size-4" /> テンプレート一覧に戻る
          </button>
          <Eyebrow>TEMPLATE / {mode === 'edit' ? `EDIT ${template.id}` : 'NEW'}</Eyebrow>
          <h1 class="mt-2 text-2xl font-bold">{mode === 'edit' ? 'テンプレートを編集' : 'テンプレートを追加'}</h1>
        </div>
        <div class="flex gap-2">
          <Button variant="outline" onClick={onClose}>キャンセル</Button>
          <Button icon={busy ? Spinner : Save} onClick={() => save(false)} disabled={!canSave}>{mode === 'edit' ? '保存（管理者）' : '追加'}</Button>
        </div>
      </div>

      <div class="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(380px,0.9fr)]">
        <div class="space-y-6">
          <div class={`${card} grid gap-4 p-6 md:grid-cols-2`}>
            <Label label="テンプレ名" required class="md:col-span-2">
              <input value={meta.name} onInput={(e) => setMeta({ ...meta, name: e.currentTarget.value })} class={inputCls} />
            </Label>
            <Label label="セット" required>
              <select value={meta.setId} onChange={(e) => setMeta({ ...meta, setId: e.currentTarget.value })} class={inputCls}>
                {data.sets.map((s) => <option key={s.id} value={s.id}>{s.name}{s.active === false ? '（無効）' : ''}</option>)}
              </select>
            </Label>
            <Label label="媒体" required>
              <select value={meta.mediaId} onChange={(e) => setMeta({ ...meta, mediaId: e.currentTarget.value })} class={inputCls}>
                {data.media.map((m) => <option key={m.id} value={m.id}>{m.name}{m.active === false ? '（無効）' : ''}</option>)}
              </select>
            </Label>
            <Label label="ランク" required hint="「共通」はランク専用のテンプレートがない場合に使われます">
              <select value={meta.rank} onChange={(e) => setMeta({ ...meta, rank: e.currentTarget.value })} class={inputCls}>
                <option value={COMMON_RANK}>{COMMON_RANK}</option>
                {data.ranks.map((r) => <option key={r.name} value={r.name}>{r.name}</option>)}
              </select>
            </Label>
            <Label label="出力形式" hint="PDF・Docx は Google ドキュメントの雛形に差し込んで書き出します">
              <select
                value={meta.format}
                onChange={(e) => {
                  const format = e.currentTarget.value
                  // テキストと書類を切り替えたら本文は引き継がない
                  if (DOCUMENT_FORMATS.includes(format) !== isDocument) setFields({})
                  setMeta({ ...meta, format })
                }}
                class={inputCls}
              >
                <option>テキスト</option>
                {DOCUMENT_FORMATS.map((f) => <option key={f}>{f}</option>)}
              </select>
            </Label>
          </div>

          {isDocument && (
            <div class={`${card} p-6`}>
              <h2 class="font-bold">雛形の Google ドキュメント</h2>
              <ol class="mt-2 list-decimal space-y-1 pl-5 text-xs leading-5 text-slate-500">
                <li>Word ファイルはドライブにアップロードし、「ファイル → Google ドキュメントとして保存」で変換する</li>
                <li>差し込みたい箇所に {'{{団体名}}'} のように書く（下の項目をクリックするとコピーできます）</li>
                <li>ドキュメントの URL を貼り付けて「読み込む」</li>
              </ol>
              <div class="mt-4 flex gap-2">
                <input
                  value={meta.fileId}
                  onInput={(e) => {
                    setMeta({ ...meta, fileId: docIdFrom(e.currentTarget.value) })
                    setFields({})
                  }}
                  placeholder="https://docs.google.com/document/d/…"
                  class={cx(inputCls, 'mt-0 font-mono')}
                />
                <Button variant="outline" icon={loadingDoc ? Spinner : FileText} onClick={loadDocument} disabled={!meta.fileId || loadingDoc}>読み込む</Button>
              </div>
              <p class="mt-2 text-xs text-slate-400">雛形を直したら、ここで保存し直すと差し込み項目とプレビューが更新されます。</p>
            </div>
          )}

          <div class={`${card} p-6`}>
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 class="font-bold">項目を差し込む</h2>
                <p class="mt-1 text-xs text-slate-500">
                  {isDocument ? 'クリックで {{項目名}} をコピーします。雛形の Google ドキュメントに貼り付けてください。' : `クリックで「${activeDef?.label || '本文'}」のカーソル位置に挿入します。`}日付は書式を選べます。
                </p>
              </div>
              {!isDocument && <Button variant="outline" size="sm" icon={Scissors} onClick={() => insert('\n---\n')} title="X のスレッドで次の投稿に分ける区切りを入れます">X区切り</Button>}
            </div>
            {[['団体', '団体情報'], ['案件', '案件情報']].map(([cat, title]) => (
              <div key={cat} class="mt-4">
                <p class="text-xs font-bold text-slate-400">{title}</p>
                <div class="mt-2 flex flex-wrap gap-1.5">
                  {items.filter((i) => i.category === cat).map((i) => (
                    <button key={i.key} onClick={() => clickItem(i)} class={cx('inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium', usedKeys.includes(i.key) ? 'border-[#9bdcc5] bg-[#effcf6] text-[#17634f]' : 'border-[#dce5f2] bg-white text-slate-600 hover:border-[#3b8dd9]')}>
                      {i.type === '日付' && <Calendar class="size-3" />}
                      {i.label || i.key}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <div class="mt-4">
              <p class="text-xs font-bold text-slate-400">共通設定</p>
              <div class="mt-2 flex flex-wrap gap-1.5">
                {data.settings.map((s) => (
                  <button key={s.key} onClick={() => insert(`{{${s.key}}}`)} class={cx('rounded-lg border px-2.5 py-1 text-xs font-medium', usedKeys.includes(s.key) ? 'border-[#9bdcc5] bg-[#effcf6] text-[#17634f]' : 'border-[#dce5f2] bg-white text-slate-600 hover:border-[#3b8dd9]')}>
                    {s.key}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div class={`${card} space-y-5 p-6`}>
            {isDocument && (
              <div>
                <span class="text-sm font-semibold">雛形の内容（読み込み結果）</span>
                <div class="mt-2 max-h-[420px] min-h-24 overflow-auto rounded-xl border border-[#dce5f2] bg-[#f9fbfe] p-3 font-mono text-sm leading-6 whitespace-pre-wrap text-slate-600">
                  {fields['本文'] || '「読み込む」を押すと、雛形の本文がここに表示されます。'}
                </div>
              </div>
            )}
            {!isDocument && fieldDefs.map((d) => (
              <div key={d.fieldKey}>
                <div class="flex items-center justify-between gap-2">
                  <span class={cx('text-sm font-semibold', activeKey === d.fieldKey && 'text-[#1261af]')}>{d.label}</span>
                  <span class="flex gap-1">
                    {d.splitRule === 'スレッド分割' && <Badge>--- で投稿を分割</Badge>}
                    {d.limit ? <Badge tone="gray">上限 {d.limit}（{d.countMode}）</Badge> : null}
                  </span>
                </div>
                <textarea
                  ref={(el) => (refs.current[d.fieldKey] = el)}
                  value={fields[d.fieldKey] ?? ''}
                  onInput={(e) => {
                    setFields({ ...fields, [d.fieldKey]: e.currentTarget.value })
                    trackCaret(d.fieldKey)(e)
                  }}
                  onClick={trackCaret(d.fieldKey)}
                  onKeyUp={trackCaret(d.fieldKey)}
                  onFocus={trackCaret(d.fieldKey)}
                  class={cx('mt-2 w-full rounded-xl border p-3 font-mono text-sm leading-6 outline-none focus:ring-2 focus:ring-blue-100', d.orphan ? 'border-amber-200' : 'border-[#dce5f2] focus:border-[#3b8dd9]', (fields[d.fieldKey] || '').includes('\n') || d.fieldKey === '本文' ? 'min-h-[260px]' : 'min-h-12')}
                />
              </div>
            ))}
            {unknownKeys.length > 0 && <Alert>未登録の項目：{unknownKeys.join('、')}（保存時に登録を確認します）</Alert>}
          </div>
        </div>

        <TemplatePreview fieldDefs={fieldDefs} fields={fields} ctx={ctx} />
      </div>

      {datePicker && (
        <Modal title={`「${itemsByKey[datePicker.key]?.label || datePicker.key}」の書式`} onClose={() => setDatePicker(null)}>
          <div class="grid gap-2">
            <button onClick={() => chooseDateFormat('')} class={cx('flex items-center justify-between rounded-xl border p-3 text-left text-sm hover:border-[#3b8dd9]', datePicker.replace && !datePicker.replace.format ? 'border-[#3b8dd9] bg-[#eef7ff]' : 'border-[#e7edf5]')}>
              <span>項目の標準書式（{itemsByKey[datePicker.key]?.format || 'YYYY年M月D日'}）</span>
              <span class="text-slate-500">{formatDate(SAMPLE_DATE, itemsByKey[datePicker.key]?.format || undefined)}</span>
            </button>
            {activeOnly(data.dateFormats).map((f) => (
              <button key={f.format} onClick={() => chooseDateFormat(f.format)} class={cx('flex items-center justify-between rounded-xl border p-3 text-left text-sm hover:border-[#3b8dd9]', datePicker.replace?.format === f.format ? 'border-[#3b8dd9] bg-[#eef7ff]' : 'border-[#e7edf5]')}>
                <span class="font-mono">{f.format}</span>
                <span class="text-slate-500">{formatDate(SAMPLE_DATE, f.format)}</span>
              </button>
            ))}
          </div>
          <p class="mt-3 text-xs text-slate-400">書式の候補は管理画面の「日付書式」で追加できます。</p>
        </Modal>
      )}

      {unknownPrompt && <UnknownItemsModal rows={unknownPrompt} busy={busy} onCancel={() => setUnknownPrompt(null)} onSubmit={registerUnknown} />}
    </section>
  )
}

function TemplatePreview({ fieldDefs, fields, ctx }) {
  return (
    <div class="h-fit self-start rounded-2xl border border-[#9bdcc5] bg-[#f0fff9] p-5 shadow-sm xl:sticky xl:top-6">
      <p class="text-xs font-bold tracking-[0.18em] text-[#16866b]">PREVIEW / MOCK DATA</p>
      <h2 class="mt-1 font-bold text-[#17483e]">入力例を差し込んだプレビュー</h2>
      <div class="mt-4 max-h-[760px] space-y-5 overflow-auto rounded-xl border border-[#b7e8d7] bg-white p-5 text-sm leading-7 text-slate-700">
        {fieldDefs.map((d) => {
          const segments = renderSegments(fields[d.fieldKey] ?? '', ctx)
          const text = segments.map((s) => (s.missing ? '' : s.text)).join('')
          if (d.splitRule === 'スレッド分割') {
            const limit = Number(d.limit) || undefined
            const posts = splitXThread(text, { limit })
            return (
              <div key={d.fieldKey}>
                <p class="text-xs font-bold text-slate-400">{d.label}（{posts.length}投稿）</p>
                <div class="mt-2 grid gap-2">
                  {posts.map((p, i) => (
                    <div key={i} class={cx('rounded-lg border p-3', p.over ? 'border-red-200 bg-red-50' : 'border-[#e7edf5]')}>
                      <p class={cx('text-right text-xs', p.over ? 'font-bold text-red-600' : 'text-slate-400')}>{i + 1}　{p.count} / {limit || 280}</p>
                      <p class="whitespace-pre-wrap">{p.text}</p>
                    </div>
                  ))}
                </div>
              </div>
            )
          }
          const count = countText(text, d.countMode)
          return (
            <div key={d.fieldKey}>
              <p class="flex justify-between text-xs font-bold text-slate-400">
                <span>{d.label}</span>
                <span class={cx(d.limit && count > d.limit && 'text-red-600')}>{count}{d.limit ? ` / ${d.limit}` : '文字'}</span>
              </p>
              <div class="mt-1 whitespace-pre-wrap"><Segments segments={segments} /></div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function UnknownItemsModal({ rows: initial, busy, onCancel, onSubmit }) {
  const [rows, setRows] = useState(initial)
  const set = (i, prop, v) => setRows(rows.map((r, j) => (j === i ? { ...r, [prop]: v } : r)))
  const small = 'h-9 rounded-lg border border-[#dce5f2] bg-white px-2 text-sm'
  return (
    <Modal
      title="新しい項目として登録しますか？"
      onClose={onCancel}
      wide
      footer={
        <>
          <Button variant="outline" onClick={onCancel}>戻る</Button>
          <Button onClick={() => onSubmit(rows)} disabled={busy}>{busy && <Spinner />}登録して保存</Button>
        </>
      }
    >
      <p class="mb-4 text-sm text-slate-500">テンプレートに入力項目・共通設定のどちらにもない名前があります。登録しない項目は、生成時に空欄になります。</p>
      <div class="grid gap-2">
        {rows.map((r, i) => (
          <div key={r.key} class="flex flex-wrap items-center gap-3 rounded-xl border border-[#e7edf5] p-3">
            <label class="flex min-w-40 flex-1 items-center gap-2 text-sm font-semibold">
              <input type="checkbox" class="size-4 accent-[#1261af]" checked={r.register} onChange={(e) => set(i, 'register', e.currentTarget.checked)} />
              {`{{${r.key}}}`}
            </label>
            <select value={r.category} onChange={(e) => set(i, 'category', e.currentTarget.value)} disabled={!r.register} class={small}>
              <option value="案件">区分：案件</option>
              <option value="団体">区分：団体</option>
            </select>
            <select value={r.type} onChange={(e) => set(i, 'type', e.currentTarget.value)} disabled={!r.register} class={small}>
              {ITEM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        ))}
      </div>
    </Modal>
  )
}
