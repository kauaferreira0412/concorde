import { useEffect, useState } from "react";
import api from "../api/client";
import { XIcon } from "./icons.jsx";

/** Rotulo em portugues pra cada "action" gravada pelo backend (ver AuditLogService.log em
 *  ServerService/VoiceModerationController) - a string crua fica como fallback se um dia
 *  surgir uma acao nova aqui sem rotulo ainda. */
const ACTION_LABELS = {
  CREATE_CHANNEL: "criou o canal",
  DELETE_CHANNEL: "excluiu o canal",
  CREATE_CATEGORY: "criou a categoria",
  DELETE_CATEGORY: "excluiu a categoria",
  MOVE_MEMBER: "moveu",
  KICK_VOICE: "expulsou da call",
  FORCE_MUTE: "mutou à força",
  FORCE_UNMUTE: "desmutou",
  FORCE_DEAFEN: "ensurdeceu à força",
  FORCE_UNDEAFEN: "reativou o áudio de",
  REMOVE_MEMBER: "removeu do servidor",
  SET_MEMBER_ROLES: "mudou os perfis de",
  CREATE_ROLE: "criou o perfil",
  UPDATE_ROLE: "editou o perfil",
  DELETE_ROLE: "excluiu o perfil",
};

function describe(entry) {
  const verb = ACTION_LABELS[entry.action] || entry.action;
  const target = entry.targetUsername ? entry.targetUsername : entry.detail;
  const extra = entry.targetUsername && entry.detail ? ` (${entry.detail})` : "";
  return (
    <>
      <strong>{entry.actorUsername}</strong> {verb} {target && <strong>{target}</strong>}
      {extra}
    </>
  );
}

export default function AuditLogModal({ server, onClose }) {
  const [entries, setEntries] = useState(null); // null = carregando
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api
      .get(`/api/servers/${server.id}/audit-log`)
      .then(({ data }) => {
        if (!cancelled) setEntries(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setEntries([]);
          setError(err.response?.data?.error || "Não foi possível carregar o log de auditoria");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [server.id]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal settings-modal" onClick={(e) => e.stopPropagation()} style={{ width: 560 }}>
        <div className="settings-modal-header">
          <h2>Log de auditoria - {server.name}</h2>
          <button type="button" className="icon-btn" onClick={onClose}>
            <XIcon />
          </button>
        </div>
        <div className="settings-content" style={{ padding: "16px 22px" }}>
          <p className="admin-hint" style={{ marginTop: 0 }}>Últimas 100 ações de moderação e gerenciamento deste servidor.</p>

          {error && <p className="auth-error">{error}</p>}

          {entries === null ? (
            <p className="admin-hint">Carregando...</p>
          ) : entries.length === 0 ? (
            !error && <p className="admin-hint">Nenhuma ação registrada ainda.</p>
          ) : (
            <div className="audit-log-list">
              {entries.map((entry) => (
                <div key={entry.id} className="audit-log-entry">
                  <span className="audit-log-entry-text">{describe(entry)}</span>
                  <span className="audit-log-entry-time">{new Date(entry.createdAt).toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
