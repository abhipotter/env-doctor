# Env Doctor

Catch environment variable mistakes before deploying a Vite frontend or Node.js backend.

Env Doctor is a local CLI for projects with a Vite client and a Node server. It scans JavaScript and TypeScript source, compares referenced variables with each app’s `.env.example`, and explains what needs to happen after a value changes.

## Why I’m building it

I changed an API URL on a production server, but my Vite frontend kept calling the old API. The URL had been included in the frontend bundle at build time. Env Doctor is designed to make that behavior visible and catch missing setup instructions before deployment.

## Planned first release

- Find environment variable references in Vite client and Node server code.
- Report missing `.env.example` entries with file locations.
- Flag browser variable names that look like private credentials.
- Explain when to rebuild and redeploy the frontend or start a new backend process.
- Return CI-friendly exit codes while keeping variable values out of the report.

## Planned usage

```bash
env-doctor check
env-doctor check --client frontend --server backend
```

By default, the command will scan `client/` and `server/` from your project root.

## Status

In development. The CLI has yet to be published to npm.