// 団体名の「似た名前」判定（二重登録の警告用）。表記ゆれ・法人格・空白・記号の違いを無視して比べる

const LEGAL_FORMS = /(株式会社|有限会社|合同会社|一般社団法人|公益社団法人|一般財団法人|公益財団法人|特定非営利活動法人|npo法人|学校法人|社会福祉法人|医療法人|\(株\)|\(有\)|\(同\)|㈱|㈲)/g

export function normalizeName(name) {
  return String(name ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(LEGAL_FORMS, '')
    .replace(/[\s・･、。,.．\-ー―‐_/／()（）「」『』【】\[\]'"’”!！?？&＆]/g, '')
}

// 編集距離（短い名前どうしなので単純な表で十分）
function distance(a, b) {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]
    prev[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1))
      diag = tmp
    }
  }
  return prev[b.length]
}

export function isSimilarName(a, b) {
  const x = normalizeName(a)
  const y = normalizeName(b)
  if (!x || !y) return false
  if (x === y) return true
  const [short, long] = x.length <= y.length ? [x, y] : [y, x]
  // 片方がもう片方を含む（「サンプル団体」と「サンプル団体東京支部」）。短すぎる名前は誤判定が多いので3文字から
  if (short.length >= 3 && long.includes(short)) return true
  // 1文字違い（4文字以上）・2文字違い（8文字以上）
  const d = distance(x, y)
  return (d <= 1 && short.length >= 4) || (d <= 2 && short.length >= 8)
}

// orgs: 団体マスタの一覧。excludeId の団体は比べない（編集中の本人）
export function findSimilarOrgs(name, orgs, excludeId = '') {
  if (!String(name ?? '').trim()) return []
  return orgs.filter((o) => o.id !== excludeId && isSimilarName(name, o.values?.['団体名']))
}
