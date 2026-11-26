import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';

import { CheckFailure, describeFileSystemError, errorCode } from '../errors.js';
import { compareText, escapeControlCharacters } from '../text.js';
import type { AppName } from '../types.js';

export interface AppDirectory {
  app: AppName;
  absolutePath: string;
  relativePath: string;
}

export interface ProjectLayout {
  rootDirectory: string;
  client: AppDirectory;
  server: AppDirectory;
}

export interface SourceFile {
  absolutePath: string;
  relativePath: string;
}

export interface LayoutOptions {
  cwd: string;
  client?: string;
  server?: string;
}

const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.mts', '.cts']);
const EXCLUDED_DIRECTORIES = new Set(['node_modules', '.git', 'dist', 'build', 'coverage']);
const DECLARATION_FILE = /\.d\.[cm]?ts$/;
const VITE_CONFIG_FILE = /^(vite|vitest)\.config\.[cm]?[jt]s$/;

const CUSTOM_FOLDER_EXAMPLE = 'env-doctor check --client frontend --server backend';

export async function resolveProjectLayout(options: LayoutOptions): Promise<ProjectLayout> {
  let rootDirectory: string;
  try {
    rootDirectory = await realpath(options.cwd);
  } catch (error) {
    throw new CheckFailure(`Could not open the current directory: ${describeFileSystemError(error)}.`);
  }

  const client = await resolveAppDirectory(rootDirectory, options.cwd, 'client', options.client);
  const server = await resolveAppDirectory(rootDirectory, options.cwd, 'server', options.server);

  if (isSameOrInside(client.absolutePath, server.absolutePath) || isSameOrInside(server.absolutePath, client.absolutePath)) {
    throw new CheckFailure(
      `The client directory ${quotePath(client.relativePath)} and server directory ${quotePath(server.relativePath)} overlap.\n` +
        'Pass two separate folders, for example:\n' +
        `  ${CUSTOM_FOLDER_EXAMPLE}`,
    );
  }

  return { rootDirectory, client, server };
}

async function resolveAppDirectory(
  rootDirectory: string,
  cwd: string,
  app: AppName,
  requested: string | undefined,
): Promise<AppDirectory> {
  const input = requested ?? app;
  const label = requested === undefined ? `${app} directory ${quotePath(input)}` : `--${app} directory ${quotePath(input)}`;

  let absolutePath: string;
  try {
    absolutePath = await realpath(path.resolve(cwd, input));
  } catch (error) {
    const code = errorCode(error);
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      throw missingDirectoryFailure(app, label, requested === undefined);
    }
    throw new CheckFailure(`Could not open the ${label}: ${describeFileSystemError(error)}.`);
  }

  if (absolutePath === rootDirectory) {
    throw new CheckFailure(
      `The ${label} is the current directory itself. Pass the app's own folder, for example: --${app} ${app}`,
    );
  }
  if (!isStrictlyInside(rootDirectory, absolutePath)) {
    throw new CheckFailure(
      `The ${label} resolves outside the current directory.\n` +
        'Run env-doctor from your project root and pass folders inside it.',
    );
  }

  let info;
  try {
    info = await stat(absolutePath);
  } catch (error) {
    throw new CheckFailure(`Could not open the ${label}: ${describeFileSystemError(error)}.`);
  }
  if (!info.isDirectory()) {
    throw new CheckFailure(`The ${label} is not a directory.`);
  }

  return { app, absolutePath, relativePath: toRelativePath(rootDirectory, absolutePath) };
}

function missingDirectoryFailure(app: AppName, label: string, isDefault: boolean): CheckFailure {
  if (isDefault) {
    return new CheckFailure(
      `Could not find the ${label} in the current directory.\n` +
        'Run env-doctor from your project root, or point it at your app folders:\n' +
        `  ${CUSTOM_FOLDER_EXAMPLE}`,
    );
  }
  return new CheckFailure(`Could not find the ${label}. Check the path passed to --${app}.`);
}

/**
 * Lists supported source files under an app directory in a stable order.
 * Symlinks inside the app are skipped so the scan cannot wander outside it.
 */
export async function discoverSourceFiles(rootDirectory: string, appDirectory: AppDirectory): Promise<SourceFile[]> {
  const files: SourceFile[] = [];
  const pending = [appDirectory.absolutePath];

  while (pending.length > 0) {
    const directory = pending.pop() as string;
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      const relativePath = toRelativePath(rootDirectory, directory);
      throw new CheckFailure(`Could not read directory ${quotePath(relativePath)}: ${describeFileSystemError(error)}.`);
    }

    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        continue;
      }
      if (entry.isDirectory()) {
        if (!EXCLUDED_DIRECTORIES.has(entry.name)) {
          pending.push(absolutePath);
        }
        continue;
      }
      if (!entry.isFile() || !isSupportedSourceName(entry.name)) {
        continue;
      }
      const isAppRoot = directory === appDirectory.absolutePath;
      if (appDirectory.app === 'client' && isAppRoot && VITE_CONFIG_FILE.test(entry.name)) {
        continue;
      }
      files.push({ absolutePath, relativePath: toRelativePath(rootDirectory, absolutePath) });
    }
  }

  files.sort((left, right) => compareText(left.relativePath, right.relativePath));
  return files;
}

function isSupportedSourceName(fileName: string): boolean {
  if (DECLARATION_FILE.test(fileName)) {
    return false;
  }
  return SOURCE_EXTENSIONS.has(path.extname(fileName));
}

export async function readSourceFile(file: SourceFile): Promise<string> {
  try {
    return await readFile(file.absolutePath, 'utf8');
  } catch (error) {
    throw new CheckFailure(`Could not read ${quotePath(file.relativePath)}: ${describeFileSystemError(error)}.`);
  }
}

/** Repo-relative path with forward slashes, as shown in reports. */
export function toRelativePath(rootDirectory: string, absolutePath: string): string {
  return path.relative(rootDirectory, absolutePath).split(path.sep).join('/');
}

export function isStrictlyInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  if (relative === '' || path.isAbsolute(relative)) {
    return false;
  }
  const firstSegment = relative.split(path.sep)[0];
  return firstSegment !== '..';
}

function isSameOrInside(parent: string, child: string): boolean {
  return path.relative(parent, child) === '' || isStrictlyInside(parent, child);
}

export function quotePath(relativePath: string): string {
  return `"${escapeControlCharacters(relativePath)}"`;
}
