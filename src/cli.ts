#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import { runCheck } from './check.js';
import { CheckFailure } from './errors.js';
import { formatReport } from './report/terminal.js';
import { escapeControlCharacters } from './text.js';

const EXIT_SUCCESS = 0;
const EXIT_ERROR_FINDINGS = 1;
const EXIT_CHECK_FAILED = 2;

const GENERAL_HELP = `Usage: env-doctor <command> [options]

Checks environment variable usage in a Vite client and a Node server.

Commands:
  check          Compare env references with each app's .env.example

Options:
  -h, --help     Show help
  -v, --version  Show the installed version

Run "env-doctor check --help" for check options.
`;

const CHECK_HELP = `Usage: env-doctor check [--client <dir>] [--server <dir>]

Scans the client and server folders, compares the environment variables they
reference with each app's .env.example, and explains when a changed value
takes effect. Only variable names are reported, never values.

Options:
  --client <dir>  Vite client folder (default: client)
  --server <dir>  Node server folder (default: server)
  -h, --help      Show this help

Both folders must be separate directories inside the current directory.

Supported references:
  client  import.meta.env.VITE_NAME and import.meta.env['VITE_NAME']
          (default VITE_ prefix only; custom envPrefix is not supported)
  server  process.env.NAME and process.env['NAME']

Exit codes:
  0  No errors found. Warnings and informational findings may be present.
  1  At least one error was found.
  2  The check could not run: invalid arguments, layout, or unreadable input.
`;

type Command =
  | { kind: 'help'; text: string }
  | { kind: 'version' }
  | { kind: 'check'; client?: string; server?: string };

const OPTIONS = {
  help: { type: 'boolean', short: 'h' },
  version: { type: 'boolean', short: 'v' },
  client: { type: 'string' },
  server: { type: 'string' },
} as const;

const EXAMPLE_FOLDERS = { client: 'frontend', server: 'backend' } as const;

function parseCommand(argv: string[]): Command {
  // Non-strict parsing with tokens lets every usage error be phrased here,
  // with user input escaped, instead of surfacing Node's generic messages.
  const { tokens } = parseArgs({ args: argv, options: OPTIONS, strict: false, allowPositionals: true, tokens: true });

  const positionals: string[] = [];
  const paths: { client?: string; server?: string } = {};
  let wantsHelp = false;
  let wantsVersion = false;

  for (const token of tokens) {
    if (token.kind === 'option-terminator') {
      continue;
    }
    if (token.kind === 'positional') {
      positionals.push(token.value);
      continue;
    }

    const name = token.name;
    if (name === 'help' || name === 'version') {
      if (token.value !== undefined) {
        throw new CheckFailure(`${token.rawName} does not take a value.`);
      }
      if (name === 'help') {
        wantsHelp = true;
      } else {
        wantsVersion = true;
      }
      continue;
    }

    if (name === 'client' || name === 'server') {
      if (paths[name] !== undefined) {
        throw new CheckFailure(`--${name} was given more than once. Pass a single directory.`);
      }
      const value = token.value;
      const looksLikeAnotherOption = !token.inlineValue && value !== undefined && value.startsWith('-');
      if (value === undefined || value === '' || looksLikeAnotherOption) {
        throw new CheckFailure(`--${name} needs a directory, for example: --${name} ${EXAMPLE_FOLDERS[name]}`);
      }
      paths[name] = value;
      continue;
    }

    throw new CheckFailure(`Unknown option ${quote(token.rawName)}. Run "env-doctor check --help" for options.`);
  }

  const [commandName, ...extraArguments] = positionals;

  if (commandName === undefined) {
    if (wantsHelp) {
      return { kind: 'help', text: GENERAL_HELP };
    }
    if (wantsVersion) {
      return { kind: 'version' };
    }
    if (paths.client !== undefined || paths.server !== undefined) {
      throw new CheckFailure('--client and --server are check options, for example: env-doctor check --client frontend');
    }
    throw new CheckFailure('Missing command. Run "env-doctor check" to scan this project, or "env-doctor --help".');
  }

  if (commandName !== 'check') {
    throw new CheckFailure(`Unknown command ${quote(commandName)}. Run "env-doctor --help" for commands.`);
  }

  const firstExtra = extraArguments[0];
  if (firstExtra !== undefined) {
    throw new CheckFailure(
      `Unexpected argument ${quote(firstExtra)}. Use --client <dir> and --server <dir> to choose folders.`,
    );
  }

  if (wantsHelp) {
    return { kind: 'help', text: CHECK_HELP };
  }
  if (wantsVersion) {
    return { kind: 'version' };
  }
  return { kind: 'check', ...paths };
}

function readPackageVersion(): string {
  const packageJson: unknown = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  if (typeof packageJson === 'object' && packageJson !== null && 'version' in packageJson) {
    if (typeof packageJson.version === 'string') {
      return packageJson.version;
    }
  }
  throw new CheckFailure('Could not determine the installed env-doctor version.');
}

async function main(argv: string[]): Promise<number> {
  try {
    const command = parseCommand(argv);

    if (command.kind === 'help') {
      process.stdout.write(command.text);
      return EXIT_SUCCESS;
    }

    if (command.kind === 'version') {
      process.stdout.write(`${readPackageVersion()}\n`);
      return EXIT_SUCCESS;
    }

    const result = await runCheck({ cwd: process.cwd(), client: command.client, server: command.server });
    process.stdout.write(formatReport(result));
    const hasErrors = result.findings.some((finding) => finding.severity === 'error');
    return hasErrors ? EXIT_ERROR_FINDINGS : EXIT_SUCCESS;
  } catch (error) {
    reportFailure(error);
    return EXIT_CHECK_FAILED;
  }
}

function reportFailure(error: unknown): void {
  if (error instanceof CheckFailure) {
    process.stderr.write(`env-doctor: ${error.message}\n`);
    return;
  }
  // Unexpected errors may carry input text in their messages, so only the
  // error type is shown.
  const errorName = error instanceof Error ? error.name : typeof error;
  process.stderr.write(
    `env-doctor: unexpected internal error (${escapeControlCharacters(errorName)}).\n` +
      'Please file a bug report with a sanitized reproduction.\n',
  );
}

function quote(text: string): string {
  return `"${escapeControlCharacters(text)}"`;
}

process.exitCode = await main(process.argv.slice(2));
