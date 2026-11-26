import { lstat, readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { parseEnv } from 'node:util';

import { CheckFailure, describeFileSystemError, errorCode } from '../errors.js';
import { isStrictlyInside, quotePath, toRelativePath, type AppDirectory } from '../project/discover.js';
import type { EnvExample } from '../types.js';

const EXAMPLE_FILE_NAME = '.env.example';

/**
 * Returns the keys declared in dotenv text. Values are dropped immediately so
 * they never reach findings, reports, or error messages.
 */
export function parseExampleKeys(text: string): Set<string> {
  const withoutBom = text.startsWith('\uFEFF') ? text.slice(1) : text;
  const parsed = parseEnv(withoutBom);
  return new Set(Object.keys(parsed));
}

export async function readEnvExample(rootDirectory: string, appDirectory: AppDirectory): Promise<EnvExample> {
  const absolutePath = path.join(appDirectory.absolutePath, EXAMPLE_FILE_NAME);
  const relativePath = toRelativePath(rootDirectory, absolutePath);
  const absent: EnvExample = { app: appDirectory.app, path: relativePath, present: false, keys: new Set() };

  let info;
  try {
    info = await lstat(absolutePath);
  } catch (error) {
    if (errorCode(error) === 'ENOENT') {
      return absent;
    }
    throw readFailure(relativePath, error);
  }

  let readablePath = absolutePath;
  if (info.isSymbolicLink()) {
    try {
      readablePath = await realpath(absolutePath);
      info = await stat(readablePath);
    } catch (error) {
      throw readFailure(relativePath, error);
    }
    if (!isStrictlyInside(appDirectory.absolutePath, readablePath)) {
      throw new CheckFailure(
        `${quotePath(relativePath)} is a symbolic link that points outside its app directory. ` +
          'Replace it with a regular file.',
      );
    }
  }

  if (!info.isFile()) {
    throw new CheckFailure(`${quotePath(relativePath)} is not a regular file. Replace it with a dotenv-style file.`);
  }

  let text: string;
  try {
    text = await readFile(readablePath, 'utf8');
  } catch (error) {
    throw readFailure(relativePath, error);
  }

  try {
    return { app: appDirectory.app, path: relativePath, present: true, keys: parseExampleKeys(text) };
  } catch {
    throw new CheckFailure(
      `Could not parse ${quotePath(relativePath)}. Use one KEY=value assignment per line; values may be empty.`,
    );
  }
}

function readFailure(relativePath: string, error: unknown): CheckFailure {
  return new CheckFailure(`Could not read ${quotePath(relativePath)}: ${describeFileSystemError(error)}.`);
}
