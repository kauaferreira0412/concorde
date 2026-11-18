import { useEffect, useState } from "react";
import api from "../api/client";
import { useProfile } from "../context/ProfileContext.jsx";
import Avatar from "./Avatar.jsx";
import { accentStyle } from "./AccentColorPicker.jsx";

const STATUS_LABEL = { ONLINE: "online", AWAY: "ausente", DND: "não perturbe", OFFLINE: "offline" };
const STATUS_DOT_CLASS = { ONLINE: "online", AWAY: "away", DND: "dnd", OFFLINE: "offline" };

/** Painel lateral da conversa direta: capa, avatar, status, bio e atalho pro perfil completo. */
export default function DmProfilePanel({ channel }) {
  const { openProfile } = useProfile();
  const [profile, setProfile] = useState(null);
  const userId = channel?.otherUserId;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setProfile(null);
    api
      .get(`/api/users/${userId}/profile`)
      .then(({ data }) => !cancelled && setProfile(data))
      .catch(() => !cancelled && setProfile(false));
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (!channel) return null;

  const name = channel.otherNickname || channel.otherUsername;
  const status = channel.otherStatus || profile?.status || "OFFLINE";
  const bio = profile?.bio?.trim();

  return (
    <aside
      className={"dm-profile-panel" + (profile?.accentColor ? " has-accent" : "")}
      style={accentStyle(profile?.accentColor)}
      aria-label={`Perfil de ${name}`}
    >
      <div
        className={"dm-profile-banner" + (profile?.bannerUrl ? " has-image" : "")}
        style={profile?.bannerUrl ? { backgroundImage: `url("${profile.bannerUrl}")` } : undefined}
      />
      <div className="dm-profile-body">
        <div className="dm-profile-avatar-wrap">
          <Avatar name={channel.otherUsername} url={channel.otherAvatarUrl} className="dm-profile-avatar" />
          <span className={"status-dot " + (STATUS_DOT_CLASS[status] || "offline")} />
        </div>
        <div>
          <div className="dm-profile-name">{name}</div>
          <div className="dm-profile-sub">
            {channel.otherNickname ? `@${channel.otherUsername} · ` : ""}
            {STATUS_LABEL[status] || "offline"}
          </div>
        </div>
        {profile?.customStatus && <div className="profile-custom-status">{profile.customStatus}</div>}
        <div className="dm-profile-card">
          <div className="dm-profile-card-title">SOBRE</div>
          <div className={"dm-profile-card-text" + (bio ? "" : " empty")}>
            {profile === null ? "Carregando..." : bio || "Ainda não escreveu nada sobre si."}
          </div>
        </div>
        {profile?.createdAt && (
          <div className="dm-profile-card">
            <div className="dm-profile-card-title">NO CONCORDE DESDE</div>
            <div className="dm-profile-card-text">
              {new Date(profile.createdAt).toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" })}
            </div>
          </div>
        )}
        <button type="button" className="btn-sticker btn-sticker-block" onClick={() => openProfile(userId)}>
          VER PERFIL
        </button>
      </div>
    </aside>
  );
}
