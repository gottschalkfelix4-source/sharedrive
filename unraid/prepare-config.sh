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

for file in .env Caddyfile; do
  if [[ -e "$appdata/$file" && ! -f "$appdata/$file" ]]; then
    printf 'Expected a regular file: %s/%s\n' "$appdata" "$file" >&2
    exit 1
  fi
done

if [[ ! -e "$appdata/.env" ]]; then
  command -v openssl >/dev/null
  db_password=$(openssl rand -hex 24)
  minio_password=$(openssl rand -hex 24)
  jwt_secret=$(openssl rand -hex 32)
  staged=$(mktemp "$appdata/.env.staged.XXXXXX")
  trap 'rm -f -- "$staged"' EXIT
  while IFS= read -r line || [[ -n "$line" ]]; do
    line=${line//change_me_db/$db_password}
    line=${line//change_me_minio/$minio_password}
    line=${line//change-me-to-a-long-random-secret-string/$jwt_secret}
    if [[ "$mode" == --unraid && "$line" == HTTP_PORT=80 ]]; then line=HTTP_PORT=8088; fi
    if [[ "$mode" == --unraid && "$line" == HTTPS_PORT=443 ]]; then line=HTTPS_PORT=8443; fi
    printf '%s\n' "$line"
  done < "$repo_dir/.env.example" > "$staged"
  if [[ $(id -u) == 0 ]]; then chown 1000:1000 "$staged"; fi
  mv -n -- "$staged" "$appdata/.env"
  printf 'Created local credentials in %s/.env (mode 0600).\n' "$appdata"
else
  printf 'Preserved existing %s/.env.\n' "$appdata"
fi

if [[ ! -e "$appdata/Caddyfile" ]]; then
  cp -n -- "$repo_dir/Caddyfile" "$appdata/Caddyfile"
  if [[ $(id -u) == 0 ]]; then chown 1000:1000 "$appdata/Caddyfile"; fi
fi
mkdir -p -- "$appdata/.setup"
if [[ ! -e "$appdata/.setup/token" ]]; then
  openssl rand -hex 32 > "$appdata/.setup/token"
  if [[ $(id -u) == 0 ]]; then chown 1000:1000 "$appdata/.setup" "$appdata/.setup/token"; fi
fi
printf 'Configuration prepared. Review image access and ports, then build images and start infrastructure.\n'
