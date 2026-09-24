#!/usr/bin/env bash

set -euo pipefail
VPS_HOST="root@187.127.37.101"
VPS_PATH="~/concorde"

SERVICE="${1:-}"
ssh -t "$VPS_HOST" "cd $VPS_PATH && docker compose -f docker-compose.prod.yml logs -f --tail 100 $SERVICE"
