import { useEffect, useState } from "react";

/**
 * Se a janela do Concorde esta em foco/visivel AGORA (aba do navegador na frente, ou janela do
 * app desktop em primeiro plano) - "focus"/"blur" cobre trocar de janela (inclusive no app
 * Electron, que e' uma BrowserWindow comum pra esses eventos), "visibilitychange" cobre trocar
 * de aba/minimizar. Usado pra pausar a PROPRIA previa de tela compartilhada quando o usuario
 * esta mexendo em outra coisa (ver ScreenShareTile em VoiceChannel.jsx, pedido explicito do
 * usuario: economizar recurso de processamento decodificando/renderizando um video que ninguem
 * esta olhando).
 */
export function useAppFocused() {
  const [focused, setFocused] = useState(() => document.hasFocus() && document.visibilityState === "visible");

  useEffect(() => {
    function update() {
      setFocused(document.hasFocus() && document.visibilityState === "visible");
    }
    window.addEventListener("focus", update);
    window.addEventListener("blur", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.removeEventListener("focus", update);
      window.removeEventListener("blur", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);

  return focused;
}
