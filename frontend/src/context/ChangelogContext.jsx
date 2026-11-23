import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import api from "../api/client";
import { useAuth } from "./AuthContext.jsx";
import MessageText from "../components/MessageText.jsx";
import { MegaphoneIcon, XIcon } from "../components/icons.jsx";

const ChangelogContext = createContext(null);

/** "2026-11-23" -> "23/11/2026" (outros formatos de versão aparecem como estão). */
export function formatChangelogVersion(version) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(.*)$/.exec(version || "");
  return m ? `${m[3]}/${m[2]}/${m[1]}${m[4] ? ` (${m[4].replace(/^[-_.]/, "")})` : ""}` : version;
}

/**
 * Modal "Novidades": abre sozinho uma vez por versão nova (se a pessoa não desligou nas
 * Configurações) e pode ser reaberto pelo botão da mensagem no canal Atualizações (openChangelog).
 */
export function ChangelogProvider({ children }) {
  const { isAuthenticated } = useAuth();
  const [entry, setEntry] = useState(null);
  const [showOnOpen, setShowOnOpen] = useState(true);
  const [loadingVersion, setLoadingVersion] = useState(null);
  const checkedRef = useRef(false);

  // ao entrar: tem versão nova que ainda não foi vista?
  useEffect(() => {
    if (!isAuthenticated) {
      checkedRef.current = false;
      setEntry(null);
      return;
    }
    if (checkedRef.current) return;
    checkedRef.current = true;
    api
      .get("/api/changelog/pending")
      .then(({ status, data }) => {
        if (status === 200 && data?.version) setEntry(data);
      })
      .catch(() => {});
    api
      .get("/api/changelog/preference")
      .then(({ data }) => setShowOnOpen(!!data?.showOnOpen))
      .catch(() => {});
  }, [isAuthenticated]);

  const openChangelog = useCallback(async (version) => {
    setLoadingVersion(version);
    try {
      const { data } = await api.get(`/api/changelog/${encodeURIComponent(version)}`);
      setEntry(data);
    } catch {
      // versão não existe mais nesse servidor - nada pra mostrar
    } finally {
      setLoadingVersion(null);
    }
  }, []);

  const updateShowOnOpen = useCallback(async (show) => {
    setShowOnOpen(show);
    try {
      await api.put("/api/changelog/preference", { showOnOpen: show });
    } catch {
      setShowOnOpen(!show);
    }
  }, []);

  function close() {
    if (entry?.version) api.post(`/api/changelog/${encodeURIComponent(entry.version)}/seen`).catch(() => {});
    setEntry(null);
  }

  return (
    <ChangelogContext.Provider value={{ openChangelog, loadingVersion, showOnOpen, setShowOnOpen: updateShowOnOpen }}>
      {children}
      {entry && (
        <ChangelogModal entry={entry} showOnOpen={showOnOpen} onToggleShowOnOpen={updateShowOnOpen} onClose={close} />
      )}
    </ChangelogContext.Provider>
  );
}

export function useChangelog() {
  return useContext(ChangelogContext);
}

function ChangelogModal({ entry, showOnOpen, onToggleShowOnOpen, onClose }) {
  // o título já vai no cabeçalho do modal - tira o "# Título" do começo do texto
  const body = (entry.markdown || "").replace(/^#\s+.*\n?/, "").trim();

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal changelog-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="changelog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="changelog-header">
          <span className="changelog-header-badge" aria-hidden="true">
            <MegaphoneIcon size={22} />
          </span>
          <div className="changelog-header-text">
            <span className="changelog-kicker">Novidades · {formatChangelogVersion(entry.version)}</span>
            <h2 id="changelog-title">{entry.title}</h2>
          </div>
          <button type="button" className="icon-btn" aria-label="Fechar novidades" onClick={onClose}>
            <XIcon size={18} />
          </button>
        </div>

        <div className="changelog-body">
          <MessageText content={body} />
        </div>

        <div className="changelog-footer">
          <label className="settings-checkbox-row changelog-optout">
            <input type="checkbox" checked={showOnOpen} onChange={(e) => onToggleShowOnOpen(e.target.checked)} />
            Mostrar novidades ao abrir o Concorde
          </label>
          <button type="button" className="changelog-ok" onClick={onClose}>
            Entendi!
          </button>
        </div>
      </div>
    </div>
  );
}
