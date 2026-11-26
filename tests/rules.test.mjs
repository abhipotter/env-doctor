import assert from 'node:assert/strict';
import { test } from 'node:test';

import { groupUsages, sortFindings } from '../dist/check.js';
import { findMissingVariables } from '../dist/rules/missing-variable.js';
import { looksLikeSecretName } from '../dist/rules/public-secret.js';

function serverReference(name, file, line, column = 1) {
  return { app: 'server', mechanism: 'process.env', name, file, line, column };
}

function example(keys, present = true) {
  return { app: 'server', path: 'server/.env.example', present, keys: new Set(keys) };
}

test('secret-like names match whole underscore-delimited tokens', () => {
  for (const name of [
    'VITE_STRIPE_SECRET_KEY',
    'VITE_ADMIN_PASSWORD',
    'VITE_SIGNING_PRIVATE_KEY',
    'VITE_GITHUB_ACCESS_TOKEN',
    'VITE_OPENAI_API_KEY',
    'VITE_client_secret',
  ]) {
    assert.equal(looksLikeSecretName(name), true, name);
  }

  for (const name of ['VITE_API_URL', 'VITE_SECRETARY_EMAIL', 'VITE_MAPBOX_TOKEN', 'VITE_KEYBOARD_LAYOUT', 'VITE_API_KEYS_URL']) {
    assert.equal(looksLikeSecretName(name), false, name);
  }
});

test('groups references by name and orders locations by file and position', () => {
  const usages = groupUsages([
    serverReference('PORT', 'server/b.js', 3),
    serverReference('DATABASE_URL', 'server/a.js', 9),
    serverReference('PORT', 'server/a.js', 7, 5),
    serverReference('PORT', 'server/a.js', 7, 2),
  ]);

  assert.deepEqual(
    usages.map((usage) => [usage.name, usage.locations.map((location) => `${location.file}:${location.line}:${location.column}`)]),
    [
      ['DATABASE_URL', ['server/a.js:9:1']],
      ['PORT', ['server/a.js:7:2', 'server/a.js:7:5', 'server/b.js:3:1']],
    ],
  );
});

test('a missing key produces one error with the first location as primary', () => {
  const usages = groupUsages([serverReference('JWT_SECRET', 'server/b.js', 1), serverReference('JWT_SECRET', 'server/a.js', 4)]);

  const findings = findMissingVariables(usages, example(['PORT']));

  assert.equal(findings.length, 1);
  assert.equal(findings[0].ruleId, 'missing-declaration');
  assert.deepEqual(findings[0].location, { file: 'server/a.js', line: 4, column: 1 });
  assert.deepEqual(findings[0].additionalLocations, [{ file: 'server/b.js', line: 1, column: 1 }]);
  assert.match(findings[0].action, /Add JWT_SECRET= to server\/\.env\.example/);
});

test('a missing example produces one template error instead of per-key errors', () => {
  const usages = groupUsages([serverReference('A', 'server/a.js', 1), serverReference('B', 'server/a.js', 2)]);

  const findings = findMissingVariables(usages, example([], false));

  assert.equal(findings.length, 1);
  assert.equal(findings[0].ruleId, 'missing-template');
  assert.equal(findings[0].file, 'server/.env.example');
  assert.match(findings[0].action, /Create server\/\.env\.example and declare the 2 variables this app reads: A=, B=\./);
});

test('a missing example is fine when the app references nothing', () => {
  assert.deepEqual(findMissingVariables([], example([], false)), []);
});

test('findings sort by severity, app, variable, rule, then location', () => {
  const finding = (severity, app, variable, ruleId) => ({ severity, app, variable, ruleId, additionalLocations: [], action: '' });
  const sorted = sortFindings([
    finding('info', 'server', 'A', 'node-runtime'),
    finding('info', 'client', 'VITE_B', 'vite-build-time'),
    finding('warning', 'client', 'VITE_B', 'public-secret-name'),
    finding('error', 'server', 'A', 'missing-declaration'),
    finding('error', 'client', 'VITE_Z', 'missing-declaration'),
    finding('info', 'client', 'VITE_A', 'vite-build-time'),
  ]);

  assert.deepEqual(
    sorted.map((item) => `${item.severity} ${item.app} ${item.variable}`),
    [
      'error client VITE_Z',
      'error server A',
      'warning client VITE_B',
      'info client VITE_A',
      'info client VITE_B',
      'info server A',
    ],
  );
});
