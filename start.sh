#!/usr/bin/env bash
# ShareDrive – Quick start script
# Copies default config on first run, then starts the stack.
# Passwords and domain are configured in the browser wizard.
set -euo pipefail

echo "╔══════════════════════════════════╗"
echo "║       ShareDrive Quick Start      ║"
echo "╚══════════════════════════════════╝"
echo ""

repo_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
cd "$repo_dir"
SHAREDRIVE_APPDATA="$repo_dir" ./unraid/prepare-config.sh --compose

echo ""
echo "→ Starting services..."
docker compose up --build -d --wait

echo ""
echo "✅ ShareDrive is running!"
echo ""
echo "   Open http://localhost to complete setup in the browser."
echo "   The wizard will guide you through setting passwords, domain, SSL, and admin account."
echo ""
echo "   Logs: docker compose logs -f"
echo ""
