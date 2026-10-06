#!/usr/bin/env bash
# Create local configuration once; preserve existing credentials on repeat runs.
set -euo pipefail
umask 077

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
repo_dir=$(cd -- "$script_dir/.." && pwd)
mode=${1:---unraid}
case "$mode" in --unraid) default_appdata=/mnt/user/appdata/sharedrive ;; --compose) default_appdata=$repo_dir ;; *) printf 'Use --unraid or --compose.\n' >&2; exit 1 ;; esac
appdata=${SHAREDRIVE_APPDATA:-$default_appdata}
if [[ "$appdata" != /* ]]; then
  printf 'SHAREDRIVE_APPDATA must be an absolute path.\n' >&2
  exit 1
fi
mkdir -p -- "$appdata"

if [[ -e "$appdata/.env" && ! -f "$appdata/.env" ]]; then
  printf 'Expected a regular file: %s/.env\n' "$appdata" >&2
  exit 1
fi

if [[ ! -e "$appdata/.env" ]]; then
  command -v openssl >/dev/null
  db_password=$(openssl rand -hex 24 | tr -d '\r\n')
  minio_password=$(openssl rand -hex 24 | tr -d '\r\n')
  jwt_secret=$(openssl rand -hex 32 | tr -d '\r\n')
  staged=$(mktemp "$appdata/.env.staged.XXXXXX")
  trap 'rm -f -- "$staged"' EXIT
  while IFS= read -r line || [[ -n "$line" ]]; do
    line=${line//change_me_db/$db_password}
    line=${line//change_me_minio/$minio_password}
    line=${line//change-me-to-a-long-random-secret-string/$jwt_secret}
    printf '%s\n' "$line"
  done < "$repo_dir/.env.example" > "$staged"
  if [[ $(id -u) == 0 ]]; then chown 1000:1000 "$staged"; fi
  mv -n -- "$staged" "$appdata/.env"
  printf 'Created local credentials in %s/.env (mode 0600).\n' "$appdata"
else
  printf 'Preserved existing %s/.env.\n' "$appdata"
fi

# Do not rotate existing credentials: persisted database/storage still use them.
if grep -Eq '^[[:space:]]*(POSTGRES_PASSWORD|DATABASE_URL|MINIO_ROOT_PASSWORD|MINIO_SECRET_KEY|JWT_SECRET)=.*(change_me_db|change_me_minio|change-me-to-a-long-random-secret-string)' "$appdata/.env"; then
  printf 'Example credentials remain in %s/.env. Set matching database/storage credentials and a random JWT_SECRET before starting; existing data credentials must not be rotated blindly.\n' "$appdata" >&2
  exit 1
fi
for key in POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB DATABASE_URL MINIO_ROOT_USER MINIO_ROOT_PASSWORD MINIO_ACCESS_KEY MINIO_SECRET_KEY JWT_SECRET; do
  if ! grep -Eq "^[[:space:]]*$key=[^[:space:]]+" "$appdata/.env"; then
    printf 'Missing or empty %s in %s/.env; configure it before starting.\n' "$key" "$appdata" >&2
    exit 1
  fi
done
jwt_secret=$(sed -n 's/^[[:space:]]*JWT_SECRET=//p' "$appdata/.env" | tail -n 1)
jwt_secret=${jwt_secret%$'\r'}
case "$jwt_secret" in
  \"*\") jwt_secret=${jwt_secret:1:-1} ;;
  \'*\') jwt_secret=${jwt_secret:1:-1} ;;
  *) jwt_secret=${jwt_secret%%[[:space:]]#*} ;;
esac
if [[ ${#jwt_secret} -lt 32 ]]; then
  printf 'JWT_SECRET in %s/.env must contain at least 32 random characters.\n' "$appdata" >&2
  exit 1
fi
if [[ -e "$appdata/.setup" && ! -d "$appdata/.setup" ]]; then
  printf 'Expected a setup directory: %s/.setup\n' "$appdata" >&2
  exit 1
fi
mkdir -p -- "$appdata/.setup"
chmod 0700 "$appdata/.setup"
if [[ -e "$appdata/.setup/token" && ! -f "$appdata/.setup/token" ]]; then
  printf 'Expected a regular setup token file: %s/.setup/token\n' "$appdata" >&2
  exit 1
fi
if [[ ! -e "$appdata/.setup/token" ]]; then
  command -v openssl >/dev/null
  setup_token=$(openssl rand -hex 32 | tr -d '\r\n')
  printf '%s\n' "$setup_token" > "$appdata/.setup/token"
fi
chmod 0600 "$appdata/.setup/token"
if [[ $(id -u) == 0 ]]; then chown 1000:1000 "$appdata/.setup" "$appdata/.setup/token"; fi
printf 'Configuration prepared. Forward your existing reverse proxy to HTTP port 8088 (or HTTP_PORT), and set TRUST_PROXY to its exact IP/CIDR.\n'
