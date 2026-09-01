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

  /**
   * Audio de Tela Inteira "sem o proprio Concorde" (so' Windows - ver main.cjs) - UMA UNICA
   * sessao de captura nativa (WASAPI Process Loopback em modo EXCLUDE, patch aplicado em
   * process-audio-capture via patch-package) pegando o sistema inteiro, menos o proprio
   * Concorde. Retorna {ok:boolean, error?:string}.
   */
  startSystemAudioExcludingSelf: () => ipcRenderer.invoke("concorde:start-system-audio-excluding-self"),
  stopSystemAudioExcludingSelf: () => ipcRenderer.invoke("concorde:stop-system-audio-excluding-self"),
  /** cb({buffer: Float32Array, channels, sampleRate}) pra cada pedaco de audio PCM. */
  onSystemAudioChunk: (cb) => {
    const listener = (_event, audioData) => cb(audioData);
    ipcRenderer.on("concorde:system-audio-chunk", listener);
    return () => ipcRenderer.removeListener("concorde:system-audio-chunk", listener);
  },

  /** Abre um link no navegador padrao do SO (nao dentro do proprio Concorde). */
  openExternal: (url) => ipcRenderer.invoke("concorde:open-external", url),
  /** Dispara o desinstalador do Windows e fecha o app. {ok:boolean, error?:string} */
  uninstall: () => ipcRenderer.invoke("concorde:uninstall"),

  /**
   * Atalhos GLOBAIS de mutar/ensurdecer - registrados no SISTEMA OPERACIONAL (globalShortcut,
   * ver main.cjs), continuam funcionando mesmo com o Concorde em segundo plano (diferente de um
   * "keydown" comum, que so' dispara com a janela em foco - era exatamente o bug relatado).
   * Chamado na entrada do app e toda vez que o usuario muda o atalho em Configuracoes (ver
   * VoiceCallContext.jsx/SettingsModal.jsx). Formato "ctrl+shift+m" (ver keyboardShortcuts.js).
   */
  registerGlobalShortcuts: (muteCombo, deafenCombo) =>
    ipcRenderer.invoke("concorde:register-shortcuts", { muteCombo, deafenCombo }),
  /** cb("mute" | "deafen") toda vez que o atalho global correspondente e' disparado. */
  onGlobalShortcut: (cb) => {
    const listener = (_event, action) => cb(action);
    ipcRenderer.on("concorde:global-shortcut", listener);
    return () => ipcRenderer.removeListener("concorde:global-shortcut", listener);
  },

  /**
   * Zoom da pagina (Ctrl +/-/0, Ctrl+scroll) - sem o menu padrao do Electron (removido de
   * proposito, ver main.cjs/DesktopTitleBar.jsx) esses atalhos pararam de funcionar sozinhos.
   * Quem escuta teclado/scroll e' o React (DesktopTitleBar.jsx); quem aplica de verdade e' o
   * processo principal (webContents.setZoomLevel, ver main.cjs).
   */
  zoomIn: () => ipcRenderer.invoke("concorde:zoom-in"),
  zoomOut: () => ipcRenderer.invoke("concorde:zoom-out"),
  zoomReset: () => ipcRenderer.invoke("concorde:zoom-reset"),

  /**
   * Janela SEPARADA de verdade das cameras (nao Document Picture-in-Picture, que nao funciona
   * dentro do Electron - ver CameraPipPage.jsx pro motivo). Abre uma BrowserWindow nova que
   * entra na MESMA sala do LiveKit por conta propria, so' pra assistir - "token" aqui e' o
   * token de LOGIN do app (nao o do LiveKit), pra essa janela nova (processo separado, sem
   * sessionStorage compartilhado) conseguir se autenticar sozinha. So' uma janela de cada vez
   * (clicar de novo so' foca a que ja esta aberta).
   */
  openCameraPip: (channelId, token) => ipcRenderer.invoke("concorde:open-camera-pip", { channelId, token }),
});
