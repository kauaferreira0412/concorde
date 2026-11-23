import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, copyFileSync, statSync, rmSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const args = process.argv.slice(2);
const isLocal = args.includes("--local");

// --local: aponta pro backend rodando na sua maquina (precisa estar de pe em
// localhost:8080) em vez da VPS de producao, e gera so' a pasta "unpacked" (sem
// instalador), pra testar rapido antes de subir de verdade.
const DESKTOP_ORIGIN = isLocal ? "http://localhost:8080" : "https://187-127-37-101.sslip.io";

const releaseDir = join(root, "release");
const downloadsDir = join(root, "public", "downloads");

// Antes de tudo (e antes de mexer no desktop-min-version.txt): os modulos nativos de audio
// precisam carregar dentro do Electron. Um "npm install" pode remover o process-audio-capture
// em silencio (e' dependencia opcional e a compilacao dele falha sem Python + Visual Studio C++),
// e ai o instalador iria pra producao sem audio no compartilhamento de tela.
function audioModulesOk() {
  const electronBin = join(root, "node_modules", "electron", "dist", process.platform === "win32" ? "electron.exe" : "electron");
  try {
    execSync(`"${electronBin}" "${join(root, "scripts", "check-audio-module.cjs")}"`, {
      cwd: root,
      stdio: "inherit",
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    });
    return true;
  } catch {
    return false;
  }
}
console.log("Conferindo os modulos de audio do app desktop...");
if (!audioModulesOk()) {
  // tenta recompilar os modulos nativos contra a versao do Electron (precisa de Python + VS C++)
  console.log("Tentando recompilar os modulos nativos pro Electron...");
  try {
    execSync("npx electron-builder install-app-deps", { cwd: root, stdio: "inherit" });
  } catch {
    // o check abaixo explica o que falta
  }
  if (!audioModulesOk()) process.exit(1);
}

const BUILD_ID = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "");
const desktopMinVersionFile = join(root, "..", "backend", "src", "main", "resources", "desktop-min-version.txt");
if (!isLocal) {
  writeFileSync(desktopMinVersionFile, BUILD_ID + "\n");
  console.log(`Build id gerado: ${BUILD_ID} (gravado em backend/src/main/resources/desktop-min-version.txt)`);
}

const platform = args.includes("--mac") ? "mac" : args.includes("--linux") ? "linux" : "win";

const targetExt = { win: ".exe", mac: ".dmg", linux: ".AppImage" }[platform];
const builderFlag = isLocal
  ? { win: "--win dir", mac: "--mac dir", linux: "--linux dir" }[platform]
  : { win: "--win nsis", mac: "--mac dmg", linux: "--linux AppImage" }[platform];

function run(cmd, extraEnv) {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { cwd: root, stdio: "inherit", env: { ...process.env, ...extraEnv } });
}

console.log(`== Empacotando Concorde desktop (${platform}) - apontando pra ${DESKTOP_ORIGIN} ==`);

rmSync(downloadsDir, { recursive: true, force: true });

run("npx vite build", {
  VITE_API_URL: DESKTOP_ORIGIN,
  VITE_WS_URL: `${DESKTOP_ORIGIN.replace(/^http/, "ws")}/ws`,
  VITE_DESKTOP_BUILD: "true",
  // build --local nao leva build id: sem ele o UpdateRequiredGate nao checa versao (o
  // desktop-min-version.txt nao muda em teste local, entao o app ficaria sempre "desatualizado")
  VITE_APP_BUILD_ID: isLocal ? "" : BUILD_ID,
});
run(`npx electron-builder ${builderFlag} --publish=never`);

if (!existsSync(releaseDir)) {
  throw new Error(`Pasta "release" nao foi criada - electron-builder falhou?`);
}

if (isLocal) {
  const unpackedDir = join(releaseDir, "win-unpacked");
  const exePath = join(unpackedDir, "Concorde.exe");
  console.log(
    `\nPronto! Build local apontando pra ${DESKTOP_ORIGIN} gerado em:` +
      `\n  ${existsSync(exePath) ? exePath : unpackedDir}` +
      `\n(precisa do backend local rodando em localhost:8080 pra funcionar - ` +
      `build local nao tem build id, entao a tela de "atualizacao necessaria" nao aparece.)` +
      `\nNao commitei nem mudei o desktop-min-version.txt - isso e' so' teste local.`
  );
  process.exit(0);
}

const installer = readdirSync(releaseDir)
  .filter((f) => f.toLowerCase().endsWith(targetExt.toLowerCase()))
  .map((f) => ({ f, mtime: statSync(join(releaseDir, f)).mtimeMs }))
  .sort((a, b) => b.mtime - a.mtime)[0];

if (!installer) {
  throw new Error(`Nenhum instalador ${targetExt} encontrado em ${releaseDir}`);
}

mkdirSync(downloadsDir, { recursive: true });
const destName = `Concorde-Setup${targetExt}`;
const destPath = join(downloadsDir, destName);
copyFileSync(join(releaseDir, installer.f), destPath);
console.log(`\nInstalador copiado: public/downloads/${destName}`);

if (platform === "win") {
  const zipPath = join(downloadsDir, "Concorde-Setup.zip");
  run(
    `powershell -NoProfile -Command "Compress-Archive -Path '${destPath}' -DestinationPath '${zipPath}' -Force"`
  );
  console.log(`Zip paliativo gerado: public/downloads/Concorde-Setup.zip`);
}

run("npx vite build");

console.log(
  `\nPronto! "public/downloads/${destName}" agora esta em dist/downloads/${destName} - o proximo deploy ja serve o download.` +
    `\nNao esqueca de commitar/dar push do desktop-min-version.txt junto (build id ${BUILD_ID}) - e' isso que` +
    ` descontinua as instalacoes antigas assim que o backend for reiniciado no deploy.`
);
