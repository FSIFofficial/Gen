import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lineDiff } from '../src/lib/diff.js'

const show = (d) => d.map((x) => ({ same: ' ', add: '+', del: '-' })[x.type] + x.text)

test('行の差分：変更・追加・削除', () => {
  assert.deepEqual(show(lineDiff('a\nb\nc\nd', 'a\nB\nc\nd\ne')), [' a', '-b', '+B', ' c', ' d', '+e'])
  assert.deepEqual(show(lineDiff('a\nb', 'b')), ['-a', ' b'])
  assert.deepEqual(show(lineDiff('', 'x')), ['-', '+x'])
  assert.deepEqual(show(lineDiff('same', 'same')), [' same'])
})
