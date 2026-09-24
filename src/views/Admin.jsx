import { useState } from 'preact/hooks'
import { Ban, Copy, Lock, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-preact'
import { COMMON_RANK, formatDate } from '../lib/engine.js'
import { Alert, Badge, Button, Empty, Eyebrow, ItemInput, Label, Modal, Spinner, card, cx, formatDateTime, inputCls, textareaCls, useApp } from '../ui/ui.jsx'
import { TemplateEditor } from './TemplateEditor.jsx'

const ITEM_TYPES = ['短文', '長文', '日付', '選択', '数値', 'URL', '画像']
const today = () => new Date().toISOString().slice(0, 10)

// 一覧の列と、追加・編集フォームの項目
const ENTITIES = [
  { id: 'templates', label: 'テンプレート' },
  {
    id: 'sets', label: 'セット', key: 'id',
    columns: [['id', 'ID'], ['name', 'セット名'], ['description', '説明'], ['order', '並び順']],
    fields: [{ prop: 'name', label: 'セット名', required: true }, { prop: 'description', label: '説明', type: 'textarea' }, { prop: 'order', label: '並び順', type: 'number' }],
  },
  {
    id: 'media', label: '媒体', key: 'id',
    columns: [['id', 'ID'], ['name', '媒体名'], ['fieldSummary', '欄'], ['order', '並び順']],
    fields: [{ prop: 'name', label: '媒体名', required: true }, { prop: 'order', label: '並び順', type: 'number' }],
    children: 'mediaFields',
  },
  {
    id: 'items', label: '入力項目', key: 'key',
    columns: [['key', '項目キー'], ['label', '表示名'], ['category', '区分'], ['type', '入力タイプ'], ['required', '必須'], ['example', '入力例'], ['order', '並び順']],
    fields: [
      { prop: 'key', label: '項目キー', required: true, keyField: true, hint: 'テンプレートで {{項目キー}} として使います。登録後は変更できません。' },
      { prop: 'label', label: '表示名', hint: '空欄なら項目キーと同じ' },
      { prop: 'category', label: '区分', type: 'select', options: ['案件', '団体'], hint: '「団体」にすると団体マスタに列が追加されます' },
      { prop: 'type', label: '入力タイプ', type: 'select', options: ITEM_TYPES },
      { prop: 'options', label: '選択肢（カンマ区切り）', show: (o) => o.type === '選択' },
      { prop: 'format', label: '標準の日付書式', type: 'dateFormat', show: (o) => o.type === '日付' },
      { prop: 'required', label: '必須', type: 'checkbox' },
      { prop: 'defaultValue', label: '初期値' },
      { prop: 'example', label: '入力例', hint: '入力欄のヒントとテンプレート編集のプレビューに使います' },
      { prop: 'order', label: '並び順', type: 'number' },
    ],
    defaults: { category: '案件', type: '短文' },
  },
  {
    id: 'ranks', label: 'ランク', key: 'name',
    columns: [['name', 'ランク名'], ['order', '並び順']],
    fields: [{ prop: 'name', label: 'ランク名', required: true, keyField: true, hint: `登録後は変更できません。「${COMMON_RANK}」は使えません。` }, { prop: 'order', label: '並び順', type: 'number' }],
  },
  {
    id: 'dateFormats', label: '日付書式', key: 'format',
    columns: [['format', '書式'], ['label', '表示名'], ['sample', '例（今日）'], ['order', '並び順']],
    fields: [
      { prop: 'format', label: '書式', required: true, keyField: true, hint: 'YYYY=年 / M・MM=月 / D・DD=日 / 曜=曜日。例：M/D(曜)' },
      { prop: 'label', label: '表示名', hint: '空欄なら書式と同じ' },
      { prop: 'order', label: '並び順', type: 'number' },
    ],
  },
  { id: 'orgs', label: '団体マスタ', key: 'id' },
  {
    id: 'settings', label: '共通設定', key: 'key', noDeactivate: true,
    columns: [['key', '項目キー'], ['value', '値'], ['description', '説明']],
    fields: [
      { prop: 'key', label: '項目キー', required: true, keyField: true, hint: 'テンプレートで {{項目キー}} として使います' },
      { prop: 'value', label: '値', type: 'textarea' },
      { prop: 'description', label: '説明' },
    ],
  },
]

export function Admin() {
  const { data, isAdmin, requireAdmin } = useApp()
  const [tab, setTab] = useState('templates')
  const [editor, setEditor] = useState(null)

  if (editor) return <TemplateEditor {...editor} onClose={() => setEditor(null)} />

  const def = ENTITIES.find((e) => e.id === tab)
  return (
    <section>
      <div class="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <Eyebrow>SETTINGS / ADMIN</Eyebrow>
          <h1 class="mt-2 text-3xl font-bold">管理</h1>
          <p class="mt-2 text-sm text-slate-500">一覧の閲覧と新規追加はどなたでもできます。既存データの編集・無効化には管理者パスワードが必要です。</p>
        </div>
        {!isAdmin && (
          <Button variant="outline" icon={Lock} onClick={requireAdmin}>管理者パスワードを入力</Button>
        )}
      </div>
      <div class="mt-6 flex flex-wrap gap-1 rounded-xl bg-[#eef2f8] p-1 text-sm font-medium">
        {ENTITIES.map((e) => (
          <button key={e.id} onClick={() => setTab(e.id)} class={cx('rounded-lg px-3 py-2', tab === e.id ? 'bg-white text-[#1261af] shadow-sm' : 'text-slate-500 hover:text-slate-700')}>
            {e.label}
            <span class="ml-1 text-xs text-slate-400">{(data[e.id] || []).length}</span>
          </button>
        ))}
      </div>
      <div class="mt-6">
        {tab === 'templates' ? <TemplateList onOpen={setEditor} /> : tab === 'orgs' ? <EntityTab key="orgs" def={orgDef(data)} /> : <EntityTab key={tab} def={def} />}
      </div>
    </section>
  )
}

// 団体マスタの列は「区分＝団体」の入力項目から決まる
function orgDef(data) {
  const byKey = Object.fromEntries(data.items.map((i) => [i.key, i]))
  const cols = data.orgColumns
  return {
    id: 'orgs', label: '団体', key: 'id',
    columns: [['id', 'ID'], ...cols.slice(0, 3).map((k) => [`values.${k}`, byKey[k]?.label || k]), ['updatedAt', '更新日時']],
    fields: cols.map((k) => ({ prop: `values.${k}`, label: byKey[k]?.label || k, required: k === '団体名', item: byKey[k] || { key: k, type: '短文' } })),
  }
}

const getProp = (obj, prop) => (prop.startsWith('values.') ? obj.values?.[prop.slice(7)] : obj[prop])

function setProp(obj, prop, value) {
  if (prop.startsWith('values.')) return { ...obj, values: { ...obj.values, [prop.slice(7)]: value } }
  return { ...obj, [prop]: value }
}

// 管理者操作（編集・無効化）の共通ボタン
function useAdminActions(entity) {
  const { adminCall, reload, notify } = useApp()
  const setActive = async (key, active, label) => {
    if (!active && !confirm(`「${label}」を無効化しますか？（削除はされず、一覧で「無効」になります。過去の履歴には影響しません）`)) return
    try {
      if (await adminCall('deactivate', { entity, key, active })) {
        await reload()
        notify(active ? '有効にしました' : '無効化しました')
      }
    } catch (e) {
      notify(e.message, 'error')
    }
  }
  return { setActive }
}

function RowActions({ record, def, onEdit, extra }) {
  const { requireAdmin } = useApp()
  const { setActive } = useAdminActions(def.id)
  const key = getProp(record, def.key)
  const label = record.name || record.values?.['団体名'] || record.label || key
  return (
    <div class="flex justify-end gap-1">
      {extra}
      <Button variant="ghost" size="sm" icon={Pencil} onClick={async () => (await requireAdmin()) && onEdit(record)}>編集</Button>
      {!def.noDeactivate &&
        (record.active === false ? (
          <Button variant="ghost" size="sm" icon={RotateCcw} onClick={() => setActive(key, true, label)}>有効にする</Button>
        ) : (
          <Button variant="ghost" size="sm" icon={Ban} onClick={() => setActive(key, false, label)}>無効化</Button>
        ))}
    </div>
  )
}

function useShowInactive() {
  const [show, setShow] = useState(false)
  const toggle = (
    <label class="flex items-center gap-2 text-sm text-slate-500">
      <input type="checkbox" class="size-4 accent-[#1261af]" checked={show} onChange={(e) => setShow(e.currentTarget.checked)} />
      無効なものも表示
    </label>
  )
  return [show, toggle]
}

function cellText(def, record, prop) {
  if (prop === 'fieldSummary') return record.fields.map((f) => f.label || f.fieldKey).join('・')
  if (prop === 'sample') return formatDate(today(), record.format)
  if (prop === 'updatedAt') return formatDateTime(record.updatedAt)
  const v = getProp(record, prop)
  if (v === true) return '○'
  if (v === false) return ''
  return String(v ?? '')
}

function EntityTab({ def }) {
  const { data } = useApp()
  const [form, setForm] = useState(null)
  const [showInactive, inactiveToggle] = useShowInactive()
  const rows = (data[def.id] || []).filter((r) => showInactive || r.active !== false)
  return (
    <div class={card}>
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-[#edf1f7] px-5 py-4">
        <h2 class="font-bold">{def.label}</h2>
        <div class="flex items-center gap-4">
          {!def.noDeactivate && inactiveToggle}
          <Button size="sm" icon={Plus} onClick={() => setForm({ mode: 'create', record: { ...(def.defaults || {}), values: {}, fields: [] } })}>新規追加</Button>
        </div>
      </div>
      {rows.length ? (
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-[#edf1f7] text-left text-xs text-slate-400">
                {def.columns.map(([p, l]) => <th key={p} class="px-5 py-3 font-semibold whitespace-nowrap">{l}</th>)}
                <th class="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={getProp(r, def.key)} class={cx('border-b border-[#f1f4f9] last:border-0', r.active === false && 'text-slate-400')}>
                  {def.columns.map(([p], i) => (
                    <td key={p} class="max-w-xs truncate px-5 py-3" title={cellText(def, r, p)}>
                      {cellText(def, r, p)}
                      {i === 0 && r.active === false && <span class="ml-2"><Badge tone="gray">無効</Badge></span>}
                    </td>
                  ))}
                  <td class="px-5 py-2">
                    <RowActions record={r} def={def} onEdit={(rec) => setForm({ mode: 'edit', record: JSON.parse(JSON.stringify(rec)) })} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty>まだ登録がありません。</Empty>
      )}
      {form && <EntityForm def={def} {...form} onClose={() => setForm(null)} />}
    </div>
  )
}

function EntityForm({ def, mode, record, onClose }) {
  const { api, data, adminCall, reload, notify } = useApp()
  const [obj, setObj] = useState(record)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const fields = def.fields.filter((f) => !f.show || f.show(obj))
  const missing = fields.filter((f) => f.required && !String(getProp(obj, f.prop) ?? '').trim())

  const save = async () => {
    setBusy(true)
    setError('')
    const payload = { entity: def.id, data: {} }
    for (const f of def.fields) {
      if (f.prop.startsWith('values.')) payload.data.values = obj.values
      else if (!(mode === 'edit' && f.keyField)) payload.data[f.prop] = obj[f.prop] ?? ''
    }
    if (def.children === 'mediaFields') payload.children = { fields: obj.fields }
    try {
      if (mode === 'create') {
        await api.call('create', payload)
      } else {
        payload.key = getProp(record, def.key)
        if (!(await adminCall('update', payload))) return
      }
      await reload()
      notify(mode === 'create' ? '追加しました' : '更新しました')
      onClose()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={`${def.label}を${mode === 'create' ? '追加' : '編集'}`}
      onClose={onClose}
      wide={def.children === 'mediaFields'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>キャンセル</Button>
          <Button onClick={save} disabled={busy || missing.length > 0}>{busy && <Spinner />}{mode === 'create' ? '追加' : '保存'}</Button>
        </>
      }
    >
      <div class="grid gap-4">
        {fields.map((f) => (
          <FieldInput key={f.prop} field={f} value={getProp(obj, f.prop)} disabled={mode === 'edit' && f.keyField} onChange={(v) => setObj(setProp(obj, f.prop, v))} dateFormats={data.dateFormats} />
        ))}
        {def.children === 'mediaFields' && <MediaFieldsEditor fields={obj.fields || []} onChange={(list) => setObj({ ...obj, fields: list })} />}
        {error && <Alert tone="red">{error}</Alert>}
      </div>
    </Modal>
  )
}

function FieldInput({ field, value, onChange, disabled, dateFormats }) {
  if (field.item) {
    return (
      <Label label={field.label} required={field.required}>
        <ItemInput item={field.item} value={value} onInput={onChange} disabled={disabled} />
      </Label>
    )
  }
  if (field.type === 'checkbox') {
    return (
      <label class="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" class="size-4 accent-[#1261af]" checked={value === true} onChange={(e) => onChange(e.currentTarget.checked)} disabled={disabled} />
        {field.label}
      </label>
    )
  }
  let input
  if (field.type === 'textarea') input = <textarea value={value ?? ''} onInput={(e) => onChange(e.currentTarget.value)} disabled={disabled} class={textareaCls} />
  else if (field.type === 'select' || field.type === 'dateFormat') {
    const options = field.type === 'dateFormat' ? [['', '（指定なし：YYYY年M月D日）'], ...dateFormats.filter((d) => d.active !== false).map((d) => [d.format, `${d.format}（${formatDate(today(), d.format)}）`])] : field.options.map((o) => [o, o])
    input = (
      <select value={value ?? ''} onChange={(e) => onChange(e.currentTarget.value)} disabled={disabled} class={inputCls}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    )
  } else input = <input type={field.type === 'number' ? 'number' : 'text'} value={value ?? ''} onInput={(e) => onChange(e.currentTarget.value)} disabled={disabled} class={inputCls} />
  return (
    <Label label={field.label} required={field.required} hint={field.hint}>
      {input}
    </Label>
  )
}

// 媒体欄（件名・本文など）の編集
function MediaFieldsEditor({ fields, onChange }) {
  const set = (i, prop, v) => onChange(fields.map((f, j) => (j === i ? { ...f, [prop]: v } : f)))
  const small = 'h-9 w-full rounded-lg border border-[#dce5f2] bg-white px-2 text-sm outline-none focus:border-[#3b8dd9]'
  return (
    <div>
      <div class="flex items-center justify-between">
        <p class="text-sm font-medium">欄（出力画面の入力欄とコピー単位）</p>
        <Button variant="outline" size="sm" icon={Plus} onClick={() => onChange([...fields, { fieldKey: '', label: '', limit: '', countMode: '通常', splitRule: 'なし', order: fields.length + 1 }])}>欄を追加</Button>
      </div>
      <div class="mt-2 overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-xs text-slate-400">
              <th class="py-2 pr-2 font-semibold">欄キー</th>
              <th class="py-2 pr-2 font-semibold">表示名</th>
              <th class="py-2 pr-2 font-semibold">文字数上限</th>
              <th class="py-2 pr-2 font-semibold">数え方</th>
              <th class="py-2 pr-2 font-semibold">分割ルール</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {fields.map((f, i) => (
              <tr key={i}>
                <td class="py-1 pr-2"><input value={f.fieldKey} onInput={(e) => set(i, 'fieldKey', e.currentTarget.value)} placeholder="本文" class={small} /></td>
                <td class="py-1 pr-2"><input value={f.label} onInput={(e) => set(i, 'label', e.currentTarget.value)} class={small} /></td>
                <td class="py-1 pr-2"><input type="number" value={f.limit} onInput={(e) => set(i, 'limit', e.currentTarget.value)} placeholder="無制限" class={small} /></td>
                <td class="py-1 pr-2">
                  <select value={f.countMode} onChange={(e) => set(i, 'countMode', e.currentTarget.value)} class={small}>
                    <option>通常</option>
                    <option>X方式</option>
                  </select>
                </td>
                <td class="py-1 pr-2">
                  <select value={f.splitRule} onChange={(e) => set(i, 'splitRule', e.currentTarget.value)} class={small}>
                    <option>なし</option>
                    <option>スレッド分割</option>
                  </select>
                </td>
                <td class="py-1">
                  <button onClick={() => onChange(fields.filter((_, j) => j !== i))} class="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="欄を削除">
                    <Trash2 class="size-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p class="mt-1 text-xs text-slate-400">表の上から順に並びます。X は「数え方：X方式」「分割ルール：スレッド分割」にします。</p>
    </div>
  )
}

function TemplateList({ onOpen }) {
  const { data } = useApp()
  const [setFilter, setSetFilter] = useState('')
  const [showInactive, inactiveToggle] = useShowInactive()
  const def = { id: 'templates', key: 'id' }
  const name = (list, id) => list.find((x) => x.id === id)?.name || id
  const mediaOrder = Object.fromEntries(data.media.map((m, i) => [m.id, i]))
  const rows = data.templates
    .filter((t) => (showInactive || t.active !== false) && (!setFilter || t.setId === setFilter))
    .sort((a, b) => a.setId.localeCompare(b.setId) || mediaOrder[a.mediaId] - mediaOrder[b.mediaId] || a.id.localeCompare(b.id))
  return (
    <div class={card}>
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-[#edf1f7] px-5 py-4">
        <div class="flex items-center gap-3">
          <h2 class="font-bold">テンプレート</h2>
          <select value={setFilter} onChange={(e) => setSetFilter(e.currentTarget.value)} class="h-8 rounded-lg border border-[#dce5f2] bg-white px-2 text-sm">
            <option value="">すべてのセット</option>
            {data.sets.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div class="flex items-center gap-4">
          {inactiveToggle}
          <Button size="sm" icon={Plus} onClick={() => onOpen({ mode: 'create' })}>新規追加</Button>
        </div>
      </div>
      {rows.length ? (
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-[#edf1f7] text-left text-xs text-slate-400">
                {['ID', 'テンプレ名', 'セット', '媒体', 'ランク', '出力形式', '更新日時'].map((h) => <th key={h} class="px-5 py-3 font-semibold whitespace-nowrap">{h}</th>)}
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id} class={cx('border-b border-[#f1f4f9] last:border-0', t.active === false && 'text-slate-400')}>
                  <td class="px-5 py-3 whitespace-nowrap">{t.id}{t.active === false && <span class="ml-2"><Badge tone="gray">無効</Badge></span>}</td>
                  <td class="px-5 py-3">{t.name}</td>
                  <td class="px-5 py-3 whitespace-nowrap">{name(data.sets, t.setId)}</td>
                  <td class="px-5 py-3 whitespace-nowrap">{name(data.media, t.mediaId)}</td>
                  <td class="px-5 py-3 whitespace-nowrap"><Badge tone={t.rank === COMMON_RANK ? 'gray' : 'blue'}>{t.rank}</Badge></td>
                  <td class="px-5 py-3 whitespace-nowrap">{t.format}</td>
                  <td class="px-5 py-3 whitespace-nowrap text-xs text-slate-400">{formatDateTime(t.updatedAt)}</td>
                  <td class="px-5 py-2">
                    <RowActions
                      record={t}
                      def={def}
                      onEdit={(rec) => onOpen({ mode: 'edit', template: rec })}
                      extra={<Button variant="ghost" size="sm" icon={Copy} onClick={() => onOpen({ mode: 'create', template: t })} title="この内容をコピーして新しいテンプレートを作ります">複製</Button>}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty>テンプレートがありません。</Empty>
      )}
    </div>
  )
}
