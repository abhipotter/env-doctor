# Vite + Express demo

A minimal Vite + React client that calls an Express health endpoint. The server reads `CLIENT_ORIGIN`, but `server/.env.example` does not declare it, so the first scan fails on purpose.

## 1. Scan the demo

From a contributor checkout of env-doctor, build the CLI once, then scan from this folder:

```bash
npm ci
npm run build
cd examples/vite-express
node ../../dist/cli.js check
```

If env-doctor is installed, `npx env-doctor check` from this folder does the same.

The scan exits with code `1`:

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

## 2. Fix the declaration

Add this line to `server/.env.example`:

```dotenv
CLIENT_ORIGIN=http://localhost:5173
```

## 3. Scan again

```bash
node ../../dist/cli.js check
```

The error is gone and the command exits with code `0`. The informational findings remain because they describe how each variable is deployed:

```text
Scanned client (3 files, 1 reference) and server (2 files, 2 references).
0 errors, 0 warnings, 3 informational findings
```

To keep the checked-in demo failing for the next reader, undo the change with `git checkout -- server/.env.example`.

## Run the apps (optional)

Scanning does not need the demo dependencies. To run the apps, install them in each folder. You need Node.js 22 or newer:

```bash
cd server
npm install
cp .env.example .env
npm start            # http://127.0.0.1:3001/api/health

cd ../client
npm install
cp .env.example .env
npm run dev          # http://localhost:5173
```

All values are local dummy values. To see the build-time behavior, change `VITE_API_URL` in `client/.env` and run `npm run build`. The new URL is written into the files under `client/dist/assets`. A frontend that was already deployed keeps the old URL until you rebuild and redeploy it.
