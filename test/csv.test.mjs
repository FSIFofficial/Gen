import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mapOrgColumns, orgRowsFromTable, parseDelimited } from '../src/lib/csv.js'

test('CSV：引用符・カンマ・改行・""・BOM・CRLF', () => {
  const text = '﻿団体名,団体紹介\r\n"A, Inc.","1行目\n2行目"\r\nB,"言う""こと"""\r\n\r\n'
  assert.deepEqual(parseDelimited(text), [
    ['団体名', '団体紹介'],
    ['A, Inc.', '1行目\n2行目'],
    ['B', '言う"こと"'],
  ])
})

test('TSV：スプレッドシートからの貼り付け（最終行に改行なし、空欄あり）', () => {
  assert.deepEqual(parseDelimited('団体名\tURL\nサンプル, 団体\t\n別団体\thttps://example.com'), [
    ['団体名', 'URL'],
    ['サンプル, 団体', ''],
    ['別団体', 'https://example.com'],
  ])
})

test('見出しを項目キー・表示名で対応づけ、行を作る', () => {
  const items = [{ key: '団体名', label: '団体名' }, { key: 'HP', label: 'ホームページ' }, { key: '案件名', label: '案件' }]
  const mapping = mapOrgColumns([' 団体名 ', 'ホームページ', '案件', '不明', 'HP'], ['団体名', 'HP'], items)
  assert.deepEqual(mapping, ['団体名', 'HP', null, null, null])
  assert.deepEqual(orgRowsFromTable([['h'], [' A ', 'https://a.example', 'x']], mapping), [{ values: { 団体名: 'A', HP: 'https://a.example' } }])
})

test('CSV の書き出し：BOM・引用符・改行、読み込むと元に戻る', async () => {
  const { toCsv } = await import('../src/lib/csv.js')
  const rows = [['a', 'b,c'], ['言う"こと"', '1行目\n2行目']]
  const csv = toCsv(rows)
  assert.ok(csv.startsWith('﻿a,"b,c"\r\n'))
  assert.deepEqual(parseDelimited(csv), rows)
})

test('CSV行：改行は <br>、英数字・true/false はそのまま、ほかは引用符', async () => {
  const { csvLine } = await import('../src/lib/csv.js')
  assert.equal(csvLine(['lyncs', 'タイトル, 1', '2026-08-20', '1行目\n2行目', "<a href='x'>", 'say "hi"', false, '']), `lyncs,"タイトル, 1",2026-08-20,"1行目<br>2行目","<a href='x'>","say ""hi""",false,""`)
})
