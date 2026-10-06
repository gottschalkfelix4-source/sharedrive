# Deployment, migration and recovery

Use Node 24 and the checked-in lockfiles. Backend images run as UID/GID **1000**.
The configuration helper sets ownership on files it creates when run as root;
it preserves existing files. For an existing installation, give this UID read/write
access to `.env`, `Caddyfile` and the private `.setup` directory before starting.
Keep `.env` and `.setup/token` at `0600`, `.setup` at `0700`.

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

Obtain the bootstrap token locally from `.setup/token`, or the Unraid appdata copy,
and enter it in the setup wizard. The token is not printed to server logs. Credential
rotation updates the saved environment and PostgreSQL role atomically as far as the
DB transaction permits; clients then reconnect. The wizard requires **recreation**
of MinIO and backend before admin creation, and checks their new credentials.
For Compose: `docker compose up -d --force-recreate minio backend`.
For Unraid: recreate MinIO through its infrastructure Compose, then use Backend
**Edit → Apply**. A plain restart does not reload `env_file`.

Rotation supports long random credentials using the common unquoted Compose / Docker
env-file syntax. Whitespace, quotes, backslashes, `$` and `#` are rejected. Other
password characters are URL-encoded in DATABASE_URL. Restart/recreate after an
unexpected process failure during rotation; inspect readiness before completing setup.
An admin account permanently closes setup while it exists. Changing secrets after
setup is an operator action with a backup and maintenance window.

## HTTP, TLS and proxies

HTTP uses `HTTP_PORT` (80 by default), built-in TLS also uses `HTTPS_PORT` (443).
For automatic TLS, set DOMAIN and ACME_EMAIL and use the SSL Compose override;
it mounts the separate `Caddyfile.tls`. The wizard can instead configure the writable
HTTP Caddyfile. Choose one method. In the environment-driven TLS override, configure
TLS through `.env` and the override, rather than the wizard's Caddyfile editor.
Public 80/443 must reach Caddy for ACME. Unraid defaults to 8088/8443 to avoid clashes;
forward public 80/443 to those ports when using built-in TLS.

With an existing TLS proxy, use HTTP mode and set `CADDY_TRUSTED_PROXIES` to the
**actual proxy IP/CIDR**. Forward Host, X-Forwarded-For and X-Forwarded-Proto there.
nginx preserves the original scheme/port. Express trusts private proxy hops by
default; use `TRUST_PROXY` to narrow this to your Docker subnet. Keep backend and
nginx unexposed so clients cannot forge those hops. Check Secure cookies and client
IP limits after changing the topology. `/api/health` is liveness; `/api/ready` checks
PostgreSQL, Redis and object storage. Plaintext upload publication additionally
requires a successful virus scan; scanner failures never publish a clean transfer.
Allow at least 3 GB for ClamAV plus database, app and storage; adjust configured
limits to available RAM/CPU. Resource caps can cause large scans to fail closed.

MinIO is built from the official source-only release pinned in
`unraid/Dockerfile.minio`; its separate license is AGPL-3.0. Building needs GitHub,
the Go module proxy/checksum service and artifact hosts such as storage.googleapis.com.
Preserve checksum and TLS validation. Review pinned image/source versions periodically.
No S3 provider mapping or external-storage migration is part of this change.

## Backup and restore

Back up to a separate pool or machine; backups contain credentials and plaintext
objects when encryption was not selected. The helper briefly stops backend and
MinIO, dumps PostgreSQL and copies the storage directory, then restores their previous
running state. It requires enough destination space and a running database:

```bash
./scripts/backup.sh /absolute/new/backup-directory
# Unraid variant:
./scripts/backup.sh /mnt/user/backups/sharedrive-2026-10-06 --unraid
```

It covers **local MinIO**, `.env`, `Caddyfile` and the setup token, not external S3 or
TLS certificate caches. Save `Caddyfile.tls` separately when customized; Caddy can
issue fresh certificates, subject to ACME rate limits. Keep encrypted share links
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

For Unraid, use the same infrastructure Compose arguments as in the README. Do not
run this against a nonempty database. Run migrations, start backend/web, check readiness
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
remote logos, SMTP and ACME still use external services. Set `SMTP_ALLOWED_HOSTS` to a
comma-separated hostname allowlist for a constrained installation and use network
egress policy for destination/IP restrictions. Existing S3 behavior remains unchanged.
