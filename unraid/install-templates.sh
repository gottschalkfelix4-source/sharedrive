#!/usr/bin/env bash
# Import user templates only; do not create or start containers.
set -euo pipefail

templates_dir=${SHAREDRIVE_TEMPLATES_DIR:-/boot/config/plugins/dockerMan/templates-user}
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
base_url=https://raw.githubusercontent.com/gottschalkfelix4-source/sharedrive/master/unraid/templates
temp_dir=$(mktemp -d)
trap 'rm -rf -- "$temp_dir"' EXIT

# Stage and check the application template before changing its installed copy.
name=sharedrive-backend
if [[ -f "$script_dir/templates/$name.xml" ]]; then
  cp -- "$script_dir/templates/$name.xml" "$temp_dir/$name.xml"
else
  curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' \
    "$base_url/$name.xml" --output "$temp_dir/$name.xml"
fi
content=$(cat -- "$temp_dir/$name.xml")
if [[ "$content" != *'<Container version="2">'* || "$content" != *'</Container>'* ]]; then
  printf 'Invalid template: %s\n' "$name" >&2
  exit 1
fi

mkdir -p -- "$templates_dir"
target="$templates_dir/user-$name.xml"
if cmp -s -- "$temp_dir/$name.xml" "$target"; then
  printf 'Unchanged: %s\n' "$target"
else
  if [[ -e "$target" ]]; then
    backup=$(mktemp "$templates_dir/.user-$name.backup.XXXXXX")
    cp -p -- "$target" "$backup"
    printf 'Previous template saved: %s\n' "$backup"
  fi
  staged=$(mktemp "$templates_dir/.user-$name.staged.XXXXXX")
  cp -- "$temp_dir/$name.xml" "$staged"
  chmod 0644 "$staged"
  mv -f -- "$staged" "$target"
  printf 'Installed: %s\n' "$target"
fi
printf 'Unraid: Docker -> Add Container -> Template -> ShareDrive-Backend.\n'
printf 'Prepare the local images and infrastructure as documented in the README before applying.\n'
