// 出力画面から外部のアプリを開くリンク

// メールソフトで開く（宛先・件名・本文入り）。本文の改行は CRLF にする
export function mailtoUrl({ to = '', subject = '', body = '' }) {
  const enc = (v) => encodeURIComponent(String(v ?? ''))
  return `mailto:${encodeURI(String(to ?? '').trim())}?subject=${enc(subject)}&body=${enc(String(body ?? '').replace(/\r?\n/g, '\r\n'))}`
}

// これより長い mailto はメールソフトによって途中で切れることがある
export const MAILTO_SAFE_LENGTH = 1900

// X の投稿画面（文面入り）
export const xIntentUrl = (text) => `https://x.com/intent/post?text=${encodeURIComponent(text)}`
