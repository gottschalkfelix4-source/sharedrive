#!/bin/bash
# ShareDrive – Quick start script

set -e

if [ ! -f .env ]; then
  echo "Creating .env from .env.example..."
  cp .env.example .env
  echo ""
  echo "⚠️  IMPORTANT: Edit .env and change the default passwords before deploying!"
  echo "   Especially JWT_SECRET, POSTGRES_PASSWORD and MINIO_ROOT_PASSWORD."
  echo ""
fi

echo "Starting ShareDrive..."
docker compose up --build -d

echo ""
echo "✅ ShareDrive is starting!"
echo ""
echo "   Web UI:        http://localhost"
echo "   MinIO Console: http://localhost:9001"
echo ""
echo "   → Open http://localhost to complete the first-time setup"
echo "     and create your admin account."
echo ""
echo "View logs: docker compose logs -f"
