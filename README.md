# Env Doctor

Catch environment variable mistakes before deploying a Vite frontend or Node.js backend.

Env Doctor is a local CLI for projects with a Vite client and a Node server. It scans JavaScript and TypeScript source, compares referenced variables with each app’s `.env.example`, and explains what needs to happen after a value changes.

```bash
npx env-doctor check
```

```text
ERROR [missing-declaration] CLIENT_ORIGIN  server/src/config.js:3:17
  Add CLIENT_ORIGIN= to server/.env.example and configure the value
  separately.

INFO  [vite-build-time] VITE_API_URL  client/src/api.ts:6:35
  Supply the updated value when building, then redeploy the frontend assets.

INFO  [node-runtime] CLIENT_ORIGIN  server/src/config.js:3:17
  If injected at startup, start a new server process with the updated value.

INFO  [node-runtime] PORT  server/src/config.js:2:16
  If injected at startup, start a new server process with the updated value.

Scanned client (3 files, 1 reference) and server (2 files, 2 references).
1 error, 0 warnings, 3 informational findings
```

## Why I’m building it

I changed an API URL on a production server, but my Vite frontend kept calling the old API. The URL had been included in the frontend bundle at build time. Env Doctor is designed to make that behavior visible and catch missing setup instructions before deployment.

Vite writes `import.meta.env.VITE_*` values into the JavaScript bundle at build time, so a deployed frontend keeps the old value until it is rebuilt with the new one and the new assets are deployed. A Node server reads `process.env` while it runs, so it picks up a changed value once a new process starts with it. Depending on your host, that means a restart, a recreated container, or a redeploy.

Env Doctor runs offline, needs no credentials, and works the same on a laptop and in CI.

## Quick start

Requires Node.js 22 or newer. The package is not on npm yet (see [Status](#status)); until it is, run it from a checkout as described in [CONTRIBUTING.md](CONTRIBUTING.md).

Run it from the folder that contains your `client/` and `server/` apps:

```bash
npx env-doctor check
```

If your apps live in other folders, name them:

```bash
npx env-doctor check --client frontend --server backend
```

To fix a `missing-declaration` error, add the key to the app's example file with a placeholder or an empty value, then run the check again:

```dotenv
# server/.env.example
CLIENT_ORIGIN=
```

The example file documents which variables an app needs. Configure the real values separately, in `.env` files or your host's settings.

For repeatable local and CI runs, pin it in your project:

```bash
npm install --save-dev --save-exact env-doctor
```

```json
{
  "scripts": {
    "check:env": "env-doctor check"
  }
}
```

## Use it in CI

Run `npm run check:env` after `npm ci`. The command needs no secrets, network access, or production configuration.

```yaml
- run: npm ci
- run: npm run check:env
```

| Exit code | Meaning |
| --- | --- |
| `0` | The check completed with no errors. Warnings and informational findings may be present. `--help` and `--version` also exit `0`. |
| `1` | The check completed and found at least one error. |
| `2` | The check could not run: invalid arguments, a missing or invalid app folder, or a file that could not be read or parsed. |

Normal reports go to stdout. Usage and operational errors go to stderr.

## What it reports

| Rule | Severity | When it appears |
| --- | --- | --- |
| `missing-template` | Error | An app uses env variables but has no `.env.example`. Reported once per app, instead of one error per key. |
| `missing-declaration` | Error | An app uses a variable that its `.env.example` does not declare. |
| `public-secret-name` | Warning | A `VITE_*` variable used in the client has a secret-like name, such as `SECRET`, `PASSWORD`, `PRIVATE_KEY`, `ACCESS_TOKEN`, or `API_KEY`. |
| `vite-build-time` | Info | A `VITE_*` variable used in the client. A new value needs a rebuild and a redeploy of the frontend assets. |
| `node-runtime` | Info | A `process.env` variable used in the server. A new value needs a new server process. |

The `public-secret-name` warning is based on the name alone. Vite embeds every `VITE_*` value it uses in browser code, where anyone can read it. Publishable keys meant for browsers are fine to keep. If the variable holds a real private credential, move its use to the server, remove the browser reference, rebuild, and rotate the credential if it was already deployed.

Repeated references to the same variable are grouped into one finding per rule. The report shows the first location and up to two more, then a count of the rest.

## Supported projects and syntax

Env Doctor 0.1 supports a Vite client and a Node server in two separate folders, each with its own `.env.example`:

```text
my-project/
├── client/            # Vite app
│   ├── .env.example
│   └── src/
└── server/            # Node or Express app
    ├── .env.example
    └── src/
```

Both folders must be inside the directory you run the command from, and neither can contain the other. Paths can be relative or absolute.

| App | Detected |
| --- | --- |
| Client | `import.meta.env.VITE_NAME` and `import.meta.env['VITE_NAME']` |
| Server | `process.env.NAME` and `process.env['NAME']` |

- Files ending in `.js`, `.jsx`, `.ts`, `.tsx`, `.mjs`, `.cjs`, `.mts`, and `.cts` are scanned. Declaration files (`.d.ts`) are skipped.
- `node_modules`, `.git`, `dist`, `build`, and `coverage` folders are skipped, and so are symbolic links inside an app.
- `vite.config.*` and `vitest.config.*` at the client root are skipped, because that code runs in Node during the build, not in the browser.
- The Vite built-ins `MODE`, `BASE_URL`, `PROD`, `DEV`, and `SSR` are never reported.
- Source is parsed with the TypeScript parser, so matches inside comments and strings are ignored.
- Example files support comments, blank lines, empty values, `export`, quoted and multiline values, CRLF line endings, and a byte order mark.

### Known limitations

- Only the default `VITE_` prefix is checked in the client. A custom `envPrefix`, or `envDir`, is not read from your Vite config. Client references without the `VITE_` prefix are counted and reported as skipped.
- The client/server boundary is the folder. The tool does not follow the Vite import graph.
- Only direct access is detected. Computed keys such as `process.env[name]`, destructuring such as `const { PORT } = process.env`, aliased env objects, and variables injected by plugins or macros are not detected.
- `process.env` in the server is assumed to be Node's environment. Local variables named `process` are not resolved.
- Names are matched case-sensitively.

## Privacy

Env Doctor reads only your source files and each app's `.env.example`. It does not:

- read `.env`, `.env.local`, production env files, or your shell environment
- run your scripts or import your config files
- send network requests or telemetry
- change any files

Reports contain variable names, file paths, and line numbers. They never contain values from example files, source excerpts, or stack traces.

## Try the demo

The [examples/vite-express](examples/vite-express) folder contains a small Vite + React client and an Express server, with one declaration missing on purpose. Its README walks through the failing scan, the fix, and the passing rerun.

## Status

In development. Version 0.1 is feature-complete for the scope above, but the CLI has yet to be published to npm.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the local build and test commands and for how to file a bug report.

## License

[MIT](LICENSE)
