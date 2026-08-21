import { useState } from "react";
import { XIcon } from "./icons.jsx";

const DISMISS_KEY = "potatoMafiaBannerDismissed";

/**
 * Cantinho comemorativo fixo - esse projeto inteiro e' um presente de aniversario pro grupo
 * "Potato Mafia" (pedido explicito do usuario), entao so' aparece quando o servidor selecionado
 * se chama isso (ver ServerPage.jsx). So' CSS (nenhuma imagem/gif pesado, ver global.css) -
 * flutua e balança suavemente, nada de JS rodando por frame.
 */
export default function PotatoMafiaBanner() {
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem(DISMISS_KEY) === "true");

  if (dismissed) return null;

  return (
    <div className="potato-mafia-banner">
      <span className="potato-mafia-emoji">🥔</span>
      <div className="potato-mafia-text">
        <strong>Potato Mafia</strong>
        <span>Parabéns! 🎉</span>
      </div>
      <button
        type="button"
        className="potato-mafia-close"
        title="Fechar"
        onClick={() => {
          sessionStorage.setItem(DISMISS_KEY, "true");
          setDismissed(true);
        }}
      >
        <XIcon size={13} />
      </button>
    </div>
  );
}
