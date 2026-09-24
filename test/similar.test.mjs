import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findSimilarOrgs, isSimilarName, normalizeName } from '../src/lib/similar.js'
import { applyStyleRule, findStyleIssues, parseStyleRules } from '../src/lib/style-check.js'

test('団体名の正規化：全角半角・法人格・空白・記号を無視', () => {
  assert.equal(normalizeName('株式会社 サンプル・ラボ（東京）'), 'サンプルラボ東京')
  assert.equal(normalizeName('ＳＡＭＰＬＥ Inc.'), 'sampleinc')
})

test('似た団体名', () => {
  assert.ok(isSimilarName('サンプル団体', 'サンプル団体'))
  assert.ok(isSimilarName('株式会社サンプル', '(株)サンプル'))
  assert.ok(isSimilarName('サンプル団体', 'サンプル団体（東京）'))
  assert.ok(isSimilarName('サンプル大学', 'サンプル大字'))
  assert.ok(!isSimilarName('ABC', 'ABD'))
  assert.ok(!isSimilarName('サンプル団体', '別の法人'))
  assert.ok(!isSimilarName('', 'x'))
  const orgs = [{ id: 'O1', values: { 団体名: 'サンプル団体' } }, { id: 'O2', values: { 団体名: '別団体' } }]
  assert.deepEqual(findSimilarOrgs('サンプル団体 ', orgs).map((o) => o.id), ['O1'])
  assert.deepEqual(findSimilarOrgs('サンプル団体', orgs, 'O1'), [])
})

test('表記ルール：読み込み・検出・置き換え', () => {
  const rules = parseStyleRules('# コメント\n御社→貴団体\n\nパートナーシップ\nweb -> Web')
  assert.deepEqual(rules, [{ from: '御社', to: '貴団体' }, { from: 'パートナーシップ', to: null }, { from: 'web', to: 'Web' }])
  const issues = findStyleIssues('御社と御社のパートナーシップ', rules)
  assert.deepEqual(issues.map((i) => [i.from, i.count]), [['御社', 2], ['パートナーシップ', 1]])
  assert.equal(applyStyleRule('御社と御社', rules[0]), '貴団体と貴団体')
  assert.equal(applyStyleRule('パートナーシップ', rules[1]), 'パートナーシップ')
})

test('メール・X のリンク', async () => {
  const { mailtoUrl, xIntentUrl } = await import('../src/lib/links.js')
  assert.equal(mailtoUrl({ to: 'a@example.com', subject: '件名 A&B', body: '1行目\n2行目' }), 'mailto:a@example.com?subject=%E4%BB%B6%E5%90%8D%20A%26B&body=1%E8%A1%8C%E7%9B%AE%0D%0A2%E8%A1%8C%E7%9B%AE')
  assert.equal(mailtoUrl({ subject: 's' }), 'mailto:?subject=s&body=')
  assert.equal(xIntentUrl('a b #タグ'), 'https://x.com/intent/post?text=a%20b%20%23%E3%82%BF%E3%82%B0')
})
