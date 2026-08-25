import { useCallback, useEffect, useRef, useState } from "react";
import { useVoiceCall } from "../context/VoiceCallContext.jsx";
import { useAlert } from "../context/AlertContext.jsx";
import { useServerMembers } from "../utils/useServerMembers";
import {
  ExternalLinkIcon,
  EyeIcon,
  EyeOffIcon,
  MaximizeIcon,
  MenuIcon,
  MicIcon,
  MicOffIcon,
  ScreenShareIcon,
  UsersIcon,
  VolumeIcon,
  WidenIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "./icons.jsx";
import { MemberRow } from "./MemberList.jsx";
import VolumeSlider from "./VolumeSlider.jsx";
import Avatar from "./Avatar.jsx";
import { useTrackFps } from "../utils/useTrackFps";
import CameraPipWindow from "./CameraPipWindow.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import SoundboardPanel from "./SoundboardPanel.jsx";

// window.concordeDesktop so' existe dentro do app Electron (ver electron/preload.cjs). A janela
// separada das cameras usa Document Picture-in-Picture (CameraPipWindow.jsx) NO NAVEGADOR - mas
// essa API depende de integracao com a "casca" de navegador de verdade (abas, gerenciador de
// janelas) que o Electron simplesmente NAO tem (ele empacota so' o motor Chromium, sem o Chrome
// em si por cima) - o objeto ate' existe no "window" (nao da pra checar por feature-detection
// comum), mas o pedido de janela nunca resolve nem rejeita, so' fica pendurado pra sempre
// (reportado: "clico, pisca e nao aparece nada" - so' no app desktop, no navegador funciona).
// Dentro do Electron a gente abre uma janela DE VERDADE do proprio Electron em vez disso (ver
// window.concordeDesktop.openCameraPip/CameraPipPage.jsx) - como e' um PROCESSO separado, nao
// enxerga os tracks de video da janela principal, entao ela entra na MESMA sala do LiveKit por
// conta propria so' pra assistir (token "hidden", ver VoiceController.getCameraViewerToken).
const isElectronDesktop = typeof window !== "undefined" && !!window.concordeDesktop;

// Tamanhos disponiveis pro tile de webcam - "size" vira uma classe CSS (.camera-tile-<size>,
// ver global.css). Comeca em "md" (tamanho de antes), dá pra aumentar/diminuir pelos botoes
// no cabecalho da secao (afeta TODOS os tiles de uma vez, ver CAMERA_SIZES/cameraSize abaixo).
const CAMERA_SIZES = ["sm", "md", "lg", "xl"];

// Quantidade de barrinhas do medidor de microfone (estilo equalizador) - puramente visual,
// so' controla a resolucao do "preenchimento" (ver mic-meter-segments em VoiceChannel).
const MIC_SEGMENT_COUNT = 40;
const MIC_SEGMENTS = Array.from({ length: MIC_SEGMENT_COUNT }, (_, i) => i);

/** true so' quando ESSE elemento especifico (nao qualquer um) esta em tela cheia agora -
 *  varios tiles podem entrar em tela cheia em momentos diferentes, cada um com seu proprio
 *  botao (ver ScreenShareTile) - por isso escuta fullscreenchange e compara com o proprio ref,
 *  em vez de um estado global unico. */
function useIsThisElementFullscreen(elRef) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => {
    function handleChange() {
      setIsFullscreen(document.fullscreenElement === elRef.current);
    }
    document.addEventListener("fullscreenchange", handleChange);
    return () => document.removeEventListener("fullscreenchange", handleChange);
  }, [elRef]);
  return isFullscreen;
}

/**
 * "Facepile" flutuante que aparece POR CIMA de uma tela compartilhada em tela cheia - igual o
 * Discord: cada pessoa na call vira um circulo (a propria camera, se estiver ligada, senao o
 * avatar), com um anel verde quando esta falando. Escondida por padrao mesmo em tela cheia -
 * um botao (UsersIcon) no canto liga/desliga ela na hora, sem sair da tela cheia.
 */
function FullscreenParticipantStrip({ participants, cameraTracks, speakingIds }) {
  const cameraByIdentity = new Map(cameraTracks.map((c) => [c.identity, c]));
  return (
    <div className="fullscreen-participant-strip">
      {participants.map((p) => {
        const camera = cameraByIdentity.get(p.identity);
        const speaking = speakingIds.has(p.identity);
        return (
          <div key={p.identity} className={"fullscreen-participant-item" + (speaking ? " speaking" : "")}>
            {camera?.track ? (
              <FullscreenParticipantCamera track={camera.track} isLocal={p.isLocal} />
            ) : (
              <Avatar name={p.name} url={p.avatarUrl} className="fullscreen-participant-avatar" />
            )}
            <span className="fullscreen-participant-name">{p.name}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Camera de alguem dentro do facepile - tile pequeno e redondo em vez do retangulo normal
 *  (ver CameraTile), so' pra caber no anel junto com os avatares de quem nao tem camera. */
function FullscreenParticipantCamera({ track, isLocal }) {
  const videoRef = useRef(null);
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !track) return;
    track.attach(el);
    return () => track.detach(el);
  }, [track]);
  return <video ref={videoRef} autoPlay playsInline muted={isLocal} className="fullscreen-participant-avatar" />;
}

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
 * Um quadrado por transmissao de tela ativa. Enquanto ninguem escolheu assistir aquela
 * transmissao especifica (isLocal e' sempre "assistida", e' a sua propria - quem compartilha
 * ve a propria previa do MESMO jeito que quem esta assistindo, pedido explicito do usuario),
 * o quadrado fica num tamanho pequeno e fixo (so' um "escolher" clicavel, com o nome de quem
 * compartilha no centro) - clicar nele e' o unico jeito de comecar a baixar aquele video (ver
 * toggleWatchScreenShare/watchedShareIdentitiesRef no VoiceCallContext). Assistindo, o tile usa
 * um tamanho fixo (bem maior que o de camera) OU o tamanho de "modo teatro" (ver theaterMode em
 * VoiceChannel) - sem zoom manual, so' esses dois estados. Botao direito (so' em transmissao de
 * outra pessoa que voce esta assistindo) abre o controle de volume do audio dela - mesmo padrao
 * do botao direito num participante na sidebar (ver onVolumeMenu/VolumeSlider em VoiceChannel).
 * Em tela cheia, ganha o facepile flutuante da call (ver FullscreenParticipantStrip) - por
 * isso "tela cheia" aqui fulscreena o CONTAINER (essa div toda), nao so' o <video> sozinho:
 * um <video> em tela cheia so' pode mostrar o proprio video, nada por cima dele.
 */
function ScreenShareTile({
  share,
  theaterMode,
  onToggleWatch,
  onToggleTheater,
  onVolumeMenu,
  participants,
  cameraTracks,
  speakingIds,
  watchers,
}) {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const isFullscreen = useIsThisElementFullscreen(containerRef);
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [watchersOpen, setWatchersOpen] = useState(false);
  const watchersRef = useRef(null);
  const fps = useTrackFps(share.track);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !share.track) return;
    share.track.attach(el);
    return () => share.track.detach(el);
  }, [share.track]);

  // Fecha o popover de "quem esta vendo" ao clicar em qualquer lugar fora dele - mesmo padrao
  // do menu de canal (ver ChannelSidebar.jsx).
  useEffect(() => {
    if (!watchersOpen) return;
    function handlePointerDown(e) {
      if (watchersRef.current && !watchersRef.current.contains(e.target)) setWatchersOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [watchersOpen]);

  function handleMaximize() {
    const el = containerRef.current;
    const request = el?.requestFullscreen || el?.webkitRequestFullscreen;
    request?.call(el);
  }

  if (!share.isLocal && !share.watching) {
    return (
      <button
        type="button"
        className="camera-tile screenshare-tile-pick"
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
    <div
      ref={containerRef}
      className={"camera-tile " + (theaterMode ? "screenshare-tile-theater" : "screenshare-tile-default") + (isFullscreen ? " is-fullscreen" : "")}
      onContextMenu={
        share.isLocal
          ? undefined
          : (e) => {
              e.preventDefault();
              onVolumeMenu(e, share);
            }
      }
    >
      <video ref={videoRef} autoPlay playsInline muted={share.isLocal} onDoubleClick={handleMaximize} />
      {!isFullscreen && (
        <>
          <span className="camera-tile-name">{share.name}</span>
          {fps != null && <span className="screenshare-fps-badge">{fps} fps</span>}
          <div className="screenshare-watchers-wrap" ref={watchersRef}>
            <button
              type="button"
              className={"screenshare-watchers-btn" + (watchersOpen ? " active" : "")}
              onClick={(e) => {
                e.stopPropagation();
                setWatchersOpen((v) => !v);
              }}
              title="Quem está vendo essa transmissão agora"
            >
              <EyeIcon size={13} />
              <span>{watchers.length}</span>
            </button>
            {watchersOpen && (
              <div className="screenshare-watchers-popover">
                <p className="screenshare-watchers-title">Assistindo agora</p>
                {watchers.length === 0 ? (
                  <p className="admin-hint" style={{ margin: 0 }}>
                    Ninguém está assistindo ainda.
                  </p>
                ) : (
                  watchers.map((w) => (
                    <div key={w.userId} className="screenshare-watchers-row">
                      <Avatar name={w.name} url={w.avatarUrl} className="voice-avatar small" />
                      <span>{w.name}</span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
          <button
            type="button"
            className={"screenshare-tile-theater-btn" + (theaterMode ? " active" : "")}
            onClick={onToggleTheater}
            title={theaterMode ? "Voltar ao tamanho normal" : "Modo teatro (bem maior, so' essa tela)"}
          >
            <WidenIcon size={13} />
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
          <button type="button" className="camera-tile-maximize" onClick={handleMaximize} title="Tela cheia">
            <MaximizeIcon size={13} />
          </button>
        </>
      )}

      {isFullscreen && (
        <>
          {/* Igual o Discord: botao pra ligar/desligar o facepile por cima do video, sem sair
              da tela cheia - escondido por padrao mesmo em tela cheia (pedido explicito do
              usuario: "clicou, aparece a sobreposição; clicou de novo, some"). */}
          <button
            type="button"
            className={"fullscreen-overlay-toggle" + (overlayVisible ? " active" : "")}
            onClick={() => setOverlayVisible((v) => !v)}
            title={overlayVisible ? "Esconder quem está na call" : "Mostrar quem está na call"}
          >
            <UsersIcon size={16} />
          </button>
          {overlayVisible && (
            <FullscreenParticipantStrip participants={participants} cameraTracks={cameraTracks} speakingIds={speakingIds} />
          )}
        </>
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
  const { showAlert } = useAlert();
  const {
    activeChannel,
    connected,
    micEnabled,
    micLevel,
    screenSharing,
    screenShares,
    cameraTracks,
    participants,
    speakingIds,
    toggleScreenShare,
    toggleWatchScreenShare,
    screenShareWatchers,
    streamVolumes,
    setStreamVolume,
    joinChannel,
  } = useVoiceCall();
  // Hoje nao existe permissao por canal (todo membro do servidor ve todos os canais - ver
  // README), entao "quem tem acesso a esse canal de voz" = todo membro do servidor.
  const members = useServerMembers(channel.serverId, stompClient, stompConnected);

  const isThisChannelActive = connected && activeChannel?.id === channel.id;

  // Popover de volume do audio da transmissao de tela - abre no botao direito em cima de uma
  // tela de OUTRA pessoa que voce esta assistindo (ver ScreenShareTile), mesmo padrao do botao
  // direito num participante na sidebar (ver ChannelSidebar.jsx).
  const [volumeMenu, setVolumeMenu] = useState(null); // { participantIdentity, name, x, y }
  const volumeMenuRef = useRef(null);

  function openVolumeMenu(e, share) {
    setVolumeMenu({ participantIdentity: share.participantIdentity, name: share.name, x: e.clientX, y: e.clientY });
  }

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

  // Indice em CAMERA_SIZES - comeca no "md" (index 1, tamanho de antes). Afeta todos os
  // tiles de webcam de uma vez (ver botoes +/- no cabecalho da secao CÂMERAS).
  const [cameraSizeIdx, setCameraSizeIdx] = useState(1);
  const cameraSize = CAMERA_SIZES[cameraSizeIdx];
  // Janela separada so' com as cameras - pedido explicito do usuario: ver as cameras maiores,
  // lado a lado, numa janela DE VERDADE. No navegador usa Document Picture-in-Picture (ver
  // CameraPipWindow.jsx, gerido por "cameraPipOpen" - liga/desliga no mesmo clique). No app
  // desktop abre uma BrowserWindow de verdade do Electron por IPC (ver
  // window.concordeDesktop.openCameraPip/CameraPipPage.jsx) - essa janela se vira sozinha
  // (processo separado, com seu proprio ciclo de vida), entao o clique aqui e' so' UMA ACAO
  // ("abrir/focar"), sem precisar de estado nenhum de "aberta ou nao" desse lado.
  const [cameraPipOpen, setCameraPipOpen] = useState(false);
  const cameraPipSupported = isElectronDesktop || (typeof window !== "undefined" && "documentPictureInPicture" in window);
  const { token } = useAuth();
  // Sem camera nenhuma ligada, a secao inteira some (ver "cameraTracks.length > 0" abaixo) -
  // sem isso aqui, se alguem ligasse a camera de novo depois, a secao voltaria tentando reabrir
  // o PiP do navegador sozinha (sem clique nenhum da pessoa), e ele rejeita isso
  // (documentPictureInPicture exige um gesto do usuario) - melhor so' resetar nesse meio-tempo.
  useEffect(() => {
    if (cameraTracks.length === 0) setCameraPipOpen(false);
  }, [cameraTracks.length]);

  function handleCameraPipClick() {
    if (isElectronDesktop) {
      window.concordeDesktop.openCameraPip(channel.id, token);
    } else {
      setCameraPipOpen((v) => !v);
    }
  }

  // "Modo teatro" - POR TELA (um Set de sids), nao um botao global: ativar/desativar numa
  // transmissao nao deve mexer nas outras (bug relatado: parar de assistir uma tirava o modo
  // teatro de TODAS). So' dois tamanhos por tile (normal ou bem maior), sem zoom manual.
  const [theaterSids, setTheaterSids] = useState(() => new Set());
  const screenshareSectionRef = useRef(null);

  const toggleTheater = useCallback((sid) => {
    setTheaterSids((prev) => {
      const next = new Set(prev);
      if (next.has(sid)) next.delete(sid);
      else next.add(sid);
      return next;
    });
  }, []);

  // Limpa sids que pararam de ser assistidos (parou de assistir, ou a pessoa parou de
  // compartilhar de vez) - senao "modo teatro" ficava "lembrado" preso pra um sid morto.
  useEffect(() => {
    setTheaterSids((prev) => {
      if (prev.size === 0) return prev;
      const watchedSids = new Set(screenShares.filter((s) => s.watching).map((s) => s.sid));
      let changed = false;
      const next = new Set();
      prev.forEach((sid) => {
        if (watchedSids.has(sid)) next.add(sid);
        else changed = true;
      });
      return changed ? next : prev;
    });
  }, [screenShares]);

  function handleScreenshareFullscreen() {
    const videoEl = screenshareSectionRef.current?.querySelector(".screenshare-tile-default video, .screenshare-tile-theater video");
    const request = videoEl?.requestFullscreen || videoEl?.webkitRequestFullscreen;
    request?.call(videoEl);
  }

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
                  disabled={cameraSizeIdx === 0 || cameraPipOpen}
                  title="Diminuir câmeras"
                >
                  <ZoomOutIcon size={15} />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => setCameraSizeIdx((i) => Math.min(CAMERA_SIZES.length - 1, i + 1))}
                  disabled={cameraSizeIdx === CAMERA_SIZES.length - 1 || cameraPipOpen}
                  title="Aumentar câmeras"
                >
                  <ZoomInIcon size={15} />
                </button>
                {cameraPipSupported && (
                  <button
                    type="button"
                    className={"icon-btn" + (cameraPipOpen ? " icon-btn-active" : "")}
                    onClick={handleCameraPipClick}
                    title={
                      isElectronDesktop
                        ? "Abrir câmeras em outra janela"
                        : cameraPipOpen
                        ? "Voltar pro Concorde"
                        : "Abrir câmeras em outra janela"
                    }
                  >
                    <ExternalLinkIcon size={15} />
                  </button>
                )}
              </div>
            </div>
            {cameraPipOpen && !isElectronDesktop ? (
              <>
                <p className="voice-hint">As câmeras estão numa janela separada agora.</p>
                <CameraPipWindow onClose={() => setCameraPipOpen(false)} onError={showAlert}>
                  <div className="camera-pip-grid">
                    {cameraTracks.map((c) => (
                      <CameraTile key={c.identity} track={c.track} name={c.name} isLocal={c.isLocal} size="xl" />
                    ))}
                  </div>
                </CameraPipWindow>
              </>
            ) : (
              <div className="camera-grid">
                {cameraTracks.map((c) => (
                  <CameraTile key={c.identity} track={c.track} name={c.name} isLocal={c.isLocal} size={cameraSize} />
                ))}
              </div>
            )}
          </section>
        )}

        <section className="voice-section">
          <div className="voice-section-header">
            <p className="voice-section-title">COMPARTILHAMENTO DE TELA</p>
            <div className="voice-section-header-actions">
              {screenShares.some((s) => s.watching) && (
                <button type="button" className="icon-btn" onClick={handleScreenshareFullscreen} title="Tela cheia">
                  <MaximizeIcon size={15} />
                </button>
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

          {screenShares.length === 0 ? (
            <div className="screenshare-empty">
              <ScreenShareIcon size={28} />
              <p>Ninguém está compartilhando a tela agora.</p>
            </div>
          ) : (
            // Um quadrado por transmissao - quem nao e' voce so' vira video de verdade depois
            // que voce clica pra entrar naquela transmissao especifica (ver ScreenShareTile
            // acima); os que ja estao sendo assistidos (inclusive a sua propria, se estiver
            // compartilhando) usam o tamanho normal ou o de "modo teatro" (POR TELA, ver
            // theaterSids acima) - sem zoom manual.
            <div className="camera-grid" ref={screenshareSectionRef}>
              {screenShares.map((s) => (
                <ScreenShareTile
                  key={s.sid}
                  share={s}
                  theaterMode={theaterSids.has(s.sid)}
                  onToggleTheater={() => toggleTheater(s.sid)}
                  onToggleWatch={toggleWatchScreenShare}
                  onVolumeMenu={openVolumeMenu}
                  participants={participants}
                  cameraTracks={cameraTracks}
                  speakingIds={speakingIds}
                  watchers={screenShareWatchers[s.participantIdentity] || []}
                />
              ))}
            </div>
          )}
        </section>

        <SoundboardPanel channelId={channel.id} />

        <ChannelAccessSection members={members} />
      </div>

      {volumeMenu && (
        <div
          className="volume-popover"
          ref={volumeMenuRef}
          style={{
            left: Math.min(volumeMenu.x, window.innerWidth - 232),
            top: Math.min(volumeMenu.y, window.innerHeight - 70),
          }}
        >
          <p className="volume-popover-title">{volumeMenu.name}</p>
          <VolumeSlider
            value={streamVolumes[volumeMenu.participantIdentity] ?? 100}
            onChange={(v) => setStreamVolume(volumeMenu.participantIdentity, v)}
            label={`Volume do áudio da transmissão de ${volumeMenu.name} (padrão 100%, pode passar de 100%)`}
          />
        </div>
      )}
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
