#!/usr/bin/env bash
# Deploy do Concorde pra VPS - builda o instalador desktop (Windows), empacota o projeto (sem
# node_modules/target/etc - a VPS builda tudo de novo dentro do Docker) e sobe pra VPS via
# ssh/scp, terminando com "docker compose ... up -d --build" nos serviços certos. Junta num só
# lugar os passos que sempre foram feitos manualmente nesse projeto (ver DEPLOY.md).
#
# Uso:
#   scripts/deploy.sh                       # build completo + deploy (backend + gateway)
#   scripts/deploy.sh --skip-desktop        # so' reenvia o codigo (nao regera o instalador .exe)
#   scripts/deploy.sh --services "gateway"  # reconstroi so' o gateway (mudanca so' de frontend)
#   scripts/deploy.sh --services "all"      # reconstroi TODOS os servicos com Dockerfile
#   scripts/deploy.sh --services ""         # nao reconstroi nada, so' reinicia com o que ja existe
#   scripts/deploy.sh --no-commit           # nao commita/pusha o desktop-min-version.txt sozinho
#
# Precisa: acesso SSH já configurado pra "root@187.127.37.101" (chave, sem senha) - se pedir
# senha toda hora, veja `ssh-copy-id root@187.127.37.101`.

set -euo pipefail

# ====== Config (mude aqui se a VPS ou o dominio trocar) ======
VPS_HOST="root@187.127.37.101"
VPS_PATH="~/concorde"
DOMAIN="187-127-37-101.sslip.io"

# ====== Flags ======
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

# ====== 1. Instalador desktop (Windows) + bundle web ======
# so' roda numa maquina Windows de verdade (electron-builder empacota .exe) - ver DEPLOY.md
# "Gerando o instalador do app desktop". Isso tambem escreve um build id novo em
# backend/src/main/resources/desktop-min-version.txt, que descontinua instalacoes antigas assim
# que o backend reiniciar.
if [[ "$SKIP_DESKTOP" == "false" ]]; then
  echo "==> [1/4] Gerando instalador desktop + bundle web..."
  (cd frontend && npm run package:desktop)
else
  echo "==> [1/4] Pulando build do desktop (--skip-desktop)"
fi

# ====== 2. Commit + push do build id (mesmo padrao seguido em toda mudanca de frontend) ======
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

# ====== 3. Empacota o projeto e envia pra VPS ======
# Exclui tudo que a propria VPS gera sozinha dentro do Docker (node_modules/target/dist/release)
# e qualquer coisa que so' deveria existir na VPS mesmo (.env.prod com os segredos de verdade,
# cookies.txt do music-bot, banco local de dev) - nunca sobrescreve isso.
echo "==> [3/4] Empacotando e enviando o projeto pra $VPS_HOST:$VPS_PATH..."
TARBALL="$(mktemp -u "${TMPDIR:-/tmp}/concorde-deploy-XXXXXX.tar.gz")"
tar --exclude='.git' \
    --exclude='frontend/node_modules' \
    --exclude='frontend/dist' \
    --exclude='frontend/release' \
    --exclude='backend/target' \
    --exclude='backend/data' \
    --exclude='music-bot/node_modules' \
    --exclude='music-bot/data' \
    --exclude='data' \
    --exclude='.env.prod' \
    --exclude='Potato Chat.html' \
    -czf "$TARBALL" .
scp "$TARBALL" "$VPS_HOST:/tmp/concorde-deploy.tar.gz"
rm -f "$TARBALL"

# ====== 4. Extrai na VPS e sobe os containers ======
echo "==> [4/4] Extraindo na VPS e subindo os containers (serviços: '${SERVICES:-<nenhum, so reinicia>}')..."
BUILD_FLAG=""
if [[ -n "$SERVICES" ]]; then
  BUILD_FLAG="--build"
fi
ssh "$VPS_HOST" "mkdir -p $VPS_PATH && tar -xzf /tmp/concorde-deploy.tar.gz -C $VPS_PATH && rm -f /tmp/concorde-deploy.tar.gz && cd $VPS_PATH && docker compose --env-file .env.prod -f docker-compose.prod.yml up -d $BUILD_FLAG $SERVICES"

echo "==> Pronto! https://$DOMAIN"
