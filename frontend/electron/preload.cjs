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
});
