# ShareDrive

Self-hosted file sharing with anonymous transfers, registered accounts, optional browser encryption and an admin panel.

ShareDrive serves the web interface and API from **one application container**. Your existing reverse proxy handles HTTPS and certificates. No additional proxy or certificate manager is needed.

## Deployment

The complete stack contains five services:

```text
Browser -- HTTPS --> Your reverse proxy -- HTTP :8088 --> ShareDrive :3000
                                                           |-- PostgreSQL
                                                           |-- Redis
                                                           |-- MinIO
                                                           `-- ClamAV
```

PostgreSQL stores users, transfers, settings and durable upload/scan/deletion jobs. MinIO stores objects, Redis provides shared rate limits and ClamAV scans plaintext uploads. Only ShareDrive publishes a host port. Files stream through the app; browsers never access MinIO directly.

Requirements: Docker, Docker Compose v2, Git, Bash and OpenSSL. Allow at least 3 GB RAM for ClamAV in addition to the application, database and storage, and enough build space for MinIO.

### Docker Compose

```bash
git clone https://github.com/gottschalkfelix4-source/sharedrive.git
cd sharedrive
bash unraid/prepare-config.sh --compose
```

The helper generates database, MinIO and JWT secrets plus a private setup token before first start. Repeating it preserves existing credentials and data. Configure `HTTP_PORT` and `TRUST_PROXY` in `.env` for your reverse proxy, then start:

```bash
docker compose up --build -d --wait --wait-timeout 900
```

Alternatively, `bash start.sh` prepares configuration and starts the stack. The first ClamAV signature download and MinIO build can take several minutes.

Point your reverse proxy at `http://SERVER-IP:8088`, open the public HTTPS URL, enter the token read locally from `.setup/token`, set the public URL and create the admin account. The wizard does not change infrastructure credentials or configure certificates. Setup closes once an admin exists.

### Reverse Proxy

Use your proxy's existing certificate configuration. Route the entire site, including `/api`, to ShareDrive's HTTP host port, default **8088**. Serve the application at the domain root; subpath deployment is not supported.

- Preserve the public `Host` header, including a nonstandard public port when used.
- Set `X-Forwarded-Proto` to the public scheme and overwrite `X-Forwarded-For` with the real client address. Do not pass unchecked client forwarding headers through.
- Set `TRUST_PROXY` in `.env` to the **actual connecting proxy IP or CIDR**, as seen by the application, then recreate the app. The default `loopback` does not automatically trust your LAN or Docker network. Avoid broad private ranges or trusting all clients.
- Allow request bodies large enough for your configured upload limits, increase upload/read timeouts and disable request buffering where supported.
- Keep the app HTTP port accessible only to the proxy and your private administration network. Infrastructure ports remain private.

For an existing internet-facing nginx proxy, add these directives to its site; certificates stay in that proxy:

```nginx
location / {
    proxy_pass http://SERVER-IP:8088;
    proxy_http_version 1.1;
    proxy_set_header Host $http_host;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_request_buffering off;
    proxy_buffering off;
    client_max_body_size 10G;
    proxy_read_timeout 600s;
    proxy_send_timeout 600s;
}
```

If another trusted proxy precedes nginx, configure that chain's client-IP handling in your existing proxy. Check login, Secure cookies, settings changes and client-IP limits through the actual public URL.

Use HTTPS for normal operation. Browser encryption and clipboard access require a secure context; HTTP on a LAN IP does not provide it. Private HTTP can be used for initial setup, but the public Base URL must match your HTTPS address.

## Unraid

Choose either the complete Compose stack or one DockerMan app template with infrastructure Compose. Both use two locally built images: the combined app and MinIO. Do not run both methods against the same appdata.

### Complete Stack

In the Unraid terminal:

```bash
mkdir -p /mnt/user/appdata/sharedrive
git clone --branch master https://github.com/gottschalkfelix4-source/sharedrive.git /mnt/user/appdata/sharedrive/source
cd /mnt/user/appdata/sharedrive/source
bash unraid/prepare-config.sh --unraid
docker build -t sharedrive:unraid -f backend/Dockerfile .
docker build -t sharedrive-minio:unraid -f unraid/Dockerfile.minio .
```

Configure `/mnt/user/appdata/sharedrive/.env`, particularly `HTTP_PORT` and `TRUST_PROXY`, then start:

```bash
docker compose --env-file /mnt/user/appdata/sharedrive/.env -f unraid/compose.yml up -d --wait --wait-timeout 900
```

Keep [unraid/compose.yml](unraid/compose.yml) in the checkout: its build contexts resolve relative to that file. `up --build` can build both local images directly instead of the manual builds. For Compose Manager, use the checkout as the project directory or configure absolute build contexts. Persistent data stays under `/mnt/user/appdata/sharedrive/`. Only the app exposes **8088 HTTP**. Point your reverse proxy at `http://UNRAID-IP:8088` and complete setup with your public HTTPS URL and the token read locally from `/mnt/user/appdata/sharedrive/.setup/token`.

For a custom appdata path, export `SHAREDRIVE_APPDATA` before preparation and every Compose command, and adjust file paths. Compose interpolation reads values from `--env-file`; configure Compose Manager project variables as needed. A service's `env_file` alone does not provide YAML interpolation values.

### DockerMan App Template

After the same preparation and two image builds:

```bash
cd /mnt/user/appdata/sharedrive/source
bash unraid/install-templates.sh
docker network inspect sharedrive >/dev/null 2>&1 || docker network create sharedrive
docker compose --env-file /mnt/user/appdata/sharedrive/.env -f unraid/compose.infrastructure.yml up -d --wait --wait-timeout 900
```

Select **Docker -> Add Container -> Template -> ShareDrive-Backend** and apply the template. This single container serves web interface and API. Keep its `sharedrive` network, token mount and `--env-file` path. Set the host port in DockerMan separately from `.env` `HTTP_PORT`. Enable autostart with enough time for infrastructure to become healthy. Local images must exist; disable registry auto-updates for the app image.

The importer preserves changed templates in backup files. It does not build images or start containers. No registry image or Community Applications listing is assumed. An archive with the app and MinIO images can be loaded using `docker load -i /path/to/sharedrive-images.tar.gz` instead of the two builds; it supplies no appdata or credentials.

For an older DockerMan installation, back up and stop its old Web and Backend containers before applying the combined Backend template. Reuse the same appdata and infrastructure project. See [upgrade instructions](docs/operations.md#upgrade-from-the-previous-proxy-stack).

## Configuration

Application settings live in **Admin -> Settings**. Infrastructure configuration stays in your private `.env`. Never put credentials in Git or XML templates.

| Variable | Purpose |
| --- | --- |
| `HTTP_PORT` | Published app port, default `8088`; internal app port remains `3000` |
| `TRUST_PROXY` | Trusted proxy IP/CIDR, comma-separated; default `loopback` |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `DATABASE_URL` | Database credentials and connection |
| `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY` | Object storage credentials |
| `MINIO_ENDPOINT`, `MINIO_PORT`, `MINIO_BUCKET`, `MINIO_USE_SSL` | Internal storage connection |
| `REDIS_URL` | Internal Redis connection |
| `CLAMAV_HOST`, `CLAMAV_PORT` | Internal scanner connection |
| `JWT_SECRET` | Random signing secret generated by the helper |
| `SETUP_TOKEN_FILE` | Private token path, `/app/.setup/token` in Docker |
| `SMTP_ALLOWED_HOSTS` | Optional exact SMTP hostname allowlist |

Settings include public Base URL, upload limits, retention, registration, email verification, SMTP, appearance, virus scanning and privacy/legal text. Certificates, DNS and proxy configuration belong to your existing reverse proxy.

## Encryption And Privacy

Browser encryption uses AES-256-GCM in 8 MiB chunks. Version 2 authenticates chunk position, file identity and length plus an encrypted manifest. Existing version 1 transfers remain readable. The complete link carries the key in its fragment, such as `/d/abc123#key=...&v=2&ctx=...`; the server never receives that fragment. Keep the full link private. The server cannot recover lost keys.

Encrypted transfers cannot be virus-scanned. Plaintext uploads require a clean scan when scanning is enabled; scanner failures do not publish a clean transfer. Administrators can access unencrypted contents and metadata. Encryption hides contents and encrypted names while the key stays private; sizes, MIME types, dates, owners and notification email remain visible. IP masking and retention do not alone establish legal compliance.

## Updates And Backups

Back up before updates, stop application writes, update the checkout, rebuild the app image and recreate its container. Rebuild MinIO when its pinned source/image changes. For standard Compose:

```bash
bash scripts/backup.sh /absolute/new/backup-directory
docker compose stop backend
git pull --ff-only
docker compose up --build -d --remove-orphans --wait --wait-timeout 900
```

For complete Unraid Compose, use `--env-file /mnt/user/appdata/sharedrive/.env -f unraid/compose.yml`, rebuild the local images and use `--force-recreate`. Back up this mode with `bash scripts/backup.sh /mnt/user/backups/sharedrive-YYYY-MM-DD --unraid-compose`. The helper's `--unraid` flag is only for DockerMan with infrastructure Compose. In DockerMan use **Edit -> Apply** after rebuilding the app. A restart does not load new images or changed environment variables.

Preserve the Compose project name and storage paths. **Do not use `down -v`, delete appdata or remove named volumes during upgrades.** Older `db push` installations may need the migration baseline before startup. [Operations](docs/operations.md) covers old-stack upgrades, credentials, backup/restore and legacy migrations.

Check `/api/health` and `/api/ready`, scanner logs and actual uploads/downloads after deployment. Readiness checks PostgreSQL, Redis and object storage; it is not a virus-scan or full workflow test.

## Development And Tests

Use Node 24 and package lockfiles. Supply isolated local database, Redis, MinIO and ClamAV endpoints via the environment or ignored `backend/.env.local`; do not overwrite a deployment `.env`.

```bash
cd backend
npm ci
npx prisma generate
npx prisma migrate deploy
npm run dev
```

In another terminal:

```bash
cd frontend
npm ci
npm run dev
```

Vite proxies `/api` to `http://localhost:3000`; `API_PROXY_TARGET` overrides it. Native setup uses `backend/.setup-token` unless `SETUP_TOKEN_FILE` is supplied. Production images build the frontend and serve it with the API.

Run `npm test` and `npm run build` in each package. Browser and database/storage integration tests use isolated fixtures in [testing](docs/testing.md). The [German project review](docs/project-review.de.md) preserves the previous review and its validation boundaries; its proxy architecture is superseded.

## License

ShareDrive: [MIT](LICENSE). MinIO is built from the pinned official source in `unraid/Dockerfile.minio` and is separately licensed under AGPL-3.0. Its build needs GitHub, the Go module proxy/checksum service and artifact hosts; preserve TLS/checksum validation.
