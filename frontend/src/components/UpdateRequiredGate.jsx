import { useEffect, useState } from "react";
import api from "../api/client";
import { AlertTriangleIcon, DownloadIcon, TrashIcon } from "./icons.jsx";
import ConfirmModal from "./ConfirmModal.jsx";

// window.concordeDesktop so' existe dentro do app Electron (ver electron/preload.cjs) - no
// navegador normal esse gate nunca bloqueia nada (sempre teria a versao mais nova, e' o
// proprio site).
const isElectronDesktop = typeof window !== "undefined" && !!window.concordeDesktop;

/** "0.1.2" > "0.1.10" numericamente, nao por string ("1" > "10" em string seria errado) -
 *  compara parte por parte, faltando parte = 0. */
function isOutdated(current, required) {
  if (!current || !required) return false;
  const cur = current.split(".").map((n) => parseInt(n, 10) || 0);
  const req = required.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(cur.length, req.length); i++) {
    const c = cur[i] || 0;
    const r = req[i] || 0;
    if (c !== r) return c < r;
  }
  return false;
}

/**
 * Bloqueia TUDO (nem chega na tela de login) se a versao instalada do app desktop estiver
 * desatualizada em relacao ao que o backend exige (ver DesktopVersionController/
 * app.desktop.min-version) - pedido explicito do usuario: quem esta com versao antiga nao
 * pode nem tentar logar, so' ve essa tela com o numero da versao nova, um botao pra abrir o
 * site (baixar o instalador novo) e um pra desinstalar a versao atual (pra depois poder
 * instalar a nova sem conflito).
 *
 * So' verifica dentro do app Electron - no navegador (isElectronDesktop false) sempre libera
 * na hora, sem nenhuma chamada extra. Se a propria checagem falhar (backend fora do ar, sem
 * rede), libera tambem (falha aberta) - nao faz sentido travar o app inteiro por causa de um
 * problema em checar se ele esta desatualizado.
 */
export default function UpdateRequiredGate({ children }) {
  const [status, setStatus] = useState(isElectronDesktop ? "checking" : "ok"); // "checking" | "ok" | "outdated"
  const [info, setInfo] = useState(null); // { currentVersion, minVersion, downloadUrl }
  const [showUninstallConfirm, setShowUninstallConfirm] = useState(false);
  const [uninstallError, setUninstallError] = useState("");

  useEffect(() => {
    if (!isElectronDesktop) return;
    let cancelled = false;
    (async () => {
      try {
        const [currentVersion, { data }] = await Promise.all([
          window.concordeDesktop.getAppVersion(),
          api.get("/api/desktop/version"),
        ]);
        if (cancelled) return;
        if (isOutdated(currentVersion, data.minVersion)) {
          setInfo({ currentVersion, minVersion: data.minVersion, downloadUrl: data.downloadUrl });
          setStatus("outdated");
        } else {
          setStatus("ok");
        }
      } catch (err) {
        console.warn("Não foi possível checar a versão do app desktop (seguindo sem bloquear):", err);
        if (!cancelled) setStatus("ok");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
            Sua versão instalada ({info.currentVersion}) está desatualizada — a versão atual do Concorde é a{" "}
            <strong>{info.minVersion}</strong>. Baixe e instale a versão nova para continuar.
          </p>
        </div>

        {uninstallError && <p className="auth-error">{uninstallError}</p>}

        <button
          type="button"
          onClick={() => window.concordeDesktop.openExternal(info.downloadUrl)}
        >
          <DownloadIcon size={16} />
          Baixar versão {info.minVersion} no site
        </button>
        <button type="button" className="danger" onClick={() => setShowUninstallConfirm(true)}>
          <TrashIcon size={16} />
          Desinstalar versão atual
        </button>

        <p className="auth-note">
          Desinstale a versão {info.currentVersion} antes de instalar a nova, para evitar conflito entre as duas.
        </p>
      </div>

      {showUninstallConfirm && (
        <ConfirmModal
          title="Desinstalar Concorde"
          message={`Isso vai abrir o desinstalador do Windows e fechar o Concorde ${info.currentVersion}. Depois, baixe e instale a versão ${info.minVersion} pelo site.`}
          confirmLabel="Desinstalar"
          danger
          onConfirm={handleUninstall}
          onClose={() => setShowUninstallConfirm(false)}
        />
      )}
    </div>
  );
}
