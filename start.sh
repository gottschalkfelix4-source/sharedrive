#!/usr/bin/env bash
# ShareDrive quick start script
# Copies default config on first run, then starts the stack.
# Infrastructure credentials are generated before containers start.
set -euo pipefail

echo "ShareDrive Quick Start"
echo ""

repo_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
cd "$repo_dir"
SHAREDRIVE_APPDATA="$repo_dir" ./unraid/prepare-config.sh --compose

echo ""
echo "Starting services..."
docker compose up --build -d --wait --remove-orphans

echo ""
echo "ShareDrive is running!"
echo ""
http_port=$(awk -F= '/^HTTP_PORT=/{print $2}' .env | tail -n 1)
echo "   Open http://localhost:${http_port:-8088} to complete setup in the browser."
echo "   HTTPS and certificates are managed by your existing reverse proxy."
echo "   Setup token: $repo_dir/.setup/token"
echo ""
echo "   Logs: docker compose logs -f"
echo ""
