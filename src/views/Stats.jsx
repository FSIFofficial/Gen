// 利用状況（管理画面のタブ）：作成履歴と団体マスタから集計する。画面に読み込み済みの一覧だけを使い、通信はしない
import { useState } from 'preact/hooks'
import { Empty, activeOnly, card, cx, useApp } from '../ui/ui.jsx'

const BAR = '#1261af'
const BAR_HOVER = '#0b4a8b'

const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

// 直近12か月（今月まで）の作成数
function monthlyCounts(history, now = new Date()) {
  const months = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push({ key: monthKey(d), label: `${d.getMonth() + 1}月`, year: d.getFullYear(), count: 0 })
  }
  const byKey = Object.fromEntries(months.map((m) => [m.key, m]))
  for (const h of history) {
    const d = new Date(h.createdAt)
    if (!isNaN(d.getTime()) && byKey[monthKey(d)]) byKey[monthKey(d)].count++
  }
  return months
}

// 多い順。上位 limit 件以外は「その他」にまとめる
function ranking(history, keyOf, labelOf, limit = 8) {
  const counts = {}
  for (const h of history) {
    const k = keyOf(h) || ''
    counts[k] = (counts[k] || 0) + 1
  }
  const rows = Object.entries(counts).map(([k, n]) => ({ label: k ? labelOf(k) : '（未設定）', count: n })).sort((a, b) => b.count - a.count)
  if (rows.length <= limit) return rows
  const rest = rows.slice(limit).reduce((sum, r) => sum + r.count, 0)
  return [...rows.slice(0, limit), { label: `その他（${rows.length - limit}件）`, count: rest, other: true }]
}

export function Stats() {
  const { data, history } = useApp()
  if (history === null) return <div class={card}><Empty>読み込み中…</Empty></div>
  const all = history || []
  const now = new Date()
  const thisMonth = all.filter((h) => monthKey(new Date(h.createdAt)) === monthKey(now)).length
  const name = (list, id) => list.find((x) => x.id === id)?.name || id
  const tiles = [
    ['作成数（全期間）', all.length, '件'],
    ['今月の作成数', thisMonth, '件'],
    ['登録団体（有効）', activeOnly(data.orgs).length, '団体'],
    ['作成者', new Set(all.map((h) => h.author).filter(Boolean)).size, '人'],
  ]
  return (
    <div class="space-y-6">
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map(([label, value, unit]) => (
          <div key={label} class={cx(card, 'p-5')}>
            <p class="text-xs font-semibold text-slate-500">{label}</p>
            <p class="mt-2 text-3xl font-bold tracking-tight text-[#12233f]">
              {value.toLocaleString()}
              <span class="ml-1 text-sm font-medium text-slate-500">{unit}</span>
            </p>
          </div>
        ))}
      </div>

      <div class={cx(card, 'p-5')}>
        <h2 class="font-bold">月ごとの作成数</h2>
        <p class="mt-1 text-xs text-slate-500">直近12か月。棒にカーソルを合わせると件数が出ます。</p>
        <MonthlyChart months={monthlyCounts(all, now)} />
      </div>

      <div class="grid gap-6 lg:grid-cols-2">
        <RankCard title="セット別" rows={ranking(all, (h) => h.setId, (id) => name(data.sets, id))} />
        <RankCard title="ランク別" rows={ranking(all, (h) => h.rank, (r) => r)} />
        <RankCard title="作成者別" rows={ranking(all, (h) => h.author, (a) => a)} />
        <RankCard title="作成の多い団体" rows={ranking(all, (h) => h.orgName, (n) => n)} />
      </div>
      <p class="text-xs text-slate-400">作成履歴（削除したものは含まない）から集計しています。</p>
    </div>
  )
}

// 1系列の縦棒グラフ。棒の上端だけ角丸、ホバーで件数、今月の値だけ直接表示
function MonthlyChart({ months }) {
  const [hover, setHover] = useState(null)
  const max = Math.max(1, ...months.map((m) => m.count))
  const step = max <= 5 ? 1 : Math.ceil(max / 4)
  const top = Math.ceil(max / step) * step
  const ticks = []
  for (let v = 0; v <= top; v += step) ticks.push(v)
  // 横長にして、画面いっぱいに広げても高さが出すぎないようにする
  const W = 1100
  const H = 220
  const left = 32
  const bottom = 28
  const plotW = W - left - 8
  const plotH = H - bottom - 16
  const slot = plotW / months.length
  const barW = Math.min(40, slot * 0.5)
  const y = (v) => 16 + plotH - (v / top) * plotH
  const last = months.length - 1
  return (
    <div class="relative mt-4">
      <svg viewBox={`0 0 ${W} ${H}`} class="block h-auto w-full" role="img" aria-label="月ごとの作成数の棒グラフ">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={left} x2={W - 8} y1={y(t)} y2={y(t)} stroke={t === 0 ? '#c7d3e3' : '#edf1f7'} stroke-width="1" />
            <text x={left - 6} y={y(t) + 4} text-anchor="end" font-size="11" fill="#64748b">{t}</text>
          </g>
        ))}
        {months.map((m, i) => {
          const x = left + slot * i + (slot - barW) / 2
          const h = y(0) - y(m.count)
          const r = Math.min(4, h / 2, barW / 2)
          return (
            <g key={m.key} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              {/* 当たり判定は棒より広く取る */}
              <rect x={left + slot * i} y={16} width={slot} height={plotH} fill="transparent" />
              {m.count > 0 && (
                <path
                  d={`M${x},${y(0)} V${y(m.count) + r} Q${x},${y(m.count)} ${x + r},${y(m.count)} H${x + barW - r} Q${x + barW},${y(m.count)} ${x + barW},${y(m.count) + r} V${y(0)} Z`}
                  fill={hover === i ? BAR_HOVER : BAR}
                />
              )}
              <text x={left + slot * i + slot / 2} y={H - 8} text-anchor="middle" font-size="11" fill="#64748b">
                {m.label}
              </text>
              {i === last && hover === null && m.count > 0 && (
                <text x={x + barW / 2} y={y(m.count) - 6} text-anchor="middle" font-size="11" font-weight="600" fill="#12233f">{m.count}</text>
              )}
            </g>
          )
        })}
      </svg>
      {hover !== null && (
        <div
          class="pointer-events-none absolute -translate-x-1/2 rounded-lg bg-[#12233f] px-2.5 py-1.5 text-xs whitespace-nowrap text-white shadow-lg"
          style={{ left: `${((left + slot * hover + slot / 2) / W) * 100}%`, top: 0 }}
        >
          {months[hover].year}年{months[hover].label}：{months[hover].count}件
        </div>
      )}
      <table class="sr-only">
        <caption>月ごとの作成数</caption>
        <tbody>{months.map((m) => <tr key={m.key}><th>{m.year}年{m.label}</th><td>{m.count}</td></tr>)}</tbody>
      </table>
    </div>
  )
}

// 横棒のランキング。数値は文字で並べるので、色だけに頼らない
function RankCard({ title, rows }) {
  const max = Math.max(1, ...rows.map((r) => r.count))
  return (
    <div class={cx(card, 'p-5')}>
      <h2 class="font-bold">{title}</h2>
      {rows.length ? (
        <div class="mt-4 space-y-2.5">
          {rows.map((r) => (
            <div key={r.label} class="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_2.5rem] items-center gap-3 text-sm" title={`${r.label}：${r.count}件`}>
              <span class={cx('truncate', r.other ? 'text-slate-400' : 'text-slate-700')}>{r.label}</span>
              <span class="h-2.5 rounded-r-full bg-[#eef2f8]">
                <span class="block h-full rounded-r-full" style={{ width: `${(r.count / max) * 100}%`, background: r.other ? '#9fb3cc' : BAR }} />
              </span>
              <span class="text-right font-semibold text-[#12233f] tabular-nums">{r.count}</span>
            </div>
          ))}
        </div>
      ) : (
        <p class="mt-4 text-sm text-slate-400">まだ作成履歴がありません。</p>
      )}
    </div>
  )
}
