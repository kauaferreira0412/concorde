import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Janela separada so' com as cameras da call (Document Picture-in-Picture - API do Chromium,
 * suportada em Chrome/Edge/Electron, que ja' e' tudo que esse app roda em cima) - pedido
 * explicito do usuario: poder ver as cameras maiores, lado a lado, numa janela a parte, sem
 * perder o resto da call escondida atras dela. Ao contrario de um "window.open()" comum, essa
 * janela roda no MESMO contexto JS da pagina principal - o video de cada camera continua
 * tocando sem interrupcao nenhuma ao "atravessar" pra ela (e' literalmente pra isso que essa
 * API existe).
 *
 * Fica isolada num componente proprio (em vez de tudo dentro de VoiceChannel.jsx) porque tem um
 * ciclo de vida bem diferente do resto: precisa pedir a janela pro navegador de forma
 * assincrona ANTES de existir um lugar pra desenhar qualquer coisa (ver useEffect abaixo).
 *
 * "children" e' desenhado DENTRO da janela nova via createPortal - continua sendo React de
 * verdade (mesmos componentes, mesmo estado), so' o "onde na tela" que muda.
 */
export default function CameraPipWindow({ onClose, onError, children }) {
  const [pipWindow, setPipWindow] = useState(null);

  useEffect(() => {
    if (!("documentPictureInPicture" in window)) {
      // Navegador sem suporte (Firefox/Safari, ou Chromium antigo demais) - o botao ja' nem
      // deveria aparecer nesse caso (ver cameraPipSupported em VoiceChannel.jsx), mas se
      // chegar aqui mesmo assim, avisa com uma mensagem de verdade em vez de so' fechar
      // silenciosamente (antes disso: "clico, pisca e nao abre", sem nenhuma pista do porque).
      onError?.("Seu navegador não suporta abrir as câmeras numa janela separada.");
      onClose();
      return;
    }
    let cancelled = false;
    let win = null;
    window.documentPictureInPicture
      .requestWindow({ width: 900, height: 560 })
      .then((w) => {
        if (cancelled) {
          w.close();
          return;
        }
        win = w;
        w.document.title = "Concorde — Câmeras";
        // A janela nova comeca com um document VAZIO, sem nenhum CSS - clona toda folha de
        // estilo (tanto <link> quanto <style>) da pagina principal pra dentro dela, assim as
        // MESMAS classes (.camera-tile, cores do tema etc) valem la' tambem.
        document.querySelectorAll('link[rel="stylesheet"], style').forEach((node) => {
          w.document.head.appendChild(node.cloneNode(true));
        });
        w.document.body.className = "camera-pip-body";
        // Se a pessoa fechar a janela pelo X dela mesma (nao pelo nosso botao "voltar ao
        // normal"), "pagehide" avisa a gente pra voltar sozinho pra visualizacao normal -
        // senao o app ficava achando que a janela ainda existe.
        w.addEventListener("pagehide", () => onClose(), { once: true });
        setPipWindow(w);
      })
      .catch((err) => {
        // O pedido em si falhou (ex: chamado fora de um clique de verdade - a API exige um
        // "gesto do usuario" recente - ou o navegador/Electron nao tem o recurso ligado) -
        // mostra o motivo de verdade em vez de so' fechar silenciosamente.
        onError?.("Não foi possível abrir a janela das câmeras: " + (err?.message || err));
        onClose();
      });
    return () => {
      cancelled = true;
      win?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!pipWindow) return null;
  return createPortal(children, pipWindow.document.body);
}
