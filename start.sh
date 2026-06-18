#!/usr/bin/env bash
# ShareDrive – Quick start script
# Generates secure random credentials on first run, then starts the stack.
set -euo pipefail

gen() {
  local len=${1:-32}
  if command -v openssl &>/dev/null; then
    # openssl rand -hex N produces 2N hex chars; trim to len
    openssl rand -hex "$len" | head -c "$len"
  else
    LC_ALL=C tr -dc 'A-Za-z0-9' < /dev/urandom | head -c "$len"
  fi
}

echo "╔══════════════════════════════════╗"
echo "║       ShareDrive Quick Start      ║"
echo "╚══════════════════════════════════╝"
echo ""

if [ ! -f .env ]; then
  echo "→ Generating .env with secure random credentials..."

  DB_PASS=$(gen 32)
  MINIO_PASS=$(gen 32)
  JWT=$(gen 64)

  cp .env.example .env

  # Replace placeholder values (GNU sed on Linux, BSD sed on macOS)
  if sed --version &>/dev/null 2>&1; then
    # GNU sed
    sed -i "s/change_me_db/$DB_PASS/g"                              .env
    sed -i "s/change_me_minio/$MINIO_PASS/g"                        .env
    sed -i "s/change-me-to-a-long-random-secret-string/$JWT/"       .env
  else
    # BSD sed (macOS)
    sed -i '' "s/change_me_db/$DB_PASS/g"                           .env
    sed -i '' "s/change_me_minio/$MINIO_PASS/g"                     .env
    sed -i '' "s/change-me-to-a-long-random-secret-string/$JWT/"    .env
  fi

  echo "✓ Credentials generated — the setup wizard will show them."
else
  echo "→ .env exists, keeping existing credentials."
fi

echo ""
echo "→ Starting services..."
docker compose up --build -d

echo ""
echo "✅ ShareDrive is running!"
echo ""
echo "   Open http://localhost to complete setup in the browser."
echo "   The wizard guides you through credentials, domain, SSL, and admin account."
echo ""
echo "   Logs: docker compose logs -f"
echo ""
