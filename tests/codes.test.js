import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CODE_RE, isCode, makeCode, normalizeCode } from '../js/codes.js';

test('makeCode only uses the unambiguous alphabet', () => {
  for (let i = 0; i < 500; i++) {
    const code = makeCode();
    assert.match(code, CODE_RE);
    assert.doesNotMatch(code, /[ILO01]/);
  }
});

test('makeCode draws every character from the injected generator', () => {
  assert.equal(makeCode(() => 0), 'AAAAAA');
  assert.equal(makeCode(() => 30), '999999');
});

test('normalizeCode tolerates how people type a code', () => {
  assert.equal(normalizeCode(' ab3-k9z '), 'AB3K9Z');
  assert.equal(normalizeCode(undefined), '');
});

test('isCode rejects look-alike characters and wrong lengths', () => {
  assert.ok(isCode('AB3K9Z'));
  assert.ok(!isCode('AB3K9'));
  assert.ok(!isCode('AB3K9ZZ'));
  assert.ok(!isCode('AB3K9O'));
  assert.ok(!isCode('ab3k9z'));
});
