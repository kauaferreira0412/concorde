import { useEffect, useState } from "react";
import api from "../api/client";
import { AlertTriangleIcon, DownloadIcon, TrashIcon } from "./icons.jsx";
import ConfirmModal from "./ConfirmModal.jsx";

// window.concordeDesktop so' existe dentro do app Electron (ver electron/preload.cjs) - no
// navegador normal esse gate nunca bloqueia nada (sempre teria a versao mais nova, e' o
// proprio site).
const isElectronDesktop = typeof window !== "undefined" && !!window.concordeDesktop;

// Gravado DENTRO do bundle no momento do build (so' o build que vai pro instalador leva isso -
// ver VITE_APP_BUILD_ID em scripts/package-desktop.mjs), nao em runtime - e' "de qual
// publicacao esse .exe especifico veio". No navegador normal (nao e' esse build) fica
// undefined, por isso o gate acima nem chega a rodar essa checagem.
const installedBuildId = import.meta.env.VITE_APP_BUILD_ID || null;

/**
 * Bloqueia TUDO (nem chega na tela de login) se o instalador que gerou esse app desktop nao
 * for o MAIS RECENTE publicado (ver DesktopVersionController/app.desktop no backend) - pedido
 * explicito do usuario: a versao exigida e' SEMPRE a ultima publicada, qualquer uma anterior e'
 * descontinuada automaticamente assim que uma nova e' gerada (ver package-desktop.mjs), sem
 * precisar configurar nada na mao a cada publicacao. A tela mostra o build instalado, o mais
 * recente exigido, um botao pra abrir o site (baixar o instalador novo) e um pra desinstalar a
 * versao atual (pra depois poder instalar a nova sem conflito).
 *
 * So' verifica dentro do app Electron - no navegador (isElectronDesktop false) sempre libera
 * na hora. Se a propria checagem falhar (backend fora do ar, sem rede) OU se esse build nao
 * tiver um build id embutido (rodando via "npm run electron" direto em dev, por exemplo),
 * libera tambem (falha aberta) - nao da pra comparar, entao nao bloqueia.
 */
export default function UpdateRequiredGate({ children }) {
  const [status, setStatus] = useState(isElectronDesktop && installedBuildId ? "checking" : "ok"); // "checking" | "ok" | "outdated"
  const [info, setInfo] = useState(null); // { latestBuildId, downloadUrl }
  const [showUninstallConfirm, setShowUninstallConfirm] = useState(false);
  const [uninstallError, setUninstallError] = useState("");

  useEffect(() => {
    if (status !== "checking") return;
    let cancelled = false;
    api
      .get("/api/desktop/version")
      .then(({ data }) => {
        if (cancelled) return;
        if (data.latestBuildId && data.latestBuildId !== installedBuildId) {
          setInfo({ latestBuildId: data.latestBuildId, downloadUrl: data.downloadUrl });
          setStatus("outdated");
        } else {
          setStatus("ok");
        }
      })
      .catch((err) => {
        console.warn("Não foi possível checar a versão do app desktop (seguindo sem bloquear):", err);
        if (!cancelled) setStatus("ok");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  if (status === "checking") {
    // So' um instante, nem chega a piscar em condicoes normais - sem spinner pra nao complicar.
    return <div className="auth-screen" />;
  }

  if (status !== "outdated") return children;

  function handleUninstall() {
    setUninstallError("");
    window.concordeDesktop.uninstall().then((result) => {
      if (!result?.ok) setUninstallError(result?.error || "Não foi possível iniciar a desinstalação.");
    });
  }

  return (
    <div className="auth-screen">
      <div className="auth-card update-required-card">
        <div className="update-required-icon">
          <AlertTriangleIcon size={26} />
        </div>
        <div className="auth-heading">
          <h1>Atualização necessária</h1>
          <p className="auth-subtitle">
            Sua instalação do Concorde está desatualizada. Baixe e instale a versão mais recente pelo site para
            continuar.
          </p>
        </div>

        {uninstallError && <p className="auth-error">{uninstallError}</p>}

        <button type="button" onClick={() => window.concordeDesktop.openExternal(info.downloadUrl)}>
          <DownloadIcon size={16} />
          Baixar a versão mais recente
        </button>
        <button type="button" className="danger" onClick={() => setShowUninstallConfirm(true)}>
          <TrashIcon size={16} />
          Desinstalar versão atual
        </button>

        <p className="auth-note">Desinstale a versão atual antes de instalar a nova, para evitar conflito entre as duas.</p>
      </div>

      {showUninstallConfirm && (
        <ConfirmModal
          title="Desinstalar Concorde"
          message="Isso vai abrir o desinstalador do Windows e fechar o Concorde. Depois, baixe e instale a versão mais recente pelo site."
          confirmLabel="Desinstalar"
          danger
          onConfirm={handleUninstall}
          onClose={() => setShowUninstallConfirm(false)}
        />
      )}
    </div>
  );
}
