#!/usr/bin/env bash
# Exercise local and downloaded imports without accessing Unraid or the network.
set -euo pipefail
repo_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
temp_dir=$(mktemp -d)
trap 'rm -rf -- "$temp_dir"' EXIT
installer="$repo_dir/unraid/install-aio-template.sh"
template="$repo_dir/unraid/templates/sharedrive-aio.xml"
target="$temp_dir/templates/user-sharedrive-aio.xml"

SHAREDRIVE_TEMPLATES_DIR="$temp_dir/templates" bash "$installer"
cmp -- "$template" "$target"
SHAREDRIVE_TEMPLATES_DIR="$temp_dir/templates" bash "$installer"
[[ $(find "$temp_dir/templates" -type f | wc -l) -eq 1 ]]
printf '\n<!-- operator customization -->\n' >> "$target"
cp -- "$target" "$temp_dir/custom.xml"
SHAREDRIVE_TEMPLATES_DIR="$temp_dir/templates" bash "$installer"
cmp -- "$template" "$target"
backup=$(find "$temp_dir/templates" -name '.user-sharedrive-aio.backup.*')
[[ -n "$backup" ]]
cmp -- "$temp_dir/custom.xml" "$backup"
[[ -z $(find "$temp_dir/templates" -name '*.staged.*') ]]

# A standalone download must ignore an untrusted adjacent templates directory.
cp -- "$installer" "$temp_dir/install-aio-template.sh"
mkdir "$temp_dir/templates-hostile"
sed 's/<Network>bridge<\/Network>/<Network>host<\/Network>/' "$template" > "$temp_dir/templates-hostile/sharedrive-aio.xml"
# Reuse the existing templates directory to model files beside a /tmp download.
cp -- "$temp_dir/templates-hostile/sharedrive-aio.xml" "$temp_dir/templates/sharedrive-aio.xml"
export SHAREDRIVE_AIO_TEST_TEMPLATE="$template"
export SHAREDRIVE_AIO_TEST_DOWNLOAD_MODE=valid
export SHAREDRIVE_AIO_TEST_CURL_LOG="$temp_dir/curl.log"
# Exported for the standalone installer child process.
# shellcheck disable=SC2329
curl() {
  printf 'download\n' >> "$SHAREDRIVE_AIO_TEST_CURL_LOG"
  local output='' previous='' argument
  for argument in "$@"; do
    if [[ "$previous" == --output ]]; then output=$argument; fi
    previous=$argument
  done
  [[ -n "$output" ]]
  case "$SHAREDRIVE_AIO_TEST_DOWNLOAD_MODE" in
    valid) cp -- "$SHAREDRIVE_AIO_TEST_TEMPLATE" "$output" ;;
    invalid) printf '<html>unavailable</html>\n' > "$output" ;;
    failed) printf '<Container version="2">' > "$output"; return 22 ;;
    *) return 1 ;;
  esac
}
export -f curl
SHAREDRIVE_TEMPLATES_DIR="$temp_dir/downloaded" bash "$temp_dir/install-aio-template.sh"
cmp -- "$template" "$temp_dir/downloaded/user-sharedrive-aio.xml"
[[ $(wc -l < "$SHAREDRIVE_AIO_TEST_CURL_LOG") -eq 1 ]]
for mode in invalid failed; do
  export SHAREDRIVE_AIO_TEST_DOWNLOAD_MODE=$mode
  if SHAREDRIVE_TEMPLATES_DIR="$temp_dir/downloaded" bash "$temp_dir/install-aio-template.sh" > "$temp_dir/$mode.log" 2>&1; then
    printf 'Installer accepted an %s download.\n' "$mode" >&2
    exit 1
  fi
  cmp -- "$template" "$temp_dir/downloaded/user-sharedrive-aio.xml"
  [[ $(find "$temp_dir/downloaded" -type f | wc -l) -eq 1 ]]
done
[[ $(wc -l < "$SHAREDRIVE_AIO_TEST_CURL_LOG") -eq 3 ]]
unset -f curl

grep -q '<Network>bridge</Network>' "$template"
grep -q '<Privileged>false</Privileged>' "$template"
grep -q 'Target="/data"' "$template"
grep -q 'Target="TRUST_PROXY"' "$template"
grep -q 'Target="SMTP_ALLOWED_HOSTS"' "$template"
grep -q -- '--stop-timeout=120' "$template"
[[ $(grep -c 'Type="Port"' "$template") -eq 1 ]]
[[ $(grep -c 'Type="Path"' "$template") -eq 1 ]]
if grep -Eq 'docker.sock|--env-file|Target="[^"]*(PASSWORD|SECRET)|--privileged' "$template"; then
  printf 'AIO template exposes external infrastructure or secrets.\n' >&2
  exit 1
fi
printf 'AIO template helper checks passed.\n'
