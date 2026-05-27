#!/bin/bash
set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_PORT="${API_PORT:-8080}"

echo "Starting API server on port ${API_PORT}..."
cd "$ROOT_DIR/artifacts/api-server" && PORT="$API_PORT" pnpm run dev
