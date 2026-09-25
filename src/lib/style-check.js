// 表記チェック。共通設定「表記ルール」の値に1行1ルールで書く
//   御社→貴団体      … 「御社」を見つけたら「貴団体」を提案（置き換えボタンを出す）
//   パートナーシップ … 矢印が無ければ、見つけたことだけ知らせる
// 「#」で始まる行と空行は読み飛ばす
export const STYLE_RULES_KEY = '表記ルール'

export function parseStyleRules(text) {
  return String(text ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const [from, ...rest] = line.split(/\s*(?:→|->|⇒)\s*/)
      return { from: from.trim(), to: rest.length ? rest.join('').trim() : null }
    })
    .filter((r) => r.from)
}

// [{ from, to, count }]（見つかったものだけ）
export function findStyleIssues(text, rules) {
  const s = String(text ?? '')
  return rules
    .map((r) => ({ ...r, count: s.split(r.from).length - 1 }))
    .filter((r) => r.count > 0)
}

export function applyStyleRule(text, rule) {
  return rule.to === null ? String(text ?? '') : String(text ?? '').split(rule.from).join(rule.to)
}

export function styleRulesFrom(settings) {
  return parseStyleRules(settings.find((s) => s.key === STYLE_RULES_KEY)?.value)
}
