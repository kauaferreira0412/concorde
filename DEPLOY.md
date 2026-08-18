# Deploy na VPS (Docker)

Passo a passo pra rodar o Concorde inteiro (Postgres + backend + LiveKit + frontend) numa
VPS Ubuntu/Debian com IP público, sem depender de ngrok.

## 1. Instalar o Docker na VPS

Via SSH, como root (ou usuário com sudo):

```bash
curl -fsSL https://get.docker.com | sh
```

## 2. Abrir as portas no firewall

```bash
ufw allow 22/tcp    # SSH - nao esqueca, senao voce se tranca de fora
ufw allow 80/tcp     # HTTP (validacao do certificado HTTPS)
ufw allow 443/tcp    # HTTPS (site, API, chat, sinalizacao de voz)
ufw allow 7881/tcp   # LiveKit - fallback TCP do WebRTC
ufw allow 50000:50100/udp  # LiveKit - midia (audio/video)
ufw enable
```

Se a VPS estiver atrás de um firewall do provedor (ex: "Cloud Firewall" da DigitalOcean/Oracle/etc,
separado do `ufw`), libere as mesmas portas lá também — é comum esquecer esse e o `ufw` não ser
o problema.

## 3. Levar o código pra VPS

```bash
git clone <url-do-seu-repo> concorde
cd concorde
```

(ou `scp -r` a pasta do projeto, se não estiver num repo git ainda)

## 4. Configurar as variáveis de produção

```bash
cp .env.prod.example .env.prod
nano .env.prod
```

Preencha pelo menos:
- `DOMAIN`: se não tiver domínio próprio, pegue o IP público da VPS (`curl ifconfig.me`) e monte
  `IP-com-hifen.sslip.io` — ex. IP `203.0.113.7` vira `DOMAIN=203-0-113-7.sslip.io`. Esse domínio
  já resolve pro seu IP automaticamente, de graça, sem cadastro em lugar nenhum.
- `DB_PASSWORD`, `ADMIN_PASSWORD`: senhas fortes, à sua escolha.
- `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET`: invente valores próprios (o secret precisa ter
  32+ caracteres) — **não** reaproveite o `devkey`/`devsecret...` do `docker-compose.yml` de dev.

## 5. Subir tudo

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build
```

Primeira subida demora um pouco (build do backend com Maven + build do frontend com npm).
Acompanhe os logs:

```bash
docker compose -f docker-compose.prod.yml logs -f
```

## 6. Testar

Abra `https://SEU_DOMINIO` no navegador (ex: `https://203-0-113-7.sslip.io`). O Caddy busca o
certificado HTTPS sozinho na primeira requisição — pode levar alguns segundos a mais na primeira
vez. Faça login com `admin` / a senha que você colocou em `ADMIN_PASSWORD`, crie um servidor e
teste o canal de voz. Manda o link do domínio pros seus amigos — não precisa mais de ngrok nem
de deixar seu PC ligado.

## Atualizando depois de mudar código

```bash
git pull
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build
```

## Gerando o instalador do app desktop (Windows)

O botão "Baixar app para Windows" da tela de login (`frontend/src/pages/LoginPage.jsx`) aponta
pra `/downloads/Concorde-Setup.exe` - um arquivo estático como qualquer outro do site, servido
pelo mesmo Caddy (ver Caddyfile). Ele só existe depois que você gera o instalador uma vez, na
sua máquina Windows:

```bash
cd frontend
npm run package:desktop
```

Isso builda o app **apontando pra VPS de produção** (`DESKTOP_ORIGIN` em
`frontend/scripts/package-desktop.mjs` - hoje `https://187-127-37-101.sslip.io`, troque ali se o
domínio mudar), empacota com `electron-builder` (ver `"build"` em `frontend/package.json`) e
copia o instalador pra `frontend/public/downloads/Concorde-Setup.exe`. O site em si continua
buildado do jeito de sempre (mesma origem) - só o app desktop empacotado leva a URL da VPS fixa,
porque ele carrega a página via `file://` (sem "mesma origem" pra aproveitar, diferente do
navegador). Ou seja: o app desktop instalado localmente por qualquer usuário fala com o **mesmo
banco/backend da VPS**, exatamente como o site - não com o computador de quem instalou.

> Nota: no Windows, a primeira vez que você rodar `npm run package:desktop`, o `electron-builder`
> baixa uma ferramenta auxiliar (`winCodeSign`) que costuma falhar em extrair 2 arquivos de macOS
> (symlinks) sem o "Modo desenvolvedor" do Windows ligado - isso não afeta o instalador gerado
> (não estamos assinando nada). Se acontecer, ligue Configurações → Privacidade e segurança →
> Para desenvolvedores → Modo desenvolvedor, e rode o comando de novo.

> Nota: o áudio isolado de "Janela" (ver `frontend/electron/main.cjs`) depende do módulo nativo
> da biblioteca `process-audio-capture`, que fica dentro de `node_modules/` (ignorado pelo git) -
> então numa máquina nova ele precisa ser recompilado uma vez para a ABI do Electron antes de
> gerar o instalador (o `electron-builder` NÃO faz isso sozinho - por isso `"npmRebuild": false`
> no `package.json`, pra ele não tentar recompilar errado e quebrar o binário):
>
> ```bash
> cd frontend
> npm install
> cd node_modules/process-audio-capture
> npx node-gyp@13 rebuild --target=32.3.3 --arch=x64 --dist-url=https://electronjs.org/headers
> cd ../..
> npm run package:desktop
> ```
>
> Precisa do Python 3.12 e do Visual Studio (com "Desktop development with C++") instalados e no
> PATH, igual pra qualquer módulo nativo do Node. O `32.3.3` é a versão do Electron usada aqui
> (ver `devDependencies.electron` no `package.json`) - se ela mudar, troque o `--target` junto.

### Publicando o instalador no site de verdade

A VPS roda Linux (Docker) e não builda `.exe` do Windows - o instalador precisa ser gerado numa
máquina Windows (acima) e depois **enviado** pra VPS. Duas formas:

**Via rebuild normal (recomendado - fica valendo pros próximos builds também):**
```bash
scp "frontend/public/downloads/Concorde-Setup.exe" usuario@SEU_DOMINIO_OU_IP:~/concorde/frontend/public/downloads/
ssh usuario@SEU_DOMINIO_OU_IP "cd ~/concorde && docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build"
```

**Via cópia direta no container (mais rápido, mas some se o container for recriado sem repetir o `scp` acima antes):**
```bash
scp "frontend/public/downloads/Concorde-Setup.exe" usuario@SEU_DOMINIO_OU_IP:/tmp/
ssh usuario@SEU_DOMINIO_OU_IP "docker cp /tmp/Concorde-Setup.exe \$(docker compose -f docker-compose.prod.yml ps -q frontend):/srv/downloads/Concorde-Setup.exe"
```

Depois de qualquer uma das duas, `https://SEU_DOMINIO/downloads/Concorde-Setup.exe` já responde e o
botão "Baixar app para Windows" da tela de login funciona pra qualquer visitante do site.

O app desktop carrega o **mesmo bundle web** (mesmo HTML/CSS/JS) - a única diferença é que, ao
compartilhar tela, ele usa um seletor nativo (janela ou tela inteira) em vez do diálogo do
navegador (ver `frontend/electron/main.cjs`, `preload.cjs` e `src/components/ScreenSharePicker.jsx`).

## Sobre as portas de voz (LiveKit)

- `443` (HTTPS/Caddy): site, API, chat e a *sinalização* da chamada de voz — tudo nessa porta só.
- `50000-50100/udp` e `7881/tcp` (LiveKit, direto, sem passar pelo Caddy): a *mídia* de
  áudio/vídeo em si. É por isso que essas portas precisam estar abertas separadamente — diferente
  do que acontecia com o ngrok, aqui dá pra abrir UDP de verdade porque é sua própria VPS.
