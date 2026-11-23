
# Deploy na VPS (Docker)

Passo a passo pra rodar o Concorde inteiro (Postgres + backend + LiveKit + frontend) numa
VPS Ubuntu/Debian com IP público, sem depender de ngrok.

## Deploy do dia a dia (depois que a VPS já está configurada uma vez)

Depois que os passos 1-4 abaixo já foram feitos uma vez (Docker instalado, firewall aberto,
código na VPS, `.env.prod` preenchido), **todo deploy seguinte é um só comando**, rodado do
Windows (Git Bash - o mesmo terminal que já roda `npm`/`git` nesse projeto):

```bash
scripts/deploy.sh
```

Isso builda o instalador desktop + o bundle web, commita/pusha o `desktop-min-version.txt`
(o resto do código precisa já ter sido commitado/pushado por você antes), envia só o instalador
(`.exe`/`.zip`, gitignorado) por `scp`, e atualiza o resto do código na VPS com
`git fetch && git reset --hard origin/master` (a VPS tem o mesmo repo clonado - não recebe
código por `scp`), terminando com `docker compose ... up -d --build backend gateway`. Ver
`scripts/deploy.sh --help` pras opções (`--skip-desktop` quando o instalador não mudou,
`--services "all"` pra reconstruir tudo incluindo o `music-bot`, `--services ""` pra só reiniciar
sem rebuildar nada). Os passos abaixo (1-4) e o resto desse arquivo continuam valendo pra
configurar uma VPS nova do zero, ou pra rodar os comandos manualmente se preferir.

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

## Novidades da versão (changelog)

A cada versão nova, o Concorde mostra um modal **"Novidades"** uma vez para cada usuário, na primeira
vez que ele abrir o app (web ou desktop) depois do deploy.

**Para publicar as novidades de uma versão:**
1. Crie um arquivo Markdown em `backend/src/main/resources/changelog/`, com a data como nome:
   `AAAA-MM-DD.md` (ex.: `2026-11-23.md`). Se sair mais de uma versão no mesmo dia, use
   `2026-11-23b.md`. A versão mais recente é a de maior nome em ordem alfabética.
2. A primeira linha `# Título` vira o título do modal. O primeiro parágrafo de texto vira o resumo
   do post no canal. O resto é o conteúdo, que aceita `##` títulos, listas, `**negrito**`, `> citação`,
   `---` e links.
3. Commite e rode o `deploy-vps.bat` normalmente.

**O que acontece quando o backend sobe:**
- Ele posta sozinho no canal **Atualizações** de cada servidor o título e o resumo, com o botão
  **"Ver novidades"**, que abre o modal. Não posta duas vezes a mesma versão.
- Cada usuário vê o modal **uma vez**. Depois de fechar, o modal só volta pelo botão do canal. O
  "já vi" fica salvo no servidor, então vale para todos os aparelhos da pessoa.
- A pessoa pode desligar o modal automático em **Configurações → Notificações** ou no próprio modal.
  O botão do canal continua funcionando.
- Contas criadas depois de uma versão não recebem o modal dessa versão, só das próximas.

## Integração com a Steam

Os usuários vinculam a conta em **Configurações → Conexões → Steam**, pelo login oficial da Steam
(OpenID). O Concorde nunca vê a senha da Steam: só recebe o SteamID confirmado pela própria Steam.
Depois de vinculado, o jogo atual aparece na lista de membros ("Jogando X") e o perfil ganha um bloco
com nome, nível e jogos recentes.

Para ligar:

1. Gere uma chave em https://steamcommunity.com/dev/apikey. É grátis, mas a conta Steam precisa ter
   gasto pelo menos US$5 na loja. Em "Domain name" coloque o `DOMAIN` da VPS.
2. Coloque no `.env.prod` da VPS: `STEAM_API_KEY=suachave`
3. Suba o backend de novo (o `deploy-vps.ps1` já faz isso).

O endereço de retorno do login (`STEAM_RETURN_URL`) já é montado no `docker-compose.prod.yml` como
`https://${DOMAIN}/api/steam/callback`. Sem a chave, a seção aparece como "não configurada" e nada é
consultado.

Limitações (são da Steam, não do Concorde):
- O jogo atual só aparece se a pessoa deixar o perfil **e** os "Detalhes de jogos" como públicos
  nas configurações de privacidade da Steam.
- Não existe aviso em tempo real: o app consulta a cada 30s (com cache no backend), então pode
  levar até ~1 minuto para "Jogando X" aparecer ou sumir.

## Acesso ao painel de administração (`/admin`)

Ter o cargo **Administrador** não basta para abrir o painel: a conta também precisa da flag
`admin_panel` na tabela `users`. Nenhuma tela ou endpoint altera essa flag, então só quem tem
acesso à VPS (e ao banco) consegue liberar ou tirar o acesso.

- Na primeira subida depois dessa mudança, o backend entrega a flag automaticamente ao
  administrador mais antigo (o dono), se ninguém tiver ela ainda.
- Contas com a flag não podem ser excluídas nem rebaixadas pelo painel, e outros admins do painel
  não conseguem editar essas contas. Só o próprio dono edita a dele.
- A mudança vale na próxima vez que a pessoa abrir ou recarregar o app (não precisa relogar).

Liberar o acesso (o usuário precisa ser ADMIN):

```bash
ssh root@187.127.37.101
cd ~/concorde
docker compose --env-file .env.prod -f docker-compose.prod.yml exec postgres \
  psql -U postgres -d discord_clone -c "UPDATE users SET role = 'ADMIN', admin_panel = true WHERE username = 'fulano';"
```

Tirar o acesso:

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml exec postgres \
  psql -U postgres -d discord_clone -c "UPDATE users SET admin_panel = false WHERE username = 'fulano';"
```

Ver quem tem acesso:

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml exec postgres \
  psql -U postgres -d discord_clone -c "SELECT id, username, role, admin_panel FROM users WHERE admin_panel;"
```

## Terminal da VPS no painel (`/admin?aba=terminal`)

O painel tem uma aba **Terminal da VPS**: um terminal de verdade (SSH) da VPS dentro do navegador,
com acesso total ao servidor. Para aparecer, a conta precisa de três coisas: cargo ADMIN, `admin_panel`
e a flag `terminal_access`. Essa flag também só muda direto no banco. Na primeira subida, o admin mais
antigo com acesso ao painel (você) recebe a flag automaticamente.

**Como funciona a segurança:**
- Na configuração, você digita a senha do usuário SSH da VPS (normalmente `root`). O backend entra uma
  vez com ela e instala uma chave SSH própria no `~/.ssh/authorized_keys`, com o comentário
  `concorde-admin-terminal`.
- A chave privada fica no banco **criptografada com a sua senha** (PBKDF2 + AES-GCM). A senha em si
  não é salva em lugar nenhum.
- Para abrir o terminal, a senha é pedida **toda vez**. Ela é o que destrava a chave, então um login
  roubado do Concorde sozinho não abre o terminal. Depois de 5 senhas erradas, o terminal fica
  bloqueado por 15 minutos.
- O backend guarda a identidade do servidor SSH vista na configuração e recusa conectar se ela mudar.
- No máximo 3 terminais abertos ao mesmo tempo. O terminal fecha sozinho depois de 30 minutos sem uso.
- Cada abertura e cada tentativa negada fica no log do backend (`docker compose ... logs backend | grep Terminal`).

**Requisitos na VPS:**
- O container do backend alcança a VPS por `host.docker.internal` (o `docker-compose.prod.yml` já tem o
  `extra_hosts` para isso), na porta 22.
- O SSH precisa aceitar login por senha **só na hora de configurar** (`PasswordAuthentication yes`).
  Depois, se quiser, pode desligar o login por senha: o terminal usa só a chave.
- Se a senha do root mudar, a senha do terminal continua sendo a antiga (ela só destrava a chave).
  Para usar a nova, clique em "Reconfigurar".

Liberar ou tirar o terminal de alguém (a pessoa também precisa ter `admin_panel`):

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml exec postgres \
  psql -U postgres -d discord_clone -c "UPDATE users SET terminal_access = true WHERE username = 'fulano';"
```

Cortar o acesso do terminal à VPS na hora, mesmo para quem tem a flag (remove a chave do Concorde):

```bash
sed -i '/ concorde-admin-terminal$/d' ~/.ssh/authorized_keys
```

## Sobre as portas de voz (LiveKit)

- `443` (HTTPS/Caddy): site, API, chat e a *sinalização* da chamada de voz — tudo nessa porta só.
- `50000-50100/udp` e `7881/tcp` (LiveKit, direto, sem passar pelo Caddy): a *mídia* de
  áudio/vídeo em si. É por isso que essas portas precisam estar abertas separadamente — diferente
  do que acontecia com o ngrok, aqui dá pra abrir UDP de verdade porque é sua própria VPS.

## Bot de música (Melodion) sendo bloqueado pelo YouTube ("Sign in to confirm you're not a bot")

VPS/datacenter costuma ter o IP "marcado" pelo YouTube, diferente do seu PC (IP residencial) -
o sintoma é o bot entrar na call mas não tocar nada, e o título da música aparecer como o link
cru no chat em vez do nome de verdade. Dá pra ver a confirmação nos logs:

```bash
docker compose -f docker-compose.prod.yml logs --tail 40 music-bot
```

Se aparecer `ERROR: [youtube] ...: Sign in to confirm you're not a bot`, o jeito confiável de
resolver é dar pro `yt-dlp` os cookies de uma sessão sua de verdade, já logada no YouTube (forçar
outro "client" tipo android/ios/tv **não resolve** - eles até passam dessa checagem, mas o
YouTube bloqueia o download do áudio em si nesses clientes agora - já testamos).

1. No seu navegador (Chrome/Firefox), **logado no YouTube**, instale uma extensão que exporta
   cookies no formato Netscape - ex: "Get cookies.txt LOCALLY" (Chrome) ou "cookies.txt" (Firefox).
2. Abra `youtube.com`, exporte os cookies com a extensão, salve como `cookies.txt`.
3. Envie esse arquivo pra VPS, na pasta `music-bot/data/` (criada vazia no repo, ignorada pelo
   git - o arquivo nunca é commitado, fica só na VPS):
   ```bash
   scp cookies.txt root@187.127.37.101:~/concorde/music-bot/data/cookies.txt
   ```
4. Reinicie só o bot pra ele pegar o arquivo (não precisa rebuildar nada, é só um volume montado):
   ```bash
   ssh root@187.127.37.101 "cd ~/concorde && docker compose -f docker-compose.prod.yml restart music-bot"
   ```
5. Confira no log (`docker compose ... logs --tail 5 music-bot`) se apareceu a linha
   `cookies.txt encontrado - yt-dlp vai usar a sessão logada pra extrair áudio.`

Esses cookies expiram/o YouTube pode invalidar de vez em quando (não tem uma validade fixa) -
se o bloqueio voltar depois de um tempo, é só repetir os passos 1-3 com cookies novos. **Nunca
compartilhe esse arquivo** (ele equivale à sua sessão logada) nem cole o conteúdo dele no chat -
mande só via `scp` direto pra VPS.

## Migrando o armazenamento do Google Cloud Storage pro Cloudflare R2

O upload de avatar/imagens/anexos trocou do GCS pro Cloudflare R2 (mesma API do S3 - ver
`StorageService.java`). Os arquivos que já existiam no bucket antigo **não vêm sozinhos** - view
os passos abaixo pra copiar tudo sem perder nada.

### 1. Configurar o bucket novo no R2

No painel da Cloudflare (R2 → seu bucket): ative a **Public Development URL** (ou aponte um
domínio seu pro bucket) - é essa URL que vai virar `R2_PUBLIC_BASE_URL`. Em "Manage API Tokens",
crie um token com permissão de leitura/escrita nesse bucket - ele te dá o `R2_ACCESS_KEY_ID` e
`R2_SECRET_ACCESS_KEY`. O `R2_ACCOUNT_ID` aparece na URL do painel do Cloudflare (o pedaço antes
de `.cloudflarestorage.com`) ou em R2 → Overview, no canto direito.

### 2. Copiar os arquivos do bucket antigo pro novo (sem passar pelo app)

Usa o [rclone](https://rclone.org/downloads/) - suporta ler do Google Cloud Storage e escrever
num bucket S3-compatível (R2) direto, sem baixar/subir manualmente. Instale e rode:

```bash
rclone config
```

Crie dois remotes:
- `gcs` → tipo `Google Cloud Storage`, cole o JSON da conta de serviço que você já usava
  (`GCS_CREDENTIALS_JSON`) quando pedir as credenciais.
- `r2` → tipo `s3`, provider `Cloudflare`, endpoint `https://SEU_ACCOUNT_ID.r2.cloudflarestorage.com`,
  `access_key_id`/`secret_access_key` do token criado no passo 1.

Depois, copia tudo mantendo a MESMA estrutura de pastas (importante - é isso que permite só
trocar o prefixo da URL no banco, sem precisar recalcular o caminho de cada arquivo):

```bash
rclone sync gcs:SEU_BUCKET_ANTIGO r2:SEU_BUCKET_NOVO --progress
```

Confere se bateu tudo:

```bash
rclone size gcs:SEU_BUCKET_ANTIGO
rclone size r2:SEU_BUCKET_NOVO
```

(Os dois devem mostrar a mesma quantidade de arquivos/tamanho total.)

### 3. Configurar as variáveis novas e subir o backend

No `.env.prod` da VPS (e localmente, se for testar antes), preencha (ver `.env.prod.example`):

```
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=SEU_BUCKET_NOVO
R2_PUBLIC_BASE_URL=https://pub-xxxxxxxx.r2.dev
```

Depois do deploy normal (`docker compose ... up -d --build backend gateway`), qualquer upload
NOVO já vai pro R2. As `GCS_CREDENTIALS_JSON`/`GCS_BUCKET` antigas podem ser removidas do
`.env.prod` (não são mais lidas por nada).

### 4. Reescrever as URLs antigas no banco (local e VPS)

Os arquivos JÁ enviados antes da troca continuam com a URL antiga (`storage.googleapis.com`)
gravada no banco - como o passo 2 copiou pro R2 com o MESMO caminho, é só trocar o prefixo em
todas as colunas que guardam uma URL de imagem/arquivo. Troque `SEU_BUCKET_ANTIGO` e
`https://pub-xxxxxxxx.r2.dev` pelos valores reais antes de rodar (no psql, local e na VPS):

```sql
DO $$
DECLARE
    old_prefix text := 'https://storage.googleapis.com/SEU_BUCKET_ANTIGO/';
    new_prefix text := 'https://pub-xxxxxxxx.r2.dev/';
BEGIN
    UPDATE users SET avatar_url = new_prefix || substring(avatar_url from length(old_prefix)+1) WHERE avatar_url LIKE old_prefix || '%';
    UPDATE servers SET icon_url = new_prefix || substring(icon_url from length(old_prefix)+1) WHERE icon_url LIKE old_prefix || '%';
    UPDATE messages SET image_url = new_prefix || substring(image_url from length(old_prefix)+1) WHERE image_url LIKE old_prefix || '%';
    UPDATE messages SET file_url = new_prefix || substring(file_url from length(old_prefix)+1) WHERE file_url LIKE old_prefix || '%';
    UPDATE direct_messages SET image_url = new_prefix || substring(image_url from length(old_prefix)+1) WHERE image_url LIKE old_prefix || '%';
    UPDATE direct_messages SET file_url = new_prefix || substring(file_url from length(old_prefix)+1) WHERE file_url LIKE old_prefix || '%';
    UPDATE battle_maps SET image_url = new_prefix || substring(image_url from length(old_prefix)+1) WHERE image_url LIKE old_prefix || '%';
    UPDATE map_tokens SET image_url = new_prefix || substring(image_url from length(old_prefix)+1) WHERE image_url LIKE old_prefix || '%';
    UPDATE character_sheets SET image_url = new_prefix || substring(image_url from length(old_prefix)+1) WHERE image_url LIKE old_prefix || '%';
    UPDATE character_sheets SET file_url = new_prefix || substring(file_url from length(old_prefix)+1) WHERE file_url LIKE old_prefix || '%';
    UPDATE custom_emojis SET image_url = new_prefix || substring(image_url from length(old_prefix)+1) WHERE image_url LIKE old_prefix || '%';
    UPDATE music_bot_settings SET avatar_url = new_prefix || substring(avatar_url from length(old_prefix)+1) WHERE avatar_url LIKE old_prefix || '%';
    UPDATE soundboard_bot_settings SET avatar_url = new_prefix || substring(avatar_url from length(old_prefix)+1) WHERE avatar_url LIKE old_prefix || '%';
    UPDATE soundboard_clips SET file_url = new_prefix || substring(file_url from length(old_prefix)+1) WHERE file_url LIKE old_prefix || '%';
END $$;
```

Depois de rodar, dá uma conferida (não precisa reiniciar nada - é só dado):

```sql
SELECT avatar_url FROM users WHERE avatar_url IS NOT NULL LIMIT 5;
```

Se aparecer `pub-xxxxxxxx.r2.dev` em vez de `storage.googleapis.com`, deu certo. Só depois de
confirmar que tudo carrega (avatares, imagens do chat, mapas, fichas...) é seguro desativar o
bucket antigo do GCS - até lá ele continua existindo e não custa nada mantê-lo como backup.
