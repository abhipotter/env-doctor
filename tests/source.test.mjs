import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CheckFailure } from '../dist/errors.js';
import { findEnvReferences } from '../dist/scan/source.js';

function names(references) {
  return references.map((reference) => reference.name);
}

test('finds client property and bracket access with 1-based locations', () => {
  const source = [
    'const api = import.meta.env.VITE_API_URL;',
    "const key = import.meta.env['VITE_MAP_ID'];",
    'const tag = import.meta.env[`VITE_TAG`];',
  ].join('\n');

  const references = findEnvReferences(source, 'client/src/api.ts', 'client');

  assert.deepEqual(references, [
    { app: 'client', mechanism: 'import.meta.env', name: 'VITE_API_URL', file: 'client/src/api.ts', line: 1, column: 13 },
    { app: 'client', mechanism: 'import.meta.env', name: 'VITE_MAP_ID', file: 'client/src/api.ts', line: 2, column: 13 },
    { app: 'client', mechanism: 'import.meta.env', name: 'VITE_TAG', file: 'client/src/api.ts', line: 3, column: 13 },
  ]);
});

test('finds server property and bracket access', () => {
  const source = [
    'export const config = {',
    '  database: process.env.DATABASE_URL,',
    "  secret: process.env['JWT_SECRET'],",
    '};',
  ].join('\n');

  const references = findEnvReferences(source, 'server/src/config.js', 'server');

  assert.deepEqual(
    references.map(({ name, line, column }) => ({ name, line, column })),
    [
      { name: 'DATABASE_URL', line: 2, column: 13 },
      { name: 'JWT_SECRET', line: 3, column: 11 },
    ],
  );
  assert.ok(references.every((reference) => reference.mechanism === 'process.env'));
});

test('parses JSX and TSX files, including JSX in plain .js files', () => {
  const tsx = 'export const Banner = (): JSX.Element => <p>{import.meta.env.VITE_BANNER}</p>;';
  const jsx = 'export const Banner = () => <p>{import.meta.env.VITE_BANNER}</p>;';

  assert.deepEqual(names(findEnvReferences(tsx, 'client/src/Banner.tsx', 'client')), ['VITE_BANNER']);
  assert.deepEqual(names(findEnvReferences(jsx, 'client/src/Banner.jsx', 'client')), ['VITE_BANNER']);
  assert.deepEqual(names(findEnvReferences(jsx, 'client/src/Banner.js', 'client')), ['VITE_BANNER']);
});

test('parses TypeScript-only syntax in .ts, .mts, and .cts files', () => {
  const source = 'const port: number = Number(process.env.PORT!) satisfies number;';

  for (const file of ['server/a.ts', 'server/b.mts', 'server/c.cts']) {
    assert.deepEqual(names(findEnvReferences(source, file, 'server')), ['PORT'], file);
  }
});

test('ignores comments, strings, and template text', () => {
  const source = [
    '// process.env.IN_LINE_COMMENT',
    '/* process.env.IN_BLOCK_COMMENT */',
    "const text = 'process.env.IN_STRING';",
    'const template = `process.env.IN_TEMPLATE`;',
    'const real = process.env.REAL_KEY;',
  ].join('\n');

  assert.deepEqual(names(findEnvReferences(source, 'server/src/a.js', 'server')), ['REAL_KEY']);
});

test('skips dynamic keys, destructuring, and aliased env objects', () => {
  const source = [
    'const name = "PORT";',
    'const a = process.env[name];',
    'const b = process.env[`${name}_SUFFIX`];',
    'const { DESTRUCTURED } = process.env;',
    'const env = process.env;',
    'const c = env.ALIASED;',
    'const d = process.env.REAL_KEY;',
  ].join('\n');

  assert.deepEqual(names(findEnvReferences(source, 'server/src/a.js', 'server')), ['REAL_KEY']);
});

test('reads only the access style that belongs to each app', () => {
  const source = 'const a = import.meta.env.VITE_ONE; const b = process.env.TWO;';

  assert.deepEqual(names(findEnvReferences(source, 'client/src/a.ts', 'client')), ['VITE_ONE']);
  assert.deepEqual(names(findEnvReferences(source, 'server/src/a.ts', 'server')), ['TWO']);
});

test('reports Vite built-ins as ordinary references for the checker to exclude', () => {
  const source = 'if (import.meta.env.DEV && import.meta.env.MODE) {}';

  assert.deepEqual(names(findEnvReferences(source, 'client/src/a.ts', 'client')), ['DEV', 'MODE']);
});

test('ignores a byte order mark when computing columns', () => {
  const source = '\uFEFFconst port = process.env.PORT;';

  const [reference] = findEnvReferences(source, 'server/index.js', 'server');

  assert.equal(reference.line, 1);
  assert.equal(reference.column, 14);
});

test('reports a syntax error with its location and without a source excerpt', () => {
  const source = 'const secret = "do-not-print";\nconst = process.env.PORT;';

  assert.throws(
    () => findEnvReferences(source, 'server/src/broken.js', 'server'),
    (error) => {
      assert.ok(error instanceof CheckFailure);
      assert.match(error.message, /server\/src\/broken\.js:2:7/);
      assert.doesNotMatch(error.message, /do-not-print|process\.env/);
      return true;
    },
  );
});
