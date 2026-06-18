#!/usr/bin/env bash
# ShareDrive – Quick start script
# Copies default config on first run, then starts the stack.
# Passwords and domain are configured in the browser wizard.
set -euo pipefail

echo "╔══════════════════════════════════╗"
echo "║       ShareDrive Quick Start      ║"
echo "╚══════════════════════════════════╝"
echo ""

if [ ! -f .env ]; then
  echo "→ Creating .env from template..."
  cp .env.example .env
  echo "✓ .env created — credentials will be set in the setup wizard."
else
  echo "→ .env exists, keeping existing configuration."
fi

echo ""
echo "→ Starting services..."
docker compose up --build -d

echo ""
echo "✅ ShareDrive is running!"
echo ""
echo "   Open http://localhost to complete setup in the browser."
echo "   The wizard will guide you through setting passwords, domain, SSL, and admin account."
echo ""
echo "   Logs: docker compose logs -f"
echo ""
