/**
 * A problem that stops the check from completing: bad arguments, an invalid
 * project layout, or an input that could not be read or parsed. The CLI maps
 * it to exit code 2. Messages must never contain file contents or env values.
 */
export class CheckFailure extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CheckFailure';
  }
}

const FILE_SYSTEM_REASONS: Record<string, string> = {
  ENOENT: 'not found',
  ENOTDIR: 'a parent path is not a directory',
  EISDIR: 'is a directory',
  EACCES: 'permission denied',
  EPERM: 'operation not permitted',
  ELOOP: 'too many symbolic links',
  EMFILE: 'too many open files',
  ENAMETOOLONG: 'path is too long',
  EIO: 'input/output error',
};

/** A short reason for a file-system error. Avoids the raw message, which repeats absolute paths. */
export function describeFileSystemError(error: unknown): string {
  const code = errorCode(error);
  if (code === undefined) {
    return 'unknown error';
  }
  return FILE_SYSTEM_REASONS[code] ?? code;
}

export function errorCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string') {
    return error.code;
  }
  return undefined;
}
