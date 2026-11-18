import { useCallback, useEffect, useRef, useState } from "react";
import { useVoiceCall } from "../context/VoiceCallContext.jsx";
import { useAlert } from "../context/AlertContext.jsx";
import {
  CameraIcon,
  CameraOffIcon,
  ExternalLinkIcon,
  EyeIcon,
  EyeOffIcon,
  HangUpIcon,
  HeadphonesIcon,
  HeadphonesOffIcon,
  MaximizeIcon,
  MicIcon,
  MicOffIcon,
  PictureInPictureIcon,
  ScreenShareIcon,
  UsersIcon,
  VolumeIcon,
  WidenIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "./icons.jsx";
import VolumeSlider from "./VolumeSlider.jsx";
import Avatar from "./Avatar.jsx";
import { useTrackFps } from "../utils/useTrackFps";
import { useAppFocused } from "../utils/useAppFocused";
import CameraPipWindow from "./CameraPipWindow.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import SoundboardPanel from "./SoundboardPanel.jsx";
import { enterPip, exitPip, pipSupported, registerPipCandidate } from "../utils/screenSharePip";
import { MembersToggleButton, MobileBackButton } from "../context/LayoutContext.jsx";

const isElectronDesktop = typeof window !== "undefined" && !!window.concordeDesktop;

const CAMERA_SIZES = ["sm", "md", "lg", "xl"];


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

function VoiceHeader({ channel, serverName, live, count }) {
  return (
    <div className="chat-header chat-header-voice">
      <MobileBackButton />
      <span className="chat-header-icon">
        <HeadphonesIcon size={20} />
      </span>
      <div className="chat-header-info">
        <h1 className="chat-header-title">{channel.name}</h1>
        <p className="chat-header-subtitle">
          Canal de voz
          {live ? ` · ${count} na call` : serverName ? ` · ${serverName}` : ""}
        </p>
      </div>
      {live && (
        <span className="live-badge">
          <span className="live-badge-dot" /> NA CALL
        </span>
      )}
      <MembersToggleButton />
    </div>
  );
}

const SPEAK_BARS = [8, 18, 12, 22, 10];

function ParticipantCard({ participant, speaking, streaming }) {
  const name = participant.isLocal ? participant.name.replace(/ \(você\)$/, "") : participant.name;
  const muted = !participant.micEnabled || participant.deafened;
  const status = participant.deafened
    ? "ensurdecido"
    : !participant.micEnabled
    ? "mutado"
    : speaking
    ? "falando"
    : participant.isLocal
    ? "microfone ativo"
    : "em silêncio";
  return (
    <div className={"voice-person" + (speaking ? " speaking" : "") + (streaming ? " streaming" : "") + (participant.isLocal ? " me" : "")}>
      {streaming && <span className="voice-person-live live-tag">AO VIVO</span>}
      <Avatar name={name} url={participant.avatarUrl} className="voice-person-avatar" />
      <div className="voice-person-text">
        <div className="voice-person-name">
          {name} {participant.isLocal && <span className="voice-person-you">(você)</span>}
        </div>
        <div className={"voice-person-status" + (speaking ? " speaking" : "") + (muted ? " muted" : "")}>
          {participant.deafened ? <HeadphonesOffIcon size={13} /> : !participant.micEnabled ? <MicOffIcon size={13} /> : null}
          {status}
        </div>
      </div>
      <div className="voice-person-bars" aria-hidden="true">
        {SPEAK_BARS.map((h, i) => (
          <span key={i} style={speaking ? { height: h } : undefined} />
        ))}
      </div>
    </div>
  );
}

function CallToolbar() {
  const {
    micEnabled,
    deafened,
    cameraEnabled,
    screenSharing,
    toggleMic,
    toggleDeafen,
    toggleCamera,
    toggleScreenShare,
    leaveChannel,
  } = useVoiceCall();
  return (
    <div className="call-toolbar" role="toolbar" aria-label="Controles da call">
      <button
        type="button"
        className={"call-toolbar-btn" + (!micEnabled ? " off" : "")}
        onClick={toggleMic}
        title={micEnabled ? "Mutar microfone" : "Desmutar microfone"}
      >
        {micEnabled ? <MicIcon size={22} /> : <MicOffIcon size={22} />}
      </button>
      <button
        type="button"
        className={"call-toolbar-btn" + (deafened ? " off" : "")}
        onClick={toggleDeafen}
        title={deafened ? "Reativar áudio" : "Ensurdecer (não ouvir ninguém)"}
      >
        {deafened ? <HeadphonesOffIcon size={22} /> : <HeadphonesIcon size={22} />}
      </button>
      <button
        type="button"
        className={"call-toolbar-btn" + (cameraEnabled ? " on" : "")}
        onClick={toggleCamera}
        title={cameraEnabled ? "Desligar câmera" : "Ligar câmera"}
      >
        {cameraEnabled ? <CameraIcon size={22} /> : <CameraOffIcon size={22} />}
      </button>
      <button
        type="button"
        className={"call-toolbar-btn accent" + (screenSharing ? " on" : "")}
        onClick={toggleScreenShare}
        title={
          screenSharing
            ? "Parar compartilhamento"
            : "Compartilhar tela - escolha uma ABA pra ter áudio limpo (Janela/Tela Inteira ficam sem áudio, pra evitar eco)"
        }
      >
        <ScreenShareIcon size={22} />
      </button>
      <button type="button" className="call-toolbar-leave" onClick={leaveChannel} title="Sair da call">
        <HangUpIcon size={22} />
        SAIR
      </button>
    </div>
  );
}

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

function ScreenShareTile({
  share,
  theaterMode,
  onToggleWatch,
  onStopSharing,
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

  const appFocused = useAppFocused();
  const previewPaused = share.isLocal && !appFocused;

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !share.track || previewPaused) return;
    share.track.attach(el);
    return () => share.track.detach(el);
  }, [share.track, previewPaused]);

  // Janela flutuante: só pra transmissões de outras pessoas que você está assistindo.
  const canPip = pipSupported && !share.isLocal && share.watching;
  const [inPip, setInPip] = useState(false);
  useEffect(() => {
    const el = videoRef.current;
    if (!canPip || !el) return undefined;
    const unregister = registerPipCandidate(el);
    const onEnter = () => setInPip(true);
    const onLeave = () => setInPip(false);
    el.addEventListener("enterpictureinpicture", onEnter);
    el.addEventListener("leavepictureinpicture", onLeave);
    setInPip(document.pictureInPictureElement === el);
    return () => {
      unregister();
      el.removeEventListener("enterpictureinpicture", onEnter);
      el.removeEventListener("leavepictureinpicture", onLeave);
      if (document.pictureInPictureElement === el) exitPip();
    };
  }, [canPip, share.track]);

  function togglePip() {
    if (inPip) exitPip();
    else enterPip(videoRef.current);
  }

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

  const owner = participants.find((p) => p.identity === share.participantIdentity);
  const ownerAvatar = owner?.avatarUrl;
  const ownerName = share.isLocal ? "Sua tela" : share.name;

  if (!share.isLocal && !share.watching) {
    return (
      <div className="stream-card idle">
        <button
          type="button"
          className="stream-card-screen"
          onClick={() => onToggleWatch(share.sid)}
          title={`Assistir a transmissão de ${share.name}`}
        >
          <span className="stream-card-idle">
            <Avatar name={share.name} url={ownerAvatar} className="stream-card-idle-avatar" />
            <strong>{share.name} está transmitindo</strong>
            <span className="stream-card-idle-hint">
              <EyeIcon size={14} /> clique pra assistir
            </span>
          </span>
        </button>
        <div className="stream-card-bar">
          <div className="stream-card-who">
            <Avatar name={share.name} url={ownerAvatar} className="voice-avatar" />
            <div className="stream-card-who-text">
              <strong>{share.name}</strong>
              <span>você não está assistindo</span>
            </div>
            <span className="live-tag">AO VIVO</span>
          </div>
          <div className="stream-card-actions">
            <button type="button" className="stream-btn stream-btn-label primary" onClick={() => onToggleWatch(share.sid)}>
              <EyeIcon size={16} /> <span className="stream-btn-text">Assistir</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={"stream-card" + (theaterMode ? " theater" : "")}>
      <div
        ref={containerRef}
        className={"stream-card-screen" + (isFullscreen ? " is-fullscreen" : "")}
        onContextMenu={
          share.isLocal
            ? undefined
            : (e) => {
                e.preventDefault();
                onVolumeMenu(e, share);
              }
        }
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={share.isLocal}
          onDoubleClick={handleMaximize}
          style={previewPaused ? { display: "none" } : undefined}
        />
        {inPip && (
          <div className="screenshare-preview-paused screenshare-pip-placeholder">
            <PictureInPictureIcon size={26} />
            <span>Tocando na janela flutuante</span>
            <button type="button" className="screenshare-pip-back" onClick={togglePip}>
              Trazer de volta
            </button>
          </div>
        )}
        {previewPaused && (
          <div className="screenshare-preview-paused">
            <EyeOffIcon size={20} />
            <span>Prévia pausada - você está fora do Concorde (os outros continuam vendo normalmente)</span>
          </div>
        )}
        {isFullscreen && (
          <>
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

      <div className="stream-card-bar">
        <div className="stream-card-who">
          <Avatar name={share.name} url={ownerAvatar} className="voice-avatar" />
          <div className="stream-card-who-text">
            <strong>{ownerName}</strong>
            <span>{fps != null ? `${fps} fps` : "conectando…"}</span>
          </div>
          <span className="live-tag">AO VIVO</span>
        </div>

        <div className="stream-card-actions">
          <div className="stream-watchers" ref={watchersRef}>
            <button
              type="button"
              className={"stream-btn stream-btn-label" + (watchersOpen ? " active" : "")}
              onClick={() => setWatchersOpen((v) => !v)}
              title="Quem está vendo essa transmissão agora"
            >
              <EyeIcon size={16} />
              {watchers.length}
            </button>
            {watchersOpen && (
              <div className="stream-watchers-popover">
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
          {!share.isLocal && (
            <button type="button" className="stream-btn" onClick={(e) => onVolumeMenu(e, share)} title="Volume da transmissão">
              <VolumeIcon size={16} />
            </button>
          )}
          {canPip && (
            <button
              type="button"
              className={"stream-btn" + (inPip ? " active" : "")}
              onClick={togglePip}
              title={inPip ? "Trazer de volta da janela flutuante" : "Janela flutuante (fica por cima de tudo, mesmo com o Concorde minimizado)"}
            >
              <PictureInPictureIcon size={16} />
            </button>
          )}
          <button
            type="button"
            className={"stream-btn" + (theaterMode ? " active" : "")}
            onClick={onToggleTheater}
            title={theaterMode ? "Voltar ao tamanho normal" : "Modo teatro (ocupa a largura toda)"}
          >
            <WidenIcon size={16} />
          </button>
          <button type="button" className="stream-btn" onClick={handleMaximize} title="Tela cheia">
            <MaximizeIcon size={16} />
          </button>
          {share.isLocal ? (
            <button type="button" className="stream-btn stream-btn-label danger" onClick={onStopSharing} title="Parar de compartilhar sua tela">
              <ScreenShareIcon size={16} /> <span className="stream-btn-text">Parar</span>
            </button>
          ) : (
            <button
              type="button"
              className="stream-btn stream-btn-label"
              onClick={() => onToggleWatch(share.sid)}
              title="Parar de assistir (economiza dados - você continua na call de voz normalmente)"
            >
              <EyeOffIcon size={16} /> <span className="stream-btn-text">Sair</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

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

  const isThisChannelActive = connected && activeChannel?.id === channel.id;

  const [volumeMenu, setVolumeMenu] = useState(null);
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

  const [cameraSizeIdx, setCameraSizeIdx] = useState(1);
  const cameraSize = CAMERA_SIZES[cameraSizeIdx];
  const [cameraPipOpen, setCameraPipOpen] = useState(false);
  const cameraPipSupported = isElectronDesktop || (typeof window !== "undefined" && "documentPictureInPicture" in window);
  const { token } = useAuth();
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
              <button className="btn-sticker" onClick={() => joinChannel(channel)}>
                <HeadphonesIcon size={18} /> TROCAR PRA ESSA CALL
              </button>
            </div>
          ) : (
            <button className="btn-sticker" onClick={() => joinChannel(channel)}>
              <HeadphonesIcon size={18} /> ENTRAR NA CALL
            </button>
          )}
        </div>
      </div>
    );
  }

  const liveIdentities = new Set(screenShares.map((s) => s.participantIdentity));
  const orderedParticipants = participants
    .map((p, i) => ({ p, i, streaming: p.isLocal ? screenSharing : liveIdentities.has(p.identity) }))
    .sort((a, b) => (a.streaming === b.streaming ? a.i - b.i : a.streaming ? -1 : 1));

  return (
    <div className="voice-channel">
      <VoiceHeader channel={channel} serverName={serverName} live count={participants.length} />

      <div className="voice-body">
        {screenShares.length > 0 && (
          <section
            className={"stream-stage" + (screenShares.length > 1 ? " multi" : "")}
            ref={screenshareSectionRef}
            aria-label="Transmissões de tela"
          >
            {screenShares.map((s) => (
              <ScreenShareTile
                key={s.sid}
                share={s}
                theaterMode={theaterSids.has(s.sid)}
                onToggleTheater={() => toggleTheater(s.sid)}
                onToggleWatch={toggleWatchScreenShare}
                onStopSharing={toggleScreenShare}
                onVolumeMenu={openVolumeMenu}
                participants={participants}
                cameraTracks={cameraTracks}
                speakingIds={speakingIds}
                watchers={screenShareWatchers[s.participantIdentity] || []}
              />
            ))}
          </section>
        )}

        <section className={"voice-people" + (screenShares.length > 0 ? " compact" : "")} aria-label="Participantes">
          {orderedParticipants.map(({ p, streaming }) => (
            <ParticipantCard key={p.identity} participant={p} speaking={speakingIds.has(p.identity)} streaming={streaming} />
          ))}
          {!screenSharing && screenShares.length === 0 && (
            <button type="button" className="voice-person voice-person-share" onClick={toggleScreenShare}>
              <span className="voice-person-share-icon">
                <ScreenShareIcon size={28} />
              </span>
              <span className="voice-person-share-title">Compartilhar tela</span>
              <span className="voice-person-share-hint">Ninguém transmitindo agora</span>
            </button>
          )}
        </section>

        <section className="voice-section voice-mic-row" aria-label="Seu microfone">
          <h2 className="voice-section-title">SEU MIC</h2>
          <div className={"mic-meter-bar" + (micEnabled ? "" : " muted")} aria-hidden="true">
            <div className="mic-meter-bar-fill" style={{ width: `${micEnabled ? micLevel : 0}%` }} />
          </div>
          <span className="voice-mic-hint">
            {micEnabled ? `${micLevel}% · fala perto do mic pra testar` : "microfone mutado"}
          </span>
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

        <SoundboardPanel channelId={channel.id} stompClient={stompClient} stompConnected={stompConnected} />

      </div>

      <CallToolbar />

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

