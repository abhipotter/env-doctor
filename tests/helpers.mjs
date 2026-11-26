import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
export const CLI_PATH = path.join(REPO_ROOT, 'dist', 'cli.js');

/** Creates a temporary project from a map of relative paths to file contents. */
export function createProject(t, files = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'env-doctor-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFiles(root, files);
  return root;
}

export function writeFiles(root, files) {
  for (const [relativePath, contents] of Object.entries(files)) {
    const absolutePath = path.join(root, relativePath);
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, contents);
  }
}

export function runCli(args, options = {}) {
  const result = spawnSync(process.execPath, [CLI_PATH, ...args], {
    cwd: options.cwd ?? REPO_ROOT,
    env: options.env ?? process.env,
    encoding: 'utf8',
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}
