# ShareDrive

Self-hosted file sharing with anonymous transfers, registered accounts, optional browser encryption and an admin panel.

ShareDrive serves the web interface and API from **one application container**. Unraid also has a separate **all-in-one image** containing the application and all infrastructure. Your existing reverse proxy handles HTTPS and certificates. No additional proxy or certificate manager is needed.

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

For the separate-container deployment: Docker, Docker Compose v2, Git, Bash and OpenSSL. Allow at least 3 GB RAM for ClamAV in addition to the application, database and storage. The Unraid AIO alternative below needs only DockerMan, Bash and curl, with at least 6 GB RAM available. Production uses ready-to-pull images; no local image build or Node installation is required.

| Published Image | Contents |
| --- | --- |
| `ghcr.io/gottschalkfelix4-source/sharedrive:latest` | Web interface and API |
| `ghcr.io/gottschalkfelix4-source/sharedrive-minio:latest` | MinIO built from the repository's pinned official source |
| `ghcr.io/gottschalkfelix4-source/sharedrive-aio:latest` | Standalone Unraid app, PostgreSQL 16, Redis, MinIO and ClamAV |

Published images target `linux/amd64`, including typical Unraid servers.

### Docker Compose

```bash
git clone https://github.com/gottschalkfelix4-source/sharedrive.git
cd sharedrive
bash unraid/prepare-config.sh --compose
```

The helper generates database, MinIO and JWT secrets plus a private setup token before first start. Repeating it preserves existing credentials and data. Configure `HTTP_PORT` and `TRUST_PROXY` in `.env` for your reverse proxy, then start:

```bash
docker compose pull
docker compose up -d --no-build --wait --wait-timeout 900
```

The root Compose file reads `.env` and mounts `.setup` relative to its own directory. Keep those files beside it if moving the stack, and preserve the project name to keep using existing named data volumes.

Alternatively, `bash start.sh` prepares configuration, pulls the images and starts the stack. The first image download and ClamAV signature download can take several minutes.

Point your reverse proxy at `http://SERVER-IP:8088`, open the public HTTPS URL, enter the token read locally from `.setup/token`, set the public URL and create the admin account. The wizard does not change infrastructure credentials or configure certificates. Setup closes once an admin exists.

### Reverse Proxy

Use your proxy's existing certificate configuration. Route the entire site, including `/api`, to ShareDrive's HTTP host port, default **8088**. Serve the application at the domain root; subpath deployment is not supported.

- Preserve the public `Host` header, including a nonstandard public port when used.
- Set `X-Forwarded-Proto` to the public scheme and overwrite `X-Forwarded-For` with the real client address. Do not pass unchecked client forwarding headers through.
- Set `TRUST_PROXY` in `.env` (or **Trusted reverse proxy** in the AIO DockerMan template) to the **actual connecting proxy IP or CIDR**, as seen by the application, then recreate the app. The default `loopback` does not automatically trust your LAN or Docker network. Avoid broad private ranges or trusting all clients.
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

Choose the standalone AIO template for a single native Docker-GUI entry, or keep the separate-container Compose deployments below. Do not run different methods against the same appdata.

### All-In-One Docker Template

Run this **one line in the Unraid terminal** to install the template:

```bash
mkdir -p /boot/config/plugins/dockerMan/templates && curl -fL https://raw.githubusercontent.com/gottschalkfelix4-source/sharedrive/master/unraid/templates/sharedrive-aio.xml -o /boot/config/plugins/dockerMan/templates/ShareDrive-AIO.xml
```

Select **Docker -> Add Container -> Template -> ShareDrive-AIO** under **Default templates** and apply. Unraid downloads `ghcr.io/gottschalkfelix4-source/sharedrive-aio:latest`. No repository checkout, Compose, separate service containers or local builds are needed. The command downloads the DockerMan XML directly to `/boot/config/plugins/dockerMan/templates/ShareDrive-AIO.xml`; it does not start a container. DockerMan saves the applied container configuration separately in `templates-user`. Running the download again replaces the default template file, so back up any customized default XML first.

Both Unraid templates include the [ShareDrive icon](unraid/assets/sharedrive-logo.png). For an already-created container with no icon, set its **Icon URL** in DockerMan's advanced Edit view to `https://raw.githubusercontent.com/gottschalkfelix4-source/sharedrive/master/unraid/assets/sharedrive-logo.png` and apply. Downloading a new default template alone does not change an existing container configuration.

The template exposes one HTTP port, **8088 -> 3000**, and one persistent directory, **`/mnt/user/appdata/sharedrive-aio -> /data`**. Select another host port if an existing stack already uses 8088. Keep bridge networking, provide at least 6 GB RAM, and set **Trusted reverse proxy** to the actual connecting proxy IP/CIDR. The advanced SMTP allowlist is optional. Do not enable privileged mode or mount the Docker socket.

First startup generates private credentials in `/data/config/secrets.json` and a setup token in `/data/.setup/token`, initializes PostgreSQL and storage, applies migrations and loads bundled ClamAV signatures. These bundled signatures allow startup without an online signature download; FreshClam refreshes them in the background when connectivity permits. Allow several minutes for initial database/scanner startup. Read `/mnt/user/appdata/sharedrive-aio/.setup/token` locally, point your existing reverse proxy at `http://UNRAID-IP:8088`, then complete setup using your public HTTPS URL. Secrets and the setup token are not printed to logs.

Read the **setup token in the Unraid terminal** after the first initialization:

```bash
cat /mnt/user/appdata/sharedrive-aio/.setup/token
```

If you changed the **Appdata** path, use that path instead. Alternatively, read it inside the running container (replace the name if you renamed it):

```bash
docker exec ShareDrive-AIO cat /data/.setup/token
```

Enter the displayed token in the setup wizard. Do not post it publicly. Setup closes once an admin exists; the token does not grant access to an already-configured installation.

All application settings can also be configured in the **AIO DockerMan template**, including upload/transfer limits, quotas, retention, SMTP, registration and verification, scanning, branding, legal text, privacy and external S3. Public URL and upload/transfer limits are visible immediately; select DockerMan's **Advanced View** for the remaining fields. Size fields use integer **MiB**, not bytes: `5120` = 5 GiB and `10240` = 10 GiB. The individual field descriptions include valid ranges and application defaults. A reverse proxy's own upload/body-size limit remains a separate setting in that proxy.

Application upload limits do not raise antivirus limits: bundled ClamAV has `6144M` stream/file/scan limits and rejects exceeded limits rather than marking oversized uploads clean. Keep plaintext files within scanner limits when scanning is enabled.

Every optional application field starts **empty**. Empty means use the existing **Admin -> Settings** value, or the application default if no value was saved. A nonempty `SHAREDRIVE_*` value takes precedence and is shown as read-only in web administration. Use **Edit -> Apply** after changing values; restarting alone does not change a container's environment. Clear an optional value and apply to release it back to web administration: template values never overwrite the saved database settings.

Downloading the XML again only updates the **default template**, not a running container's saved user template. Existing containers need the new variables added under **Edit -> Add another Path, Port, Variable, Label or Device -> Variable**, using the `Target` names in the XML, then **Apply**; alternatively use the refreshed default template while retaining the existing appdata path and container name. Do not initialize a second container against the same appdata. Update the AIO image as well: older images do not implement these optional settings.

SMTP passwords and external S3 secret keys are masked in DockerMan, but remain available in Docker's environment and saved user-template XML. Protect your Unraid flash backups and Docker access. Generated database/Redis/MinIO/JWT credentials and the setup token are deliberately **not** template settings. Enabling external S3 does not migrate existing objects automatically.

Enable **Autostart** and use Unraid's normal **Check for Updates / Update** action for this container. Updates restart all bundled services together; all data persists in appdata. **Stop the container and back up the entire AIO appdata directory before updating.** Keep the template's 120-second stop timeout. AIO uses PostgreSQL 16 and does not automatically upgrade database majors. See [AIO operations and recovery](docs/operations.md#unraid-all-in-one).

This is a separate installation, not an automatic migration: **do not select existing Compose or DockerMan appdata**. Existing split deployments remain supported and unchanged.

### Complete Stack

In the Unraid terminal:

```bash
mkdir -p /mnt/user/appdata/sharedrive
git clone --branch master https://github.com/gottschalkfelix4-source/sharedrive.git /mnt/user/appdata/sharedrive/source
cd /mnt/user/appdata/sharedrive/source
bash unraid/prepare-config.sh --unraid
```

Configure `/mnt/user/appdata/sharedrive/.env`, particularly `HTTP_PORT` and `TRUST_PROXY`, then start:

```bash
docker compose --env-file /mnt/user/appdata/sharedrive/.env -f unraid/compose.yml pull
docker compose --env-file /mnt/user/appdata/sharedrive/.env -f unraid/compose.yml up -d --no-build --wait --wait-timeout 900
```

Use [unraid/compose.yml](unraid/compose.yml) in Compose Manager or copy it to your preferred stack directory. It contains no build contexts; its appdata references default to `/mnt/user/appdata/sharedrive/`. Configure Compose Manager's project variables as described below and pull the images before starting. Only the app exposes **8088 HTTP**. Point your reverse proxy at `http://UNRAID-IP:8088` and complete setup with your public HTTPS URL and the token read locally from `/mnt/user/appdata/sharedrive/.setup/token`.

For a custom appdata path, export `SHAREDRIVE_APPDATA` before preparation and every Compose command, and adjust file paths. Compose interpolation reads values from `--env-file`; configure Compose Manager project variables as needed. A service's `env_file` alone does not provide YAML interpolation values.

### DockerMan App Template

After cloning the checkout and preparing configuration as above, without starting the complete stack:

```bash
cd /mnt/user/appdata/sharedrive/source
bash unraid/install-templates.sh
docker network inspect sharedrive >/dev/null 2>&1 || docker network create sharedrive
docker compose --env-file /mnt/user/appdata/sharedrive/.env -f unraid/compose.infrastructure.yml pull
docker compose --env-file /mnt/user/appdata/sharedrive/.env -f unraid/compose.infrastructure.yml up -d --no-build --wait --wait-timeout 900
```

Select **Docker -> Add Container -> Template -> ShareDrive-Backend** and apply the template. Unraid pulls the app from GHCR; this single container serves web interface and API. Keep its `sharedrive` network, token mount and `--env-file` path. Set the host port in DockerMan separately from `.env` `HTTP_PORT`. Enable autostart with enough time for infrastructure to become healthy. Back up before using Unraid's image update action.

The importer preserves changed templates in backup files. It does not start containers. Images are published in GHCR; a Community Applications listing is not required.

For an older DockerMan installation, back up and stop its old Web and Backend containers before applying the combined Backend template. Reuse the same appdata and infrastructure project. See [upgrade instructions](docs/operations.md#upgrade-from-the-previous-proxy-stack).

## Configuration

Application settings live in **Admin -> Settings**, with optional `SHAREDRIVE_*` overrides exposed by both DockerMan templates as described above. Separate-container infrastructure configuration stays in your private `.env`; AIO generates and preserves its own private `/data/config/secrets.json`. Never put credentials in Git or shared XML templates. AIO also accepts `TRUST_PROXY` and optional `SMTP_ALLOWED_HOSTS`; the remaining table describes the separate-container infrastructure deployment.

| Variable | Purpose |
| --- | --- |
| `HTTP_PORT` | Published app port, default `8088`; internal app port remains `3000` |
| `SHAREDRIVE_IMAGE` | Optional app image override, including a published commit tag or digest |
| `MINIO_IMAGE` | Optional MinIO image override, including a published commit tag or digest |
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

For reproducible deployments, set `SHAREDRIVE_IMAGE` and `MINIO_IMAGE` to the published `sha-<full 40-character Git commit SHA>` tags or full `ghcr.io/...@sha256:...` image references. In DockerMan, pin the app in its Repository field instead; infrastructure still uses `MINIO_IMAGE`. A pinned image changes only when you update that reference. `latest` follows successful publications from `master`.

## Encryption And Privacy

Browser encryption uses AES-256-GCM in 8 MiB chunks. Version 2 authenticates chunk position, file identity and length plus an encrypted manifest. Existing version 1 transfers remain readable. The complete link carries the key in its fragment, such as `/d/abc123#key=...&v=2&ctx=...`; the server never receives that fragment. Keep the full link private. The server cannot recover lost keys.

Encrypted transfers cannot be virus-scanned. Plaintext uploads require a clean scan when scanning is enabled; scanner failures do not publish a clean transfer. Administrators can access unencrypted contents and metadata. Encryption hides contents and encrypted names while the key stays private; sizes, MIME types, dates, owners and notification email remain visible. IP masking and retention do not alone establish legal compliance.

## Updates And Backups

For AIO, stop the container, back up its complete appdata directory and use Unraid's image update action as described above. The following commands and `scripts/backup.sh` are for the separate-container deployments, **not AIO**.

Back up before updates, stop application writes, update the checkout, pull the published images and recreate the affected containers. For standard Compose:

```bash
bash scripts/backup.sh /absolute/new/backup-directory
docker compose stop backend
git pull --ff-only
docker compose pull
docker compose up -d --no-build --remove-orphans --wait --wait-timeout 900
```

For complete Unraid Compose, use `--env-file /mnt/user/appdata/sharedrive/.env -f unraid/compose.yml` with the same pull/start commands. Back up this mode with `bash scripts/backup.sh /mnt/user/backups/sharedrive-YYYY-MM-DD --unraid-compose`. The helper's `--unraid` flag is only for DockerMan with infrastructure Compose. In DockerMan use Unraid's image update action for the app; pull/recreate infrastructure with its own Compose file. Use **Edit -> Apply** when changing template environment or image references. A restart does not load new images or changed environment variables.

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

For optional local image builds, from the repository root after preparing configuration:

```bash
docker compose -f docker-compose.yml -f docker-compose.build.yml up --build -d --wait --wait-timeout 900
```

The override builds local `sharedrive:local` and `sharedrive-minio:local` images. Production Compose files contain no build instructions.

To build AIO from the current source, explicitly pass the matching local application and MinIO images (the Dockerfile's pinned fallback application may predate new settings):

```bash
docker build -t sharedrive:local -f backend/Dockerfile .
docker build -t sharedrive-minio:local -f unraid/Dockerfile.minio .
docker build -t sharedrive-aio:local -f unraid/aio/Dockerfile --build-arg APP_IMAGE=sharedrive:local --build-arg MINIO_IMAGE=sharedrive-minio:local .
```

CI runs deployment, frontend, backend, real-storage and AIO checks; successful `master` builds publish the app, MinIO and AIO with `latest` and commit-specific tags. Published AIO builds always use the matching application image.

Run `npm test` and `npm run build` in each package. Browser and database/storage integration tests use isolated fixtures in [testing](docs/testing.md). The [German project review](docs/project-review.de.md) preserves the previous review and its validation boundaries; its proxy architecture is superseded.

## License

ShareDrive: [MIT](LICENSE). The published MinIO image is built in CI from the pinned official source in `unraid/Dockerfile.minio` and is separately licensed under AGPL-3.0. Source builds need GitHub, the Go module proxy/checksum service and artifact hosts; preserve TLS/checksum validation. Pulling the published image does not require those build tools or services on your server.
