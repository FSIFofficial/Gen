import { createContext } from 'preact'
import { useContext, useEffect, useRef, useState } from 'preact/hooks'
import { ExternalLink, ImagePlus, X } from 'lucide-preact'

export const AppContext = createContext(null)
export const useApp = () => useContext(AppContext)

export const cx = (...c) => c.filter(Boolean).join(' ')

export const card = 'rounded-2xl border border-[#dce5f2] bg-white'
export const inputCls = 'mt-1 h-10 w-full rounded-lg border border-[#dce5f2] bg-white px-3 text-sm font-normal outline-none focus:border-[#3b8dd9] focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-500'
export const textareaCls = 'mt-1 min-h-24 w-full rounded-lg border border-[#dce5f2] bg-white p-3 text-sm font-normal leading-6 outline-none focus:border-[#3b8dd9] focus:ring-2 focus:ring-blue-100'

const variants = {
  primary: 'bg-[#1261af] text-white hover:bg-[#0f5596]',
  outline: 'border border-[#dce5f2] bg-white text-[#12233f] hover:bg-slate-50',
  ghost: 'text-slate-600 hover:bg-slate-100',
  danger: 'border border-red-200 bg-white text-red-600 hover:bg-red-50',
}
const sizes = { md: 'h-10 px-4 text-sm', sm: 'h-8 px-3 text-xs', lg: 'h-11 px-5 text-sm' }

export function Button({ variant = 'primary', size = 'md', icon: Icon, iconEnd: IconEnd, class: klass, children, ...props }) {
  return (
    <button
      type="button"
      class={cx('inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl font-medium whitespace-nowrap transition disabled:pointer-events-none disabled:opacity-50', variants[variant], sizes[size], klass)}
      {...props}
    >
      {Icon && <Icon class="size-4" />}
      {children}
      {IconEnd && <IconEnd class="size-4" />}
    </button>
  )
}

export function Eyebrow({ children }) {
  return <p class="text-sm font-semibold text-[#1671c9]">{children}</p>
}

export function Badge({ tone = 'blue', children }) {
  const tones = {
    blue: 'bg-[#eaf4ff] text-[#1261af]',
    green: 'bg-[#effcf6] text-[#17634f]',
    amber: 'bg-amber-50 text-amber-800',
    gray: 'bg-slate-100 text-slate-500',
    red: 'bg-red-50 text-red-700',
  }
  return <span class={cx('inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold whitespace-nowrap', tones[tone])}>{children}</span>
}

export function Alert({ tone = 'amber', children, class: klass }) {
  const tones = {
    amber: 'border-amber-200 bg-amber-50 text-amber-900',
    red: 'border-red-200 bg-red-50 text-red-800',
    green: 'border-[#b7e8d7] bg-[#effcf6] text-[#17634f]',
    blue: 'border-[#cfe3f7] bg-[#f1f8ff] text-[#1a4f86]',
  }
  return <div class={cx('rounded-xl border px-4 py-3 text-sm', tones[tone], klass)}>{children}</div>
}

export function Label({ label, required, hint, class: klass, children }) {
  return (
    <label class={cx('block text-sm font-medium', klass)}>
      <span>
        {label}
        {required && <span class="text-red-500"> *</span>}
      </span>
      {children}
      {hint && <span class="mt-1 block text-xs font-normal text-slate-400">{hint}</span>}
    </label>
  )
}

export function Modal({ title, onClose, children, footer, wide }) {
  const ref = useRef(null)
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose?.()
    window.addEventListener('keydown', onKey)
    ref.current?.querySelector('input, textarea, select')?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return (
    <div class="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-[#0b1a33]/40 p-4 sm:items-center" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div ref={ref} class={cx(card, 'my-8 w-full shadow-xl', wide ? 'max-w-3xl' : 'max-w-md')} role="dialog" aria-modal="true" aria-label={title}>
        <div class="flex items-center justify-between border-b border-[#edf1f7] px-5 py-4">
          <h2 class="font-bold">{title}</h2>
          {onClose && (
            <button onClick={onClose} class="rounded-lg p-1 text-slate-400 hover:bg-slate-100" aria-label="閉じる">
              <X class="size-4" />
            </button>
          )}
        </div>
        <div class="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div class="flex justify-end gap-2 border-t border-[#edf1f7] px-5 py-3">{footer}</div>}
      </div>
    </div>
  )
}

export function Spinner({ class: klass }) {
  return <span class={cx('inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent', klass)} />
}

export function Empty({ children }) {
  return <p class="px-5 py-10 text-center text-sm text-slate-500">{children}</p>
}

// 入力項目の入力タイプに応じた入力欄
export function ItemInput({ item, value, onInput, disabled }) {
  const v = value ?? ''
  const set = (e) => onInput(e.currentTarget.value)
  const placeholder = item.example ? `例：${item.example}` : ''
  switch (item.type) {
    case '長文':
      return <textarea value={v} onInput={set} placeholder={placeholder} disabled={disabled} class={textareaCls} />
    case '日付':
      return <input type="date" value={v} onInput={set} disabled={disabled} class={inputCls} />
    case '数値':
      return <input type="number" value={v} onInput={set} placeholder={placeholder} disabled={disabled} class={inputCls} />
    case 'URL':
      return <input type="url" value={v} onInput={set} placeholder={placeholder || 'https://'} disabled={disabled} class={inputCls} />
    case '選択': {
      const options = String(item.options || '').split(',').map((s) => s.trim()).filter(Boolean)
      return (
        <select value={v} onChange={set} disabled={disabled} class={inputCls}>
          <option value="">選択してください</option>
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
          {v && !options.includes(v) && <option value={v}>{v}</option>}
        </select>
      )
    }
    case '画像':
      return <input value={v} onInput={set} placeholder="画像は今後対応予定（ドライブのファイルIDなど）" disabled={disabled} class={inputCls} />
    default:
      return <input value={v} onInput={set} placeholder={placeholder} disabled={disabled} class={inputCls} />
  }
}

export async function copyText(text, notify) {
  try {
    await navigator.clipboard.writeText(text)
    notify('コピーしました')
  } catch {
    notify('コピーに失敗しました。テキストを選択してコピーしてください。', 'error')
  }
}

export function formatDateTime(iso) {
  const d = new Date(iso)
  return isNaN(d) ? '' : d.toLocaleString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export const byOrder = (a, b) => (a.order === '' ? Infinity : a.order) - (b.order === '' ? Infinity : b.order)
export const activeOnly = (list) => list.filter((x) => x.active !== false)

// GAS から base64 で受け取ったファイルをダウンロードさせる
export function downloadBase64({ base64, mimeType, fileName }) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  downloadBlob(new Blob([bytes], { type: mimeType }), fileName)
}

export function downloadText(text, fileName, mimeType = 'text/plain;charset=utf-8') {
  downloadBlob(new Blob([text], { type: mimeType }), fileName)
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const googleDocUrl = (fileId, kind = 'document') => `https://docs.google.com/${kind}/d/${encodeURIComponent(fileId)}/edit`

// 雛形（Google ドキュメント / スライド）を新しいタブで開く。モックモードの雛形は実在しないので出さない
export function DocLink({ fileId, kind = 'document', size = 'md', children }) {
  const { api } = useApp()
  if (!fileId || api.mock) return null
  return (
    <a
      href={googleDocUrl(fileId, kind)}
      target="_blank"
      rel="noopener noreferrer"
      class={cx('inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl font-medium whitespace-nowrap transition', variants[size === 'sm' ? 'ghost' : 'outline'], sizes[size])}
    >
      <ExternalLink class="size-4" />
      {children || (kind === 'presentation' ? 'Googleスライドで開く' : 'Googleドキュメントで開く')}
    </a>
  )
}

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif']
const imageCache = new Map()

// 保存済みの画像（ロゴなど）を GAS から読み出して表示する
export function StoredImage({ fileId, class: klass }) {
  const { api } = useApp()
  const [src, setSrc] = useState(imageCache.get(fileId) || '')
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!fileId || imageCache.has(fileId)) return setSrc(imageCache.get(fileId) || '')
    let alive = true
    setFailed(false)
    api
      .call('readImage', { fileId })
      .then(({ mimeType, base64 }) => {
        const url = `data:${mimeType};base64,${base64}`
        imageCache.set(fileId, url)
        if (alive) setSrc(url)
      })
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
    }
  }, [fileId])
  if (!fileId) return null
  if (failed) return <span class="text-xs text-red-600">画像を読み込めません</span>
  if (!src) return <Spinner class="text-slate-300" />
  return <img src={src} alt="" class={cx('rounded-lg border border-[#e7edf5] bg-white object-contain', klass || 'size-16')} />
}

// 画像を選んで GAS（LOGO_FOLDER_ID のフォルダ）に保存し、ファイルIDを返す
export function ImageUpload({ value, onChange, disabled }) {
  const { api, notify } = useApp()
  const [busy, setBusy] = useState(false)
  const pick = async (e) => {
    const file = e.currentTarget.files?.[0]
    e.currentTarget.value = ''
    if (!file) return
    if (!IMAGE_TYPES.includes(file.type)) return notify('PNG・JPEG・GIF の画像を選んでください', 'error')
    if (file.size > 5 * 1024 * 1024) return notify('画像は5MB以下にしてください', 'error')
    setBusy(true)
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result).split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      const { fileId } = await api.call('uploadImage', { fileName: file.name, mimeType: file.type, base64 })
      imageCache.set(fileId, `data:${file.type};base64,${base64}`)
      onChange(fileId)
      notify('画像を保存しました')
    } catch (err) {
      notify(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div class="mt-1 flex items-center gap-3">
      <StoredImage fileId={value} />
      <label class={cx('inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-xl border border-[#dce5f2] bg-white px-3 text-xs font-medium hover:bg-slate-50', (disabled || busy) && 'pointer-events-none opacity-50')}>
        {busy ? <Spinner /> : <ImagePlus class="size-4" />}
        {value ? '画像を変更' : '画像を選ぶ'}
        <input type="file" accept={IMAGE_TYPES.join(',')} class="sr-only" onChange={pick} disabled={disabled || busy} />
      </label>
      {value && !disabled && (
        <button type="button" class="text-xs text-slate-400 hover:text-red-600" onClick={() => onChange('')}>外す</button>
      )}
    </div>
  )
}
