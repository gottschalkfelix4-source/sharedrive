#!/usr/bin/env bash
# Consistent local-storage backup. Pauses backend and MinIO, then restores prior running state.
set -euo pipefail
umask 077
repo_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd "$repo_dir"
destination=${1:?Usage: backup.sh ABSOLUTE_NEW_DIRECTORY [--unraid|--unraid-compose]}
[[ "$destination" == /* && ! -e "$destination" ]] || { printf 'Use a new absolute backup directory.\n' >&2; exit 1; }
case ${2:-} in
--unraid)
  config_dir=${SHAREDRIVE_APPDATA:-/mnt/user/appdata/sharedrive}
  compose=(docker compose --env-file "$config_dir/.env" -f unraid/compose.infrastructure.yml)
  backend=ShareDrive-Backend
  ;;
--unraid-compose)
  config_dir=${SHAREDRIVE_APPDATA:-/mnt/user/appdata/sharedrive}
  compose=(docker compose --env-file "$config_dir/.env" -f unraid/compose.yml)
  backend=$("${compose[@]}" ps -a -q backend)
  ;;
'')
  config_dir=${SHAREDRIVE_CONFIG_DIR:-$repo_dir}
  compose=(docker compose --env-file "$config_dir/.env")
  backend=$("${compose[@]}" ps -a -q backend)
  ;;
*) printf 'Use --unraid (DockerMan) or --unraid-compose (full Compose stack).\n' >&2; exit 1 ;;
esac
minio=$("${compose[@]}" ps -a -q minio)
[[ -n "$backend" && -n "$minio" ]] || { printf 'Create the application and infrastructure containers first.\n' >&2; exit 1; }
backend_running=$(docker inspect -f '{{.State.Running}}' "$backend")
minio_running=$(docker inspect -f '{{.State.Running}}' "$minio")
resume() {
  if [[ "$minio_running" == true ]]; then docker start "$minio" >/dev/null; fi
  if [[ "$backend_running" == true ]]; then docker start "$backend" >/dev/null; fi
}
trap resume EXIT
docker stop --time 30 "$backend" "$minio" >/dev/null
mkdir -m 700 -- "$destination"
# Database environment variables are expanded inside the PostgreSQL container.
# shellcheck disable=SC2016
"${compose[@]}" exec -T postgres sh -c 'pg_dump --format=custom --no-owner --no-acl -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > "$destination/database.dump"
cp -- "$config_dir/.env" "$destination/"
if [[ -f "$config_dir/.setup/token" ]]; then mkdir "$destination/.setup"; cp -- "$config_dir/.setup/token" "$destination/.setup/"; fi
mkdir "$destination/minio"
docker cp "$minio:/data/." "$destination/minio/"
printf 'ShareDrive local-storage backup completed: %s\n' "$destination"
