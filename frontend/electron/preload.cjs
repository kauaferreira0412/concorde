const { contextBridge, ipcRenderer } = require("electron");

/**
 * Ponte segura entre o processo principal (Node/Electron, tem acesso ao SO) e o renderer
 * (React, roda como pagina web comum, sem Node) - com contextIsolation ligado (ver main.cjs)
 * o renderer NAO enxerga isso a nao ser pelo que a gente expor explicitamente aqui.
 *
 * "window.concordeDesktop" so existe quando a pagina esta rodando DENTRO do app Electron -
 * no navegador normal (VoiceCallContext.jsx, VoiceChannel.jsx) esse objeto e' undefined, e o
 * app cai pro fluxo padrao (getDisplayMedia do navegador) sem nenhuma mudanca de comportamento.
 */
contextBridge.exposeInMainWorld("concordeDesktop", {
  /** Lista telas e janelas disponiveis pra compartilhar, com miniatura (dataURL). */
  listScreenSources: () => ipcRenderer.invoke("concorde:list-screen-sources"),

  /**
   * Audio isolado de UMA janela (so' Windows - process-audio-capture, ver main.cjs) - usado
   * quando o usuario compartilha uma Janela especifica. "hwnd" vem do id da fonte escolhida
   * no ScreenSharePicker ("window:<hwnd>:0"). Retorna {ok:boolean, error?:string} - se
   * ok=false, quem chamou publica so' o video, sem travar o compartilhamento.
   */
  startWindowAudioCapture: (hwnd) => ipcRenderer.invoke("concorde:start-window-audio", hwnd),
  stopWindowAudioCapture: () => ipcRenderer.invoke("concorde:stop-window-audio"),
  /** cb({buffer: Float32Array, channels, sampleRate}) pra cada pedaco de audio PCM. */
  onWindowAudioChunk: (cb) => {
    const listener = (_event, audioData) => cb(audioData);
    ipcRenderer.on("concorde:window-audio-chunk", listener);
    return () => ipcRenderer.removeListener("concorde:window-audio-chunk", listener);
  },

  /** Versao instalada (package.json "version", ver electron-builder) - ver UpdateRequiredGate.jsx. */
  getAppVersion: () => ipcRenderer.invoke("concorde:get-app-version"),
  /** Abre um link no navegador padrao do SO (nao dentro do proprio Concorde). */
  openExternal: (url) => ipcRenderer.invoke("concorde:open-external", url),
  /** Dispara o desinstalador do Windows e fecha o app. {ok:boolean, error?:string} */
  uninstall: () => ipcRenderer.invoke("concorde:uninstall"),
});
