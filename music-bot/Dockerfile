# Precisa ser baseada em glibc (Debian), NAO Alpine - o binario nativo do @livekit/rtc-node
# so' tem build pronto pra "linux-x64-gnu" (ver node_modules/@livekit/rtc-ffi-bindings), Alpine
# usa musl e quebraria a instalacao.
FROM node:20-bookworm-slim

# ffmpeg (decodifica o audio baixado pra PCM cru) + curl/unzip (so' pra baixar o yt-dlp e o
# deno abaixo, nao ficam na imagem final por muito tempo mesmo, mas nao vale a pena um estagio
# multi-stage aqui - os binarios sao pequenos).
# IMPORTANTE: baixa o "yt-dlp_linux" (binario standalone, empacotado com PyInstaller), NAO o
# "yt-dlp" puro - esse ultimo e' soh um script Python que precisa de um "python3" instalado na
# imagem pra rodar, e node:20-bookworm-slim nao tem. Com o standalone nao precisa de Python
# nenhum. (Isso silenciosamente fazia TODA musica falhar - o processo nem rodava de verdade,
# so' cai no fallback de titulo/nao toca nada, sem erro visivel porque o stderr do yt-dlp e'
# ignorado de proposito no bot, ver index.js.)
#
# Deno: o yt-dlp mais recente precisa de um runtime JavaScript pra resolver o desafio de
# assinatura que o YouTube coloca nos links de audio (sem isso: "Signature solving failed" ->
# "The page needs to be reloaded", mesmo com cookies validos - reportado/reproduzido na VPS).
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg curl unzip ca-certificates \
    && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp \
    && curl -fsSL https://deno.land/install.sh | DENO_INSTALL=/usr/local sh \
    && apt-get purge -y curl unzip && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY . .

# yt-dlp se atualiza sozinho (--update) toda vez que o container sobe - a YouTube muda coisas
# de proposito pra dificultar extracao, entao o binario baixado no build da imagem pode ja
# estar desatualizado por ocasiao do deploy. Isso falha silenciosamente (so' loga um aviso)
# se nao tiver internet nesse instante, nao trava a subida do bot.
CMD yt-dlp --update-to stable >/dev/null 2>&1 || true; node index.js
