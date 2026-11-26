import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { createProject, REPO_ROOT, runCli, writeFiles } from './helpers.mjs';

const PACKAGE_VERSION = JSON.parse(readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8')).version;
const IS_WINDOWS = process.platform === 'win32';

const BASIC_PROJECT = {
  'client/src/api.ts': 'export const apiUrl = import.meta.env.VITE_API_URL;\n',
  'client/.env.example': 'VITE_API_URL=\n',
  'server/index.js': 'export const port = process.env.PORT;\n',
  'server/.env.example': 'PORT=3000\n',
};

function trySymlink(target, linkPath, type) {
  try {
    symlinkSync(target, linkPath, type);
    return true;
  } catch {
    return false;
  }
}

/** Joins indented lines so assertions on action text do not depend on where it wraps. */
function unwrap(text) {
  return text.replace(/\n {2}(?=\S)/g, ' ');
}

function assertCheckFailed(result, pattern) {
  assert.equal(result.status, 2, `expected exit 2, got ${result.status}\n${result.stdout}${result.stderr}`);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, pattern);
  assert.doesNotMatch(result.stderr, /\n\s+at /, 'stderr should not contain a stack trace');
}

test('--help and check --help print usage and exit 0', () => {
  const general = runCli(['--help']);
  assert.equal(general.status, 0);
  assert.match(general.stdout, /Usage: env-doctor <command>/);
  assert.equal(general.stderr, '');

  const check = runCli(['check', '--help']);
  assert.equal(check.status, 0);
  assert.match(check.stdout, /Usage: env-doctor check \[--client <dir>\] \[--server <dir>\]/);
  assert.match(check.stdout, /default VITE_ prefix only/);
});

test('--version prints the package version', () => {
  const result = runCli(['--version']);

  assert.equal(result.status, 0);
  assert.equal(result.stdout, `${PACKAGE_VERSION}\n`);
});

test('usage errors exit 2 with a message on stderr', async (t) => {
  const cases = [
    { args: [], pattern: /Missing command/ },
    { args: ['scan'], pattern: /Unknown command "scan"/ },
    { args: ['check', '--fix'], pattern: /Unknown option "--fix"/ },
    { args: ['check', 'extra'], pattern: /Unexpected argument "extra"/ },
    { args: ['check', '--client', 'a', '--client', 'b'], pattern: /--client was given more than once/ },
    { args: ['check', '--server'], pattern: /--server needs a directory/ },
    { args: ['check', '--client', '--server', 'api'], pattern: /--client needs a directory/ },
    { args: ['check', '--client='], pattern: /--client needs a directory/ },
    { args: ['check', '--help=yes'], pattern: /--help does not take a value/ },
    { args: ['--client', 'web'], pattern: /--client and --server are check options/ },
  ];

  for (const { args, pattern } of cases) {
    await t.test(args.join(' ') || '(no arguments)', () => {
      assertCheckFailed(runCli(args), pattern);
    });
  }
});

test('a passing project exits 0 with deployment guidance', (t) => {
  const root = createProject(t, BASIC_PROJECT);

  const result = runCli(['check'], { cwd: root });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.equal(
    result.stdout,
    [
      'INFO  [vite-build-time] VITE_API_URL  client/src/api.ts:1:23',
      '  Supply the updated value when building, then redeploy the frontend assets.',
      '',
      'INFO  [node-runtime] PORT  server/index.js:1:21',
      '  If injected at startup, start a new server process with the updated value.',
      '',
      'Scanned client (1 file, 1 reference) and server (1 file, 1 reference).',
      '0 errors, 0 warnings, 2 informational findings',
      '',
    ].join('\n'),
  );
});

test('a missing declaration exits 1 and names the example file', (t) => {
  const root = createProject(t, {
    ...BASIC_PROJECT,
    'server/src/config.ts': 'export const secret = process.env.JWT_SECRET;\n',
  });

  const result = runCli(['check'], { cwd: root });

  assert.equal(result.status, 1);
  assert.match(
    result.stdout,
    /^ERROR \[missing-declaration\] JWT_SECRET {2}server\/src\/config\.ts:1:23\n {2}Add JWT_SECRET= to server\/\.env\.example and configure the value separately\.\n/,
  );
  assert.match(result.stdout, /1 error, 0 warnings, 3 informational findings\n$/);
});

test('a missing example produces one missing-template error for that app', (t) => {
  const root = createProject(t, {
    'client/src/api.ts': 'export const apiUrl = import.meta.env.VITE_API_URL;\n',
    'client/.env.example': 'VITE_API_URL=\n',
    'server/index.js': 'const a = process.env.PORT;\nconst b = process.env.DATABASE_URL;\n',
  });

  const result = runCli(['check'], { cwd: root });

  assert.equal(result.status, 1);
  assert.equal(result.stdout.match(/^ERROR/gm).length, 1);
  assert.match(result.stdout, /ERROR \[missing-template\] server\/\.env\.example\n/);
  assert.match(result.stdout, /Create server\/\.env\.example and declare the 2 variables this app reads:/);
  assert.doesNotMatch(result.stdout, /missing-declaration/);
});

test('the same key in two apps is checked against each app independently', (t) => {
  const root = createProject(t, {
    'client/src/a.ts': 'const value = import.meta.env.VITE_SHARED;\n',
    'client/.env.example': 'VITE_SHARED=\n',
    'server/a.js': 'const value = process.env.VITE_SHARED;\n',
    'server/.env.example': 'OTHER=\n',
  });

  const result = runCli(['check'], { cwd: root });

  assert.equal(result.status, 1);
  assert.match(result.stdout, /ERROR \[missing-declaration\] VITE_SHARED {2}server\/a\.js:1:15/);
  assert.doesNotMatch(result.stdout, /ERROR \[missing-declaration\] VITE_SHARED {2}client/);
  assert.match(result.stdout, /INFO {2}\[vite-build-time\] VITE_SHARED {2}client\/src\/a\.ts:1:15/);
});

test('repeated references are grouped in a stable order', (t) => {
  const files = { ...BASIC_PROJECT };
  for (const name of ['e', 'c', 'a', 'd', 'b']) {
    files[`server/src/${name}.js`] = `\nconst token = process.env.SESSION_KEY;\n`;
  }
  const root = createProject(t, files);

  const first = runCli(['check'], { cwd: root });
  const second = runCli(['check'], { cwd: root });

  assert.equal(first.status, 1);
  assert.equal(first.stdout, second.stdout);
  assert.equal(first.stdout.match(/\[missing-declaration\] SESSION_KEY/g).length, 1);
  assert.match(
    first.stdout,
    /ERROR \[missing-declaration\] SESSION_KEY {2}server\/src\/a\.js:2:15\n {2}Also referenced at server\/src\/b\.js:2:15, server\/src\/c\.js:2:15, and 2 more\.\n/,
  );
});

test('a declared secret-like Vite key warns but still exits 0', (t) => {
  const root = createProject(t, {
    ...BASIC_PROJECT,
    'client/src/pay.ts': 'export const key = import.meta.env.VITE_STRIPE_SECRET_KEY;\n',
    'client/.env.example': 'VITE_API_URL=\nVITE_STRIPE_SECRET_KEY=\n',
  });

  const result = runCli(['check'], { cwd: root });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /^WARN {2}\[public-secret-name\] VITE_STRIPE_SECRET_KEY {2}client\/src\/pay\.ts:1:20\n/);
  assert.match(unwrap(result.stdout), /If this is a private credential, keep it on the server and remove the browser reference\./);
  assert.match(result.stdout, /0 errors, 1 warning, 3 informational findings\n$/);
});

test('Vite built-ins are excluded and other unprefixed client names are reported as skipped', (t) => {
  const root = createProject(t, {
    ...BASIC_PROJECT,
    'client/src/mode.ts': 'const a = import.meta.env.MODE, b = import.meta.env.DEV, c = import.meta.env.PUBLIC_URL;\n',
  });

  const result = runCli(['check'], { cwd: root });

  assert.equal(result.status, 0);
  assert.doesNotMatch(result.stdout, /\] (MODE|DEV|PUBLIC_URL) /);
  assert.match(result.stdout, /Skipped 1 client reference without the VITE_ prefix/);
});

test('a project with no supported references says so and exits 0', (t) => {
  const root = createProject(t, {
    'client/src/main.ts': 'console.log("hello");\n',
    'server/index.js': 'console.log("hello");\n',
  });

  const result = runCli(['check'], { cwd: root });

  assert.equal(result.status, 0);
  assert.equal(
    result.stdout,
    'No supported environment variable references were detected in 2 scanned files.\n0 errors, 0 warnings, 0 informational findings\n',
  );
});

test('discovery skips generated folders, declarations, Vite config, and nested symlinks', (t) => {
  const root = createProject(t, {
    ...BASIC_PROJECT,
    'client/vite.config.ts': 'export default { base: import.meta.env.VITE_FROM_CONFIG };\n',
    'client/src/env.d.ts': 'declare const x: typeof import.meta.env.VITE_FROM_DECLARATION;\n',
    'client/dist/assets/index.js': 'import.meta.env.VITE_FROM_DIST;\n',
    'server/node_modules/lib/index.js': 'process.env.FROM_NODE_MODULES;\n',
    'server/build/index.js': 'process.env.FROM_BUILD;\n',
    'server/coverage/x.js': 'process.env.FROM_COVERAGE;\n',
    'server/notes.md': 'process.env.FROM_MARKDOWN\n',
    'outside/linked.js': 'process.env.FROM_SYMLINK;\n',
  });
  trySymlink(path.join(root, 'outside'), path.join(root, 'server', 'linked'), 'junction');

  const result = runCli(['check'], { cwd: root });

  assert.equal(result.status, 0, result.stdout);
  assert.doesNotMatch(result.stdout, /FROM_/);
  assert.match(result.stdout, /Scanned client \(1 file, 1 reference\) and server \(1 file, 1 reference\)\./);
});

test('custom folders work with relative and absolute paths containing spaces', (t) => {
  const root = createProject(t, {
    'web app/src/a.ts': 'import.meta.env.VITE_API_URL;\n',
    'web app/.env.example': 'VITE_API_URL=\n',
    'api server/index.js': 'process.env.PORT;\n',
    'api server/.env.example': 'PORT=\n',
  });

  const relative = runCli(['check', '--client', 'web app', '--server', './api server'], { cwd: root });
  assert.equal(relative.status, 0, relative.stderr);
  assert.match(relative.stdout, /web app\/src\/a\.ts:1:1/);

  const absolute = runCli(['check', `--client=${path.join(root, 'web app')}`, '--server', path.join(root, 'api server')], {
    cwd: root,
  });
  assert.equal(absolute.status, 0, absolute.stderr);
  assert.equal(absolute.stdout, relative.stdout);
});

test('a missing default folder suggests the custom folder flags', (t) => {
  const root = createProject(t, { 'frontend/src/a.ts': '', 'backend/index.js': '' });

  const result = runCli(['check'], { cwd: root });

  assertCheckFailed(result, /Could not find the client directory "client"/);
  assert.match(result.stderr, /env-doctor check --client frontend --server backend/);
});

test('invalid app roots exit 2', async (t) => {
  const root = createProject(t, {
    ...BASIC_PROJECT,
    'client/nested/a.ts': '',
    'not-a-dir.txt': '',
  });
  const outside = mkdtempSync(path.join(tmpdir(), 'env-doctor-outside-'));
  t.after(() => rmSync(outside, { recursive: true, force: true }));

  const cases = [
    { args: ['--client', 'missing'], pattern: /Could not find the --client directory "missing"/ },
    { args: ['--client', 'not-a-dir.txt'], pattern: /--client directory "not-a-dir\.txt" is not a directory/ },
    { args: ['--client', '../'], pattern: /resolves outside the current directory/ },
    { args: ['--server', outside], pattern: /resolves outside the current directory/ },
    { args: ['--client', '.'], pattern: /--client directory "." is the current directory itself/ },
    { args: ['--server', 'client'], pattern: /overlap/ },
    { args: ['--server', 'client/nested'], pattern: /overlap/ },
  ];

  for (const { args, pattern } of cases) {
    await t.test(args.join(' '), () => {
      assertCheckFailed(runCli(['check', ...args], { cwd: root }), pattern);
    });
  }
});

test('an app root symlinked outside the project is rejected', (t) => {
  const root = createProject(t, BASIC_PROJECT);
  const outside = mkdtempSync(path.join(tmpdir(), 'env-doctor-outside-'));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  if (!trySymlink(outside, path.join(root, 'linked-client'), 'junction')) {
    t.skip('symlinks are not available');
    return;
  }

  const result = runCli(['check', '--client', 'linked-client'], { cwd: root });

  assertCheckFailed(result, /--client directory "linked-client" resolves outside the current directory/);
});

test('an example file symlinked outside its app is rejected', (t) => {
  const root = createProject(t, { ...BASIC_PROJECT, 'shared.env': 'PORT=\n' });
  rmSync(path.join(root, 'server', '.env.example'));
  if (!trySymlink(path.join(root, 'shared.env'), path.join(root, 'server', '.env.example'), 'file')) {
    t.skip('symlinks are not available');
    return;
  }

  const result = runCli(['check'], { cwd: root });

  assertCheckFailed(result, /"server\/\.env\.example" is a symbolic link that points outside its app directory/);
});

test('a source syntax error exits 2 with its location and no excerpt', (t) => {
  const root = createProject(t, {
    ...BASIC_PROJECT,
    'server/src/broken.ts': 'const token = "sentinel-in-source";\nconst = ;\n',
  });

  const result = runCli(['check'], { cwd: root });

  assertCheckFailed(result, /Could not parse server\/src\/broken\.ts:2:7 \(syntax error TS\d+\)/);
  assert.doesNotMatch(result.stderr, /sentinel-in-source/);
});

test('an example path that is not a regular file exits 2', (t) => {
  const root = createProject(t, BASIC_PROJECT);
  rmSync(path.join(root, 'client', '.env.example'));
  mkdirSync(path.join(root, 'client', '.env.example'));

  const result = runCli(['check'], { cwd: root });

  assertCheckFailed(result, /"client\/\.env\.example" is not a regular file/);
});

test('an unreadable source file exits 2 instead of reporting a clean scan', (t) => {
  const isRoot = typeof process.getuid === 'function' && process.getuid() === 0;
  if (IS_WINDOWS || isRoot) {
    t.skip('file permissions cannot make a file unreadable here');
    return;
  }
  const root = createProject(t, { ...BASIC_PROJECT, 'server/secret.js': 'process.env.PORT;\n' });
  const unreadable = path.join(root, 'server', 'secret.js');
  chmodSync(unreadable, 0o000);

  const result = runCli(['check'], { cwd: root });

  assertCheckFailed(result, /Could not read "server\/secret\.js": permission denied\./);
});

test('control characters in file names are escaped in the report', (t) => {
  if (IS_WINDOWS) {
    t.skip('Windows file names cannot contain control characters');
    return;
  }
  const root = createProject(t, {
    ...BASIC_PROJECT,
    'server/evil\u001b[31m.js': 'process.env.PORT;\n',
  });

  const result = runCli(['check'], { cwd: root });

  assert.equal(result.status, 0);
  assert.doesNotMatch(result.stdout, /\u001b/);
  assert.match(result.stdout, /server\/evil\\x1b\[31m\.js:1:1/);
});

test('values from examples, env files, and the process environment never appear in output', (t) => {
  const sentinel = 'sentinel-value-7f3a91';
  const root = createProject(t, {
    'client/src/a.ts': 'import.meta.env.VITE_API_URL; import.meta.env.VITE_MISSING_KEY;\n',
    'client/.env.example': `VITE_API_URL=${sentinel}\n`,
    'client/.env': `VITE_API_URL=${sentinel}\nVITE_MISSING_KEY=${sentinel}\n`,
    'client/.env.local': `VITE_MISSING_KEY=${sentinel}\n`,
    'server/index.js': 'process.env.PORT; process.env.DATABASE_URL;\n',
    'server/.env.example': `PORT="${sentinel}"\nexport DATABASE_URL='${sentinel}'\n`,
    'server/.env': `DATABASE_URL=${sentinel}\n`,
    'server/.env.production': `DATABASE_URL=${sentinel}\n`,
  });
  const env = { ...process.env, PORT: sentinel, DATABASE_URL: sentinel, VITE_MISSING_KEY: sentinel };

  const failing = runCli(['check'], { cwd: root, env });
  assert.equal(failing.status, 1);

  writeFiles(root, { 'server/src/broken.js': `const x = "${sentinel}"; const = ;\n` });
  const broken = runCli(['check'], { cwd: root, env });
  assert.equal(broken.status, 2);

  for (const output of [failing.stdout, failing.stderr, broken.stdout, broken.stderr]) {
    assert.doesNotMatch(output, new RegExp(sentinel));
  }
});
