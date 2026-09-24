import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, copyFileSync, statSync, rmSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const DESKTOP_ORIGIN = "https://187-127-37-101.sslip.io";

const releaseDir = join(root, "release");
const downloadsDir = join(root, "public", "downloads");

const BUILD_ID = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "");
const desktopMinVersionFile = join(root, "..", "backend", "src", "main", "resources", "desktop-min-version.txt");
writeFileSync(desktopMinVersionFile, BUILD_ID + "\n");
console.log(`Build id gerado: ${BUILD_ID} (gravado em backend/src/main/resources/desktop-min-version.txt)`);

const args = process.argv.slice(2);
const platform = args.includes("--mac") ? "mac" : args.includes("--linux") ? "linux" : "win";

const targetExt = { win: ".exe", mac: ".dmg", linux: ".AppImage" }[platform];
const builderFlag = { win: "--win nsis", mac: "--mac dmg", linux: "--linux AppImage" }[platform];

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
  VITE_APP_BUILD_ID: BUILD_ID,
});
run(`npx electron-builder ${builderFlag} --publish=never`);

if (!existsSync(releaseDir)) {
  throw new Error(`Pasta "release" nao foi criada - electron-builder falhou?`);
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
