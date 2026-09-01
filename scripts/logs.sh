#!/usr/bin/env bash
# Acompanha os logs de um (ou de todos os) serviço(s) do Concorde na VPS, ao vivo.
#
# Uso:
#   scripts/logs.sh              # todos os serviços
#   scripts/logs.sh backend      # so' o backend
#   scripts/logs.sh music-bot    # so' o bot de musica

set -euo pipefail
VPS_HOST="root@187.127.37.101"
VPS_PATH="~/concorde"

SERVICE="${1:-}"
ssh -t "$VPS_HOST" "cd $VPS_PATH && docker compose -f docker-compose.prod.yml logs -f --tail 100 $SERVICE"
