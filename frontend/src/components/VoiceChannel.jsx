import { useEffect, useRef, useState } from "react";
import { useVoiceCall } from "../context/VoiceCallContext.jsx";
import { useServerMembers } from "../utils/useServerMembers";
import { EyeIcon, EyeOffIcon, HeadphonesOffIcon, MaximizeIcon, MicIcon, MicOffIcon, VolumeIcon } from "./icons.jsx";
import Avatar from "./Avatar.jsx";
import { MemberRow } from "./MemberList.jsx";

/** Slider de volume 0-200% (o Discord/navegador so vai ate 100% - aqui passa disso via
    Web Audio, ver webAudioMix em VoiceCallContext.jsx). Reaproveitado pra voz e transmissão. */
function VolumeSlider({ value, onChange, label }) {
  return (
    <div className="volume-slider-row" title={label}>
      <VolumeIcon size={13} className="voice-status-icon" />
      <input
        type="range"
        min={0}
        max={200}
        step={5}
        value={value}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onChange(Number(e.target.value))}
        className={"volume-slider" + (value > 100 ? " boosted" : "")}
      />
      <span className="volume-slider-value">{value}%</span>
    </div>
  );
}

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
    participants,
    speakingIds,
    micLevel,
    screenShares,
    selectedScreenShareSid,
    selectScreenShare,
    toggleWatchScreenShare,
    participantVolumes,
    streamVolumes,
    setParticipantVolume,
    setStreamVolume,
    getLocalMicTrack,
    joinChannel,
    registerVideoContainer,
  } = useVoiceCall();
  // Hoje nao existe permissao por canal (todo membro do servidor ve todos os canais - ver
  // README), entao "quem tem acesso a esse canal de voz" = todo membro do servidor.
  const members = useServerMembers(channel.serverId, stompClient, stompConnected);

  const videoContainerRef = useRef(null);
  const isThisChannelActive = connected && activeChannel?.id === channel.id;
  const selectedShare = screenShares.find((s) => s.sid === selectedScreenShareSid) || null;

  // "Testar microfone": toca de volta o que o LiveKit ja esta captando do seu mic AGORA na
  // call, pra voce se ouvir sem precisar sair e abrir Configuracoes.
  const [micTesting, setMicTesting] = useState(false);
  const testAudioRef = useRef(null);

  // Popover de volume individual - abre no botao direito em cima do card de alguem na call
  // (nao existe mais slider fixo no card, senao cada card ficava largo demais - ver print).
  const [volumeMenu, setVolumeMenu] = useState(null); // { identity, x, y }
  const volumeMenuRef = useRef(null);

  useEffect(() => {
    if (!volumeMenu) return;
    function handlePointerDown(e) {
      if (volumeMenuRef.current && !volumeMenuRef.current.contains(e.target)) setVolumeMenu(null);
    }
    function handleKeyDown(e) {
      if (e.key === "Escape") setVolumeMenu(null);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [volumeMenu]);

  // Fecha sozinho se a pessoa sair da call (ou voce trocar de canal) enquanto o popover
  // estava aberto - senao ficaria apontando pra alguem que nao esta mais la.
  useEffect(() => {
    if (volumeMenu && !participants.some((p) => p.identity === volumeMenu.identity)) setVolumeMenu(null);
  }, [participants, volumeMenu]);

  useEffect(() => {
    if (!isThisChannelActive) return;
    registerVideoContainer(videoContainerRef.current);
    return () => registerVideoContainer(null);
  }, [isThisChannelActive, registerVideoContainer]);

  // Para o teste sozinho se voce sair do canal, senao ficaria tocando de volta em segundo plano.
  useEffect(() => {
    if (!isThisChannelActive) stopMicTest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isThisChannelActive]);

  function toggleMicTest() {
    if (micTesting) {
      stopMicTest();
      return;
    }
    const track = getLocalMicTrack();
    if (!track || !testAudioRef.current) return;
    testAudioRef.current.srcObject = new MediaStream([track]);
    testAudioRef.current.play();
    setMicTesting(true);
  }

  function stopMicTest() {
    if (testAudioRef.current) testAudioRef.current.srcObject = null;
    setMicTesting(false);
  }

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
          <div className="voice-section-header">
            <p className="voice-section-title">SEU MICROFONE</p>
            <button type="button" className="link-btn screenshare-watch-btn" onClick={toggleMicTest}>
              <MicIcon size={14} /> {micTesting ? "Parar teste" : "Testar microfone"}
            </button>
          </div>
          <div className="mic-meter-row">
            <div className="mic-meter-track">
              <div className="mic-meter-fill" style={{ width: `${micLevel}%` }} />
            </div>
            <span className="mic-meter-value">{micEnabled ? `${micLevel}%` : "mutado"}</span>
          </div>
          <p className="voice-hint">
            Fale perto do microfone — a barra acima deve se mexer instantaneamente. Use "Testar microfone" pra se
            ouvir, ou os ícones 🎤/🎧 na barra inferior esquerda para mutar ou ensurdecer.
          </p>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio ref={testAudioRef} autoPlay />
        </section>

        <section className="voice-section">
          <p className="voice-section-title">NA CALL — {participants.length}</p>
          <div className="voice-call-list">
            {participants.map((p) => (
              <div
                key={p.identity}
                className={"voice-call-card" + (speakingIds.has(p.identity) ? " speaking" : "")}
                // Volume so' faz sentido pra voz dos OUTROS - a sua propria voz voce nao ouve.
                onContextMenu={(e) => {
                  if (p.isLocal) return;
                  e.preventDefault();
                  setVolumeMenu({ identity: p.identity, x: e.clientX, y: e.clientY });
                }}
                title={!p.isLocal ? "Clique com o botão direito pra ajustar o volume" : undefined}
              >
                <Avatar name={p.name} url={p.avatarUrl} className="voice-avatar" />
                <span className="voice-call-name">
                  {p.isLocal ? p.name.replace(" (você)", "") : p.name}
                  {p.isLocal && <span className="voice-call-you">você</span>}
                </span>
                {p.deafened ? (
                  <span className="voice-status-badge" title="Ensurdecido - não está ouvindo ninguém">
                    <HeadphonesOffIcon size={13} /> ensurdecido
                  </span>
                ) : (
                  !p.micEnabled && (
                    <span className="voice-status-badge danger" title="Microfone mutado">
                      <MicOffIcon size={13} /> mudo
                    </span>
                  )
                )}
              </div>
            ))}
          </div>
          <p className="voice-hint">
            O anel verde acende em volta de quem está falando de verdade — só quem está dentro da call vê esse
            indicador. Clique com o botão direito em alguém pra ajustar o volume individual dela (até 200%).
          </p>
        </section>

        {volumeMenu &&
          (() => {
            const p = participants.find((pp) => pp.identity === volumeMenu.identity);
            if (!p) return null;
            return (
              <div
                className="volume-popover"
                ref={volumeMenuRef}
                style={{ left: Math.min(volumeMenu.x, window.innerWidth - 232), top: Math.min(volumeMenu.y, window.innerHeight - 70) }}
              >
                <p className="volume-popover-title">Volume de {p.name}</p>
                <VolumeSlider
                  value={participantVolumes[p.identity] ?? 100}
                  onChange={(v) => setParticipantVolume(p.identity, v)}
                  label={`Volume de ${p.name} (padrão 100%, pode passar de 100%)`}
                />
              </div>
            );
          })()}

        <section className="voice-section">
          <div className="voice-section-header">
            <p className="voice-section-title">COMPARTILHAMENTO DE TELA</p>
            {screenShares.length > 0 && (
              <button className="icon-btn" onClick={handleFullscreen} title="Ver em tela cheia">
                <MaximizeIcon />
              </button>
            )}
          </div>
          {screenShares.length === 0 ? (
            <p className="voice-hint" style={{ margin: 0 }}>
              Ninguém está compartilhando a tela agora.
            </p>
          ) : (
            screenShares.length > 1 && (
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
            )
          )}

          {selectedShare && !selectedShare.isLocal && (
            <div className="screenshare-controls">
              <button
                type="button"
                className="link-btn screenshare-watch-btn"
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

          <div className="screenshare-stage">
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
