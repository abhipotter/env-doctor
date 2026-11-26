# Contributing to Env Doctor

Thanks for helping. This guide covers local setup, the project's conventions, and how to report a bug.

## Local setup

You need Node.js 22 or newer and npm.

```bash
npm ci
npm run build       # compiles src/ to dist/
npm test            # builds, then runs all tests against dist/
```

Other scripts:

| Command | What it does |
| --- | --- |
| `npm run test:only` | Runs the tests without rebuilding |
| `npm run smoke:pack` | Builds, packs the package, installs the tarball in a temporary folder, and runs the installed CLI against the demo. Needs network access to install `typescript`. |
| `node dist/cli.js check` | Runs your local build. Use it from `examples/vite-express` to see the demo report. |

Tests use Node's built-in test runner and run against the compiled code in `dist/`, the same modules that users install. CI runs the build, tests, a demo scan, and the pack smoke test on Linux and Windows with Node 22 and 24.

## Where things live

| Path | Responsibility |
| --- | --- |
| `src/cli.ts` | Argument parsing, output streams, and exit codes |
| `src/check.ts` | Runs discovery, scanning, and rules, then groups and sorts findings |
| `src/project/discover.ts` | Validates app folders and lists source files |
| `src/scan/source.ts` | Finds env references with the TypeScript parser |
| `src/scan/env-example.ts` | Reads the keys declared in `.env.example` |
| `src/rules/` | One file per rule group. Rules take plain data and never touch the file system. |
| `src/report/terminal.ts` | Formats the text report |
| `tests/` | Parser, rule, and CLI tests |
| `examples/vite-express/` | The demo project used in the docs and tests |

## Conventions

- Write code for the next human reader. Use names that say what something does, and keep the happy path straight. Avoid dense one-liners and abbreviations.
- Keep comments for constraints that the code cannot explain on its own.
- Use the TypeScript syntax tree to find references, not regular expressions. Use Node's `util.parseEnv` for example files.
- Never print or log env values, source excerpts, raw parser errors, or stack traces. Error messages name the file or option that needs attention and how to fix it.
- Keep one feature or fix per pull request. If a change affects CLI output, ordering, or exit codes, update the README and the tests in the same pull request.
- Test the behavior users see, using small fixtures with fake values.

## Reporting a bug

Open an issue with:

1. The command you ran, and your env-doctor, Node.js, and operating system versions.
2. The report or error you got, and what you expected.
3. A minimal, sanitized reproduction: a few source lines and the matching `.env.example` keys.

Replace every real value with a dummy one before you post. Never paste real `.env` files, credentials, or tokens. env-doctor only needs variable names to reproduce a problem.
