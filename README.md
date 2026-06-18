<div align="center">

# ShareDrive

**Self-hosted file sharing — fast, private, beautiful.**

A WeTransfer-style platform you run yourself. Upload files, share a link, done.
Anonymous transfers or registered accounts with full history — your choice.

[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)](https://docs.docker.com/compose/)
[![Node.js](https://img.shields.io/badge/Node.js-20-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
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
- **DSGVO / GDPR** — IP anonymization, configurable log retention, privacy policy + imprint pages, cookie notice
- **Privacy-aware admin** — admins can manage transfers without seeing file names, types, or download links
- **Configurable** — storage limits, retention periods, appearance (color, logo), security policies — all via web UI

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, TypeScript, Tailwind CSS, Framer Motion |
| Backend | Node.js, Express, TypeScript, Prisma ORM |
| Database | PostgreSQL 16 |
| Object storage | MinIO (S3-compatible) |
| Cache / sessions | Redis 7 |
| Proxy / SSL | nginx (built-in) · Caddy (optional, auto-SSL) |
| Orchestration | Docker Compose |

---

## Quick Start

**Requirements:** Docker + Docker Compose v2

```bash
git clone https://github.com/gottschalkfelix4-source/sharedrive.git
cd sharedrive
cp .env.example .env
```

Edit `.env` and change the default passwords, then:

```bash
docker compose up --build -d
```

Open **http://localhost** — the setup wizard guides you through domain configuration and admin account creation.

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
ACME_EMAIL=admin@yourdomain.com   # optional, for expiry notifications
```

**2. Start with the SSL override:**
```bash
docker compose -f docker-compose.yml -f docker-compose.ssl.yml up --build -d
```

Caddy fetches the certificate on first start. Ports 80 and 443 must be reachable from the internet (for the ACME challenge). The setup wizard shows this command with a copy button when you enable the SSL toggle.

---

## Behind a Reverse Proxy

If you already have a reverse proxy handling SSL, just run the standard `docker compose up -d` and proxy to port 80.

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
        client_max_body_size 10G;
    }
}
```

Set **Base URL** to `https://share.yourdomain.com` in the setup wizard or Admin → Settings → General.

---

## Configuration

All application settings live in **Admin → Settings** after first start. The `.env` file is infrastructure-only.

### `.env` reference

| Variable | Description |
|---|---|
| `HTTP_PORT` | Host port for HTTP-only mode (default: `80`) |
| `DOMAIN` | Domain for auto-SSL mode (e.g. `share.example.com`) |
| `ACME_EMAIL` | Let's Encrypt contact email (optional) |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Database credentials |
| `DATABASE_URL` | Full Postgres connection string |
| `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` | MinIO root credentials |
| `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` | MinIO access credentials |
| `REDIS_URL` | Redis connection URL |
| `JWT_SECRET` | JWT signing secret — **change before going live** |

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
- Each 8 MB chunk is encrypted client-side before being sent to the server
- The key is appended to the download URL as a fragment: `https://…/d/abc123#key=<base64url>`
- The server and MinIO never see the plaintext or the key
- The receiver's browser decrypts the file locally before saving it

The download link is the only place the key exists. If it's lost, the file cannot be recovered.

---

## Architecture

**HTTP-only mode:**
```
Browser
  │
  ▼
nginx :80
  ├── /        → frontend (static, built into the nginx image)
  └── /api/*   → backend :3000
                     ├── PostgreSQL (users, transfers, settings)
                     ├── MinIO (file objects — internal only)
                     └── Redis (rate limiting, sessions)
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

**Privacy:** Admins see transfer metadata (size, download count, expiry, owner) but cannot see individual file names, MIME types, or access download links.

---

## Development

```bash
# Backend
cd backend
npm install
cp ../.env.example ../.env   # set DATABASE_URL to a local Postgres instance
npx prisma db push
npm run dev

# Frontend (separate terminal)
cd frontend
npm install
npm run dev
```

The Vite dev server proxies `/api` to `http://localhost:3000`.

---

## License

MIT — see [LICENSE](LICENSE).
