#!/usr/bin/env bash
set -euo pipefail
exec python3 /opt/sharedrive/aio/entrypoint.py "$@"
