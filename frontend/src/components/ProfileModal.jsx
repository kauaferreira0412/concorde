import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/client";
import { useAuth } from "../context/AuthContext.jsx";
import { useAlert } from "../context/AlertContext.jsx";
import Avatar from "./Avatar.jsx";
import { CheckIcon, MessageSquareIcon, ShieldIcon } from "./icons.jsx";

const STATUS_LABEL = { ONLINE: "Online", AWAY: "Ausente", DND: "Não perturbe", OFFLINE: "Offline" };
const STATUS_DOT_CLASS = { ONLINE: "online", AWAY: "away", DND: "dnd", OFFLINE: "offline" };

/**
 * Cartao de perfil de QUALQUER usuario (clicavel a partir do chat, lista de membros, canal
 * de voz - ver useProfile/ProfileContext). E' so' leitura - quando e' o seu proprio perfil,
 * o botao manda pra Configuracoes > Perfil (ver openSettingsInstead), que e' onde a edicao
 * de verdade mora hoje (apelido, foto, bio, apelido por servidor - ver SettingsModal.jsx).
 *
 * Layout em secoes bem separadas (pedido explicito do usuario - antes era so' um paragrafo
 * solto): banner com o avatar "flutuando" por cima (estilo Discord), status como selo colorido,
 * depois um cartao "Sobre mim" com a bio e outro com informacoes (membro desde, cargo).
 */
export default function ProfileModal({ userId, onClose }) {
  const { user: me } = useAuth();
  const { showAlert } = useAlert();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [loadError, setLoadError] = useState("");
  // Relacao de amizade com essa pessoa (ver GET /api/friends/status/{userId} no backend) - so'
  // busca quando NAO e' o proprio perfil, decide se mostra "Adicionar amigo"/"Pedido enviado"/
  // "Aceitar pedido"/"Enviar mensagem" (pedido explicito do usuario: essas acoes direto no
  // perfil de um membro do servidor, nao so' pela tela de Amigos).
  const [friendStatus, setFriendStatus] = useState(null);
  const [friendActionBusy, setFriendActionBusy] = useState(false);

  const isMe = me?.id === userId;

  useEffect(() => {
    setProfile(null);
    setLoadError("");
    setFriendStatus(null);
    api
      .get(`/api/users/${userId}/profile`)
      .then(({ data }) => setProfile(data))
      .catch((err) => setLoadError(err.response?.data?.error || "Não foi possível carregar esse perfil"));
    if (me?.id !== userId) {
      api.get(`/api/friends/status/${userId}`).then(({ data }) => setFriendStatus(data));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  function openSettingsInstead() {
    onClose();
    window.dispatchEvent(new CustomEvent("concorde:open-settings"));
  }

  async function handleSendFriendRequest() {
    if (!profile || friendActionBusy) return;
    setFriendActionBusy(true);
    try {
      await api.post("/api/friends/requests", { username: profile.username });
      setFriendStatus({ status: "OUTGOING", dmChannelId: null });
    } catch (err) {
      showAlert(err.response?.data?.error || "Não foi possível enviar o pedido de amizade");
    } finally {
      setFriendActionBusy(false);
    }
  }

  async function handleAcceptFriendRequest() {
    if (friendActionBusy) return;
    setFriendActionBusy(true);
    try {
      await api.post(`/api/friends/requests/${userId}/accept`);
      const { data } = await api.get(`/api/friends/status/${userId}`);
      setFriendStatus(data);
    } catch (err) {
      showAlert(err.response?.data?.error || "Não foi possível aceitar o pedido");
    } finally {
      setFriendActionBusy(false);
    }
  }

  /** Manda pra Home ja' abrindo a conversa com essa pessoa - a Home busca a lista de amigos
   *  sozinha, mas passar tudo pronto no state evita esperar esse round-trip pra ver a
   *  conversa abrir (ver pages/home/Container.jsx, le' location.state uma vez ao montar). */
  function goToDm() {
    if (!profile || !friendStatus?.dmChannelId) return;
    onClose();
    navigate("/channels/@me", {
      state: {
        openDm: {
          channelId: friendStatus.dmChannelId,
          otherUserId: profile.id,
          otherUsername: profile.username,
          otherNickname: profile.nickname,
          otherAvatarUrl: profile.avatarUrl,
          otherStatus: profile.status,
        },
      },
    });
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal profile-modal" onClick={(e) => e.stopPropagation()}>
        {loadError && <p className="auth-error" style={{ margin: 20 }}>{loadError}</p>}

        {profile && (
          <>
            <div className="profile-banner" />

            <div className="profile-header">
              <div className="member-avatar-wrap profile-avatar-wrap">
                <Avatar name={profile.username} url={profile.avatarUrl} className="profile-avatar" />
                <span className={"status-dot " + STATUS_DOT_CLASS[profile.status]} title={STATUS_LABEL[profile.status]} />
              </div>
            </div>

            <div className="profile-body">
              <div className="profile-heading">
                <h2>{profile.nickname || profile.username}</h2>
                {profile.role === "ADMIN" && (
                  <span className="profile-admin-badge" title="Administrador">
                    <ShieldIcon size={12} /> Admin
                  </span>
                )}
              </div>
              <p className="profile-username">@{profile.username}</p>
              <span className={"profile-status-pill " + STATUS_DOT_CLASS[profile.status]}>
                <span className={"status-dot " + STATUS_DOT_CLASS[profile.status]} />
                {STATUS_LABEL[profile.status]}
              </span>

              {!isMe && friendStatus && (
                <div className="profile-friend-action">
                  {friendStatus.status === "NONE" && (
                    <button type="button" onClick={handleSendFriendRequest} disabled={friendActionBusy}>
                      Adicionar amigo
                    </button>
                  )}
                  {friendStatus.status === "OUTGOING" && (
                    <button type="button" className="link-btn" disabled>
                      Pedido de amizade enviado
                    </button>
                  )}
                  {friendStatus.status === "INCOMING" && (
                    <button type="button" onClick={handleAcceptFriendRequest} disabled={friendActionBusy}>
                      <CheckIcon size={14} /> Aceitar pedido de amizade
                    </button>
                  )}
                  {friendStatus.status === "FRIENDS" && (
                    <button type="button" onClick={goToDm}>
                      <MessageSquareIcon size={14} /> Enviar mensagem
                    </button>
                  )}
                </div>
              )}

              <div className="profile-section">
                <p className="profile-section-title">Sobre mim</p>
                {profile.bio ? (
                  <p className="profile-bio">{profile.bio}</p>
                ) : (
                  <p className="profile-bio profile-bio-empty">
                    {isMe ? "Você ainda não escreveu nada sobre você." : "Essa pessoa ainda não escreveu nada sobre ela."}
                  </p>
                )}
              </div>

              <div className="profile-section">
                <p className="profile-section-title">Informações</p>
                <div className="profile-info-grid">
                  <div className="profile-info-item">
                    <span className="profile-info-label">Membro desde</span>
                    <span className="profile-info-value">
                      {new Date(profile.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
                    </span>
                  </div>
                  <div className="profile-info-item">
                    <span className="profile-info-label">Cargo</span>
                    <span className="profile-info-value">{profile.role === "ADMIN" ? "Administrador" : "Usuário"}</span>
                  </div>
                </div>
              </div>
            </div>

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
