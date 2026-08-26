import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../context/AuthContext.jsx";
import api from "../api/client";
import Avatar from "./Avatar.jsx";
import { HeadphonesIcon } from "./icons.jsx";

const MAX_AVATARS = 8; // depois disso so mostra "+N", senao a fileira fica gigante num servidor grande

export default function ServerSidebar({ servers, selectedServerId, homeActive, onSelect, onHome, onCreateServer }) {
  const { isAdmin } = useAuth();
  // Tooltip customizado ao passar o mouse num servidor - pedido explicito do usuario: mostrar
  // os avatares de quem esta numa call de voz AGORA nesse servidor, sem precisar entrar nele
  // primeiro (ver GET /api/servers/{id}/voice-presence, junta a presenca de TODOS os canais de
  // voz do servidor - ver ServerService.getVoicePresence no backend).
  const [hoveredServerId, setHoveredServerId] = useState(null);
  const [tooltipPos, setTooltipPos] = useState(null); // {top, left} em pixels de tela
  const [voicePresence, setVoicePresence] = useState(null); // null = carregando, [] = ninguem na call
  const hoverTimeoutRef = useRef(null);

  function handleHoverStart(serverId, iconEl) {
    // Pequeno atraso antes de buscar - passar o mouse RAPIDO por varios servidores em sequencia
    // (rolando a lista) nao devia disparar uma chamada de API pra cada um.
    clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => {
      // ".server-sidebar" tem "overflow-y:auto" - sem overflow-x definido, o CSS forca os DOIS
      // eixos a cortar conteudo que vaza (regra do proprio spec: um eixo "auto" e o outro
      // "visible" vira "auto" tambem) - um tooltip posicionado com "left:100%" (pra fora da
      // barra estreita de 76px) ficava CORTADO/invisivel mesmo com os dados certos chegando
      // (reportado: "nao ta mostrando"). Portal pro document.body em position:fixed, calculado
      // a partir da posicao de VERDADE do icone na tela, escapa desse corte de vez.
      const rect = iconEl.getBoundingClientRect();
      setTooltipPos({ top: rect.top + rect.height / 2, left: rect.right + 14 });
      setHoveredServerId(serverId);
      setVoicePresence(null);
      api
        .get(`/api/servers/${serverId}/voice-presence`)
        .then(({ data }) => setVoicePresence(data || []))
        .catch(() => setVoicePresence([]));
    }, 200);
  }

  function handleHoverEnd() {
    clearTimeout(hoverTimeoutRef.current);
    setHoveredServerId(null);
  }

  const hoveredServer = servers.find((s) => s.id === hoveredServerId);

  return (
    <div className="server-sidebar">
      {/* Logo do Concorde = "ir pra Home" (amigos + chats privados), igual o botao do Discord
          no topo da barra de servidores - pedido explicito do usuario. */}
      <div className="server-icon-wrap">
        <span className={"server-icon-pill" + (homeActive ? " active" : "")} />
        <button
          className={"server-icon home has-icon" + (homeActive ? " active" : "")}
          onClick={onHome}
          title="Página inicial (amigos e mensagens)"
        >
          <img src={`${import.meta.env.BASE_URL}icon-192.png`} alt="" className="server-icon-img" />
        </button>
      </div>
      <div className="server-sidebar-divider" />
      {servers.map((s) => {
        const isActive = s.id === selectedServerId;
        return (
          <div
            key={s.id}
            className="server-icon-wrap"
            onMouseEnter={(e) => handleHoverStart(s.id, e.currentTarget)}
            onMouseLeave={handleHoverEnd}
          >
            <span className={"server-icon-pill" + (isActive ? " active" : "")} />
            <button
              className={"server-icon" + (isActive ? " active" : "") + (s.iconUrl ? " has-icon" : "")}
              onClick={() => onSelect(s.id)}
            >
              {s.iconUrl ? <img src={s.iconUrl} alt="" className="server-icon-img" /> : s.name.slice(0, 2).toUpperCase()}
            </button>
          </div>
        );
      })}
      {/* Criar servidor e' exclusivo do administrador */}
      {isAdmin && (
        <button className="server-icon add" title="Criar servidor" onClick={onCreateServer}>
          +
        </button>
      )}

      {hoveredServer &&
        tooltipPos &&
        createPortal(
          <div className="server-hover-tooltip" style={{ top: tooltipPos.top, left: tooltipPos.left }}>
            <p className="server-hover-tooltip-name">{hoveredServer.name}</p>
            {Array.isArray(voicePresence) && voicePresence.length > 0 && (
              <div className="server-hover-tooltip-voice">
                <HeadphonesIcon size={12} className="server-hover-tooltip-voice-icon" />
                <div className="server-hover-tooltip-avatars">
                  {voicePresence.slice(0, MAX_AVATARS).map((p) => (
                    <Avatar
                      key={p.userId}
                      name={p.username}
                      url={p.avatarUrl}
                      className="voice-avatar small server-hover-tooltip-avatar"
                    />
                  ))}
                  {voicePresence.length > MAX_AVATARS && (
                    <span className="server-hover-tooltip-avatar-more">+{voicePresence.length - MAX_AVATARS}</span>
                  )}
                </div>
              </div>
            )}
          </div>,
          document.body
        )}
    </div>
  );
}
