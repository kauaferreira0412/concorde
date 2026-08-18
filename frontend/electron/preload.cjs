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
   * Audio isolado de UMA janela (so' Windows - ver electron/native/window-audio-capture) -
   * usado quando o usuario compartilha uma Janela especifica (Tela Inteira continua usando
   * getUserMedia normal, audio do sistema todo). "hwnd" vem do id da fonte escolhida no
   * ScreenSharePicker ("window:<hwnd>:0"). Retorna {ok:boolean, error?:string} - se ok=false
   * (modulo indisponivel, API do Windows indisponivel nessa build, etc.) quem chamou publica
   * so' o video, sem travar o compartilhamento.
   */
  startWindowAudioCapture: (hwnd) => ipcRenderer.invoke("concorde:start-window-audio", hwnd),
  stopWindowAudioCapture: () => ipcRenderer.invoke("concorde:stop-window-audio"),
  /** cb(chunkBuffer) pra cada pedaco de audio PCM (float32, 48kHz, estereo, intercalado). */
  onWindowAudioChunk: (cb) => {
    const listener = (_event, chunk) => cb(chunk);
    ipcRenderer.on("concorde:window-audio-chunk", listener);
    return () => ipcRenderer.removeListener("concorde:window-audio-chunk", listener);
  },
  /** cb(message) quando a captura de audio da janela falha (ver ReportError no addon nativo). */
  onWindowAudioError: (cb) => {
    const listener = (_event, message) => cb(message);
    ipcRenderer.on("concorde:window-audio-error", listener);
    return () => ipcRenderer.removeListener("concorde:window-audio-error", listener);
  },
});
