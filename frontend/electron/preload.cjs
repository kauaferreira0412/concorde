const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("concordeDesktop", {
  listScreenSources: () => ipcRenderer.invoke("concorde:list-screen-sources"),

  startWindowAudioCapture: (hwnd) => ipcRenderer.invoke("concorde:start-window-audio", hwnd),
  stopWindowAudioCapture: () => ipcRenderer.invoke("concorde:stop-window-audio"),
  onWindowAudioChunk: (cb) => {
    const listener = (_event, audioData) => cb(audioData);
    ipcRenderer.on("concorde:window-audio-chunk", listener);
    return () => ipcRenderer.removeListener("concorde:window-audio-chunk", listener);
  },

  startSystemAudioExcludingSelf: () => ipcRenderer.invoke("concorde:start-system-audio-excluding-self"),
  stopSystemAudioExcludingSelf: () => ipcRenderer.invoke("concorde:stop-system-audio-excluding-self"),
  onSystemAudioChunk: (cb) => {
    const listener = (_event, audioData) => cb(audioData);
    ipcRenderer.on("concorde:system-audio-chunk", listener);
    return () => ipcRenderer.removeListener("concorde:system-audio-chunk", listener);
  },

  openExternal: (url) => ipcRenderer.invoke("concorde:open-external", url),

  downloadImage: (url) => ipcRenderer.invoke("concorde:download-image", url),
  copyImage: (url) => ipcRenderer.invoke("concorde:copy-image", url),
  uninstall: () => ipcRenderer.invoke("concorde:uninstall"),

  registerGlobalShortcuts: (muteCombo, deafenCombo) =>
    ipcRenderer.invoke("concorde:register-shortcuts", { muteCombo, deafenCombo }),
  onGlobalShortcut: (cb) => {
    const listener = (_event, action) => cb(action);
    ipcRenderer.on("concorde:global-shortcut", listener);
    return () => ipcRenderer.removeListener("concorde:global-shortcut", listener);
  },

  zoomIn: () => ipcRenderer.invoke("concorde:zoom-in"),
  zoomOut: () => ipcRenderer.invoke("concorde:zoom-out"),
  zoomReset: () => ipcRenderer.invoke("concorde:zoom-reset"),

  openCameraPip: (channelId, token) => ipcRenderer.invoke("concorde:open-camera-pip", { channelId, token }),
});
