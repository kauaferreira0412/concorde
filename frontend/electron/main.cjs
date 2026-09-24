const { app, BrowserWindow, protocol, ipcMain, desktopCapturer, net, shell, globalShortcut, Menu, clipboard, nativeImage } = require("electron");
const path = require("path");
const { pathToFileURL } = require("url");
const { spawn } = require("child_process");
const fs = require("fs");

const APP_PROTOCOL = "concorde";
const DEV_URL = "http://localhost:5173";

if (process.platform === "win32") {
  app.setAppUserModelId("com.concorde.app");
}

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

protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
  },
]);

let mainWindow;

const TITLEBAR_HEIGHT = 38;

function createWindow(deepLinkUrl) {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: "Concorde",
    backgroundColor: "#050816",
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#070b1a",
      symbolColor: "#f4f6fd",
      height: TITLEBAR_HEIGHT,
    },
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  const startUrl = app.isPackaged ? "app://./index.html" : DEV_URL;

  mainWindow.loadURL(startUrl);

  if (deepLinkUrl) {
    routeDeepLink(deepLinkUrl);
  }
}

let cameraPipWindow = null;

function createCameraPipWindow(channelId, appToken) {
  if (cameraPipWindow && !cameraPipWindow.isDestroyed()) {
    cameraPipWindow.focus();
    return;
  }
  cameraPipWindow = new BrowserWindow({
    width: 900,
    height: 560,
    title: "Concorde — Câmeras",
    backgroundColor: "#050816",
    titleBarStyle: "hidden",
    titleBarOverlay: { color: "#070b1a", symbolColor: "#f4f6fd", height: TITLEBAR_HEIGHT },
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });
  const hash = `#/camera-pip/${channelId}?token=${encodeURIComponent(appToken)}`;
  const target = app.isPackaged ? `app://./index.html${hash}` : `${DEV_URL}/${hash}`;
  cameraPipWindow.loadURL(target);
  cameraPipWindow.on("closed", () => {
    cameraPipWindow = null;
  });
}

ipcMain.handle("concorde:open-camera-pip", (_event, { channelId, token }) => {
  createCameraPipWindow(channelId, token);
});

function registerAppProtocol() {
  protocol.handle("app", (request) => {
    const url = new URL(request.url);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === "" || pathname === "/") pathname = "/index.html";
    const filePath = path.normalize(path.join(__dirname, "../dist", pathname));
    return net.fetch(pathToFileURL(filePath).toString());
  });
}

ipcMain.handle("concorde:list-screen-sources", async () => {
  const sources = await desktopCapturer.getSources({
    types: ["screen", "window"],
    thumbnailSize: { width: 320, height: 180 },
    fetchWindowIcons: true,
  });
  return sources.map((s) => ({
    id: s.id,
    name: s.name,
    type: s.id.startsWith("screen:") ? "screen" : "window",
    thumbnailDataUrl: s.thumbnail.isEmpty() ? null : s.thumbnail.toDataURL(),
    iconDataUrl: s.appIcon && !s.appIcon.isEmpty() ? s.appIcon.toDataURL() : null,
  }));
});

ipcMain.handle("concorde:start-window-audio", async (event, hwnd) => {
  if (!audioCapture || !getPidForHwnd) return { ok: false, error: "Modulo de audio por janela indisponivel" };
  try {
    const permission = await audioCapture.requestPermission();
    if (permission.status !== "authorized") {
      return { ok: false, error: "Permissao de captura de audio negada pelo Windows" };
    }
    const pid = getPidForHwnd(hwnd);
    if (!pid) return { ok: false, error: "Nao foi possivel identificar o processo dessa janela" };
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

ipcMain.handle("concorde:start-system-audio-excluding-self", async () => {
  if (!audioCapture) return { ok: false, error: "Modulo de audio por processo indisponivel" };
  if (typeof audioCapture.startCaptureExcludingSelf !== "function") {
    return { ok: false, error: "Versão instalada da lib de áudio não suporta o modo excluir (patch não aplicado?)" };
  }
  try {
    audioCapture.stopCapture();
    await new Promise((resolve) => setTimeout(resolve, 300));

    const permission = await audioCapture.requestPermission();
    if (permission.status !== "authorized") {
      return { ok: false, error: "Permissao de captura de audio negada pelo Windows" };
    }
    const started = audioCapture.startCaptureExcludingSelf(process.pid, (audioData) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("concorde:system-audio-chunk", audioData);
      }
    });
    if (!started) {
      return { ok: false, error: "Não foi possível iniciar a captura de áudio do sistema - tente de novo." };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle("concorde:stop-system-audio-excluding-self", () => {
  if (audioCapture) audioCapture.stopCapture();
});

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

const ZOOM_STEP = 0.5;
const ZOOM_MIN = -4;
const ZOOM_MAX = 5;

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

ipcMain.handle("concorde:open-external", (_event, url) => {
  if (typeof url === "string" && /^https:\/\//.test(url)) shell.openExternal(url);
});

ipcMain.handle("concorde:download-image", (_event, url) => {
  if (typeof url !== "string" || !/^https:\/\//.test(url) || !mainWindow) {
    return { ok: false, error: "URL inválida" };
  }
  try {
    mainWindow.webContents.session.downloadURL(url);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
});

ipcMain.handle("concorde:copy-image", async (_event, url) => {
  if (typeof url !== "string" || !/^https:\/\//.test(url)) {
    return { ok: false, error: "URL inválida" };
  }
  try {
    const response = await net.fetch(url);
    if (!response.ok) {
      return { ok: false, error: `HTTP ${response.status}` };
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    const image = nativeImage.createFromBuffer(buffer);
    if (image.isEmpty()) {
      return { ok: false, error: "Formato de imagem não suportado" };
    }
    clipboard.writeImage(image);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
});

ipcMain.handle("concorde:uninstall", () => {
  if (process.platform !== "win32" || !app.isPackaged) {
    return { ok: false, error: "Desinstalação automática só é suportada no instalador Windows." };
  }
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

if (!app.isDefaultProtocolClient(APP_PROTOCOL)) {
  app.setAsDefaultProtocolClient(APP_PROTOCOL);
}

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
    Menu.setApplicationMenu(null);
    registerAppProtocol();
    const deepLink = process.argv.find((arg) => arg.startsWith(`${APP_PROTOCOL}://`));
    createWindow(deepLink);
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  if (audioCapture) audioCapture.stopCapture();
});
