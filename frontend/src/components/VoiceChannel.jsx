import { useEffect, useRef, useState } from "react";
import { useVoiceCall } from "../context/VoiceCallContext.jsx";
import { useServerMembers } from "../utils/useServerMembers";
import { EyeIcon, EyeOffIcon, MaximizeIcon, ScreenShareIcon, WidenIcon } from "./icons.jsx";
import VolumeSlider from "./VolumeSlider.jsx";
import { MemberRow } from "./MemberList.jsx";

/**
 * Vista de UM canal de voz. A conexao em si (LiveKit) vive no VoiceCallContext, entao
 * ela sobrevive mesmo se voce sair desse canal para ler um canal de texto - igual ao
 * Discord, que te mantem na call enquanto voce navega pelo servidor.
 */
export default function VoiceChannel({ channel, stompClient, stompConnected }) {
  const {
    activeChannel,
    connected,
    micEnabled,
    micLevel,
    screenSharing,
    screenShares,
    selectedScreenShareSid,
    selectScreenShare,
    toggleScreenShare,
    toggleWatchScreenShare,
    streamVolumes,
    setStreamVolume,
    joinChannel,
    registerVideoContainer,
  } = useVoiceCall();
  // Hoje nao existe permissao por canal (todo membro do servidor ve todos os canais - ver
  // README), entao "quem tem acesso a esse canal de voz" = todo membro do servidor.
  const members = useServerMembers(channel.serverId, stompClient, stompConnected);

  const videoContainerRef = useRef(null);
  const isThisChannelActive = connected && activeChannel?.id === channel.id;
  const selectedShare = screenShares.find((s) => s.sid === selectedScreenShareSid) || null;

  // "Ampliar" - estagio intermediario entre o tamanho normal e a tela cheia de verdade
  // (Fullscreen API, via handleFullscreen): ocupa 100% da largura da area central, mas
  // continua dentro da pagina - da pra rolar e ver participantes/membros normalmente.
  const [theaterMode, setTheaterMode] = useState(false);

  useEffect(() => {
    if (screenShares.length === 0) setTheaterMode(false);
  }, [screenShares.length]);

  useEffect(() => {
    if (!isThisChannelActive) return;
    registerVideoContainer(videoContainerRef.current);
    return () => registerVideoContainer(null);
  }, [isThisChannelActive, registerVideoContainer]);

  function handleFullscreen() {
    const videoEl = videoContainerRef.current?.querySelector("video");
    if (!videoEl) return;
    const request = videoEl.requestFullscreen || videoEl.webkitRequestFullscreen;
    request?.call(videoEl);
  }

  if (!isThisChannelActive) {
    return (
      <div className="voice-channel">
        <div className="chat-header">🔊 {channel.name}</div>
        <div className="voice-join">
          {activeChannel && activeChannel.id !== channel.id ? (
            <div style={{ textAlign: "center" }}>
              <p className="voice-hint" style={{ marginBottom: 12 }}>
                Você está conectado em 🔊 {activeChannel.name}. Entrar aqui vai te tirar de lá.
              </p>
              <button onClick={() => joinChannel(channel)}>Trocar para esta call</button>
            </div>
          ) : (
            <button onClick={() => joinChannel(channel)}>Entrar na call</button>
          )}
        </div>
        <ChannelAccessSection members={members} />
      </div>
    );
  }

  return (
    <div className="voice-channel">
      <div className="chat-header">🔊 {channel.name}</div>

      <div className="voice-body">
        <section className="voice-section">
          <p className="voice-section-title">SEU MICROFONE</p>
          <div className="mic-meter-row">
            <div className="mic-meter-track">
              <div className="mic-meter-fill" style={{ width: `${micLevel}%` }} />
            </div>
            <span className="mic-meter-value">{micEnabled ? `${micLevel}%` : "mutado"}</span>
          </div>
          <p className="voice-hint">
            Fale perto do microfone — a barra acima deve se mexer instantaneamente. Use os ícones 🎤/🎧 na barra
            inferior esquerda para mutar ou ensurdecer.
          </p>
        </section>

        <section className="voice-section">
          <div className="voice-section-header">
            <p className="voice-section-title">COMPARTILHAMENTO DE TELA</p>
            <div className="voice-section-header-actions">
              {screenShares.length > 0 && (
                <>
                  <button
                    className={"icon-btn" + (theaterMode ? " icon-btn-active" : "")}
                    onClick={() => setTheaterMode((v) => !v)}
                    title={theaterMode ? "Voltar ao tamanho normal" : "Ampliar (ocupa a largura toda, sem sair da página)"}
                  >
                    <WidenIcon />
                  </button>
                  <button className="icon-btn" onClick={handleFullscreen} title="Ver em tela cheia">
                    <MaximizeIcon />
                  </button>
                </>
              )}
              <button
                type="button"
                className={"btn-accent-sm" + (screenSharing ? " active" : "")}
                onClick={toggleScreenShare}
                title={
                  screenSharing
                    ? "Parar compartilhamento"
                    : "Compartilhar tela (com áudio) - use fone de ouvido pra evitar eco"
                }
              >
                <ScreenShareIcon size={15} />
                {screenSharing ? "Parar compartilhamento" : "Compartilhar tela"}
              </button>
            </div>
          </div>

          {screenShares.length > 1 && (
            <div className="screenshare-tabs">
              {screenShares.map((s) => (
                <button
                  key={s.sid}
                  className={"screenshare-tab" + (s.sid === selectedScreenShareSid ? " active" : "")}
                  onClick={() => selectScreenShare(s.sid)}
                >
                  🖥️ {s.name}
                </button>
              ))}
            </div>
          )}

          {selectedShare && !selectedShare.isLocal && (
            <div className="screenshare-controls">
              <button
                type="button"
                className={"btn-outline-sm" + (!selectedShare.watching ? " active" : "")}
                onClick={() => toggleWatchScreenShare(selectedShare.sid)}
                title={
                  selectedShare.watching
                    ? "Parar de assistir (economiza dados - você continua na call de voz normalmente)"
                    : "Voltar a assistir esta transmissão"
                }
              >
                {selectedShare.watching ? (
                  <>
                    <EyeOffIcon size={14} /> Parar de assistir
                  </>
                ) : (
                  <>
                    <EyeIcon size={14} /> Assistir transmissão
                  </>
                )}
              </button>
              <VolumeSlider
                value={streamVolumes[selectedShare.participantIdentity] ?? 100}
                onChange={(v) => setStreamVolume(selectedShare.participantIdentity, v)}
                label={`Volume do áudio da transmissão de ${selectedShare.name} (padrão 100%, pode passar de 100%)`}
              />
            </div>
          )}

          <div
            className={
              "screenshare-stage" +
              (screenShares.length === 0 ? " empty" : "") +
              (theaterMode ? " theater" : "")
            }
          >
            {screenShares.length === 0 && (
              <div className="screenshare-empty">
                <ScreenShareIcon size={28} />
                <p>Ninguém está compartilhando a tela agora.</p>
              </div>
            )}
            {/* Fica sempre montado (mesmo sem ninguem compartilhando) para o VoiceCallContext
                ter uma referencia estavel de onde anexar o video quando alguem comecar. */}
            <div
              className={"voice-video-grid" + (screenShares.length === 0 || !selectedShare?.watching ? " empty" : "")}
              ref={videoContainerRef}
              onDoubleClick={handleFullscreen}
            />
            {selectedShare && !selectedShare.watching && (
              <p className="screenshare-paused-hint">
                Você não está assistindo esta transmissão agora. Clique em "Assistir transmissão" acima para voltar.
              </p>
            )}
          </div>
        </section>

        <ChannelAccessSection members={members} />
      </div>
    </div>
  );
}

/**
 * "Quem tem acesso a esse canal" - hoje e' o mesmo que "membros do servidor" (nao existe
 * permissao por canal ainda, ver README), com o status ao vivo de cada um. Aparece tanto
 * antes de entrar na call quanto durante ela.
 */
function ChannelAccessSection({ members }) {
  if (members.length === 0) return null;
  return (
    <section className="voice-section">
      <p className="voice-section-title">MEMBROS COM ACESSO A ESSE CANAL — {members.length}</p>
      <div className="voice-participants">
        {members.map((m) => (
          <MemberRow key={m.userId} member={m} />
        ))}
      </div>
    </section>
  );
}
