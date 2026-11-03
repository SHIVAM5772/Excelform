# Local Windows setup

## Prerequisites

- Windows with Node.js **22 LTS** and npm on PATH.
- Docker Desktop configured for Linux containers and running. MySQL and Redis containers expose loopback-only ports.
- PowerShell. If npm.ps1 is blocked by your execution policy, use `npm.cmd` and `npx.cmd` instead of changing your system policy.
- Allow Chromium to run under your Windows account.

From the repository root (for this checkout `D:\Shivam_Excel_Project`):

```powershell
Set-Location D:\Shivam_Excel_Project
npm.cmd install
npm.cmd run setup:env
docker compose up -d
docker compose ps
npm.cmd run db:generate
npm.cmd run db:deploy
npx.cmd playwright install chromium
npm.cmd run user:create -- admin@example.com
npm.cmd run dev
```

The environment helper creates `.env` only if absent, generates independent random session/encryption keys and a root database password, and retains the development-only database account from `.env.example`. Never commit `.env`. Review it before running Compose. Your workspace password is prompted without echo, must be 12–72 characters, and is never a Google password.

Wait for MySQL/Redis to become healthy. Open [http://localhost:5173](http://localhost:5173) and sign in. Press Ctrl+C to stop the development processes. `docker compose stop` preserves database and queue volumes. Do not use `down -v` unless deliberately erasing data.

If another local MySQL service already uses port 3306, set `MYSQL_PORT=3307` in `.env` and change only the port in `DATABASE_URL` to 3307. Docker MySQL still uses port 3306 internally. Restart Compose after changing the host port; do not stop or delete an unrelated database.

## Making database changes

```powershell
npm.cmd run db:migrate -- --name add_feature
```

Prisma `migrate dev` needs a disposable shadow database. The Compose app user does not have global database-creation privileges. For model development, create `formflow_shadow` using an admin database client, grant that development account access, and configure Prisma's `shadowDatabaseUrl` with a `SHADOW_DATABASE_URL` environment variable in the datasource. Ordinary application setup uses `db:deploy` and requires no shadow database.

## Google owner access (optional)

Create a Google Cloud project, enable the Google Forms API, configure the OAuth consent screen, and add a Web application OAuth client. Register exactly `http://localhost:4000/api/google/callback`. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `GOOGLE_REDIRECT_URI` in `.env`, restart the API, then connect Google in Settings. Add your Google account as a test user for an unpublished OAuth app. The app requests read-only form-body access and encrypts the refresh token. It does not use OAuth to silently log in respondent browser contexts.

## Verification

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
npm.cmd test
npm.cmd run test:e2e
```

For MySQL/Redis service tests, follow [docs/TESTING.md](docs/TESTING.md) and use a separate `_test` database. The development database is never a test target. If default Playwright discovery differs from your installed browser directory, set `PLAYWRIGHT_BROWSERS_PATH` to your own compatible installation directory for that terminal session.
