import { useEffect, useLayoutEffect, useRef, useState } from "react";

const SHOW_DELAY_MS = 450;
const GAP = 8;
const EDGE = 8;

/**
 * Tooltip do Concorde no estilo do tema, no lugar do tooltip nativo do navegador.
 *
 * Funciona com qualquer `title="..."` do app, sem mexer nos componentes: ao passar o mouse,
 * o texto vai pra `data-tooltip` (e some o `title`, senão o navegador mostraria o dele também)
 * e aparece um balão estilizado. Se o elemento não tem texto visível, o texto vira `aria-label`
 * pra continuar acessível pra leitores de tela.
 */
export default function ThemedTooltip() {
  const [tip, setTip] = useState(null);
  const [pos, setPos] = useState(null);
  const bubbleRef = useRef(null);

  useEffect(() => {
    let current = null;
    let timer = null;

    function adopt(el) {
      const title = el.getAttribute("title");
      if (title != null) {
        if (title.trim()) {
          el.setAttribute("data-tooltip", title);
          if (!el.hasAttribute("aria-label") && !el.textContent.trim()) el.setAttribute("aria-label", title);
        }
        el.removeAttribute("title");
      }
      return el.getAttribute("data-tooltip");
    }

    function hide() {
      clearTimeout(timer);
      timer = null;
      current = null;
      setTip(null);
      setPos(null);
    }

    function onOver(e) {
      const el = e.target instanceof Element ? e.target.closest("[title], [data-tooltip]") : null;
      if (!el) return;
      // o título pode ter mudado desde a última vez (React reescreve o atributo)
      const text = adopt(el);
      if (el === current) return;
      clearTimeout(timer);
      setTip(null);
      setPos(null);
      current = el;
      if (!text) return;
      timer = setTimeout(() => {
        if (current !== el || !el.isConnected) return;
        setTip({ text: el.getAttribute("data-tooltip") || text, rect: el.getBoundingClientRect() });
      }, SHOW_DELAY_MS);
    }

    function onOut(e) {
      if (!current) return;
      const to = e.relatedTarget;
      if (to instanceof Node && current.contains(to)) return;
      hide();
    }

    document.addEventListener("pointerover", onOver, true);
    document.addEventListener("pointerout", onOut, true);
    document.addEventListener("pointerdown", hide, true);
    document.addEventListener("keydown", hide, true);
    document.addEventListener("wheel", hide, { capture: true, passive: true });
    window.addEventListener("scroll", hide, true);
    window.addEventListener("blur", hide);
    window.addEventListener("resize", hide);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("pointerover", onOver, true);
      document.removeEventListener("pointerout", onOut, true);
      document.removeEventListener("pointerdown", hide, true);
      document.removeEventListener("keydown", hide, true);
      document.removeEventListener("wheel", hide, { capture: true });
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("blur", hide);
      window.removeEventListener("resize", hide);
    };
  }, []);

  // mede o balão e posiciona: em cima do elemento (ou embaixo, se não couber), sem sair da tela
  useLayoutEffect(() => {
    if (!tip || !bubbleRef.current) return;
    const { width, height } = bubbleRef.current.getBoundingClientRect();
    const { rect } = tip;
    const titleBar = document.documentElement.dataset.desktopTitlebar === "true" ? 38 : 0;
    let top = rect.top - height - GAP;
    let placement = "top";
    if (top < titleBar + EDGE) {
      top = rect.bottom + GAP;
      placement = "bottom";
    }
    const center = rect.left + rect.width / 2;
    const left = Math.min(Math.max(center - width / 2, EDGE), window.innerWidth - width - EDGE);
    const arrow = Math.min(Math.max(center - left, 12), width - 12);
    setPos({ top, left, placement, arrow });
  }, [tip]);

  if (!tip) return null;

  return (
    <div
      ref={bubbleRef}
      className={"themed-tooltip" + (pos ? ` themed-tooltip-${pos.placement} visible` : "")}
      style={pos ? { top: pos.top, left: pos.left, "--tooltip-arrow": `${pos.arrow}px` } : { top: -9999, left: -9999 }}
      role="tooltip"
    >
      {tip.text}
    </div>
  );
}
