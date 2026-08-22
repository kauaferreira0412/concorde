import { useEffect } from "react";

/**
 * Barra de titulo customizada do app DESKTOP (Electron) - substitui a barra padrao feia do
 * Windows (menu File/Edit/View/Window/Help, botoes brancos quadrados) por algo no estilo do
 * app (ver main.cjs: titleBarStyle "hidden" tira a barra nativa inteira). Os botoes de
 * minimizar/maximizar/fechar continuam sendo desenhados pelo proprio WINDOWS por cima (nao
 * por nos - ver "titleBarOverlay" em main.cjs), entao esse componente so' cuida do espaco a
 * esquerda (icone + nome do app), da area "arrastavel" pra mover a janela, e (ja que e' o
 * lugar central que sempre esta montado no app desktop) dos atalhos de ZOOM que sumiram
 * junto com o menu padrao removido (Ctrl +/-/0, Ctrl+scroll - ver useEffect abaixo).
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

  // Zoom (Ctrl +/-/0, Ctrl+scroll) - o navegador normal ja faz isso sozinho (zoom da propria
  // pagina web), mas dentro do Electron sem o menu padrao (removido de proposito, ver main.cjs)
  // esses atalhos somem junto - reimplementados aqui na mao, chamando de volta o processo
  // principal (ver preload.cjs/main.cjs), que e' quem de fato controla o zoom da janela.
  useEffect(() => {
    function handleKeyDown(e) {
      if (!e.ctrlKey) return;
      // "+"/"=" no mesmo lugar do teclado (com/sem Shift) - cobre os dois; "-" cobre o "-" do
      // teclado numerico tambem (o navegador ja normaliza pra esse mesmo e.key).
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        window.concordeDesktop.zoomIn();
      } else if (e.key === "-") {
        e.preventDefault();
        window.concordeDesktop.zoomOut();
      } else if (e.key === "0") {
        e.preventDefault();
        window.concordeDesktop.zoomReset();
      }
    }
    // "wheel" precisa de { passive: false } pra "e.preventDefault()" ter efeito (senao o
    // navegador ja trata o listener como "so' vou ler, nao vou bloquear" e rola a pagina de
    // qualquer jeito por cima do zoom).
    function handleWheel(e) {
      if (!e.ctrlKey) return;
      e.preventDefault();
      if (e.deltaY < 0) window.concordeDesktop.zoomIn();
      else if (e.deltaY > 0) window.concordeDesktop.zoomOut();
    }
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("wheel", handleWheel);
    };
  }, []);

  return (
    <div className="desktop-titlebar">
      <img src="/favicon-32.png" alt="" className="desktop-titlebar-icon" />
      <span className="desktop-titlebar-title">Concorde</span>
    </div>
  );
}
