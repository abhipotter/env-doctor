import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseExampleKeys } from '../dist/scan/env-example.js';

function sortedKeys(text) {
  return [...parseExampleKeys(text)].sort();
}

test('reads keys from simple assignments, comments, and blank lines', () => {
  const text = ['# Database', 'DATABASE_URL=postgres://localhost/demo', '', '   ', '# PORT=ignored', 'PORT=3000'].join('\n');

  assert.deepEqual(sortedKeys(text), ['DATABASE_URL', 'PORT']);
});

test('treats an empty assignment as a declaration', () => {
  assert.deepEqual(sortedKeys('JWT_SECRET=\nAPI_TOKEN=""\n'), ['API_TOKEN', 'JWT_SECRET']);
});

test('strips a byte order mark from the first key', () => {
  assert.deepEqual(sortedKeys('\uFEFFFIRST=1\nSECOND=2\n'), ['FIRST', 'SECOND']);
});

test('handles CRLF line endings', () => {
  assert.deepEqual(sortedKeys('FIRST=1\r\nSECOND=\r\nTHIRD=3\r\n'), ['FIRST', 'SECOND', 'THIRD']);
});

test('accepts the export prefix and quoted values', () => {
  const text = ['export EXPORTED=1', 'DOUBLE="two words"', "SINGLE='x=y'", 'BACKTICK=`z`'].join('\n');

  assert.deepEqual(sortedKeys(text), ['BACKTICK', 'DOUBLE', 'EXPORTED', 'SINGLE']);
});

test('counts duplicate keys once', () => {
  assert.equal(parseExampleKeys('PORT=1\nPORT=2\nPORT=\n').size, 1);
});

test('does not treat lines inside a quoted multiline value as declarations', () => {
  const text = ['CERTIFICATE="-----BEGIN-----', 'HIDDEN_INSIDE=value', '-----END-----"', 'AFTER=1'].join('\n');

  assert.deepEqual(sortedKeys(text), ['AFTER', 'CERTIFICATE']);
});

test('returns names only', () => {
  const keys = parseExampleKeys('API_URL=http://sentinel.example\n');

  assert.ok(keys instanceof Set);
  assert.deepEqual([...keys], ['API_URL']);
});

test('returns no keys for an empty file', () => {
  assert.equal(parseExampleKeys('').size, 0);
});
