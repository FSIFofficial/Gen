// 行単位の差分（テンプレートの変更履歴の表示用）。[{ type: 'same' | 'add' | 'del', text }]
export function lineDiff(before, after) {
  const a = String(before ?? '').split('\n')
  const b = String(after ?? '').split('\n')
  // 前後の共通部分を先に除いて、表を小さくする
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start++
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--
    endB--
  }
  const midA = a.slice(start, endA)
  const midB = b.slice(start, endB)
  // 最長共通部分列（LCS）
  const n = midA.length
  const m = midB.length
  const table = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) table[i][j] = midA[i] === midB[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1])
  }
  const out = a.slice(0, start).map((text) => ({ type: 'same', text }))
  let i = 0
  let j = 0
  while (i < n || j < m) {
    if (i < n && j < m && midA[i] === midB[j]) {
      out.push({ type: 'same', text: midA[i++] })
      j++
    } else if (i < n && (j === m || table[i + 1][j] >= table[i][j + 1])) out.push({ type: 'del', text: midA[i++] })
    else out.push({ type: 'add', text: midB[j++] })
  }
  return out.concat(a.slice(endA).map((text) => ({ type: 'same', text })))
}
