# Precisa ser baseada em glibc (Debian), NAO Alpine - o binario nativo do @livekit/rtc-node
# so' tem build pronto pra "linux-x64-gnu" (ver node_modules/@livekit/rtc-ffi-bindings), Alpine
# usa musl e quebraria a instalacao.
FROM node:20-bookworm-slim

# ffmpeg (decodifica o audio baixado pra PCM cru) + curl (so' pra baixar o yt-dlp abaixo,
# nao fica na imagem final por muito tempo mesmo, mas nao vale a pena um estagio multi-stage
# aqui - o binario do yt-dlp e' pequeno).
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg curl ca-certificates \
    && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp \
    && apt-get purge -y curl && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY . .

# yt-dlp se atualiza sozinho (--update) toda vez que o container sobe - a YouTube muda coisas
# de proposito pra dificultar extracao, entao o binario baixado no build da imagem pode ja
# estar desatualizado por ocasiao do deploy. Isso falha silenciosamente (so' loga um aviso)
# se nao tiver internet nesse instante, nao trava a subida do bot.
CMD yt-dlp --update-to stable >/dev/null 2>&1 || true; node index.js
