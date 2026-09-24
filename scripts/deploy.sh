#!/usr/bin/env bash

set -euo pipefail

VPS_HOST="root@187.127.37.101"
VPS_PATH="~/concorde"
DOMAIN="187-127-37-101.sslip.io"

SKIP_DESKTOP=false
SERVICES="backend gateway"
DO_COMMIT=true

usage() {
  sed -n '2,17p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-desktop) SKIP_DESKTOP=true; shift ;;
    --services) SERVICES="$2"; shift 2 ;;
    --no-commit) DO_COMMIT=false; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Opção desconhecida: $1" >&2; usage; exit 1 ;;
  esac
done

if [[ "$SERVICES" == "all" ]]; then
  SERVICES="backend gateway music-bot"
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ "$SKIP_DESKTOP" == "false" ]]; then
  echo "==> [1/4] Gerando instalador desktop + bundle web..."
  (cd frontend && npm run package:desktop)
else
  echo "==> [1/4] Pulando build do desktop (--skip-desktop)"
fi

if [[ "$DO_COMMIT" == "true" ]]; then
  if ! git diff --quiet -- backend/src/main/resources/desktop-min-version.txt 2>/dev/null; then
    echo "==> [2/4] Commitando desktop-min-version.txt..."
    git add backend/src/main/resources/desktop-min-version.txt
    git commit -m "chore: novo build id do instalador desktop"
    git push
  else
    echo "==> [2/4] desktop-min-version.txt sem mudança - nada pra commitar"
  fi
else
  echo "==> [2/4] Pulando commit/push (--no-commit)"
fi

echo "==> [3/4] Enviando o instalador desktop pra $VPS_HOST..."
scp "frontend/public/downloads/Concorde-Setup.exe" "frontend/public/downloads/Concorde-Setup.zip" \
    "$VPS_HOST:$VPS_PATH/frontend/public/downloads/"

echo "==> [4/4] Atualizando código na VPS (git) e subindo os containers (serviços: '${SERVICES:-<nenhum, so reinicia>}')..."
BUILD_FLAG=""
if [[ -n "$SERVICES" ]]; then
  BUILD_FLAG="--build"
fi
ssh "$VPS_HOST" "cd $VPS_PATH && git fetch origin && git reset --hard origin/master && git log -1 --oneline && docker compose --env-file .env.prod -f docker-compose.prod.yml up -d $BUILD_FLAG $SERVICES"

echo "==> Pronto! https://$DOMAIN"
