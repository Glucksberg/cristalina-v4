#!/bin/sh
set -eu

HERMES_ROOT=${HERMES_ROOT:-/mnt/c/Users/Markus/desktop/projetos/hermes-cristalina-sandbox/home}
CRISTALINA_ROOT=${CRISTALINA_ROOT:-/mnt/c/Users/Markus/desktop/projetos/cristalina-v4-runtime}
CRISTALINA_CONFIG=${CRISTALINA_CONFIG:-$CRISTALINA_ROOT/.cristalina-v4/config.json}

git -C "$CRISTALINA_ROOT" pull --ff-only

CRISTALINA_REPO_ROOT="$CRISTALINA_ROOT" \
  sh "$CRISTALINA_ROOT/scripts/install-hermes.sh" \
  --runtime-root "$HERMES_ROOT" \
  --config "$CRISTALINA_CONFIG"

echo
echo "Install finished. Restart Hermes with: hermes gateway restart"
