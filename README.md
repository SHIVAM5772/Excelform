# FormFlow Automation

A React + Express monorepo for authorized Google Forms bulk submissions from Excel. It includes real browser analysis/submission, ExcelJS workbooks, encrypted MySQL records, BullMQ dispatch and recovery, row validation, review and authorization, live progress, audit logs, and downloadable reports.

**Start with [Windows setup](SETUP_WINDOWS.md).** Server deployment is covered in [Production setup](SETUP_PRODUCTION.md). The implementation is production-oriented, but live Google compatibility and MySQL/Redis deployment must be verified in your environment before operational use. See [capabilities and limits](docs/CAPABILITIES.md) and [verification results](docs/VERIFICATION.md).

## Run locally

Use Node 22 LTS, npm, Docker Desktop with Linux containers, and PowerShell. From this repository root:

```powershell
npm install
npm run setup:env
docker compose up -d
npm run db:generate
npm run db:deploy
npx playwright install chromium
npm run user:create -- admin@example.com
npm run dev
```

Enter the **workspace** password at the terminal prompt; it is hashed with bcrypt. No public registration or default accounts exist. Open [http://localhost:5173](http://localhost:5173). The API listens on port 4000. Keep `WEB_ORIGIN` exactly aligned with your browser address, including scheme and port.

The initial migration is checked in. For database model development use `npm run db:migrate -- --name descriptive_change` (the configured equivalent of `npx prisma migrate dev --schema packages/database/prisma/schema.prisma`). Use `db:deploy` to apply checked-in migrations without a shadow database.

## Workflow

1. Sign in and analyze a Google Form respondent URL. For a form you own, connect Google in Settings, use its `/d/{formId}/edit` link, and select owner API analysis.
2. Review questions, warnings, and restrictions. Forms with blockers can be inspected and templated but cannot be queued.
3. Download the Excel workbook. Fill `Responses`, starting at row 2; preserve headings and the `Field Mapping` sheet.
4. In Upload Responses choose the matching generated template and XLSX file. Review validation counts, duplicate warnings and row errors; download the validation report when needed.
5. Explicitly confirm your authorization and the valid-row count. Only valid rows are queued. Every row gets a fresh, isolated browser context.
6. Monitor jobs, pause/resume/cancel remaining rows, and download the outcome report. Row identifiers are Excel row numbers to minimize personal data exposure.

`SUBMITTED` requires a successful respondent POST reply (including a normal redirect), a visible expected confirmation, and no remaining Submit button. The analyzer reads the form's custom confirmation text from public settings; recognized default English messages are used when that setting is unavailable. A durable intent is written **before** clicking Submit. Timeout, crash or missing confirmation after that boundary produces `UNKNOWN`; those rows are never automatically retried. Verify them with the form owner. Even an interrupted row without an intent is conservatively marked UNKNOWN on batch redelivery.

## Commands

| Command                                                  | Purpose                                                              |
| -------------------------------------------------------- | -------------------------------------------------------------------- |
| `npm run dev`                                            | Web, API and submission worker together                              |
| `npm run dev:web` / `npm run dev:api` / `npm run worker` | Individual processes                                                 |
| `npm run db:generate` / `db:deploy` / `db:migrate`       | Prisma client and migrations                                         |
| `npm run typecheck` / `lint` / `build`                   | Static verification and production outputs                           |
| `npm test`                                               | Vitest unit, Excel, API boundary, React and real local browser tests |
| `npm run test:e2e`                                       | Playwright responsive sign-in UI test                                |
| `npm run test:services`                                  | Opt-in MySQL/Redis persistence and queue integration                 |
| `npm run retention`                                      | Remove expired uploads, batches and audit events                     |

The service tests require a **disposable database ending in `_test`** and a dedicated Redis database `/15`. They never reset a production database. See [testing instructions](docs/TESTING.md). No automated test submits data to third-party Google Forms.

## Architecture

```text
apps/web                     React / Vite / Tailwind dashboard
apps/api                     Express auth, REST and Socket.IO gateway
packages/shared              Zod schemas, normalized types, section-path logic
packages/database            Prisma schema, initial SQL migration, AES-GCM storage
packages/form-analyzer       URL/network boundary, public metadata and owner API normalization
packages/excel-engine        Workbook generation, bounded parsing, row validation, reports
packages/submission-engine   Browser control, queue dispatch, durable batch processor
workers/submission-worker    BullMQ worker, dispatch reconciliation, progress publisher
tests                        Unit/API/browser fixtures and integration tests
docker                       Nginx and HTTPS reverse-proxy configuration
scripts                      Account provisioning, retention and environment setup
```

MySQL is the authority for job state. The API commits authorization and records before dispatch; the worker reconciles outstanding DB jobs every ten seconds, closing the DB/Redis failure gap. BullMQ carries only a batch ID. Row answers and Google refresh tokens use AES-256-GCM with a separately configured encryption key. Redis messages contain only user and job IDs. Cookies are HttpOnly, SameSite=Lax and Secure in production; state-changing REST requests require an exact Origin match. Requests and responses use `{data: ...}` or `{error:{code,message}}`. See [API documentation](docs/API.md).

Concurrency defaults to one **batch per worker**, with rows processed sequentially and a minimum one-second inter-row delay (default three seconds). Multiple workers increase aggregate concurrency. Recovery never offers exactly-once guarantees over a third-party form; ambiguity is preserved rather than risking duplicates.

## Troubleshooting

- **Docker not recognized / ports refused:** install and start Docker Desktop, then `docker compose ps` and `docker compose logs mysql redis`. This machine initially had neither running service.
- **Prisma authentication:** ensure `DATABASE_URL` credentials match Compose `MYSQL_PASSWORD`. Changing environment passwords does not change an already initialized database user; update that user's password explicitly. Do not delete volumes to fix credentials unless you intend to erase data.
- **Shadow database denied:** use `db:deploy` for existing migrations. For `db:migrate`, configure a separate shadow database and grant development-only privileges.
- **Browser executable missing:** run `npx playwright install chromium` under the same user that runs the API/worker. `PLAYWRIGHT_BROWSERS_PATH` or `PLAYWRIGHT_EXECUTABLE_PATH` can select an existing compatible installation.
- **403 on a POST:** visit `WEB_ORIGIN`, usually `http://localhost:5173`; browser requests provide Origin automatically. Development also accepts `127.0.0.1` on the same configured protocol/port. Other ports remain rejected, and Vite uses a strict port so an occupied 5173 cannot silently move the frontend. Restart development processes after configuration changes. API scripts must also send the allowed Origin header.
- **Queued batch stays queued:** check worker logs and Redis availability. The worker must be running. DB reconciliation retries dispatch; it never retries UNKNOWN records.
- **Owner analysis denied:** enable Forms API, configure OAuth, add yourself as an OAuth test user if the app is unverified, and reconnect. Your account must have form access.
- **Manual action:** review the reason. Login, CAPTCHA, uploads and unsupported controls cannot be bypassed. Fix/reanalyze the form, create a fresh template and upload; resuming only processes remaining queued rows.
- **Unexpected fields / changed form:** analyze again and use the new template. Do not copy old mapping sheets into new workbooks.
- **UNKNOWN:** compare row information with the form owner's actual response records. The application intentionally provides no replay endpoint for ambiguous rows.

## Data and maintenance

The default retention command removes uploads and their batches after 30 days only when terminal, plus old audit events. Form schemas are retained until explicit user deletion. Schedule the command daily in Windows Task Scheduler or a server timer; setting `RETENTION_DAYS` alone does not run cleanup. Settings includes explicit deletion of your stored form data once active work settles. Deletion cannot remove responses held by Google or copies in your database backups.

Back up MySQL, the Redis AOF and `DATA_KEY` securely and separately. Lost encryption keys make stored answers and OAuth tokens unrecoverable. Session-secret rotation signs users out; data-key rotation requires decrypting and re-encrypting records, and is not automated here. The code deliberately avoids storing raw uploaded files and does not log answers, passwords or cookies. Form titles, question metadata and job timestamps remain unencrypted; use encrypted database disks/backups in deployment.

References: [Google Forms REST capabilities](https://developers.google.com/workspace/forms/api/reference/rest), [BullMQ stalled-job behavior](https://docs.bullmq.io/guide/jobs/stalled), [Playwright network interception](https://playwright.dev/docs/network).
#   E x c e l f o r m  
 