export type BusinessType = 'partner' | 'orbit'
export type Medium = 'email' | 'x' | 'instagram' | 'note' | 'news'

export const mediumLabels: Record<Medium, string> = { email: 'メール', x: 'X', instagram: 'Instagram', note: 'note', news: 'HPニュース' }
export const businessLabels: Record<BusinessType, string> = { partner: 'Cosmo Base パートナー締結', orbit: 'Orbit利用契約' }

export type Draft = {
  organizationId: string; business: BusinessType; rank: string; media: Medium[]; project: string; publicDate: string; intro: string; summary: string; points: string; url: string; contact: string; signingDate: string; collaboration: string; startDate: string; purpose: string; publicCollaboration: string; salutation: string; emailPurpose: string; hashtags: string
}
export type Generated = Record<Medium, { title?: string; subject?: string; body: string }>

const optional = (label: string, value: string, suffix = '') => value ? `${label}${value}${suffix}` : ''
export function generateCopy(draft: Draft, org: { name: string; type: string; url: string; x: string; instagram: string; contact: string }): Generated {
  const isPartner = draft.business === 'partner'
  const orgIntro = draft.intro || `${org.name}の活動についてご紹介します。`
  const details = isPartner ? `${optional('連携内容：', draft.collaboration)}` : `${optional('利用目的：', draft.purpose)}${draft.publicCollaboration ? ` 公開可能な連携内容：${draft.publicCollaboration}` : ''}`
  const fact = isPartner ? `${org.name}とパートナーシップを締結しました。` : `${org.name}によるOrbitの利用を開始しました。`
  const hash = draft.hashtags ? `\n\n${draft.hashtags}` : ''
  return {
    email: { subject: `${draft.project}のお知らせ｜FSIF`, body: `${draft.salutation || '関係者の皆さま'}\n\nいつもFSIFの活動にご理解とご協力をいただき、ありがとうございます。\n\n${fact}\n${orgIntro}\n${draft.summary}\n${details}${draft.points ? `\n今回のポイント：${draft.points}` : ''}\n\n今後もより良い活動を通じて、宇宙に関わるきっかけを届けてまいります。${draft.url ? `\n詳細：${draft.url}` : ''}\n\n${draft.contact || org.contact || 'FSIF事務局'}${draft.emailPurpose ? `\n\n（${draft.emailPurpose}）` : ''}` },
    x: { body: `${fact}\n\n${draft.summary}\n${draft.points ? `\n${draft.points}` : ''}${draft.url ? `\n${draft.url}` : ''}${hash}` },
    instagram: { body: `${fact}\n\n${orgIntro}\n\n${draft.summary}\n${details}${draft.points ? `\n\n${draft.points}` : ''}${draft.url ? `\n\n詳しくはプロフィールのリンクから。${draft.url}` : ''}${hash}` },
    note: { title: draft.project, body: `${fact}\n\n## ${org.name}について\n${orgIntro}\n\n## 今回の取り組み\n${draft.summary}\n\n## 連携の内容\n${details}${draft.points ? `\n\n## 伝えたいポイント\n${draft.points}` : ''}${draft.url ? `\n\n詳しくはこちら\n${draft.url}` : ''}` },
    news: { title: draft.project, body: `${fact}\n\n${orgIntro}\n\n${draft.summary}\n\n${details}${draft.points ? `\n\n${draft.points}` : ''}${draft.url ? `\n\n関連URL：${draft.url}` : ''}\n\n${draft.contact || org.contact || 'お問い合わせ：FSIF事務局'}` },
  }
}

export const sampleOrganizations = [
  { id: 'sample-a', name: 'サンプル宇宙団体A', type: '宇宙系学生団体', url: 'https://example.com/a', x: '@sample_space_a', instagram: '@sample_space_a', contact: 'sample-a@example.com' },
  { id: 'sample-b', name: 'サンプルテック企業B', type: '非宇宙系企業', url: 'https://example.com/b', x: '@sample_tech_b', instagram: '', contact: 'sample-b@example.com' },
]
export const emptyDraft: Draft = { organizationId: 'sample-a', business: 'partner', rank: 'なし', media: ['email', 'x', 'instagram', 'note', 'news'], project: '', publicDate: '', intro: '', summary: '', points: '', url: '', contact: '', signingDate: '', collaboration: '', startDate: '', purpose: '', publicCollaboration: '', salutation: '', emailPurpose: '', hashtags: '' }

type AnyRecord = Record<string, string>
export const placeholders = (text: string) => text.replace(/undefined|\{\{[^}]+\}\}/g, '').replace(/\n{3,}/g, '\n\n').trim()
export const toText = (medium: Medium, result: { title?: string; subject?: string; body: string }) => placeholders(medium === 'email' ? `件名：${result.subject}\n\n${result.body}` : result.title ? `タイトル：${result.title}\n\n${result.body}` : result.body)
void ({} as AnyRecord)
void toText
void placeholders
void mediumLabels
void businessLabels
void sampleOrganizations
void emptyDraft
void generateCopy

export const organizationTypes = ['宇宙系学生団体', '非宇宙系学生団体', '宇宙系企業', '非宇宙系企業', 'その他']
export const allMedia: Medium[] = ['email', 'x', 'instagram', 'note', 'news']
export type Organization = typeof sampleOrganizations[number]
export type HistoryItem = { id: string; savedAt: string; organization: Organization; draft: Draft; generated: Generated }

