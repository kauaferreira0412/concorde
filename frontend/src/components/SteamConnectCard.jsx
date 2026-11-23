import { useEffect, useState } from "react";
import api from "../api/client";
import { ExternalLinkIcon, GamepadIcon } from "./icons.jsx";

/** Seção "Steam" da aba Conexões: vincula a conta pelo login oficial da Steam. */
export default function SteamConnectCard() {
  const [status, setStatus] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get("/api/steam/status")
      .then(({ data }) => setStatus(data))
      .catch(() => setStatus({ configured: false, connected: false }));
  }, []);

  // o login acontece em outra aba/no navegador - fica perguntando até a conta aparecer
  useEffect(() => {
    if (!connecting) return;
    let cancelled = false;
    let attempts = 0;
    const interval = setInterval(() => {
      attempts += 1;
      api
        .get("/api/steam/status")
        .then(({ data }) => {
          if (cancelled) return;
          if (data.connected) {
            setStatus(data);
            setConnecting(false);
          } else if (attempts >= 90) {
            setConnecting(false);
          }
        })
        .catch(() => {});
    }, 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [connecting]);

  async function handleConnect() {
    setError("");
    try {
      const { data } = await api.get("/api/steam/login-url");
      if (window.concordeDesktop) window.concordeDesktop.openExternal(data.url);
      else window.open(data.url, "_blank", "noopener,noreferrer");
      setConnecting(true);
    } catch (err) {
      setError(err.response?.data?.error || "Não foi possível iniciar o login na Steam");
    }
  }

  async function handleDisconnect() {
    setError("");
    try {
      await api.delete("/api/steam/connection");
      setStatus((prev) => ({ ...prev, connected: false, personaName: null, avatarUrl: null, profileUrl: null }));
    } catch (err) {
      setError(err.response?.data?.error || "Não foi possível desvincular sua conta da Steam");
    }
  }

  function openProfile() {
    if (!status?.profileUrl) return;
    if (window.concordeDesktop) window.concordeDesktop.openExternal(status.profileUrl);
    else window.open(status.profileUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <>
      <p className="settings-section-title">Steam</p>
      {status === null ? (
        <p className="admin-hint">Carregando...</p>
      ) : !status.configured ? (
        <p className="admin-hint">
          Integração com a Steam ainda não configurada nesse servidor (falta cadastrar a STEAM_API_KEY no backend).
        </p>
      ) : (
        <div className="spotify-connect-card steam-connect-card">
          {status.connected && status.avatarUrl ? (
            <img src={status.avatarUrl} alt="" className="steam-connect-avatar" />
          ) : (
            <GamepadIcon size={28} />
          )}
          <div className="spotify-connect-info">
            <strong>
              {status.connected ? `Conectado como ${status.personaName || "sua conta Steam"}` : "Conecte sua conta da Steam"}
            </strong>
            <p className="admin-hint" style={{ margin: 0 }}>
              {status.connected
                ? "O jogo que você estiver jogando aparece na lista de membros e no seu perfil. Pra isso funcionar, deixe o perfil e os detalhes de jogos como públicos na Steam."
                : "Opcional - mostra pros outros o que você está jogando e algumas informações do seu perfil Steam. O login é feito no site oficial da Steam; o Concorde nunca vê sua senha."}
            </p>
            {status.connected && status.profileUrl && (
              <button type="button" className="link-btn steam-connect-profile" onClick={openProfile}>
                Ver perfil na Steam <ExternalLinkIcon size={12} />
              </button>
            )}
          </div>
          {status.connected ? (
            <button type="button" className="danger" onClick={handleDisconnect}>
              Desvincular
            </button>
          ) : (
            <button type="button" onClick={handleConnect} disabled={connecting}>
              {connecting ? "Aguardando..." : "Entrar com a Steam"}
            </button>
          )}
        </div>
      )}
      {connecting && (
        <p className="admin-hint" style={{ margin: 0 }}>
          Faça login na Steam na aba que abriu - assim que terminar, isso aqui atualiza sozinho.
        </p>
      )}
      {error && <p className="auth-error">{error}</p>}
    </>
  );
}
