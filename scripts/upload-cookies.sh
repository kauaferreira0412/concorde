#!/usr/bin/env bash
# Envia um cookies.txt (exportado do YouTube, ver DEPLOY.md "Bot de música sendo bloqueado")
# pra VPS e reinicia so' o music-bot pra ele pegar o arquivo novo. Nunca comita esse arquivo -
# ele equivale a uma sessao logada de verdade.
#
# Uso:
#   scripts/upload-cookies.sh caminho/pro/cookies.txt

set -euo pipefail
VPS_HOST="root@187.127.37.101"
VPS_PATH="~/concorde"

FILE="${1:-}"
if [[ -z "$FILE" || ! -f "$FILE" ]]; then
  echo "Uso: scripts/upload-cookies.sh caminho/pro/cookies.txt" >&2
  exit 1
fi

echo "==> Enviando $FILE pra VPS..."
scp "$FILE" "$VPS_HOST:$VPS_PATH/music-bot/data/cookies.txt"

echo "==> Reiniciando o music-bot..."
ssh "$VPS_HOST" "cd $VPS_PATH && docker compose -f docker-compose.prod.yml restart music-bot"

echo "==> Pronto - confira com: scripts/logs.sh music-bot"
