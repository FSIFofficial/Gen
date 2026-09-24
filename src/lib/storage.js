// このブラウザの localStorage に置く値（作成者名・入力途中の下書き）。保存できない環境でも画面は動かす
export const AUTHOR_KEY = 'pg-author'
export const DRAFT_KEY = 'pg-draft'

export function readLocal(key) {
  try {
    return localStorage.getItem(key) || ''
  } catch {
    return ''
  }
}

export function writeLocal(key, value) {
  try {
    if (value) localStorage.setItem(key, value)
    else localStorage.removeItem(key)
  } catch {
    // 記録用なので保存できなくても続行
  }
}

export const readAuthor = () => readLocal(AUTHOR_KEY)
export const saveAuthor = (name) => writeLocal(AUTHOR_KEY, name)

// 資料作成の入力途中の状態。{ orgId, orgValues, caseValues, setId, rank, mediaIds, step, savedAt }
export function readDraft() {
  try {
    const d = JSON.parse(readLocal(DRAFT_KEY) || 'null')
    return d && typeof d === 'object' && d.orgId ? d : null
  } catch {
    return null
  }
}

export const saveDraft = (draft) => writeLocal(DRAFT_KEY, draft ? JSON.stringify(draft) : '')
export const clearDraft = () => writeLocal(DRAFT_KEY, '')
