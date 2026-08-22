import { useEffect } from "react";

/**
 * Barra de titulo customizada do app DESKTOP (Electron) - substitui a barra padrao feia do
 * Windows (menu File/Edit/View/Window/Help, botoes brancos quadrados) por algo no estilo do
 * app (ver main.cjs: titleBarStyle "hidden" tira a barra nativa inteira). Os botoes de
 * minimizar/maximizar/fechar continuam sendo desenhados pelo proprio WINDOWS por cima (nao
 * por nos - ver "titleBarOverlay" em main.cjs), entao esse componente so' cuida do espaco a
 * esquerda (icone + nome do app) e da area "arrastavel" pra mover a janela.
 *
 * So' renderizado quando window.concordeDesktop existe (ver App.jsx) - no navegador normal a
 * pagina usa a barra de titulo de verdade do proprio navegador, sem nenhuma mudanca.
 */
export default function DesktopTitleBar() {
  // Avisa o CSS global (ver global.css) que precisa reservar esse espaco no topo da pagina -
  // classe/atributo em vez de inline style aqui porque VARIOS seletores dependem disso (o
  // #root inteiro empurra pra baixo, ver "html[data-desktop-titlebar] #root").
  useEffect(() => {
    document.documentElement.setAttribute("data-desktop-titlebar", "true");
    return () => document.documentElement.removeAttribute("data-desktop-titlebar");
  }, []);

  return (
    <div className="desktop-titlebar">
      <img src="/favicon-32.png" alt="" className="desktop-titlebar-icon" />
      <span className="desktop-titlebar-title">Concorde</span>
    </div>
  );
}
