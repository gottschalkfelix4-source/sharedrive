# Deployment, migration and recovery

Use Node 24 and the checked-in lockfiles. Separate backend images run as UID/GID **1000**.
The configuration helper sets ownership on files it creates when run as root;
it preserves existing files. For an existing installation, give this UID read
access to the configuration and read/write access to the private `.setup` directory.
Keep `.env` and `.setup/token` at `0600`, `.setup` at `0700`.

## Unraid all-in-one

The independent image `ghcr.io/gottschalkfelix4-source/sharedrive-aio:latest`
bundles the web application, PostgreSQL 16, Redis, MinIO and ClamAV. Install
`unraid/templates/sharedrive-aio.xml` using the README one-liner, then select
**Docker -> Add Container -> Template -> ShareDrive-AIO**. This creates one native
DockerMan entry with WebUI, autostart and normal image updates; Compose and external
infrastructure are not required. The template installer only imports XML. It stages
downloads before installation and saves changed previous templates as hidden backup
files in DockerMan's templates-user directory.

Use bridge networking, one HTTP mapping (8088 to container port 3000 by default),
and one new appdata bind (`/mnt/user/appdata/sharedrive-aio` to `/data`). Reserve at
least 6 GB RAM; the supplied memory limit can be raised for larger workloads.
ClamAV alone needs at least 3 GB, and initial database/scanner startup can take several
minutes. The image bundles signatures, so the first startup does not require an online
signature download; FreshClam refreshes signatures in the background when connectivity
permits. Keep monitoring update failures and signature age: offline startup is not a
promise that stale signatures offer current protection. All internal infrastructure
listens only on loopback. Do not expose its
ports, enable privileged mode, mount the Docker socket or supply the split-stack
`.env`. Keep `--stop-timeout=120` so application requests and PostgreSQL can shut
down cleanly before Docker forcibly stops the container.

The supervisor starts as root only to initialize ownership and launch services under
their own unprivileged users. The app runs as node UID 1000; the database, Redis and
ClamAV use their distribution service users. There is no configurable global PUID/PGID:
changing ownership recursively to Unraid UID 99 can break the database and private
credentials. Preserve numeric ownership and permissions when copying backups.

Persistent data is under `/data/{postgres,redis,minio,clamav,config,.setup}`.
First initialization generates infrastructure credentials in root-owned private
`/data/config/secrets.json` and the setup token in `/data/.setup/token`. Subsequent
starts preserve those credentials; do not remove or replace the secrets file over
existing data. Read the host appdata `.setup/token` locally to complete the normal
setup wizard. The token and passwords are not printed to container logs.
Configure `TRUST_PROXY` in DockerMan for the actual connecting reverse proxy and
optionally set `SMTP_ALLOWED_HOSTS`. TLS remains in your existing external proxy.
Use **Edit -> Apply** to load changes to template environment variables.

### AIO updates and recovery

Use Unraid's normal image update action only after a backup. Updates restart every
bundled service together. Automatic migrations apply application schema changes;
PostgreSQL remains on major 16. The runtime refuses incompatible `PG_VERSION`
directories instead of trying a destructive major upgrade. A future database-major
upgrade needs a separately tested dump/restore procedure; it is not automatic.
An older image is not a rollback of an already changed database schema.

Before a cold backup, let active uploads finish, stop **ShareDrive-AIO** in the
Docker GUI and verify that the container is stopped. Back up the **entire** appdata
directory, including hidden `.setup`, private configuration, database, object
storage, Redis and scanner data. Store backups on another pool or machine and
preserve numeric owners, permissions and symlinks. Do not copy live PostgreSQL files
and call that a consistent backup. `scripts/backup.sh` targets split deployments
and does **not** back up AIO. Back up your external proxy/certificates separately;
keep encrypted links with their key fragments separately too.

Test recovery into an empty, isolated AIO appdata path using the **same saved image
digest** first. Restore the full stopped-state backup with numeric ownership and
permissions intact, set that new path in an isolated AIO template with another HTTP
port, and start it. Keep the production container stopped or isolated while testing;
do not send notification emails or reuse the public domain accidentally. Check
health/readiness, admin login, byte-identical downloads and a new scanned upload
before relying on the recovery. Restart the original container once the cold backup
has completed if no recovery is needed.

This AIO data layout is not interchangeable with existing Compose/DockerMan appdata.
Do not point the AIO template at existing split-stack directories or run both against
one directory. No automatic cross-mode migration is provided. Existing deployments
may continue using their current split images and templates.

## Database upgrades

New databases use `prisma migrate deploy`. No startup command accepts data loss.
The additive hardening migration also includes fields that were previously present
only in `db push` deployments. It does not remove existing columns or data.

For a **legacy database without migration history**, or one that records the old
initial migration name `init`, stop application writes and
verify a backup before upgrading. With Node 24 and the checkout available:

```bash
cd backend
npm ci
export DATABASE_URL='<existing database URL>'
npm run db:baseline
# Only after checking the output and backup:
npm run db:baseline -- --apply --backup-confirmed
npx prisma migrate deploy
npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --exit-code
```

Pass credentials through the shell environment or your secret manager; do not add
them to scripts or Git. The baseline checks base column types, named constraints
and unique indexes, then records `19700101000000_init`. If an already applied `init`
entry exists, it verifies the exact SQL checksum and completion before renaming
only that history entry; no application data or migration checksum changes. The
initial directory has a timestamp so it sorts before subsequent migrations on a
fresh database. It permits extra legacy columns. A failed
check or a nonempty final schema diff requires investigation. This is a baseline
for this project's known legacy schema, not an automatic repair of arbitrary drift.
The built image also includes `node dist/scripts/baseline.js` for environments
without a host Node installation; run it in a one-off backend container before
normal startup. Databases already recording `19700101000000_init` require no baseline.

Upgrades may leave older complete objects without `File.storedSize`; downloads
calculate the legacy framing size. Legacy encrypted transfers remain version 1.
Incomplete in-memory uploads from the old release cannot be recovered: stop writes,
let uploads finish, and abort leftover multipart uploads during this one-time upgrade.
New upload and scan sessions are persisted, have a 24-hour deadline and release quota
through durable cleanup. An accepted download attempt consumes one slot, including
a later client abort. Download tickets expire after 60 seconds and grant one file
or the ZIP scope; they never contain the password or encryption key.

## Credentials and setup

The following preparation and credential procedures apply to **separate-container**
deployments. AIO creates and preserves its own credentials as described above.

Run `bash unraid/prepare-config.sh --compose` for the root Compose stack, or
`bash unraid/prepare-config.sh --unraid` for Unraid, before first startup. It creates
random database, MinIO and JWT secrets and a private setup token. Existing credentials
are preserved on subsequent runs; placeholder credentials must be corrected before
startup. Do not recreate `.env` over an existing database or storage installation.

Read `.setup/token` locally, or the Unraid appdata copy, and enter it in the setup
wizard. The token is not printed to server logs. Enter the public URL and create the
admin account. Setup neither rotates infrastructure credentials nor configures TLS.
An admin account closes setup while it exists. Keep initial setup private.

Credential changes after deployment require a backup and maintenance window. Update
the database role and matching DATABASE_URL together, and keep MinIO's root/client
credentials consistent. Update `.env` and recreate affected containers to reload their
environment. A plain restart reuses the previous environment. Recheck readiness and
authentication afterwards; changing JWT_SECRET invalidates existing sessions.

If an older installation stopped midway through the previous wizard's credential
rotation, preserve its saved `.env` and recreate the app and MinIO from that file
before completing setup. The compatibility readiness check refuses mismatched
credentials rather than silently discarding that pending change.

## Upgrade from the previous proxy stack

The application now serves both frontend and API on port 3000, published as
`HTTP_PORT` (default 8088). The old nginx/Web and Caddy services, SSL override and
certificate configuration are no longer used. Your existing reverse proxy provides TLS.

1. Back up configuration, database and MinIO; let active uploads finish and stop
   application writes. Check legacy migration requirements above before startup.
2. Keep the existing `.env`, token directory, Compose project name, database/storage
   volume names and appdata paths. The combined app and pinned-source MinIO images
   are published in GHCR; pull them using your existing deployment's Compose arguments.
3. Update `HTTP_PORT` to an available private port, typically 8088, and configure
   `TRUST_PROXY` for the actual external proxy. Old `DOMAIN`, `ACME_EMAIL`,
   `HTTPS_PORT` and `CADDY_TRUSTED_PROXIES` settings are unused.
4. For standard Compose, run `docker compose pull`, then
   `docker compose up -d --no-build --remove-orphans --wait --wait-timeout 900`.
   For complete Unraid Compose, use `unraid/compose.yml` and the appdata Compose
   arguments for both commands, adding `--force-recreate` when changing environment.
   This removes old proxy containers while keeping persistent data.
5. For DockerMan, stop the old Web and Backend containers, update the infrastructure
   Compose file, pull its images and start with `--no-build --remove-orphans`.
   Apply the combined Backend template with its GHCR Repository, using the same
   appdata/network and the published HTTP port. Remove the
   old Web container after checking the new app. Its separate local image is unused.
6. Point the existing reverse proxy at the new HTTP port. Keep the saved public
   Base URL and admin account; completed installations do not repeat first setup.
   Check HTTPS login, settings changes, scanner logs and uploads/downloads.

Do not use `down -v` or delete storage directories. Old Caddy files and certificate
volumes can remain as archived backup material; they are not read by the new app.

## HTTP, TLS and proxies

HTTP uses `HTTP_PORT` (8088 by default); the app listens internally on port 3000.
TLS and certificates are handled by your existing reverse proxy. Configure its
upstream to the app's HTTP port and route the domain root and `/api` to that upstream.
Set `TRUST_PROXY` to the **actual connecting proxy IP/CIDR** as seen by the app.
The default `loopback` does not trust LAN or arbitrary Docker subnet addresses.
The proxy must preserve public Host (and public port), overwrite X-Forwarded-For
with the client address and set X-Forwarded-Proto from its trusted public scheme.
Do not forward unchecked client-supplied headers. For multi-proxy topologies,
configure the upstream chain in your existing proxy before trusting those headers.
Limit direct access to the app HTTP port and keep infrastructure ports unexposed.
Set adequate request-size limits and upload/read timeouts in the external proxy.
Disable request buffering where supported. Use a public HTTPS Base URL; encryption
and clipboard APIs require a secure browser context.

Check Secure cookies, login, CSRF-protected settings changes and client IP limits
after changing topology. `/api/health` is liveness; `/api/ready` checks
PostgreSQL, Redis and object storage. Plaintext upload publication additionally
requires a successful virus scan; scanner failures never publish a clean transfer.
Allow at least 3 GB for ClamAV plus database, app and storage; adjust configured
limits to available RAM/CPU. Resource caps can cause large scans to fail closed.

The public images `ghcr.io/gottschalkfelix4-source/sharedrive:latest` and
`ghcr.io/gottschalkfelix4-source/sharedrive-minio:latest` target linux/amd64.
Successful `master` CI runs publish them after deployment, frontend, backend and
real-storage integration checks. Set `SHAREDRIVE_IMAGE` and `MINIO_IMAGE` in the
Compose environment to a published `sha-<full 40-character commit SHA>` tag or
registry digest for a fixed deployment. Pin DockerMan's app Repository separately.
With pinned references, update those values before pulling an intended new release.
Keep configuration and database migration compatibility in mind when rolling back:
an older image is not a database restore.

The MinIO image is built in CI from the official source-only release pinned in
`unraid/Dockerfile.minio`; its separate license is AGPL-3.0. No source build is
required on a production server. Optional local builds need GitHub, the Go module
proxy/checksum service and artifact hosts such as storage.googleapis.com; preserve
checksum and TLS validation. Review pinned image/source versions periodically.
No S3 provider mapping or external-storage migration is part of this change.

## Backup and restore

Back up to a separate pool or machine; backups contain credentials and plaintext
objects when encryption was not selected. The helper briefly stops backend and
MinIO, dumps PostgreSQL and copies the storage directory, then restores their previous
running state. It requires enough destination space and a running database:

```bash
./scripts/backup.sh /absolute/new/backup-directory
# DockerMan app + infrastructure Compose:
./scripts/backup.sh /mnt/user/backups/sharedrive-2026-10-06 --unraid
# Complete Unraid Compose stack (run from the checkout):
bash scripts/backup.sh /mnt/user/backups/sharedrive-2026-10-06 --unraid-compose
```

It covers **local MinIO**, `.env`, the setup token and the PostgreSQL dump, not
external S3 or your external proxy configuration/certificates. Back up that proxy
using its own procedure. Keep encrypted share links
with their key fragments separately: the server backup cannot recover those keys.
Review a PostgreSQL dump using `pg_restore --list`, and test restore on an isolated
database/storage pair before relying on a backup.

Restore into a **fresh, isolated** installation, with backend stopped. Restore the
saved configuration and complete `minio/` contents into the new storage directory;
set the backend configuration/token ownership as above. Start PostgreSQL and MinIO,
then restore the database with the destination's own credentials:

```bash
docker compose exec -T postgres sh -c 'pg_restore --exit-on-error --no-owner --no-acl -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < /path/to/backup/database.dump
```

For complete Unraid Compose, use `--env-file /mnt/user/appdata/sharedrive/.env
-f unraid/compose.yml` and the existing `sharedrive-unraid-stack` project for the
restore command. For DockerMan with infrastructure Compose, use the same env file
and `-f unraid/compose.infrastructure.yml` with its existing `sharedrive-unraid`
project. Keep the deployment mode and any custom project name consistent; do not
start the other stack against the same storage directories. Do not
run this against a nonempty database. Run migrations, start the app, check readiness
and byte-compare a representative download, plus an encrypted link and a scanned upload.
Recovering into an old production volume or overwriting it is a separate deliberate
operation, not an update procedure.

## Privacy and outgoing services

Admins control the server and can access database/storage. Public short IDs may reveal
unprotected plaintext transfers; hiding filename columns does not prevent that access.
Client encryption protects contents and encrypted names from a server without the key,
but sizes, MIME types, counts, dates, uploader identity and notification email remain visible.
Encrypted uploads cannot be virus-scanned. Notification emails do not contain the key.
Both log tables use the retention setting; download/system IPs are masked before storage.
This does not by itself make a service legally compliant or data anonymous.

Fonts use local system fallbacks. Upload locations use a bundled Natural Earth world map instead of external map
tiles; the app makes no implicit Google Fonts or map-tile requests. Operator-configured
remote logos and SMTP still use external services. Certificate issuance belongs to
your external proxy. Set `SMTP_ALLOWED_HOSTS` to a
comma-separated hostname allowlist for a constrained installation and use network
egress policy for destination/IP restrictions. Existing S3 behavior remains unchanged.
