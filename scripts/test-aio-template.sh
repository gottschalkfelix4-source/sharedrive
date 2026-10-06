#!/usr/bin/env bash
# Exercise local and downloaded imports without accessing Unraid or the network.
set -euo pipefail
repo_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
temp_dir=$(mktemp -d)
trap 'rm -rf -- "$temp_dir"' EXIT
installer="$repo_dir/unraid/install-aio-template.sh"
template="$repo_dir/unraid/templates/sharedrive-aio.xml"
target="$temp_dir/templates/ShareDrive-AIO.xml"

grep -Fq "templates_dir=\${SHAREDRIVE_TEMPLATES_DIR:-/boot/config/plugins/dockerMan/templates}" "$installer"
grep -Fq 'mkdir -p /boot/config/plugins/dockerMan/templates && curl -fL' "$repo_dir/README.md"
grep -Fq -- '-o /boot/config/plugins/dockerMan/templates/ShareDrive-AIO.xml' "$repo_dir/README.md"

SHAREDRIVE_TEMPLATES_DIR="$temp_dir/templates" bash "$installer"
cmp -- "$template" "$target"
SHAREDRIVE_TEMPLATES_DIR="$temp_dir/templates" bash "$installer"
[[ $(find "$temp_dir/templates" -type f | wc -l) -eq 1 ]]
printf '\n<!-- operator customization -->\n' >> "$target"
cp -- "$target" "$temp_dir/custom.xml"
SHAREDRIVE_TEMPLATES_DIR="$temp_dir/templates" bash "$installer"
cmp -- "$template" "$target"
backup=$(find "$temp_dir/templates" -name '.ShareDrive-AIO.backup.*')
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
cmp -- "$template" "$temp_dir/downloaded/ShareDrive-AIO.xml"
[[ $(wc -l < "$SHAREDRIVE_AIO_TEST_CURL_LOG") -eq 1 ]]
for mode in invalid failed; do
  export SHAREDRIVE_AIO_TEST_DOWNLOAD_MODE=$mode
  if SHAREDRIVE_TEMPLATES_DIR="$temp_dir/downloaded" bash "$temp_dir/install-aio-template.sh" > "$temp_dir/$mode.log" 2>&1; then
    printf 'Installer accepted an %s download.\n' "$mode" >&2
    exit 1
  fi
  cmp -- "$template" "$temp_dir/downloaded/ShareDrive-AIO.xml"
  [[ $(find "$temp_dir/downloaded" -type f | wc -l) -eq 1 ]]
done
[[ $(wc -l < "$SHAREDRIVE_AIO_TEST_CURL_LOG") -eq 3 ]]
unset -f curl

grep -q '<Network>bridge</Network>' "$template"
grep -q '<Privileged>false</Privileged>' "$template"
icon_url=https://raw.githubusercontent.com/gottschalkfelix4-source/sharedrive/master/unraid/assets/sharedrive-logo.png
grep -Fq "<Icon>$icon_url</Icon>" "$template"
grep -Fq "<Icon>$icon_url</Icon>" "$repo_dir/unraid/templates/sharedrive-backend.xml"
[[ $(od -An -tx1 -N8 "$repo_dir/unraid/assets/sharedrive-logo.png" | tr -d ' \n') == 89504e470d0a1a0a ]]
grep -q 'Target="/data"' "$template"
grep -q 'Target="TRUST_PROXY"' "$template"
grep -q 'Target="SMTP_ALLOWED_HOSTS"' "$template"
grep -q -- '--stop-timeout=120' "$template"
[[ $(grep -c 'Type="Port"' "$template") -eq 1 ]]
[[ $(grep -c 'Type="Path"' "$template") -eq 1 ]]
if grep -Eq 'docker.sock|--env-file|Target="(JWT_SECRET|DATABASE_URL|REDIS_URL|MINIO_SECRET_KEY|SETUP_TOKEN_FILE)"|--privileged' "$template"; then
  printf 'AIO template exposes external infrastructure or secrets.\n' >&2
  exit 1
fi
python3 - "$repo_dir" <<'PY'
import json
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

repo = Path(sys.argv[1])
mapping = json.loads((repo / 'backend/src/lib/environmentSettings.json').read_text())
expected = {entry['env'] for entry in mapping}
assert len(expected) == len(mapping) == 33
always = {'SHAREDRIVE_BASE_URL', 'SHAREDRIVE_MAX_FILE_SIZE_MIB', 'SHAREDRIVE_MAX_TRANSFER_SIZE_MIB'}
masked = {'SHAREDRIVE_SMTP_PASSWORD', 'SHAREDRIVE_S3_SECRET_KEY'}
booleans = {'SHAREDRIVE_SMTP_ENABLED', 'SHAREDRIVE_SMTP_SECURE',
            'SHAREDRIVE_REGISTRATION_ENABLED', 'SHAREDRIVE_REQUIRE_EMAIL_VERIFICATION',
            'SHAREDRIVE_VIRUS_SCAN_ENABLED', 'SHAREDRIVE_S3_ENABLED', 'SHAREDRIVE_S3_USE_SSL'}
for filename in ['sharedrive-aio.xml', 'sharedrive-backend.xml']:
    root = ET.parse(repo / 'unraid/templates' / filename).getroot()
    controls = [item for item in root.findall('Config')
                if item.get('Target', '').startswith('SHAREDRIVE_')]
    assert {item.get('Target') for item in controls} == expected, filename
    assert len(controls) == len(expected), filename
    for item in controls:
        env = item.get('Target')
        assert item.get('Type') == 'Variable' and item.get('Required') == 'false', env
        assert not (item.text or '').strip(), env
        assert item.get('Default') == ('|true|false' if env in booleans else ''), env
        assert item.get('Mask') == ('true' if env in masked else 'false'), env
        assert item.get('Display') == ('always' if env in always else 'advanced'), env
        assert 'default:' in item.get('Description', '').lower(), env
for item in mapping:
    if item['env'].endswith('_MIB'):
        assert item['multiplier'] == 1048576
print('All 33 optional settings match both templates and the canonical mapping.')
PY
printf 'AIO template helper checks passed.\n'
