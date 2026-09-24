import { useEffect, useState } from "react";
import api from "../api/client";
import { AlertTriangleIcon, DownloadIcon, TrashIcon } from "./icons.jsx";
import ConfirmModal from "./ConfirmModal.jsx";

const isElectronDesktop = typeof window !== "undefined" && !!window.concordeDesktop;

const installedBuildId = import.meta.env.VITE_APP_BUILD_ID || null;

export default function UpdateRequiredGate({ children }) {
  const [status, setStatus] = useState(isElectronDesktop && installedBuildId ? "checking" : "ok");
  const [info, setInfo] = useState(null);
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
  }, [status]);

  if (status === "checking") {
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
