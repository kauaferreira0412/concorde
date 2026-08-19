import { useEffect, useRef, useState } from "react";
import { useVoiceCall } from "../context/VoiceCallContext.jsx";
import { useServerMembers } from "../utils/useServerMembers";
import {
  EyeOffIcon,
  MaximizeIcon,
  MenuIcon,
  MicIcon,
  MicOffIcon,
  ScreenShareIcon,
  VolumeIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "./icons.jsx";
import { MemberRow } from "./MemberList.jsx";

// Tamanhos disponiveis pro tile de webcam - "size" vira uma classe CSS (.camera-tile-<size>,
// ver global.css). Comeca em "md" (tamanho de antes), dá pra aumentar/diminuir pelos botoes
// no cabecalho da secao (afeta TODOS os tiles de uma vez, ver CAMERA_SIZES/cameraSize abaixo).
const CAMERA_SIZES = ["sm", "md", "lg", "xl"];

// Quantidade de barrinhas do medidor de microfone (estilo equalizador) - puramente visual,
// so' controla a resolucao do "preenchimento" (ver mic-meter-segments em VoiceChannel).
const MIC_SEGMENT_COUNT = 40;
const MIC_SEGMENTS = Array.from({ length: MIC_SEGMENT_COUNT }, (_, i) => i);

/** Cabecalho do canal de voz - nome, subtitulo "Canal de voz · Servidor", badge de "TEMPO
 *  REAL" enquanto conectado. Sem "facepile" de iniciais aqui (pedido do usuario pra tirar) -
 *  quem esta na call ja aparece na lista de participantes logo abaixo. */
function VoiceHeader({ channel, serverName, live }) {
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
      <button
        type="button"
        className="icon-btn"
        style={{ marginLeft: "auto" }}
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
 * Um quadrado por transmissao de tela ativa - mesmo estilo/tamanho do tile de camera (pedido
 * explicito do usuario, com print de referencia). Enquanto ninguem escolheu assistir aquela
 * transmissao especifica (isLocal e' sempre "assistida", e' a sua propria), o quadrado so'
 * mostra o nome de quem esta compartilhando no centro e funciona como botao - clicar nele e'
 * o unico jeito de comecar a baixar aquele video (ver toggleWatchScreenShare/
 * watchedShareIdentitiesRef no VoiceCallContext: ninguem mais entra automaticamente numa
 * transmissao so' porque alguem comecou a compartilhar).
 */
function ScreenShareTile({ share, onToggleWatch }) {
  const videoRef = useRef(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !share.track) return;
    share.track.attach(el);
    return () => share.track.detach(el);
  }, [share.track]);

  function handleMaximize() {
    const el = videoRef.current;
    const request = el?.requestFullscreen || el?.webkitRequestFullscreen;
    request?.call(el);
  }

  if (!share.isLocal && !share.watching) {
    return (
      <button
        type="button"
        className="camera-tile camera-tile-md screenshare-tile-pick"
        onClick={() => onToggleWatch(share.sid)}
        title={`Clique para assistir a transmissão de ${share.name}`}
      >
        <ScreenShareIcon size={22} />
        <span className="screenshare-tile-pick-name">{share.name}</span>
        <span className="screenshare-tile-pick-hint">Clique para assistir</span>
      </button>
    );
  }

  return (
    <div className="camera-tile camera-tile-md">
      <video ref={videoRef} autoPlay playsInline muted={share.isLocal} onDoubleClick={handleMaximize} />
      <span className="camera-tile-name">{share.name}</span>
      <button type="button" className="camera-tile-maximize" onClick={handleMaximize} title="Tela cheia">
        <MaximizeIcon size={13} />
      </button>
      {!share.isLocal && (
        <button
          type="button"
          className="screenshare-tile-stop"
          onClick={() => onToggleWatch(share.sid)}
          title="Parar de assistir (economiza dados - você continua na call de voz normalmente)"
        >
          <EyeOffIcon size={13} />
        </button>
      )}
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
    toggleScreenShare,
    toggleWatchScreenShare,
    joinChannel,
  } = useVoiceCall();
  // Hoje nao existe permissao por canal (todo membro do servidor ve todos os canais - ver
  // README), entao "quem tem acesso a esse canal de voz" = todo membro do servidor.
  const members = useServerMembers(channel.serverId, stompClient, stompConnected);

  const isThisChannelActive = connected && activeChannel?.id === channel.id;

  // Indice em CAMERA_SIZES - comeca no "md" (index 1, tamanho de antes). Afeta todos os
  // tiles de webcam de uma vez (ver botoes +/- no cabecalho da secao CÂMERAS).
  const [cameraSizeIdx, setCameraSizeIdx] = useState(1);
  const cameraSize = CAMERA_SIZES[cameraSizeIdx];

  if (!isThisChannelActive) {
    return (
      <div className="voice-channel">
        <VoiceHeader channel={channel} serverName={serverName} live={false} />
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
      <VoiceHeader channel={channel} serverName={serverName} live />

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
            <p className="voice-section-title">COMPARTILHAMENTO DE TELA</p>
            <div className="voice-section-header-actions">
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

          {screenShares.length === 0 ? (
            <div className="screenshare-empty">
              <ScreenShareIcon size={28} />
              <p>Ninguém está compartilhando a tela agora.</p>
            </div>
          ) : (
            // Um quadrado por transmissao (lado a lado, mesmo tamanho/estilo do tile de
            // camera) - quem nao e' voce so' vira video de verdade depois que voce clica pra
            // entrar naquela transmissao especifica (ver ScreenShareTile acima).
            <div className="camera-grid">
              {screenShares.map((s) => (
                <ScreenShareTile key={s.sid} share={s} onToggleWatch={toggleWatchScreenShare} />
              ))}
            </div>
          )}
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
