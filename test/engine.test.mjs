import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  countX, countPlain, extractKeys, extractPlaceholders, formatDate, formItemsFor, generateOutputs, buildContext,
  pickTemplates, placeholderAt, renderSegments, renderTemplate, splitBySeparator, splitXThread,
} from '../src/lib/engine.js'

const items = [
  { key: '団体名', category: '団体', type: '短文', order: 1 },
  { key: '締結日', category: '案件', type: '日付', format: 'YYYY年M月D日', order: 2 },
  { key: 'URL', category: '案件', type: 'URL', order: 3 },
]
const settings = [{ key: '署名', value: 'サンプル運営事務局' }]
const ctx = (values) => buildContext({ values, items, settings })

test('extractPlaceholders: キーと書式を取り出す', () => {
  const p = extractPlaceholders('{{団体名}}と{{ 締結日 : M/D(曜) }}')
  assert.deepEqual(p.map((x) => [x.key, x.format]), [['団体名', ''], ['締結日', 'M/D(曜)']])
  assert.deepEqual(extractKeys(['{{a}}{{b}}', '{{a:X}}{{c}}']), ['a', 'b', 'c'])
})

test('placeholderAt: カーソル位置の差し込みを返す', () => {
  const text = 'x{{締結日:M/D}}y'
  assert.equal(placeholderAt(text, 4).key, '締結日')
  assert.equal(placeholderAt(text, 0), null)
})

test('formatDate: 仕様の書式候補', () => {
  assert.equal(formatDate('2026-09-24', 'YYYY年M月D日'), '2026年9月24日')
  assert.equal(formatDate('2026-09-24', 'YYYY年M月D日（曜）'), '2026年9月24日（木）')
  assert.equal(formatDate('2026-09-24', 'M月D日'), '9月24日')
  assert.equal(formatDate('2026-09-24', 'M/D(曜)'), '9/24(木)')
  assert.equal(formatDate('2026-01-05', 'YYYY/MM/DD'), '2026/01/05')
  assert.equal(formatDate('2026/9/24', 'M/D'), '9/24')
  assert.equal(formatDate('未定', 'M/D'), '未定')
  assert.equal(formatDate('2026-02-30', 'M/D'), '2026-02-30')
})

test('renderTemplate: 差し込み・共通設定・日付の標準書式と上書き', () => {
  const tpl = '{{団体名}}：{{締結日}} / {{締結日:M/D(曜)}}\n{{署名}}'
  assert.equal(renderTemplate(tpl, ctx({ 団体名: 'サンプル団体', 締結日: '2026-09-24' })), 'サンプル団体：2026年9月24日 / 9/24(木)\nサンプル運営事務局')
})

test('renderTemplate: 未入力は空にして空行を詰める', () => {
  assert.equal(renderTemplate('A\n\n{{URL}}\n\nB', ctx({})), 'A\n\nB')
})

test('renderSegments: 差し込み部分と未入力を区別する', () => {
  const seg = renderSegments('こんにちは{{団体名}}{{URL}}', ctx({ 団体名: 'X' }))
  assert.deepEqual(seg, [{ text: 'こんにちは' }, { text: 'X', key: '団体名' }, { text: '［URL］', key: 'URL', missing: true }])
})

test('pickTemplates: ランク専用を優先し、なければ共通', () => {
  const templates = [
    { id: 'T1', setId: 'S1', mediaId: 'X', rank: '共通', active: true },
    { id: 'T2', setId: 'S1', mediaId: 'X', rank: 'ゴールド', active: true },
    { id: 'T3', setId: 'S1', mediaId: 'MAIL', rank: '共通', active: true },
    { id: 'T4', setId: 'S1', mediaId: 'NOTE', rank: 'ゴールド', active: false },
    { id: 'T5', setId: 'S2', mediaId: 'MAIL', rank: 'ゴールド', active: true },
  ]
  const gold = pickTemplates(templates, 'S1', 'ゴールド')
  assert.deepEqual(Object.fromEntries(Object.entries(gold).map(([k, v]) => [k, v.id])), { X: 'T2', MAIL: 'T3' })
  const silver = pickTemplates(templates, 'S1', 'シルバー')
  assert.deepEqual(Object.fromEntries(Object.entries(silver).map(([k, v]) => [k, v.id])), { X: 'T1', MAIL: 'T3' })
})

test('countX: 全角2・半角1・URLは23', () => {
  assert.equal(countX('abc'), 3)
  assert.equal(countX('あいう'), 6)
  assert.equal(countX('詳細 https://example.com/very/long/path?x=1 です'), 4 + 1 + 23 + 1 + 4)
  assert.equal(countX('あ'.repeat(140)), 280)
  assert.equal(countPlain('あa😀'), 3)
})

test('splitBySeparator: 単独行の --- で分割', () => {
  assert.deepEqual(splitBySeparator('A\n---\nB\n  ---  \nC\n--- x'), ['A', 'B', 'C\n--- x'])
})

test('splitXThread: 上限超えは句点・改行で自動分割', () => {
  const long = 'あ'.repeat(100) + '。' + 'い'.repeat(100) + '。'
  const posts = splitXThread(long)
  assert.equal(posts.length, 2)
  assert.ok(posts.every((p) => !p.over))
  assert.equal(posts[0].text, 'あ'.repeat(100) + '。')
})

test('splitXThread: 句点がなければ文字単位で分割', () => {
  const posts = splitXThread('あ'.repeat(300))
  assert.deepEqual(posts.map((p) => p.count), [280, 280, 40])
})

test('splitXThread: 番号付与 (1/3) も上限内に収める', () => {
  const posts = splitXThread('A\n---\nB\n---\n' + 'あ'.repeat(140), { numbering: true })
  assert.equal(posts.length, 4)
  assert.equal(posts[0].text, 'A\n(1/4)')
  assert.ok(posts.every((p) => p.count <= 280))
  assert.equal(splitXThread('単独', { numbering: true })[0].text, '単独')
})

test('generateOutputs と formItemsFor', () => {
  const media = [{ id: 'M1', fields: [{ fieldKey: '件名' }, { fieldKey: '本文' }] }]
  const picked = { M1: { id: 'T1', fields: { 件名: '{{団体名}}', 本文: '{{締結日}}{{署名}}{{謎}}' } } }
  const out = generateOutputs({ picked, mediaIds: ['M1'], media, ctx: ctx({ 団体名: 'A', 締結日: '2026-09-24' }) })
  assert.deepEqual(out, { M1: { templateId: 'T1', fields: { 件名: 'A', 本文: '2026年9月24日サンプル運営事務局' } } })
  const form = formItemsFor({ picked, mediaIds: ['M1'], items, settings })
  assert.deepEqual(form.orgItems.map((i) => i.key), ['団体名'])
  assert.deepEqual(form.caseItems.map((i) => i.key), ['締結日'])
  assert.deepEqual(form.settingKeys, ['署名'])
  assert.deepEqual(form.unknownKeys, ['謎'])
})
