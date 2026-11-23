import { useEffect, useState } from "react";
import api from "../api/client";
import { ExternalLinkIcon, GamepadIcon } from "./icons.jsx";

function formatHours(minutes) {
  if (!minutes) return "0 h";
  const hours = minutes / 60;
  if (hours < 1) return `${minutes} min`;
  return `${hours < 10 ? hours.toFixed(1).replace(".", ",") : Math.round(hours).toLocaleString("pt-BR")} h`;
}

/** Bloco Steam do perfil: jogo atual, dados do perfil e jogos recentes (só aparece se a conta estiver vinculada). */
export default function SteamProfileSection({ userId }) {
  const [steam, setSteam] = useState(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    function load() {
      api
        .get(`/api/steam/profile/${userId}`)
        .then(({ data }) => {
          if (!cancelled) setSteam(data);
        })
        .catch(() => {});
    }
    setSteam(null);
    load();
    const interval = setInterval(load, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [userId]);

  if (!steam?.connected) return null;

  const playing = steam.playing;
  const recentGames = (steam.recentGames || []).filter((g) => g.name);

  return (
    <>
      {playing && (
        <div className="profile-section">
          <p className="profile-section-title profile-section-title-spotify">
            <GamepadIcon size={11} /> Jogando agora
          </p>
          <a
            href={playing.storeUrl || steam.profileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="profile-spotify-card steam-playing-card"
          >
            {playing.headerUrl ? (
              <img src={playing.headerUrl} alt="" className="steam-playing-art" />
            ) : (
              <span className="steam-playing-art steam-playing-art-empty">
                <GamepadIcon size={20} />
              </span>
            )}
            <div className="profile-spotify-info">
              <strong>{playing.name}</strong>
              <span>na Steam</span>
            </div>
          </a>
        </div>
      )}

      <div className="profile-section">
        <p className="profile-section-title profile-section-title-spotify">
          <GamepadIcon size={11} /> Steam
        </p>
        <a href={steam.profileUrl} target="_blank" rel="noopener noreferrer" className="profile-spotify-card steam-profile-card">
          {steam.avatarUrl && <img src={steam.avatarUrl} alt="" className="profile-spotify-art" />}
          <div className="profile-spotify-info">
            <strong>{steam.personaName || "Perfil na Steam"}</strong>
            <span>
              {steam.publicProfile
                ? [steam.personaState, steam.level != null ? `Nível ${steam.level}` : null].filter(Boolean).join(" · ")
                : "Perfil privado na Steam"}
            </span>
          </div>
          {steam.level != null && <span className="steam-level-badge">{steam.level}</span>}
          <ExternalLinkIcon size={13} className="steam-profile-link-icon" />
        </a>

        {recentGames.length > 0 && (
          <ul className="steam-recent-list">
            {recentGames.map((g) => (
              <li key={g.appId}>
                <a href={g.storeUrl} target="_blank" rel="noopener noreferrer" className="steam-recent-item">
                  {g.iconUrl ? (
                    <img src={g.iconUrl} alt="" className="steam-recent-icon" />
                  ) : (
                    <span className="steam-recent-icon" />
                  )}
                  <span className="steam-recent-info">
                    <strong>{g.name}</strong>
                    <span>
                      {formatHours(g.minutesTwoWeeks)} nas últimas 2 semanas · {formatHours(g.minutesTotal)} no total
                    </span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
