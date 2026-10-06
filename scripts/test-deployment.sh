#!/usr/bin/env bash
# Check credential bootstrap and template installation without Docker or real data.
set -euo pipefail
repo_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
temp_dir=$(mktemp -d)
trap 'rm -rf -- "$temp_dir"' EXIT
appdata="$temp_dir/appdata"

SHAREDRIVE_APPDATA="$appdata" bash "$repo_dir/unraid/prepare-config.sh" --compose
[[ -s "$appdata/.env" && -s "$appdata/.setup/token" ]]
[[ ! -e "$appdata/Caddyfile" ]]
if grep -Eq '^.*=(.*change_me|change-me-)' "$appdata/.env"; then
  printf 'Generated configuration still contains placeholder credentials.\n' >&2
  exit 1
fi
[[ $(wc -c < "$appdata/.setup/token") -eq 65 ]]
cp -- "$appdata/.env" "$temp_dir/preserved.env"
cp -- "$appdata/.setup/token" "$temp_dir/preserved.token"
SHAREDRIVE_APPDATA="$appdata" bash "$repo_dir/unraid/prepare-config.sh" --compose
cmp -- "$appdata/.env" "$temp_dir/preserved.env"
cmp -- "$appdata/.setup/token" "$temp_dir/preserved.token"

mkdir "$temp_dir/placeholder"
cp -- "$repo_dir/.env.example" "$temp_dir/placeholder/.env"
if SHAREDRIVE_APPDATA="$temp_dir/placeholder" bash "$repo_dir/unraid/prepare-config.sh" --compose > "$temp_dir/placeholder.log" 2>&1; then
  printf 'Placeholder credentials were accepted.\n' >&2
  exit 1
fi
grep -q 'Example credentials remain' "$temp_dir/placeholder.log"
cmp -- "$temp_dir/placeholder/.env" "$repo_dir/.env.example"

mkdir "$temp_dir/incomplete"
sed '/^JWT_SECRET=/d' "$appdata/.env" > "$temp_dir/incomplete/.env"
if SHAREDRIVE_APPDATA="$temp_dir/incomplete" bash "$repo_dir/unraid/prepare-config.sh" --compose > "$temp_dir/incomplete.log" 2>&1; then
  printf 'Missing JWT secret was accepted.\n' >&2
  exit 1
fi
grep -q 'Missing or empty JWT_SECRET' "$temp_dir/incomplete.log"

mkdir "$temp_dir/short-secret"
sed 's/^JWT_SECRET=.*/JWT_SECRET=short/' "$appdata/.env" > "$temp_dir/short-secret/.env"
if SHAREDRIVE_APPDATA="$temp_dir/short-secret" bash "$repo_dir/unraid/prepare-config.sh" --compose > "$temp_dir/short-secret.log" 2>&1; then
  printf 'Short JWT secret was accepted.\n' >&2
  exit 1
fi
grep -q 'at least 32 random characters' "$temp_dir/short-secret.log"

SHAREDRIVE_TEMPLATES_DIR="$temp_dir/templates" bash "$repo_dir/unraid/install-templates.sh"
[[ -f "$temp_dir/templates/user-sharedrive-backend.xml" ]]
[[ ! -e "$temp_dir/templates/user-sharedrive-web.xml" ]]
SHAREDRIVE_TEMPLATES_DIR="$temp_dir/templates" bash "$repo_dir/unraid/install-templates.sh"
[[ $(find "$temp_dir/templates" -type f | wc -l) -eq 1 ]]

# Exercise full-stack backup selection and restoration of running containers.
export SHAREDRIVE_TEST_DOCKER_LOG="$temp_dir/docker.log"
# Exported for the child backup script's Docker calls.
# shellcheck disable=SC2329
docker() {
  printf '%s\n' "$*" >> "$SHAREDRIVE_TEST_DOCKER_LOG"
  case "$1" in
    compose)
      case "$*" in
        *'ps -a -q backend') printf 'test-backend\n' ;;
        *'ps -a -q minio') printf 'test-minio\n' ;;
        *'exec -T postgres '*) printf 'test-database-dump\n' ;;
        *) return 1 ;;
      esac
      ;;
    inspect) printf 'true\n' ;;
    stop|start|cp) ;;
    *) return 1 ;;
  esac
}
export -f docker
SHAREDRIVE_APPDATA="$appdata" bash "$repo_dir/scripts/backup.sh" "$temp_dir/backup" --unraid-compose
grep -q -- '-f unraid/compose.yml ps -a -q backend' "$SHAREDRIVE_TEST_DOCKER_LOG"
grep -q '^stop --time 30 test-backend test-minio$' "$SHAREDRIVE_TEST_DOCKER_LOG"
grep -q '^start test-minio$' "$SHAREDRIVE_TEST_DOCKER_LOG"
grep -q '^start test-backend$' "$SHAREDRIVE_TEST_DOCKER_LOG"
cmp -- "$temp_dir/backup/.env" "$appdata/.env"
cmp -- "$temp_dir/backup/.setup/token" "$appdata/.setup/token"
[[ -s "$temp_dir/backup/database.dump" && -d "$temp_dir/backup/minio" ]]
unset -f docker
printf 'Deployment helper checks passed.\n'
