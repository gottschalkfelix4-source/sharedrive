#!/usr/bin/env bash
# All data created here belongs to an isolated disposable test volume.
set -euo pipefail
export MSYS_NO_PATHCONV=1
repo_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
image=${AIO_IMAGE:-sharedrive-aio:ci}
name="sharedrive-aio-test-$$-$RANDOM"
volume="$name-data"
contender="$name-contender"
failed=1
cleanup() {
  if [[ "$failed" == 1 ]]; then docker logs --tail 120 "$name" >&2 || true; fi
  docker rm -fv "$name" >/dev/null 2>&1 || true
  docker rm -fv "$contender" >/dev/null 2>&1 || true
  docker volume rm "$volume" >/dev/null 2>&1 || true
}
trap cleanup EXIT
docker volume create "$volume" >/dev/null
start() {
  local settings=()
  if [[ ${AIO_TEST_SETTINGS:-managed} == managed ]]; then
    settings=(-e 'SHAREDRIVE_APP_NAME=AIO managed fixture'
      -e SHAREDRIVE_MAX_FILE_SIZE_MIB=1 -e SHAREDRIVE_MAX_TRANSFER_SIZE_MIB=2
      -e SHAREDRIVE_USER_STORAGE_QUOTA_MIB=3 -e SHAREDRIVE_REGISTRATION_ENABLED=false
      -e SHAREDRIVE_SMTP_PASSWORD=aio-test-smtp-fixture -e SHAREDRIVE_S3_SECRET_KEY=aio-test-s3-fixture)
  fi
  docker run -d --name "$name" --network bridge --memory 6g --stop-timeout 120 \
    -p 127.0.0.1::3000 "${settings[@]}" --mount "type=volume,src=$volume,dst=/data,volume-nocopy" "$image" >/dev/null
}
wait_healthy() {
  for ((attempt=0; attempt<180; attempt++)); do
    status=$(docker inspect --format '{{.State.Status}}:{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$name")
    case "$status" in running:healthy) return 0 ;; exited:*|dead:*) printf 'AIO stopped before becoming healthy.\n' >&2; return 1 ;; esac
    sleep 3
  done
  printf 'AIO readiness timed out.\n' >&2
  return 1
}
api_test() {
  docker exec -i -e "AIO_TEST_PHASE=$1" "$name" node < "$repo_dir/scripts/test-aio-api.cjs"
}
wait_refused() {
  local container=$1 reason=$2
  for ((attempt=0; attempt<30; attempt++)); do
    if [[ $(docker inspect --format '{{.State.Status}}' "$container") == exited ]]; then
      [[ $(docker inspect --format '{{.State.ExitCode}}' "$container") == 1 ]]
      docker logs "$container" 2>&1 | grep -q "$reason"
      docker rm -v "$container" >/dev/null
      return 0
    fi
    sleep 1
  done
  printf 'Unsafe AIO startup was not refused: %s\n' "$reason" >&2
  docker logs --tail 30 "$container" >&2 || true
  return 1
}
edit_data() {
  docker run --rm --network none --entrypoint node \
    --mount "type=volume,src=$volume,dst=/data,volume-nocopy" "$image" -e "$1"
}
start
wait_healthy
api_test initial
docker run -d --name "$contender" --network none --memory 512m \
  --mount "type=volume,src=$volume,dst=/data,volume-nocopy" "$image" >/dev/null
wait_refused "$contender" 'already using'
docker restart --time 120 "$name" >/dev/null
wait_healthy
api_test restart
docker stop --time 120 "$name" >/dev/null
[[ $(docker inspect --format '{{.State.ExitCode}}' "$name") == 0 ]]
docker rm -v "$name" >/dev/null
start
wait_healthy
api_test recreate
docker stop --time 120 "$name" >/dev/null
[[ $(docker inspect --format '{{.State.ExitCode}}' "$name") == 0 ]]
docker rm -v "$name" >/dev/null
edit_data "require('fs').writeFileSync('/data/postgres/PG_VERSION', '17\\n')"
start
wait_refused "$name" 'not major version 16'
edit_data "require('fs').writeFileSync('/data/postgres/PG_VERSION', '16\\n')"
edit_data "require('fs').renameSync('/data/config/secrets.json', '/data/config/secrets.saved')"
start
wait_refused "$name" 'secrets.json is missing'
edit_data "require('fs').renameSync('/data/config/secrets.saved', '/data/config/secrets.json')"
start
wait_healthy
api_test recreate
docker stop --time 120 "$name" >/dev/null
[[ $(docker inspect --format '{{.State.ExitCode}}' "$name") == 0 ]]
docker rm -v "$name" >/dev/null
AIO_TEST_SETTINGS=unmanaged start
wait_healthy
api_test unmanaged
failed=0
printf 'AIO first-run, settings overrides, antivirus, persistence, locking and unsafe-start refusal checks passed.\n'
