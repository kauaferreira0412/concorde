import { useEffect, useState } from "react";
import api from "../api/client";
import { useAuth } from "../context/AuthContext.jsx";
import Avatar from "./Avatar.jsx";

const STATUS_LABEL = { ONLINE: "Online", AWAY: "Ausente", DND: "Não perturbe", OFFLINE: "Offline" };
const STATUS_DOT_CLASS = { ONLINE: "online", AWAY: "away", DND: "dnd", OFFLINE: "offline" };

/**
 * Cartao de perfil de QUALQUER usuario (clicavel a partir do chat, lista de membros, canal
 * de voz - ver useProfile/ProfileContext). E' so' leitura - quando e' o seu proprio perfil,
 * o botao manda pra Configuracoes > Perfil (ver openSettingsInstead), que e' onde a edicao
 * de verdade mora hoje (apelido, foto, bio, apelido por servidor - ver SettingsModal.jsx).
 */
export default function ProfileModal({ userId, onClose }) {
  const { user: me } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loadError, setLoadError] = useState("");

  const isMe = me?.id === userId;

  useEffect(() => {
    setProfile(null);
    setLoadError("");
    api
      .get(`/api/users/${userId}/profile`)
      .then(({ data }) => setProfile(data))
      .catch((err) => setLoadError(err.response?.data?.error || "Não foi possível carregar esse perfil"));
  }, [userId]);

  function openSettingsInstead() {
    onClose();
    window.dispatchEvent(new CustomEvent("concorde:open-settings"));
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal profile-modal" onClick={(e) => e.stopPropagation()}>
        {loadError && <p className="auth-error">{loadError}</p>}

        {profile && (
          <>
            <div className="profile-header">
              <div className="member-avatar-wrap profile-avatar-wrap">
                <Avatar name={profile.username} url={profile.avatarUrl} className="profile-avatar" />
                <span className={"status-dot " + STATUS_DOT_CLASS[profile.status]} title={STATUS_LABEL[profile.status]} />
              </div>
              <div className="profile-heading">
                <h2>{profile.nickname || profile.username}</h2>
                <p className="profile-username">@{profile.username}</p>
              </div>
            </div>

            <p className="admin-hint">
              {STATUS_LABEL[profile.status]} · Membro desde {new Date(profile.createdAt).toLocaleDateString()}
            </p>

            {profile.bio && <p className="profile-bio">{profile.bio}</p>}

            <div className="settings-actions">
              <button type="button" className="link-btn" onClick={onClose}>
                Fechar
              </button>
              {isMe && (
                <button type="button" onClick={openSettingsInstead}>
                  Editar nas Configurações
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
