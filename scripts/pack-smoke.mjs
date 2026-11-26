// Packs the package, installs the tarball into an empty folder, and checks
// that the installed executable behaves like the local build.
import { spawnSync } from 'node:child_process';
import { appendFileSync, cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const isWindows = process.platform === 'win32';
const packageJson = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));

const REQUIRED_FILES = ['package.json', 'README.md', 'LICENSE', 'dist/cli.js', 'dist/check.js'];
const FORBIDDEN_PREFIXES = ['src/', 'tests/', 'examples/', 'scripts/', '.github/', 'node_modules/'];

function quoteForShell(argument) {
  return /[\s"]/.test(argument) ? `"${argument.replaceAll('"', '\\"')}"` : argument;
}

// npm and installed bins are .cmd shims on Windows, which need a shell.
function run(command, args, options = {}) {
  const result = spawnSync(isWindows ? [command, ...args].map(quoteForShell).join(' ') : command, isWindows ? [] : args, {
    cwd: options.cwd ?? repoRoot,
    encoding: 'utf8',
    shell: isWindows,
  });
  if (result.error) {
    throw result.error;
  }
  return result;
}

function runOrFail(command, args, options) {
  const result = run(command, args, options);
  if (result.status !== 0) {
    fail(`${command} ${args.join(' ')} exited ${result.status}\n${result.stdout}${result.stderr}`);
  }
  return result;
}

function fail(message) {
  console.error(`pack smoke test failed: ${message}`);
  process.exit(1);
}

function expect(condition, message) {
  if (!condition) {
    fail(message);
  }
}

const workDirectory = mkdtempSync(path.join(tmpdir(), 'env-doctor-pack-'));
try {
  const packed = runOrFail('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', workDirectory]);
  const [packInfo] = JSON.parse(packed.stdout);
  const packedFiles = packInfo.files.map((file) => file.path.replaceAll('\\', '/'));

  for (const required of REQUIRED_FILES) {
    expect(packedFiles.includes(required), `package is missing ${required}`);
  }
  for (const file of packedFiles) {
    const forbidden = FORBIDDEN_PREFIXES.some((prefix) => file.startsWith(prefix)) || /(^|\/)\.env/.test(file);
    expect(!forbidden, `package unexpectedly contains ${file}`);
  }
  console.log(`Packed ${packInfo.filename} with ${packedFiles.length} files.`);

  const installDirectory = path.join(workDirectory, 'consumer');
  cpSync(path.join(repoRoot, 'examples', 'vite-express'), installDirectory, {
    recursive: true,
    filter: (source) => !source.split(path.sep).includes('node_modules'),
  });
  writeFileSync(path.join(installDirectory, 'package.json'), JSON.stringify({ name: 'consumer', private: true }, null, 2));
  runOrFail('npm', ['install', '--no-audit', '--no-fund', path.join(workDirectory, packInfo.filename)], {
    cwd: installDirectory,
  });

  const installedBin = path.join(installDirectory, 'node_modules', '.bin', isWindows ? 'env-doctor.cmd' : 'env-doctor');
  const localCli = path.join(repoRoot, 'dist', 'cli.js');

  const version = runOrFail(installedBin, ['--version'], { cwd: installDirectory });
  expect(version.stdout.trim() === packageJson.version, `--version printed ${version.stdout.trim()}`);

  const help = runOrFail(installedBin, ['check', '--help'], { cwd: installDirectory });
  expect(help.stdout.includes('Usage: env-doctor check'), 'check --help did not print usage');

  const failing = run(installedBin, ['check'], { cwd: installDirectory });
  const failingLocal = run(process.execPath, [localCli, 'check'], { cwd: installDirectory });
  expect(failing.status === 1, `demo scan exited ${failing.status}, expected 1\n${failing.stdout}${failing.stderr}`);
  expect(failing.stdout === failingLocal.stdout, 'installed and local reports differ for the demo');

  appendFileSync(path.join(installDirectory, 'server', '.env.example'), 'CLIENT_ORIGIN=http://localhost:5173\n');
  const fixed = run(installedBin, ['check'], { cwd: installDirectory });
  expect(fixed.status === 0, `fixed demo scan exited ${fixed.status}, expected 0\n${fixed.stdout}${fixed.stderr}`);

  const usageError = run(installedBin, ['check', '--unknown'], { cwd: installDirectory });
  expect(usageError.status === 2, `unknown option exited ${usageError.status}, expected 2`);

  console.log('Installed tarball matches the local build: help, version, demo scans, and exit codes.');
} finally {
  rmSync(workDirectory, { recursive: true, force: true });
}
