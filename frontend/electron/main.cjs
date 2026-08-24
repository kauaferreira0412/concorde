const { app, BrowserWindow, protocol, ipcMain, desktopCapturer, net, shell, globalShortcut, Menu } = require("electron");
const path = require("path");
const { pathToFileURL } = require("url");
const { spawn } = require("child_process");
const fs = require("fs");

const APP_PROTOCOL = "concorde"; // concorde://invite/<code> - deep link, registrado no SO
const DEV_URL = "http://localhost:5173";

// Audio isolado de UMA janela (so' Windows) - usa a biblioteca "process-audio-capture"
// (WASAPI Process Loopback por PID, ver package.json) pra pegar so' o audio do processo dono
// da janela escolhida, sem vazar o audio do proprio Concorde nem de mais nada. "hwnd-utils" e'
// um modulo pequeno so' pra converter o HWND da janela escolhida (vindo do desktopCapturer)
// no PID que a biblioteca de audio espera - ver ScreenSharePicker.jsx/VoiceCallContext.jsx.
let audioCapture = null;
let getPidForHwnd = null;
if (process.platform === "win32") {
  try {
    ({ audioCapture } = require("process-audio-capture"));
    ({ getPidForHwnd } = require(path.join(__dirname, "native", "hwnd-utils", "build", "Release", "hwnd_utils.node")));
  } catch (err) {
    console.warn("Modulo de audio por janela nao carregou:", err.message);
  }
}

// Esquema custom que serve os arquivos de dist/ (o app empacotado) - em vez de abrir direto
// via file://. O motivo: uma pagina file:// e' uma "origem opaca" pro navegador, manda
// "Origin: null" em toda chamada de WebSocket - e o backend rejeita isso (403), porque a
// whitelist de CORS so' aceita dominios especificos (ver app.cors.allowed-origins no
// application.yml do backend, que ja' inclui "app://." esperando por isso). Registrando
// "app" como esquema privilegiado ("standard"), o navegador trata como uma origem de
// verdade (app://.) - o WebSocket do chat passa a autenticar normalmente.
protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
  },
]);

let mainWindow;

// Altura da barra de titulo customizada, em pixels - PRECISA bater com ".desktop-titlebar"
// e "html[data-desktop-titlebar] #root" em global.css (o React reserva esse espaco no topo
// da pagina pro conteudo nao ficar escondido atras da barra).
const TITLEBAR_HEIGHT = 38;

function createWindow(deepLinkUrl) {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: "Concorde",
    backgroundColor: "#050816", // mesmo tom do --bg-app (ver global.css) - evita um "flash" branco
    // Remove a barra de titulo/menu PADRAO do Windows (aquela feia, com File/Edit/View/Window/
    // Help e os botoes brancos quadrados) - o conteudo web passa a ocupar a janela inteira, e a
    // gente desenha nossa PROPRIA barra em cima (ver DesktopTitleBar.jsx). "titleBarOverlay"
    // mantem os botoes de minimizar/maximizar/fechar sendo desenhados pelo proprio WINDOWS (nao
    // por nos) so' que com as cores do nosso tema - continuam com o comportamento nativo de
    // verdade (inclusive o menu de "snap layouts" ao passar o mouse no maximizar, do Windows 11).
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#070b1a", // --bg-rail (ver global.css)
      symbolColor: "#f4f6fd", // --text-primary
      height: TITLEBAR_HEIGHT,
    },
    webPreferences: {
      // getUserMedia/getDisplayMedia (mic, camera, compartilhar tela) funcionam
      // normalmente aqui, igual em um Chrome comum.
      contextIsolation: true,
      nodeIntegration: false,
      // Expoe window.concordeDesktop (ver preload.cjs) - e' assim que o React sabe que esta
      // rodando no app desktop e pode usar o seletor de tela customizado (com miniatura,
      // estilo Discord) em vez do dialogo padrao do Chromium.
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  const startUrl = app.isPackaged ? "app://./index.html" : DEV_URL;

  mainWindow.loadURL(startUrl);

  if (deepLinkUrl) {
    routeDeepLink(deepLinkUrl);
  }
}

// Atende qualquer app://<algo> lendo o arquivo correspondente de dentro de dist/ (funciona
// normal mesmo empacotado dentro do .asar - o Electron trata .asar como pasta comum pra
// leitura de arquivo). So' precisa estar registrado antes da janela carregar a URL.
function registerAppProtocol() {
  protocol.handle("app", (request) => {
    const url = new URL(request.url);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === "" || pathname === "/") pathname = "/index.html";
    const filePath = path.normalize(path.join(__dirname, "../dist", pathname));
    return net.fetch(pathToFileURL(filePath).toString());
  });
}

// Lista as telas/janelas disponiveis pra compartilhar, com miniatura - so' o processo
// principal (aqui) tem acesso a desktopCapturer, o renderer pede via preload.cjs.
ipcMain.handle("concorde:list-screen-sources", async () => {
  const sources = await desktopCapturer.getSources({
    types: ["screen", "window"],
    thumbnailSize: { width: 320, height: 180 },
    fetchWindowIcons: true,
  });
  // Thumbnail/icon vem como NativeImage - so' o dataURL atravessa o IPC de forma segura
  // (NativeImage nao e' serializavel).
  return sources.map((s) => ({
    id: s.id,
    name: s.name,
    type: s.id.startsWith("screen:") ? "screen" : "window",
    thumbnailDataUrl: s.thumbnail.isEmpty() ? null : s.thumbnail.toDataURL(),
    iconDataUrl: s.appIcon && !s.appIcon.isEmpty() ? s.appIcon.toDataURL() : null,
  }));
});

// Audio isolado de uma janela - chamado quando o usuario escolhe compartilhar uma Janela
// especifica no ScreenSharePicker. "hwnd" vem do id da fonte do desktopCapturer (formato
// "window:<hwnd>:0"). Ao contrario de Tela Inteira (audio do sistema, capturado no proprio
// renderer via getUserMedia), esse audio vem isolado por processo, entao NAO precisa mutar a
// call - quem compartilha continua ouvindo todo mundo normal (ver VoiceCallContext.jsx).
ipcMain.handle("concorde:start-window-audio", async (event, hwnd) => {
  if (!audioCapture || !getPidForHwnd) return { ok: false, error: "Modulo de audio por janela indisponivel" };
  try {
    const permission = await audioCapture.requestPermission();
    if (permission.status !== "authorized") {
      return { ok: false, error: "Permissao de captura de audio negada pelo Windows" };
    }
    const pid = getPidForHwnd(hwnd);
    if (!pid) return { ok: false, error: "Nao foi possivel identificar o processo dessa janela" };
    // Float32Array atravessa o IPC do Electron normalmente (clonagem estruturada) - sem
    // precisar converter pra array comum.
    const started = audioCapture.startCapture(pid, (audioData) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("concorde:window-audio-chunk", audioData);
      }
    });
    return started ? { ok: true } : { ok: false, error: "Nao foi possivel iniciar a captura desse processo" };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle("concorde:stop-window-audio", () => {
  if (audioCapture) audioCapture.stopCapture();
});

// Atalhos GLOBAIS (mutar/ensurdecer) - ao contrario de um listener de "keydown" comum no
// renderer (so' dispara com a janela do Concorde em foco), globalShortcut e' registrado no
// SISTEMA OPERACIONAL: continua funcionando mesmo com outra janela em primeiro plano (jogo,
// navegador, etc), que era exatamente o bug relatado. Formato interno do app e'
// "ctrl+shift+m" (ver keyboardShortcuts.js) - o Electron exige "Control+Shift+M".
function comboToAccelerator(combo) {
  if (!combo) return null;
  return combo
    .split("+")
    .map((part) => {
      if (part === "ctrl") return "Control";
      if (part === "shift") return "Shift";
      if (part === "alt") return "Alt";
      if (part === "meta") return "Super";
      if (part === "space") return "Space";
      return part.length === 1 ? part.toUpperCase() : part[0].toUpperCase() + part.slice(1);
    })
    .join("+");
}

// Re-registrado do zero toda vez que e' chamado (na entrada do app E toda vez que o usuario
// muda o atalho em Configuracoes, ver VoiceCallContext.jsx/SettingsModal.jsx) - mais simples
// do que tentar diffar qual mudou. "Melhor esforco": se o combo ja estiver ocupado por outro
// programa no SO, globalShortcut.register() so' retorna false, sem travar nada.
ipcMain.handle("concorde:register-shortcuts", (_event, { muteCombo, deafenCombo } = {}) => {
  globalShortcut.unregisterAll();
  const register = (combo, action) => {
    const accelerator = comboToAccelerator(combo);
    if (!accelerator) return;
    try {
      globalShortcut.register(accelerator, () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("concorde:global-shortcut", action);
        }
      });
    } catch (err) {
      console.warn(`Nao foi possivel registrar o atalho global "${accelerator}":`, err.message);
    }
  };
  register(muteCombo, "mute");
  register(deafenCombo, "deafen");
  return { ok: true };
});

// Zoom da pagina (Ctrl +/-/0, Ctrl+scroll) - o Electron so' vem com esses atalhos "de graca"
// atraves do MENU padrao (role "zoomIn"/"zoomOut"/"resetZoom"), que a gente removeu de
// proposito (ver Menu.setApplicationMenu(null) acima, junto com a barra de titulo customizada -
// DesktopTitleBar.jsx) - reimplementados aqui na mao. O renderer (DesktopTitleBar.jsx) escuta
// o teclado/scroll e so' chama esses 3 IPCs; quem de fato aplica o zoom e' o processo principal
// (webContents.setZoomLevel), que e' onde esse controle realmente vive no Electron. Passo de
// 0.5 "nivel" (~10% maior/menor por vez, escala do proprio Chromium), limitado entre -4 (bem
// pequeno) e 5 (bem grande) pra nunca sair de uma proporcao usavel.
const ZOOM_STEP = 0.5;
const ZOOM_MIN = -4;
const ZOOM_MAX = 5;

// webContents.setZoomLevel() reescala TODO o conteudo web, inclusive a nossa barra de titulo
// customizada (ela e' HTML normal, ver DesktopTitleBar.jsx/global.css) - mas os botoes de
// minimizar/maximizar/fechar NAO sao HTML nenhum, sao desenhados pelo proprio WINDOWS por cima
// (titleBarOverlay, ver createWindow acima), numa altura FIXA que o zoom nao alcanca sozinho.
// Sem isso, dar zoom deixava nossa barra menor/maior enquanto os botoes do Windows ficavam
// sempre do mesmo tamanho - iam desalinhando (reportado, com print). setTitleBarOverlay()
// deixa reajustar essa altura na hora, entao chamamos ela toda vez que o zoom muda, escalando
// pelo MESMO fator (getZoomFactor(), o multiplicador de verdade - 1 = 100%, 1.5 = 150% etc).
function applyZoomLevel(level) {
  if (!mainWindow) return;
  mainWindow.webContents.setZoomLevel(level);
  if (process.platform === "win32") {
    const factor = mainWindow.webContents.getZoomFactor();
    mainWindow.setTitleBarOverlay({ height: Math.round(TITLEBAR_HEIGHT * factor) });
  }
}

ipcMain.handle("concorde:zoom-in", () => {
  if (!mainWindow) return;
  applyZoomLevel(Math.min(ZOOM_MAX, mainWindow.webContents.getZoomLevel() + ZOOM_STEP));
});
ipcMain.handle("concorde:zoom-out", () => {
  if (!mainWindow) return;
  applyZoomLevel(Math.max(ZOOM_MIN, mainWindow.webContents.getZoomLevel() - ZOOM_STEP));
});
ipcMain.handle("concorde:zoom-reset", () => {
  applyZoomLevel(0);
});

// Abre o link de download (site) no navegador PADRAO do usuario, nao numa janela do proprio
// Concorde - faz mais sentido baixar um instalador novo por fora do app que esta desatualizado
// (e que a pessoa esta prestes a desinstalar).
ipcMain.handle("concorde:open-external", (_event, url) => {
  if (typeof url === "string" && /^https:\/\//.test(url)) shell.openExternal(url);
});

// Dispara o desinstalador do NSIS (gerado pelo electron-builder, ver "nsis" em package.json) -
// fica sempre do lado do .exe principal, nomeado "Uninstall <productName>.exe" por padrao. Abre
// a janela normal do desinstalador (o usuario ainda confirma por la', igual clicando em
// "Desinstalar" no Painel de Controle) e fecha o Concorde OFERECER pra o desinstalador poder
// apagar os arquivos sem o processo estar com eles abertos/travados.
ipcMain.handle("concorde:uninstall", () => {
  if (process.platform !== "win32" || !app.isPackaged) {
    return { ok: false, error: "Desinstalação automática só é suportada no instalador Windows." };
  }
  // app.getName() le o campo "name" do package.json ("concorde-frontend", tecnico) - o
  // desinstalador do NSIS e' nomeado com o "productName" ("Concorde"), que e' o mesmo nome do
  // proprio .exe principal (Concorde.exe) - usar o basename do exe da' o nome certo sem
  // precisar duplicar "Concorde" cru aqui.
  const installDir = path.dirname(app.getPath("exe"));
  const productName = path.basename(app.getPath("exe"), ".exe");
  const uninstallerPath = path.join(installDir, `Uninstall ${productName}.exe`);
  if (!fs.existsSync(uninstallerPath)) {
    return { ok: false, error: `Desinstalador não encontrado (${uninstallerPath}).` };
  }
  try {
    spawn(uninstallerPath, [], { detached: true, stdio: "ignore" }).unref();
  } catch (err) {
    return { ok: false, error: err.message };
  }
  app.quit();
  return { ok: true };
});

/** concorde://invite/<code>  ->  /invite/<code> dentro do React Router */
function routeDeepLink(url) {
  if (!mainWindow) return;
  const match = url.match(/^concorde:\/\/invite\/(.+)$/);
  if (match) {
    const code = match[1];
    const target = app.isPackaged
      ? `app://./index.html#/invite/${code}`
      : `${DEV_URL}/#/invite/${code}`;
    mainWindow.loadURL(target);
  }
}

// Registra o protocolo concorde:// no sistema operacional
if (!app.isDefaultProtocolClient(APP_PROTOCOL)) {
  app.setAsDefaultProtocolClient(APP_PROTOCOL);
}

// Garante uma unica instancia (necessario para deep link funcionar bem no Windows)
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    const deepLink = argv.find((arg) => arg.startsWith(`${APP_PROTOCOL}://`));
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
    if (deepLink) routeDeepLink(deepLink);
  });

  app.whenReady().then(() => {
    // Some de vez o menu padrao do Electron (File/Edit/View/Window/Help) - com titleBarStyle
    // "hidden" acima ele ja nao aparece na barra, mas isso tambem desativa os atalhos de
    // teclado que vinham junto com ele por padrao (Ctrl+R recarregar, Ctrl+Shift+I devtools
    // etc), que a gente nao quer expostos num app final pro usuario comum.
    Menu.setApplicationMenu(null);
    registerAppProtocol();
    const deepLink = process.argv.find((arg) => arg.startsWith(`${APP_PROTOCOL}://`));
    createWindow(deepLink);
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// Libera os atalhos globais do SO ao fechar - senao eles ficam "presos" ate' o processo do
// Electron morrer de vez, mesmo com a janela ja fechada.
app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});
