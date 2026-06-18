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
- **Anonymous transfers** — no account needed for senders or receivers
- **Registered accounts** — full transfer history, longer retention, dashboard
- **Admin panel** — stats, charts, user & transfer management, all settings in the web UI
- **First-time setup wizard** — guided domain + admin account configuration on first launch
- **Email verification** — optional SMTP-backed verification with test button
- **Reverse-proxy ready** — everything streams through port 80, no extra ports exposed, SSL handled upstream
- **Privacy-aware admin** — admins can manage transfers without seeing file names, types, or download links
- **Configurable** — storage limits, retention periods, appearance (color, logo), security policies — all via web UI, no env editing required

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, TypeScript, Tailwind CSS, Framer Motion |
| Backend | Node.js, Express, TypeScript, Prisma ORM |
| Database | PostgreSQL 16 |
| Object storage | MinIO (S3-compatible) |
| Cache / sessions | Redis 7 |
| Reverse proxy | nginx (also serves the built frontend) |
| Orchestration | Docker Compose |

---

## Quick Start

**Requirements:** Docker + Docker Compose

```bash
git clone https://github.com/gottschalkfelix4-source/sharedrive.git
cd sharedrive
cp .env.example .env
```

Edit `.env` and change the default passwords, then:

```bash
docker compose up --build -d
```

Open **http://localhost** — the setup wizard will guide you through domain configuration and creating your admin account.

> The `start.sh` script wraps these steps and creates `.env` from the example automatically if it doesn't exist.

```bash
chmod +x start.sh && ./start.sh
```

---

## Configuration

All application settings live in the **Admin panel → Settings** after first start. No need to touch `.env` again.

### `.env` (infrastructure only)

| Variable | Description |
|---|---|
| `HTTP_PORT` | Host port the web interface listens on (default: `80`) |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Database credentials |
| `DATABASE_URL` | Full Postgres connection string |
| `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` | MinIO root credentials |
| `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` | MinIO access credentials (can match root) |
| `REDIS_URL` | Redis connection URL |
| `JWT_SECRET` | Secret for signing JWT tokens — **change this before going live** |

### Web UI Settings

| Category | Options |
|---|---|
| **General** | App name, base URL (domain), description, max files per transfer |
| **Storage** | Max file size, max transfer size, retention days (anonymous / registered) |
| **Email** | SMTP host/port/auth, SSL toggle, from address, test button |
| **Security** | Open/closed registration, require email verification |
| **Appearance** | Primary color (presets + custom picker), logo upload, favicon upload |

---

## Behind a Reverse Proxy

ShareDrive is designed to run behind a reverse proxy (Caddy, nginx, Traefik, etc.) that handles SSL termination. All file downloads stream through the backend on port 80 — MinIO is never exposed to the browser.

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

## Architecture

```
Browser
  │
  ▼
nginx :80
  ├── /           → frontend (static, built into the nginx image)
  └── /api/*      → backend :3000
                        ├── PostgreSQL (users, transfers, settings)
                        ├── MinIO (file objects, internal only)
                        └── Redis (rate limiting, sessions)
```

File uploads stream directly from the browser through the backend to MinIO using [Busboy](https://github.com/mscdex/busboy) — no temp files on disk.

File downloads stream from MinIO through the backend to the browser — no presigned MinIO URLs are ever exposed, so your internal hostname stays internal.

---

## Admin Panel

The admin panel lives at `/admin` and is accessible to users with the `ADMIN` role.

- **Dashboard** — active transfers, downloads today, storage used, 7-day download chart, recent transfers
- **Files** — paginated transfer list with search and status filter, bulk-delete
- **Users** — paginated user list, role management, delete users
- **Settings** — 5 categories (see above), all persisted to the database

**Privacy:** Admins can see which user owns a transfer and its metadata (size, download count, expiry) but cannot see individual file names, MIME types, or access download links.

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

The frontend dev server proxies `/api` to `http://localhost:3000` via Vite.

---

## License

MIT — see [LICENSE](LICENSE).
