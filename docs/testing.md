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
cancelled uploads and manifest integrity. Setup tests cover the single form, token
header, completion when automatic login fails, and mobile layout. They are not a
full production deployment test.

Managed-settings browser tests cover disabled Docker-managed controls, omission
from save payloads, exact byte-limit preservation, asset upload/delete/drop guards,
continued S3 connection testing, old API compatibility and desktop/mobile layouts.
Backend environment tests cover all 33 mapping entries, MiB conversion, validated
and redacted values, immutable overrides, secret masking, non-mutating updates and
effective-setting constraints.

Backend runtime tests verify frontend deep links, API and asset 404 responses,
HTTP-compatible security headers, explicit proxy trust and HTTPS-origin CSRF.
CI additionally builds the combined application image and checks its frontend,
deep links and API over HTTP, plus all three Compose configurations and the
configuration/template/backup helper tests.

On `master`, publication waits for all five CI jobs: deployment, frontend, backend,
storage integration and AIO. It publishes linux/amd64 app, pinned-source MinIO and AIO images
to GHCR with `latest` and `sha-<full 40-character commit SHA>` tags. Pull the published
images without build instructions when verifying installation; a local build cannot
establish anonymous registry availability. After publication, the workflow checks
pulling with fresh authentication configuration and starts the five-service stack.
An additional post-publication job anonymously pulls and verifies the AIO image.

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

For the independent Unraid AIO image, run `bash scripts/test-aio-template.sh`.
It checks local and standalone downloaded imports, idempotency, customized-template
backups, invalid/partial-download preservation, one port/path, all 33 optional
settings matching the backend map in both XML templates, secret-field masking and
absence of privileged mode or generated infrastructure credentials. It does
not establish registry availability or runtime behavior. Standalone downloads must
ignore a hostile adjacent `templates/` directory and fetch the official XML.

To exercise the AIO runtime, use its focused unit checks and a built or published image:

```bash
docker run --rm --entrypoint python3 --mount "type=bind,src=$PWD/unraid/aio,dst=/tests,readonly" sharedrive-aio:ci /tests/test-runtime.py
AIO_IMAGE=sharedrive-aio:ci bash scripts/test-aio.sh
# After publication, verify the actual anonymously pulled image too:
docker pull ghcr.io/gottschalkfelix4-source/sharedrive-aio:latest
AIO_IMAGE=ghcr.io/gottschalkfelix4-source/sharedrive-aio:latest bash scripts/test-aio.sh
```

`test-aio.sh` creates a disposable volume and loopback-only HTTP mapping. It verifies
fresh setup/admin login, a clean scanned upload/download, EICAR rejection, health,
then restart and container recreation with preserved credentials, admin/database,
MinIO objects and Redis state. It checks graceful shutdown and removes only its
own disposable container/volume. It also verifies managed limits reject oversized
uploads, secrets remain masked, managed changes are refused, ordinary admin changes
persist and removing deployment overrides restores the saved settings. AIO bundles initial scanner signatures; fresh
signature updates run in the background and are not a prerequisite for offline startup.

Parse the AIO XML as XML,
then verify an anonymous registry pull and a real cold start of the published image
with new disposable appdata. Check all bundled services, setup/login, actual scanned
upload/download, restart persistence and graceful shutdown. Check the setup token
and generated secrets remain unchanged after restart. Test incompatible PostgreSQL
major rejection and stopped-state full-appdata backup/restore on disposable paths.
Do not reuse production appdata for these checks.

Before rollout, validate root Compose, complete Unraid Compose and infrastructure
Compose, the single Unraid app XML and helper shell syntax. Confirm that only the
app publishes an HTTP port and the combined image serves frontend routes and API.
Confirm all primary Compose files use registry images without build keys. Check
`docker compose pull` followed by `up -d --no-build` and verify anonymous pulls from
GHCR for both app and MinIO. Optional developer builds use `docker-compose.build.yml`.
Test fresh migrations and the legacy baseline on disposable
databases; confirm a final schema diff is empty and seeded data remains. Test backup /
restore into a separate database and byte-compare stored objects. On the target Unraid
server check readiness, Secure cookies, login/settings changes, proxy client IPs and
full upload/download flows through the existing HTTPS proxy. Check encrypted upload
and download in that browser secure context. The setup flow accepts only token,
public URL and administrator details; no credential rotation or SSL step is required.
Exercise an old-stack upgrade using preserved volumes and existing credentials.
The importer downloads the published app template from `master`.

`bash scripts/test-deployment.sh` checks configuration preparation, preservation of
existing secrets, template import, public registry references without production
build keys, the optional build override and backup service selection with
temporary fixtures and mocked Docker calls. It does not replace a real container
startup or backup/restore test.

Production audits use `npm audit --omit=dev`; CI rejects high/critical production findings.
Remaining moderate SDK findings and development-only advisories are recorded in the
project review. Do not force incompatible majors into transitive libraries merely to
make an audit counter disappear.
