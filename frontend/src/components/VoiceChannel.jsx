import { useEffect, useRef, useState } from "react";
import { useVoiceCall } from "../context/VoiceCallContext.jsx";
import { useServerMembers } from "../utils/useServerMembers";
import {
  EyeIcon,
  EyeOffIcon,
  MaximizeIcon,
  MenuIcon,
  MicIcon,
  MicOffIcon,
  ScreenShareIcon,
  VolumeIcon,
  WidenIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "./icons.jsx";
import VolumeSlider from "./VolumeSlider.jsx";
import Avatar from "./Avatar.jsx";
import { MemberRow } from "./MemberList.jsx";

// Tamanhos disponiveis pro tile de webcam - "size" vira uma classe CSS (.camera-tile-<size>,
// ver global.css). Comeca em "md" (tamanho de antes), dá pra aumentar/diminuir pelos botoes
// no cabecalho da secao (afeta TODOS os tiles de uma vez, ver CAMERA_SIZES/cameraSize abaixo).
const CAMERA_SIZES = ["sm", "md", "lg", "xl"];

// Quantidade de barrinhas do medidor de microfone (estilo equalizador) - puramente visual,
// so' controla a resolucao do "preenchimento" (ver mic-meter-segments em VoiceChannel).
const MIC_SEGMENT_COUNT = 40;
const MIC_SEGMENTS = Array.from({ length: MIC_SEGMENT_COUNT }, (_, i) => i);

function formatDuration(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Cabecalho do canal de voz - nome, subtitulo "Canal de voz · Servidor", badge de "TEMPO
 *  REAL" enquanto conectado, e um "facepile" de quem esta na call (ate' 4, +N o resto). */
function VoiceHeader({ channel, serverName, live, participants }) {
  const list = participants || [];
  const visible = list.slice(0, 4);
  const extra = list.length - visible.length;
  return (
    <div className="chat-header chat-header-voice">
      <span className="chat-header-icon">
        <VolumeIcon size={16} />
      </span>
      <div className="chat-header-info">
        <p className="chat-header-title">{channel.name}</p>
        <p className="chat-header-subtitle">Canal de voz{serverName ? ` · ${serverName}` : ""}</p>
      </div>
      {live && (
        <span className="live-badge">
          <span className="live-badge-dot" /> TEMPO REAL
        </span>
      )}
      {live && list.length > 0 && (
        <div className="chat-header-avatars">
          {visible.map((p) => (
            <Avatar key={p.identity} name={p.name} url={p.avatarUrl} className="chat-header-avatar" />
          ))}
          {extra > 0 && <span className="chat-header-avatar chat-header-avatar-more">+{extra}</span>}
        </div>
      )}
      <button
        type="button"
        className="icon-btn"
        style={list.length === 0 ? { marginLeft: "auto" } : undefined}
        title="Ver membros com acesso a esse canal"
        onClick={() => document.getElementById("voice-members-section")?.scrollIntoView({ behavior: "smooth", block: "start" })}
      >
        <MenuIcon size={16} />
      </button>
    </div>
  );
}

/** Um tile de webcam (sua ou de outro participante) - anexa/solta o track de video do
 *  LiveKit num <video> proprio conforme o componente monta/desmonta (mesmo padrao usado
 *  pra tela compartilhada, so' que aqui varios tiles ficam visiveis ao mesmo tempo). Cada
 *  tile tem seu proprio botao de "tela cheia" (Fullscreen API), independente dos outros. */
function CameraTile({ track, name, isLocal, size }) {
  const videoRef = useRef(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !track) return;
    track.attach(el);
    return () => track.detach(el);
  }, [track]);

  function handleMaximize() {
    const el = videoRef.current;
    const request = el?.requestFullscreen || el?.webkitRequestFullscreen;
    request?.call(el);
  }

  return (
    <div className={"camera-tile camera-tile-" + size}>
      <video ref={videoRef} autoPlay playsInline muted={isLocal} onDoubleClick={handleMaximize} />
      <span className="camera-tile-name">{name}</span>
      <button type="button" className="camera-tile-maximize" onClick={handleMaximize} title="Tela cheia">
        <MaximizeIcon size={13} />
      </button>
    </div>
  );
}

/**
 * Vista de UM canal de voz. A conexao em si (LiveKit) vive no VoiceCallContext, entao
 * ela sobrevive mesmo se voce sair desse canal para ler um canal de texto - igual ao
 * Discord, que te mantem na call enquanto voce navega pelo servidor.
 */
export default function VoiceChannel({ channel, serverName, stompClient, stompConnected }) {
  const {
    activeChannel,
    connected,
    micEnabled,
    micLevel,
    screenSharing,
    screenShares,
    cameraTracks,
    participants,
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

  // Indice em CAMERA_SIZES - comeca no "md" (index 1, tamanho de antes). Afeta todos os
  // tiles de webcam de uma vez (ver botoes +/- no cabecalho da secao CÂMERAS).
  const [cameraSizeIdx, setCameraSizeIdx] = useState(1);
  const cameraSize = CAMERA_SIZES[cameraSizeIdx];

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

  // Estatisticas "ao vivo" da transmissao (resolucao/fps/duracao), mostradas no cabecalho da
  // secao COMPARTILHAMENTO DE TELA - lidas direto do <video> atual (videoContainerRef), sem
  // precisar que o VoiceCallContext exponha o track cru. Resolucao/fps vem de verdade do
  // getSettings() da MediaStreamTrack por baixo; duracao e' contada localmente a partir do
  // momento em que a primeira transmissao apareceu.
  const [shareElapsed, setShareElapsed] = useState(0);
  const [shareStats, setShareStats] = useState(null); // { width, height, frameRate }
  const shareStartRef = useRef(null);

  useEffect(() => {
    if (screenShares.length === 0) {
      shareStartRef.current = null;
      setShareElapsed(0);
      setShareStats(null);
      return;
    }
    if (!shareStartRef.current) shareStartRef.current = Date.now();
    function tick() {
      setShareElapsed(Math.floor((Date.now() - shareStartRef.current) / 1000));
      const videoEl = videoContainerRef.current?.querySelector("video");
      const settings = videoEl?.srcObject?.getVideoTracks?.()[0]?.getSettings?.();
      if (settings?.width) {
        setShareStats({ width: settings.width, height: settings.height, frameRate: settings.frameRate });
      }
    }
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [screenShares.length]);

  function handleFullscreen() {
    const videoEl = videoContainerRef.current?.querySelector("video");
    if (!videoEl) return;
    const request = videoEl.requestFullscreen || videoEl.webkitRequestFullscreen;
    request?.call(videoEl);
  }

  if (!isThisChannelActive) {
    return (
      <div className="voice-channel">
        <VoiceHeader channel={channel} serverName={serverName} live={false} participants={[]} />
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

  const activeMicSegments = micEnabled ? Math.round((micLevel / 100) * MIC_SEGMENT_COUNT) : 0;

  return (
    <div className="voice-channel">
      <VoiceHeader channel={channel} serverName={serverName} live participants={participants} />

      <div className="voice-body">
        <section className="voice-section">
          <div className="voice-section-header">
            <p className="voice-section-title">SEU MICROFONE</p>
            <span className={"mic-status-pill" + (micEnabled ? "" : " danger")}>
              {micEnabled ? "Microfone ativo" : "Microfone mutado"}
            </span>
          </div>
          <div className="mic-meter-row">
            <span className={"mic-meter-icon" + (micEnabled ? "" : " danger")}>
              {micEnabled ? <MicIcon size={15} /> : <MicOffIcon size={15} />}
            </span>
            <div className="mic-meter-segments">
              {MIC_SEGMENTS.map((i) => (
                <span key={i} className={"mic-meter-segment" + (i < activeMicSegments ? " active" : "")} />
              ))}
            </div>
            <span className="mic-meter-value">{micEnabled ? `${micLevel}%` : "—"}</span>
          </div>
          <p className="voice-hint">
            Fale perto do microfone — a barra acima deve se mexer instantaneamente. Use os ícones na barra
            inferior esquerda para mutar ou ensurdecer.
          </p>
        </section>

        {cameraTracks.length > 0 && (
          <section className="voice-section">
            <div className="voice-section-header">
              <p className="voice-section-title">CÂMERAS</p>
              <div className="voice-section-header-actions">
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => setCameraSizeIdx((i) => Math.max(0, i - 1))}
                  disabled={cameraSizeIdx === 0}
                  title="Diminuir câmeras"
                >
                  <ZoomOutIcon size={15} />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => setCameraSizeIdx((i) => Math.min(CAMERA_SIZES.length - 1, i + 1))}
                  disabled={cameraSizeIdx === CAMERA_SIZES.length - 1}
                  title="Aumentar câmeras"
                >
                  <ZoomInIcon size={15} />
                </button>
              </div>
            </div>
            <div className="camera-grid">
              {cameraTracks.map((c) => (
                <CameraTile key={c.identity} track={c.track} name={c.name} isLocal={c.isLocal} size={cameraSize} />
              ))}
            </div>
          </section>
        )}

        <section className="voice-section">
          <div className="voice-section-header">
            <div className="voice-section-title-group">
              <p className="voice-section-title">COMPARTILHAMENTO DE TELA</p>
              {screenShares.length > 0 && (
                <div className="share-stats">
                  <span className="live-badge live-badge-danger">
                    <span className="live-badge-dot" /> AO VIVO
                  </span>
                  {shareStats?.height && <span className="share-stat">{shareStats.height}p</span>}
                  {shareStats?.frameRate && <span className="share-stat">{Math.round(shareStats.frameRate)} fps</span>}
                  <span className="share-stat">{formatDuration(shareElapsed)}</span>
                </div>
              )}
            </div>
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
                    : "Compartilhar tela - escolha uma ABA pra ter áudio limpo (Janela/Tela Inteira ficam sem áudio, pra evitar eco)"
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
    <section id="voice-members-section" className="voice-section">
      <div className="voice-section-header">
        <p className="voice-section-title">MEMBROS COM ACESSO A ESSE CANAL — {members.length}</p>
        <span className="voice-section-sort-hint">Ordenado por atividade</span>
      </div>
      <div className="voice-participants">
        {members.map((m) => (
          <MemberRow key={m.userId} member={m} />
        ))}
      </div>
    </section>
  );
}
