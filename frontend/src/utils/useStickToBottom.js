import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

const NEAR_BOTTOM_PX = 80;

/**
 * Mantém o chat colado no fim: ao abrir o canal, quando chegam mensagens e quando o conteúdo cresce depois
 * (imagens, prévias de link, players de áudio carregando). Se a pessoa rolar pra cima pra ler, solta.
 * resetKey: troca de canal/DM -> volta a grudar no fim.
 */
export function useStickToBottom(resetKey, messages) {
  const containerRef = useRef(null);
  const stuckRef = useRef(true);
  const programmaticRef = useRef(false);

  const scrollToEnd = useCallback((smooth = false) => {
    const el = containerRef.current;
    if (!el) return;
    programmaticRef.current = true;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    // a rolagem suave dispara vários scrolls; não deixa eles "soltarem" o chat
    setTimeout(() => (programmaticRef.current = false), smooth ? 450 : 60);
  }, []);

  const onScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el || programmaticRef.current) return;
    stuckRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
  }, []);

  /** Pra pular pra uma mensagem antiga sem o chat puxar de volta pro fim. */
  const release = useCallback(() => {
    stuckRef.current = false;
    programmaticRef.current = false;
  }, []);

  // Canal novo: gruda no fim.
  useLayoutEffect(() => {
    stuckRef.current = true;
  }, [resetKey]);

  // Mensagens novas: se estava no fim, continua no fim (primeira carga instantânea, depois suave).
  const loadedKeyRef = useRef(null);
  useLayoutEffect(() => {
    if (!stuckRef.current || !messages?.length) return;
    const first = loadedKeyRef.current !== resetKey;
    loadedKeyRef.current = resetKey;
    scrollToEnd(!first);
  }, [messages, resetKey, scrollToEnd]);

  // Conteúdo que cresce depois (imagem carregou, prévia apareceu): reajusta se estava no fim.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(() => {
      if (stuckRef.current) scrollToEnd(false);
    });
    Array.from(el.children).forEach((c) => ro.observe(c));
    ro.observe(el);
    const mo = new MutationObserver(() => {
      ro.disconnect();
      ro.observe(el);
      Array.from(el.children).forEach((c) => ro.observe(c));
    });
    mo.observe(el, { childList: true });
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, [resetKey, scrollToEnd]);

  return { containerRef, onScroll, release, scrollToEnd };
}
