#!/usr/bin/env bash
# Deploy do Concorde pra VPS - builda o instalador desktop (Windows), commita/pusha o build id,
# envia so' o instalador (.exe/.zip, gitignored) por scp, e atualiza o resto do codigo na VPS
# via "git fetch/reset --hard origin/master" (a VPS tem o mesmo repo clonado, NAO recebe codigo
# por scp) - termina com "docker compose ... up -d --build" nos serviços certos. Junta num só
# lugar os comandos que sempre foram rodados manualmente nesse projeto (ver DEPLOY.md).
#
# Uso:
#   scripts/deploy.sh                       # build completo + deploy (backend + gateway)
#   scripts/deploy.sh --skip-desktop        # so' atualiza o codigo (nao regera o instalador .exe)
#   scripts/deploy.sh --services "gateway"  # reconstroi so' o gateway (mudanca so' de frontend)
#   scripts/deploy.sh --services "all"      # reconstroi TODOS os servicos com Dockerfile
#   scripts/deploy.sh --services ""         # nao reconstroi nada, so' reinicia com o que ja existe
#   scripts/deploy.sh --no-commit           # nao commita/pusha o desktop-min-version.txt sozinho
#
# Precisa: acesso SSH já configurado pra "root@187.127.37.101" (chave, sem senha) - se pedir
# senha toda hora, veja `ssh-copy-id root@187.127.37.101`. E o commit mais novo do master
# precisa já estar no GitHub (o passo 2 abaixo cuida do desktop-min-version.txt sozinho, mas
# qualquer outra mudança de código precisa ter sido commitada/pushada ANTES de rodar esse
# script).

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

# ====== 3. Envia so' o instalador desktop (o resto do codigo vai por git, ver passo 4) ======
# frontend/public/downloads/ e' gitignored de proposito (nao versiona binario) - por isso o
# .exe/.zip precisam ir por scp direto, separado do resto do codigo.
echo "==> [3/4] Enviando o instalador desktop pra $VPS_HOST..."
scp "frontend/public/downloads/Concorde-Setup.exe" "frontend/public/downloads/Concorde-Setup.zip" \
    "$VPS_HOST:$VPS_PATH/frontend/public/downloads/"

# ====== 4. Atualiza o codigo na VPS via git e sobe os containers ======
# A VPS tem o mesmo repo clonado (nao recebe codigo por scp) - so' da' um fetch/reset pro commit
# mais novo do master (empurrado no passo 2 acima, ou por qualquer commit anterior que ainda nao
# tinha sido deployado) e reconstroi os servicos pedidos.
echo "==> [4/4] Atualizando código na VPS (git) e subindo os containers (serviços: '${SERVICES:-<nenhum, so reinicia>}')..."
BUILD_FLAG=""
if [[ -n "$SERVICES" ]]; then
  BUILD_FLAG="--build"
fi
ssh "$VPS_HOST" "cd $VPS_PATH && git fetch origin && git reset --hard origin/master && git log -1 --oneline && docker compose --env-file .env.prod -f docker-compose.prod.yml up -d $BUILD_FLAG $SERVICES"

echo "==> Pronto! https://$DOMAIN"
