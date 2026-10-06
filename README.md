<div align="center">

# ShareDrive

**Self-hosted file sharing — fast, private, beautiful.**

A WeTransfer-style platform you run yourself. Upload files, share a link, done.
Anonymous transfers or registered accounts with full history — your choice.

[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)](https://docs.docker.com/compose/)
[![Node.js](https://img.shields.io/badge/Node.js-24-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

</div>

---

## Features

- **Drag & drop uploads** — drop files, set an optional title, password, expiry and download limit, share the link
- **End-to-end encryption** — AES-256-GCM, encrypted in the browser before upload; the key lives only in the download link fragment, never sent to the server
- **Anonymous transfers** — no account needed for senders or receivers
- **Registered accounts** — full transfer history, longer retention, dashboard
- **Admin panel** — stats, charts, user & transfer management, all settings in the web UI
- **First-time setup wizard** — guided domain + admin account configuration on first launch
- **Auto-SSL** — optional built-in HTTPS via Caddy + Let's Encrypt, no reverse proxy required
- **Reverse-proxy ready** — drop behind Caddy, nginx, or Traefik; SSL handled upstream if preferred
- **Email verification** — optional SMTP-backed verification with test button
- **Privacy controls** — masked log IPs, configurable retention, privacy policy + imprint pages; legal compliance depends on the deployment
- **Client encryption** — protects contents and encrypted names from the server while the share-link key remains private; server administrators can access unencrypted transfers and metadata
- **Configurable** — storage limits, retention periods, appearance (color, logo), security policies — all via web UI

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, TypeScript, Tailwind CSS, Framer Motion |
| Backend | Node.js, Express, TypeScript, Prisma ORM |
| Database | PostgreSQL 16 |
| Object storage | MinIO (S3-compatible) |
| Shared rate limits | Redis 7 |
| Durable upload/scan/deletion jobs | PostgreSQL |
| Proxy / SSL | nginx (built-in) · Caddy (optional, auto-SSL) |
| Orchestration | Docker Compose |

---

## Quick Start

**Requirements:** Docker + Docker Compose v2, Git, Bash and OpenSSL; several GB of RAM/build space for MinIO and ClamAV.

```bash
git clone https://github.com/gottschalkfelix4-source/sharedrive.git
cd sharedrive
SHAREDRIVE_APPDATA="$PWD" bash unraid/prepare-config.sh --compose
```

The helper creates random local credentials and a private setup token. Start the stack:

```bash
docker compose up --build -d --wait
```

Read `.setup/token` locally and enter it in the wizard at **http://localhost**. After credential rotation, recreate MinIO and backend as instructed by the wizard before creating the admin account. See [operations](docs/operations.md).

> `start.sh` wraps these steps and auto-creates `.env` from the example:
> ```bash
> chmod +x start.sh && ./start.sh
> ```

---

## Auto-SSL (no reverse proxy needed)

ShareDrive ships with an optional Caddy sidecar that provisions and renews Let's Encrypt certificates automatically.

**1. Add to `.env`:**
```env
DOMAIN=share.yourdomain.com
ACME_EMAIL=admin@yourdomain.com
```

**2. Start with the SSL override:**
```bash
docker compose -f docker-compose.yml -f docker-compose.ssl.yml up --build -d
```

The SSL override mounts `Caddyfile.tls`, which reads DOMAIN and ACME_EMAIL. Caddy fetches the certificate on first start. Ports 80 and 443 must be reachable from the internet (for the ACME challenge). The setup wizard shows this command with a copy button when you enable the SSL toggle.

---

## Behind a Reverse Proxy

If you already have a reverse proxy handling TLS, run HTTP mode and proxy to HTTP_PORT. Set `CADDY_TRUSTED_PROXIES` to that proxy's exact IP/CIDR, and forward Host, X-Forwarded-For and X-Forwarded-Proto. See [proxy configuration](docs/operations.md#http-tls-and-proxies).

**Caddy example:**
```
share.yourdomain.com {
    reverse_proxy localhost:80
}
```

**nginx example:**
```nginx
server {
    listen 443 ssl;
    server_name share.yourdomain.com;

    ssl_certificate     /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass         http://localhost:80;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        client_max_body_size 10G;
    }
}
```

Set **Base URL** to `https://share.yourdomain.com` in the setup wizard or Admin → Settings → General.

---

## Configuration

Application settings live in **Admin → Settings**. Infrastructure secrets and proxy settings live in `.env`. Enter the local `.setup/token` in the setup wizard; keep that file private. [Migration, backup/restore and setup credential rotation](docs/operations.md) are documented separately.

### `.env` reference

| Variable | Description |
|---|---|
| `HTTP_PORT` | Host port for HTTP-only mode (default: `80`) |
| `DOMAIN` | Domain for auto-SSL mode (e.g. `share.example.com`) |
| `ACME_EMAIL` | Let's Encrypt contact email (required with the SSL override) |
| `HTTPS_PORT` | Host port for built-in TLS (default: `443`) |
| `CADDY_TRUSTED_PROXIES` / `TRUST_PROXY` | Trusted upstream proxy addresses / Express proxy hops |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Database credentials |
| `DATABASE_URL` | Full Postgres connection string |
| `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` | MinIO root credentials |
| `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` | MinIO access credentials |
| `REDIS_URL` | Redis connection URL |
| `JWT_SECRET` | Random signing secret of at least 32 characters; generated by the helper |
| `SETUP_TOKEN_FILE` | Private bootstrap token file; Docker uses `/app/.setup/token` |
| `SMTP_ALLOWED_HOSTS` | Optional comma-separated allowlist of exact SMTP hosts |

### Web UI Settings

| Category | Options |
|---|---|
| **General** | App name, base URL, description, max files per transfer |
| **Storage** | Max file size, max transfer size, retention days (anonymous / registered) |
| **Email** | SMTP host/port/auth, SSL toggle, from address, test button |
| **Security** | Open/closed registration, require email verification |
| **Appearance** | Primary color (presets + custom picker), logo upload, favicon upload |
| **Privacy** | IP anonymization, log retention period, privacy policy text, imprint text |

---

## End-to-End Encryption

When the sender enables **Ende-zu-Ende-Verschlüsselung** before uploading:

- A 256-bit AES-GCM key is generated in the browser
- Each 8 MiB chunk is encrypted client-side and authenticated with its file, position and length
- New transfers include an authenticated encrypted manifest to detect altered or missing file metadata; existing version 1 transfers remain readable
- The full download URL carries the key, version and context in its fragment: `https://…/d/abc123#key=<base64url>&v=2&ctx=<context>`
- The server and MinIO never see the plaintext or the key
- The receiver's browser decrypts the file locally before saving it

Keep the complete link private. The server cannot recover a lost key. Encrypted uploads cannot be virus-scanned; plaintext uploads require a clean scan when scanning is enabled.

---

## Architecture

**HTTP-only mode:**
```
Browser
  │
  ▼
Caddy :80
  │
  ▼
nginx :80
  ├── /        → frontend (static, built into the nginx image)
  └── /api/*   → backend :3000
                     ├── PostgreSQL (users, transfers, settings, durable jobs)
                     ├── MinIO (file objects — internal only)
                     ├── ClamAV (plaintext virus scans)
                     └── Redis (shared rate limits)
```

**Auto-SSL mode (`docker-compose.ssl.yml`):**
```
Browser
  │
  ▼
Caddy :443 (Let's Encrypt TLS)
  │
  ▼
nginx :80  →  backend :3000  →  MinIO / PostgreSQL / Redis
```

File uploads stream directly from the browser through the backend to MinIO via [Busboy](https://github.com/mscdex/busboy) — no temp files on disk. Downloads stream back the same way — no presigned MinIO URLs are ever exposed to the browser.

---

## Admin Panel

The admin panel lives at `/admin` (requires `ADMIN` role).

- **Dashboard** — active transfers, downloads today, storage used, 7-day download chart, recent transfers
- **Files** — paginated transfer list with search and status filter, bulk-delete
- **Users** — paginated user list, role management, delete users
- **Settings** — 6 categories, all persisted to the database

**Privacy:** Server administrators can access the database and storage. Client encryption protects contents and names while its key stays in the share-link fragment; sizes, MIME types, dates, owner and notification email remain visible. Unprotected plaintext transfers are accessible through their short IDs. See [privacy and operations](docs/operations.md#privacy-and-outgoing-services).

---

## Development

Use Node **24** and the lockfiles. Start the infrastructure and complete first setup through Compose before switching to a native backend. For a native backend, supply DATABASE_URL, REDIS_URL, MINIO_ENDPOINT/PORT and CLAMAV_HOST/PORT for local test services via the shell or ignored `backend/.env.local`; do not overwrite an existing deployment `.env`. The dev command loads the root `.env` plus these optional local overrides. Use the isolated fixtures in [testing](docs/testing.md) instead of production data.

```bash
cd backend
npm ci
npx prisma generate
# With the local DATABASE_URL exported:
npx prisma migrate deploy
npm run dev

# Frontend (separate terminal, from the checkout)
cd frontend
npm ci
npm run dev
```

Vite proxies `/api` to `http://localhost:3000`; API_PROXY_TARGET can override the development proxy. Native first setup generates its token in `backend/.setup-token` unless SETUP_TOKEN_FILE is supplied. Credential rotation and Caddy TLS configuration are intended for the documented Compose/Unraid deployment; use that workflow to initialize the development database first.

---

## Unraid

ShareDrive provides two DockerMan user templates: [Backend](unraid/templates/sharedrive-backend.xml) and [Web](unraid/templates/sharedrive-web.xml). PostgreSQL, Redis, MinIO, ClamAV and Caddy run through the included [infrastructure Compose file](unraid/compose.infrastructure.yml). The templates use locally built images; no published ShareDrive registry image is assumed. Requirements: Unraid with Docker enabled, Docker Compose v2, Git, curl and OpenSSL. This is a DockerMan template import, not a Community Applications listing.

### Add the templates with one command

Run this **in the Unraid terminal**:

```bash
bash -c 'set -euo pipefail; t=$(mktemp); trap '\''rm -f -- "$t"'\'' EXIT; curl -fsSL --proto "=https" --proto-redir "=https" https://raw.githubusercontent.com/gottschalkfelix4-source/sharedrive/master/unraid/install-templates.sh -o "$t"; bash "$t"'
```

The command downloads the importer and installs both XML files in `/boot/config/plugins/dockerMan/templates-user/`. It preserves changed existing templates in backup files and leaves identical templates untouched. It does **not** install images or start containers. Then select **Docker → Add Container → Template → ShareDrive-Backend / ShareDrive-Web**. If working from an unpublished checkout, use `bash unraid/install-templates.sh` from that checkout instead.

### Prepare images and persistent storage

Clone once, or use your existing checkout:

```bash
mkdir -p /mnt/user/appdata/sharedrive
git clone --branch master https://github.com/gottschalkfelix4-source/sharedrive.git /mnt/user/appdata/sharedrive/source
cd /mnt/user/appdata/sharedrive/source
bash unraid/prepare-config.sh
docker network inspect sharedrive >/dev/null 2>&1 || docker network create sharedrive
docker build -t sharedrive-backend:unraid ./backend
docker build -t sharedrive-web:unraid -f nginx/Dockerfile .
docker build -t sharedrive-minio:unraid -f unraid/Dockerfile.minio .
docker compose --env-file /mnt/user/appdata/sharedrive/.env -f unraid/compose.infrastructure.yml up -d
```

The configuration helper creates random local database, MinIO and JWT secrets with `.env` permissions `0600`, and a writable runtime copy of `Caddyfile`. Repeating it preserves existing configuration. Persistent service data uses bind mounts under `/mnt/user/appdata/sharedrive/`, rather than the Docker image filesystem. Choose an appdata pool with enough space for uploads, PostgreSQL and ClamAV signatures. Keep the source checkout and local images for rebuilds.

**MinIO:** the included Dockerfile builds the official source-only release from a fixed Git commit, with Go module checksum validation. It needs GitHub, the Go proxy/checksum service and artifact hosts such as `storage.googleapis.com`. MinIO is separately licensed under AGPL-3.0. If using `MINIO_IMAGE` instead, supply an accessible trusted image with `curl` for the configured healthcheck; skip the MinIO build above and use `up -d --no-build`. The source build and real storage integration have been verified; see the [review](docs/project-review.de.md).

If you received a Docker image archive containing these three `:unraid` images, load it with `docker load -i /path/to/sharedrive-images.tar.gz` instead of running the three image-build commands. Prepare the configuration, Docker network and infrastructure as above; the archive supplies the images, not service data or credentials.

Only Caddy exposes host ports: HTTP **8088**, HTTPS **8443** (TCP/UDP). Database, Redis, MinIO, its console, ClamAV, backend and nginx remain on the `sharedrive` Docker network. Change `HTTP_PORT` / `HTTPS_PORT` in the appdata `.env` if those ports are occupied. Update the Web template's WebUI URL if HTTP_PORT changes.

### Apply templates and complete setup

1. Apply **ShareDrive-Backend**, then **ShareDrive-Web**. Keep network `sharedrive` and the aliases `backend` / `nginx`; the existing proxy configuration depends on them. Local images must already exist. Disable registry auto-updates for these two images.
2. Read `/mnt/user/appdata/sharedrive/.setup/token` locally and enter it in the wizard. Open `http://UNRAID-IP:8088` on your LAN to complete setup. Keep the initial setup private until the admin account exists. The backend template reads credentials using `--env-file` and mounts that same file at `/app/.env` for the wizard.
3. After the wizard's **Zugangsdaten speichern & anwenden** step, recreate MinIO and the backend **before proceeding to admin login**. The wizard saves the credentials, refreshes clients and requires container recreation. It will not finish admin creation until readiness is verified. Leave the wizard tab open while running:

   ```bash
   cd /mnt/user/appdata/sharedrive/source
   docker compose --env-file /mnt/user/appdata/sharedrive/.env -f unraid/compose.infrastructure.yml up -d --force-recreate minio
   ```

   Then use Unraid **ShareDrive-Backend → Edit → Apply** to recreate the backend with the updated `--env-file`. `docker restart` alone reuses the old container environment and does not reload this file.

4. Use **Bereitschaft prüfen** in the wizard after recreation, then create the admin account. With an existing reverse proxy, leave built-in SSL off, proxy to port 8088 and set the public HTTPS Base URL. For built-in Caddy TLS, forward public TCP 80 → 8088 and TCP 443 → 8443 (optionally UDP 443 → 8443), point DNS at your server and enable SSL in the wizard. The writable runtime `Caddyfile` is shared with Caddy; the Unraid workflow does not use `docker-compose.ssl.yml`.
5. Enable Unraid autostart for Backend before Web, with enough delay for PostgreSQL and MinIO to become ready. Infrastructure uses `restart: unless-stopped`; start it again with the Compose command above if stopped manually. The backend exits if dependencies are unavailable and retries through its restart policy.

Use HTTPS for normal browser access: end-to-end encryption and clipboard APIs require a secure browser context when accessing a server by LAN IP or domain. Plain HTTP on port 8088 is suitable for the initial private setup, but does not provide those browser capabilities.

If you choose a different appdata path, export `SHAREDRIVE_APPDATA` for the helper and every Compose command, pass the matching `--env-file` path and adjust all backend template mounts and its Extra Parameters `--env-file`. Never place actual credentials in the XML templates.

### Check readiness and update

```bash
cd /mnt/user/appdata/sharedrive/source
docker compose --env-file /mnt/user/appdata/sharedrive/.env -f unraid/compose.infrastructure.yml ps
docker compose --env-file /mnt/user/appdata/sharedrive/.env -f unraid/compose.infrastructure.yml exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT 1"'
docker compose --env-file /mnt/user/appdata/sharedrive/.env -f unraid/compose.infrastructure.yml exec -T redis redis-cli ping
docker compose --env-file /mnt/user/appdata/sharedrive/.env -f unraid/compose.infrastructure.yml exec -T clamav clamdscan --ping 1
curl --fail http://UNRAID-IP:8088/api/health
curl --fail http://UNRAID-IP:8088/api/ready
curl --fail http://UNRAID-IP:8088/api/setup/status
```

If HTTPS was enabled, use the configured public HTTPS URL for HTTP checks. Wait for ClamAV's first signature download; `PONG` alone does not establish that signatures are current. Check its logs, then verify an upload/download with matching bytes, a password-protected transfer and an encrypted transfer. `/api/health` alone does not test those workflows.

Before updates, back up `.env`, `Caddyfile`, PostgreSQL (with `pg_dump`) and MinIO objects. Stop the two app containers, update the checkout with `git pull --ff-only`, rebuild both local images with the build commands above, then use Unraid **Edit → Apply** on Backend and Web to recreate them using the new images. A restart alone keeps the old image. The backend applies versioned migrations. Legacy installations created with `db push`, or recording the old initial migration name `init`, need the controlled [baseline procedure](docs/operations.md#database-upgrades) before the first upgrade. The backend runs as UID/GID 1000; existing configuration files must be writable by that UID. Use the [backup helper and restore guide](docs/operations.md#backup-and-restore). Recheck readiness after updates. Do not delete appdata or use `docker system prune -a` as an update procedure: it can remove locally built images required by these templates.

## Project review and improvement suggestions

The [German project review](docs/project-review.de.md) records findings, implemented improvements and verified checks. The approved upload/download, setup/authentication, migration, privacy, frontend and deployment improvements are implemented. **S3 provider mapping and external-storage migration were excluded**; do not switch providers while existing transfers still depend on the previous storage.

Regression checks: `npm test` and `npm run build` in each package; `npm run test:browser` in frontend after installing Playwright Chromium. Backend `test:database` and `test:integration` require isolated test services, documented in [testing](docs/testing.md). CI runs builds, database/concurrency tests, browser flows and a separate real-MinIO/ClamAV integration job.

---

## License

MIT — see [LICENSE](LICENSE).
