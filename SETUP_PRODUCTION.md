# Deploy on a persistent server

Use a Linux VM with Docker Engine/Compose, a public DNS name, ports 80/443 reachable, and enough RAM for MySQL plus Chromium (start with 4 GB). Long-running workers are required; this stack is not a serverless deployment. Run one worker initially. Back up and monitor infrastructure before accepting operational data.

## Configure

Check out the repository on the server. Create `.env` using `node scripts/init-env.mjs` or copy `.env.example` and generate independent cryptographic keys. Set:

- `NODE_ENV=production`
- `DOMAIN=forms.your-domain.example`
- `WEB_ORIGIN=https://forms.your-domain.example`
- strong `MYSQL_ROOT_PASSWORD` and `MYSQL_PASSWORD` (URL-encode the latter if necessary in database URLs; simpler randomly generated hex avoids URI escaping)
- a random 64-hex `DATA_KEY` and random `SESSION_SECRET` of at least 32 characters
- `PORT=4000` (matches proxy and health check)
- OAuth credentials and `GOOGLE_REDIRECT_URI=https://forms.your-domain.example/api/google/callback`, if used
- conservative `WORKER_CONCURRENCY=1`, `RECORD_DELAY_MS=3000`, and bounded `MAX_ROWS`, `MAX_UPLOAD_MB`, `RETENTION_DAYS`

The production overlay replaces app database/Redis hostnames with internal Compose service names. MySQL and Redis remain bound only to host loopback via the base file. The API and frontend have no public host ports; Caddy terminates HTTPS and routes `/api/*` and `/socket.io/*` to the API. Only the trusted proxy reaches the API, which trusts one proxy hop.

## Start

```powershell
docker compose -f docker-compose.yml -f docker-compose.production.yml up -d --build
docker compose -f docker-compose.yml -f docker-compose.production.yml ps
docker compose -f docker-compose.yml -f docker-compose.production.yml exec api npm run user:create -- admin@example.com
```

The one-shot migration container applies committed migrations before API/worker startup. Visit your HTTPS domain and sign in. Check `/api/health` for liveness and `/api/health/ready` for MySQL/Redis readiness. Inspect worker logs for dispatch reconciliation errors. Verify a small, explicitly authorized form you control before enabling bulk workloads. No real Google form was used in this checkout's tests.

## Operational behavior

- API and worker images contain matching Playwright Chromium and system libraries. Processes run as `pwuser` with container init, memory/CPU limits, shared memory and restart policies. Ensure the host permits Chromium's sandbox; do not weaken the container simply to bypass a platform error. Isolate browser workloads on a dedicated host or VM for higher-assurance use.
- Redis uses append-only persistence and `noeviction`. MySQL stores schema versions, encrypted answers, durable intent timestamps and outcome history. Queue messages contain only database IDs. The ten-second reconciler dispatches outstanding batches after commit/Redis failures.
- The worker finishes the current browser action on graceful shutdown. A forced kill, stalled job or unverified browser result is conservatively UNKNOWN on recovery; no automatic replay. Pause/cancel can prevent future Submit intents, but cannot undo a click already in flight. Avoid overlapping deployments with an old worker after Redis lock loss.
- Browser workers only visit exact allowlisted Google hosts, validate redirects/IPv4 DNS destinations and disallow service workers. Public URL analysis accepts no arbitrary local targets. A separate loopback adapter exists only for tests and is never available through REST.
- Polling backs up Socket.IO events. Scale the API only after adding a shared rate-limit store, distributed analyzer limits and a Socket.IO Redis adapter/sticky-session strategy. This configuration is intentionally a single API instance.
- Health checks do not prove end-to-end Google availability. Alert on queue age, job/worker errors, browser resource usage, UNKNOWN/manual-action rates, DB availability, disk capacity and backup restore tests. The worker publishes a 30-second Redis heartbeat after successful DB/queue reconciliation; its container health check verifies that heartbeat. Docker restart policies restart exited processes, not merely unhealthy containers, so monitor and handle unhealthy status explicitly.
- Schedule `docker compose -f docker-compose.yml -f docker-compose.production.yml exec -T api npm run retention` daily. Retention excludes active jobs; inspect stuck paused jobs so they do not retain data indefinitely.

## Updates and recovery

Back up first, then rerun the build/start command. Database migrations are applied by the migration service. Test restore procedures using a separate environment. Do not delete Docker volumes during deployment. Rotate revoked OAuth access from Google account settings as well as disconnecting locally; local disconnect drops the stored token but does not call Google's token revocation endpoint.

The server must be able to reach Google's HTTPS hosts and resolve public DNS. No proxy rotation, stealth flags, authentication or CAPTCHA bypass exists. Form restrictions remain blockers. Maintain an appropriately verified OAuth consent screen for broader account access.

Review [capability limits](docs/CAPABILITIES.md), [security notes](docs/SECURITY.md), and [verification results](docs/VERIFICATION.md) before deployment. This guide prepares deployment; it does not claim a server was provisioned, Docker images were built here, or live Google response persistence was verified.
