// Gera o instalador do app desktop (Windows, por padrao) e deixa ele pronto pra download
// dentro do proprio site, em /downloads/Concorde-Setup.exe - e' assim que o botao "Baixar
// para Windows" da LoginPage funciona (ver src/pages/LoginPage.jsx): o instalador vira so'
// mais um arquivo estatico dentro de public/, que o Vite copia pro dist/ e o Caddy ja serve
// (mesmo catch-all que serve o resto do site - ver Caddyfile).
//
// Uso:
//   npm run package:desktop            -> Windows (nsis), plataforma padrao pra maioria dos usuarios
//   npm run package:desktop -- --mac   -> gera .dmg em vez de .exe
//   npm run package:desktop -- --linux -> gera .AppImage em vez de .exe
//
// Passos:
//   1. vite build MIRANDO A VPS (ver DESKTOP_ORIGIN abaixo) - o app empacotado carrega o
//      index.html via file:// dentro do Electron, sem "mesma origem" nenhuma pra aproveitar
//      (diferente do navegador, que usa window.location sozinho - ver src/api/client.js e
//      src/ws/chatSocket.js) - por isso so' esse build injeta VITE_API_URL/VITE_WS_URL fixos,
//      apontando pro servidor de producao de verdade. O app desktop sempre fala com a MESMA
//      VPS/banco que o site normal, nunca com localhost.
//   2. electron-builder (empacota o Electron + esse dist/ num instalador, ver "build" no
//      package.json pra config de icone/NSIS/etc)
//   3. copia o instalador gerado (nome varia com plataforma/versao) pra
//      public/downloads/Concorde-Setup.<ext> com nome fixo, pra o link de download nunca
//      quebrar entre versoes
//   4. vite build de novo, agora SEM as variaveis (build normal do site, mesma origem de
//      sempre) - so' assim que public/downloads/ (agora com o instalador) entra no dist/
//      que sera servido pelo Caddy. Se pulassemos esse passo o proprio SITE ficaria com as
//      chamadas de API fixadas na VPS em vez de "mesma origem".
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, copyFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url))); // frontend/

// Dominio publico da VPS onde o Concorde roda de verdade (ver DEPLOY.md) - troque aqui se o
// dominio mudar. O app desktop empacotado sempre aponta pra ca, e' o mesmo banco/backend do
// site (https://187-127-37-101.sslip.io/servers/1).
const DESKTOP_ORIGIN = "https://187-127-37-101.sslip.io";

const releaseDir = join(root, "release");
const downloadsDir = join(root, "public", "downloads");

const args = process.argv.slice(2);
const platform = args.includes("--mac") ? "mac" : args.includes("--linux") ? "linux" : "win";

const targetExt = { win: ".exe", mac: ".dmg", linux: ".AppImage" }[platform];
const builderFlag = { win: "--win nsis", mac: "--mac dmg", linux: "--linux AppImage" }[platform];

function run(cmd, extraEnv) {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { cwd: root, stdio: "inherit", env: { ...process.env, ...extraEnv } });
}

console.log(`== Empacotando Concorde desktop (${platform}) - apontando pra ${DESKTOP_ORIGIN} ==`);

run("npx vite build", {
  VITE_API_URL: DESKTOP_ORIGIN,
  VITE_WS_URL: `${DESKTOP_ORIGIN.replace(/^http/, "ws")}/ws`,
});
run(`npx electron-builder ${builderFlag} --publish=never`);

if (!existsSync(releaseDir)) {
  throw new Error(`Pasta "release" nao foi criada - electron-builder falhou?`);
}

// electron-builder nomeia o arquivo com versao (ex: "Concorde Setup 0.1.0.exe") - pegamos o
// instalador mais recente com a extensao certa, sem precisar acompanhar a versao na mao.
const installer = readdirSync(releaseDir)
  .filter((f) => f.toLowerCase().endsWith(targetExt.toLowerCase()))
  .map((f) => ({ f, mtime: statSync(join(releaseDir, f)).mtimeMs }))
  .sort((a, b) => b.mtime - a.mtime)[0];

if (!installer) {
  throw new Error(`Nenhum instalador ${targetExt} encontrado em ${releaseDir}`);
}

mkdirSync(downloadsDir, { recursive: true });
const destName = `Concorde-Setup${targetExt}`;
copyFileSync(join(releaseDir, installer.f), join(downloadsDir, destName));
console.log(`\nInstalador copiado: public/downloads/${destName}`);

// Build normal do SITE (sem VITE_API_URL/VITE_WS_URL) - continua usando "mesma origem",
// igual sempre foi. So' entra aqui pra empacotar o instalador junto como arquivo estatico.
run("npx vite build");

console.log(`\nPronto! "public/downloads/${destName}" agora esta em dist/downloads/${destName} - o proximo deploy ja serve o download.`);
