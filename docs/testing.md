# Regression tests

Node 24 is required. Install each package using `npm ci`. Run `npx prisma generate`
in backend before building; the engine/checksum downloads require binaries.prisma.sh.

```bash
cd backend
npm test
npm run build
cd ../frontend
npm test
npm run build
npx playwright install --with-deps chromium
npm run test:browser
```

`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium` uses an installed Chromium
instead of the Playwright download. Browser tests start their own Vite process on
5176 and a download-fixture server on 39005. They mock JSON API responses and verify
password retry, ticket scope, downloaded fixture bytes, encrypted link fragments,
cancelled uploads and manifest integrity. They are not a full production deployment test.

## Database and API integration

Use a **disposable local database** whose name ends in `_test`, an isolated Redis
instance/database 15, and a MinIO bucket ending in `-test`. These tests delete their
fixture database contents. They reject common production configurations rather than
quietly running against the normal `.env`. Supply values via environment variables;
the application test runner does not source a production `.env`.

```bash
export DATABASE_URL='postgresql://postgres:fixture-test-only@127.0.0.1:55432/sharedrive_test'
export REDIS_URL='redis://127.0.0.1:56379/15'
export JWT_SECRET='fixture-test-jwt-secret-at-least-32-characters'
export SETUP_TOKEN='fixture-test-setup-token-at-least-32-characters'
export MINIO_ENDPOINT=127.0.0.1 MINIO_PORT=19000 MINIO_USE_SSL=false
export MINIO_ACCESS_KEY=ci-minio MINIO_SECRET_KEY=ci-fixture-minio-password
export MINIO_BUCKET=sharedrive-local-test
export CLAMAV_HOST=127.0.0.1 CLAMAV_PORT=13310
cd backend
npx prisma migrate deploy
npm run test:database
npm run test:integration
```

The sample credentials are disposable test fixtures, not deployment secrets.
Publish the services only to loopback for native tests. Real storage/scan tests need
a running MinIO server and clamd with loaded signatures. See the CI workflow for
service startup and the pinned MinIO source build. No S3 provider-switch test is
included because that change was excluded.

`test:database` exercises PostgreSQL transactions/advisory locks, concurrent quota and
download reservations, job persistence, log retention, cookie/CSRF sessions, 2FA recovery
and deletion retry. Its storage-outage test deliberately stubs the object-delete command.
It also checks concurrent setting changes and admin demotions, session revocation,
short-lived diagnostics without echoed secrets, and the checksum-verified transition
from the legacy initial migration history name.

`test:integration` exercises HTTP upload framing, multipart truncation, empty objects,
quota lifecycle, scoped file/ZIP tickets, setup singleton locking and virus publication.
The classic streaming tests include multipart-size data, empty files and a source
failure after a full multipart buffer; all run against real storage in CI.
Set `TEST_STORAGE_FIXTURE=memory` only to test the API against an explicit in-memory
storage-command double while retaining real PostgreSQL, Redis and clamd. The runner
prints that substitution. This mode does **not** establish MinIO SDK, multipart protocol
or storage durability correctness; CI's separate storage job runs without it.

## Release checks

Before rollout, validate both Compose configurations, Caddy configuration, Unraid XML
and helper shell syntax. Test fresh migrations and the legacy baseline on disposable
databases; confirm a final schema diff is empty and seeded data remains. Test backup /
restore into a separate database and byte-compare stored objects. On the target Unraid
server check readiness, TLS cookies, proxy client IPs and full upload/download flows.
The importer one-liner downloads the published templates from `master`.

Production audits use `npm audit --omit=dev`; CI rejects high/critical production findings.
Remaining moderate SDK findings and development-only advisories are recorded in the
project review. Do not force incompatible majors into transitive libraries merely to
make an audit counter disappear.
