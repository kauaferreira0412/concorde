// Confere, DENTRO do Electron (mesma ABI do app empacotado), se os módulos nativos de áudio
// carregam - e se o process-audio-capture está com o patch do Concorde (captura o som do sistema
// EXCLUINDO o próprio Concorde, pra quem assiste não ouvir a call de volta).
//
// Rodado pelo package-desktop.mjs antes de gerar o instalador:
//   ELECTRON_RUN_AS_NODE=1 electron scripts/check-audio-module.cjs
// Sai com código 1 (e o build para) se algo estiver faltando - antes isso falhava em silêncio
// e o instalador ia pra produção sem áudio no compartilhamento de tela.
const path = require("path");

const root = path.join(__dirname, "..");
const problems = [];

try {
  const { audioCapture } = require(path.join(root, "node_modules", "process-audio-capture"));
  if (!audioCapture) {
    problems.push("process-audio-capture carregou, mas sem o objeto audioCapture (modulo nativo nao compilado?)");
  } else if (typeof audioCapture.startCaptureExcludingSelf !== "function") {
    problems.push("process-audio-capture sem o patch do Concorde (rode: npx patch-package)");
  } else if (!audioCapture.addon || typeof audioCapture.addon.startCaptureExcludingSelf !== "function") {
    problems.push(
      "o binario nativo do process-audio-capture nao tem startCaptureExcludingSelf - recompile com o patch aplicado " +
        "(ver DEPLOY.md, secao do instalador desktop)"
    );
  }
} catch (err) {
  problems.push("process-audio-capture nao carregou: " + String(err.message).split("\n")[0]);
}

try {
  const hwnd = require(path.join(root, "electron", "native", "hwnd-utils", "build", "Release", "hwnd_utils.node"));
  if (typeof hwnd.getPidForHwnd !== "function") problems.push("hwnd_utils.node sem getPidForHwnd");
} catch (err) {
  problems.push("hwnd_utils.node nao carregou: " + String(err.message).split("\n")[0]);
}

if (problems.length) {
  console.error("\nERRO: modulos de audio do app desktop com problema (Electron " + process.versions.electron + "):");
  for (const p of problems) console.error("  - " + p);
  console.error("Sem isso, compartilhar tela no app desktop fica sem audio. Build interrompido.\n");
  process.exit(1);
}
console.log("Modulos de audio OK (Electron " + process.versions.electron + ", com exclusao do proprio Concorde).");
