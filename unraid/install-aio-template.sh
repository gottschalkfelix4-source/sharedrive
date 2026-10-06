#!/usr/bin/env bash
# Install the standalone AIO template; do not create or start containers.
set -euo pipefail

templates_dir=${SHAREDRIVE_TEMPLATES_DIR:-/boot/config/plugins/dockerMan/templates-user}
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
url=https://raw.githubusercontent.com/gottschalkfelix4-source/sharedrive/master/unraid/templates/sharedrive-aio.xml
temp_dir=$(mktemp -d)
staged=
cleanup() {
  if [[ -n "$staged" ]]; then rm -f -- "$staged"; fi
  rm -rf -- "$temp_dir"
}
trap cleanup EXIT

# A downloaded installer in /tmp must not trust an unrelated adjacent templates directory.
if [[ "${script_dir##*/}" == unraid && -f "$script_dir/../backend/Dockerfile" &&
      -f "$script_dir/../README.md" && -f "$script_dir/templates/sharedrive-aio.xml" ]]; then
  cp -- "$script_dir/templates/sharedrive-aio.xml" "$temp_dir/template.xml"
else
  curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' \
    "$url" --output "$temp_dir/template.xml"
fi
content=$(cat -- "$temp_dir/template.xml")
if [[ "$content" != *'<Container version="2">'* || "$content" != *'</Container>'* ||
      "$content" != *'<Name>ShareDrive-AIO</Name>'* ||
      "$content" != *'<Repository>ghcr.io/gottschalkfelix4-source/sharedrive-aio:latest</Repository>'* ]]; then
  printf 'Invalid ShareDrive AIO template; installed template was not changed.\n' >&2
  exit 1
fi

mkdir -p -- "$templates_dir"
target="$templates_dir/user-sharedrive-aio.xml"
if cmp -s -- "$temp_dir/template.xml" "$target"; then
  printf 'Unchanged: %s\n' "$target"
else
  if [[ -e "$target" ]]; then
    backup=$(mktemp "$templates_dir/.user-sharedrive-aio.backup.XXXXXX")
    cp -p -- "$target" "$backup"
    printf 'Previous template saved: %s\n' "$backup"
  fi
  staged=$(mktemp "$templates_dir/.user-sharedrive-aio.staged.XXXXXX")
  cp -- "$temp_dir/template.xml" "$staged"
  chmod 0644 "$staged"
  mv -f -- "$staged" "$target"
  staged=
  printf 'Installed: %s\n' "$target"
fi
printf 'Unraid: Docker -> Add Container -> Template -> ShareDrive-AIO.\n'
printf 'Use a fresh appdata directory and an available HTTP host port; then Apply.\n'
printf 'Your existing reverse proxy handles HTTPS. No other containers are required.\n'
