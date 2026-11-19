import { useWindowDimensions } from "react-native";

/**
 * Tamanho da tela pro layout: no iPad (ou celular deitado bem largo) o app vira "desktop":
 * abas na lateral, lista + conversa lado a lado e grades com mais colunas.
 */
export function useLayout() {
  const { width, height } = useWindowDimensions();
  const wide = width >= 700;
  return {
    width,
    height,
    wide,
    landscape: width > height,
    /** colunas pra uma grade com cards de pelo menos `min` px */
    columns: (min = 170, max = 6) => Math.max(2, Math.min(max, Math.floor((width - 40) / min))),
    /** largura da coluna da lista nas telas divididas */
    sideWidth: Math.min(360, Math.max(280, Math.round(width * 0.32))),
  };
}

/** Conteúdo de leitura (perfil, configurações) não estica demais no iPad. */
export const READABLE_WIDTH = 720;
