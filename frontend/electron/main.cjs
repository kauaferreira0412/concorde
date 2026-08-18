const { app, BrowserWindow, protocol, ipcMain, desktopCapturer } = require("electron");
const path = require("path");

const APP_PROTOCOL = "concorde";
const DEV_URL = "http://localhost:5173";

let mainWindow;

function createWindow(deepLinkUrl) {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: "Concorde",
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

  const startUrl = app.isPackaged
    ? `file://${path.join(__dirname, "../dist/index.html")}`
    : DEV_URL;

  mainWindow.loadURL(startUrl);

  if (deepLinkUrl) {
    routeDeepLink(deepLinkUrl);
  }
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

/** concorde://invite/<code>  ->  /invite/<code> dentro do React Router */
function routeDeepLink(url) {
  if (!mainWindow) return;
  const match = url.match(/^concorde:\/\/invite\/(.+)$/);
  if (match) {
    const code = match[1];
    const target = app.isPackaged
      ? `file://${path.join(__dirname, "../dist/index.html")}#/invite/${code}`
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
    const deepLink = process.argv.find((arg) => arg.startsWith(`${APP_PROTOCOL}://`));
    createWindow(deepLink);
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
