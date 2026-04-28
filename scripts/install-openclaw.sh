#!/bin/sh
set -eu

REPO_ROOT=${CRISTALINA_REPO_ROOT:-$(pwd)}

cd "$REPO_ROOT"

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm is required to install Cristalina for OpenClaw" >&2
  exit 1
fi

pnpm install
pnpm cristalina install openclaw --non-interactive "$@"
