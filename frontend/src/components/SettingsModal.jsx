import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMicLevel } from "../utils/useMicLevel";
import {
  getNoiseSuppressionMode,
  getSavedAudioInput,
  getSavedAudioOutput,
  getSavedVideoInput,
  getSoundEffectsEnabled,
  setNoiseSuppressionMode as persistNoiseSuppressionMode,
  setSavedAudioInput,
  setSavedAudioOutput,
  setSavedVideoInput,
  setSoundEffectsEnabled,
} from "../utils/audioSettings";
import { NOISE_SUPPRESSION_MODES, createNoiseSuppressionProcessor } from "../utils/noiseSuppression";
import { getDesktopNotificationsEnabled, setDesktopNotificationsEnabled } from "../utils/notificationSettings";
import {
  formatShortcut,
  getDeafenShortcut,
  getMuteShortcut,
  isOnlyModifier,
  setDeafenShortcut,
  setMuteShortcut,
  shortcutFromEvent,
} from "../utils/keyboardShortcuts";
import { playJoinSound } from "../utils/soundEffects";
import { useAuth } from "../context/AuthContext.jsx";
import { useVoiceCall } from "../context/VoiceCallContext.jsx";
import api from "../api/client";
import Avatar from "./Avatar.jsx";
import StatusDropdown from "./StatusDropdown.jsx";
import VolumeSlider from "./VolumeSlider.jsx";
import { BellIcon, KeyboardIcon, MicIcon, MusicNoteIcon, PaletteIcon, ShieldIcon, UserIcon, XIcon } from "./icons.jsx";
import AppearanceSettings from "./AppearanceSettings.jsx";
import ImageCropModal from "./ImageCropModal.jsx";
import { getAutoPipEnabled, pipSupported, setAutoPipEnabled } from "../utils/screenSharePip";
import { getAutoListenAudioShare, setAutoListenAudioShare } from "../utils/audioShareListen";
import { accentStyle } from "./AccentColorPicker.jsx";
import { AboutBlocksEditor } from "./AboutBlocks.jsx";
import CardColorsEditor from "./CardColorsEditor.jsx";
import SteamConnectCard from "./SteamConnectCard.jsx";

const TABS = [
  { id: "perfil", label: "Perfil", Icon: UserIcon },
  { id: "aparencia", label: "Aparência", Icon: PaletteIcon },
  { id: "audio", label: "Áudio e vídeo", Icon: MicIcon },
  { id: "atalhos", label: "Atalhos", Icon: KeyboardIcon },
  { id: "notificacoes", label: "Notificações", Icon: BellIcon },
  { id: "conexoes", label: "Conexões", Icon: MusicNoteIcon },
];
const ADMIN_TAB = { id: "administracao", label: "Administração", Icon: ShieldIcon };

function ShortcutRecorder({ value, onChange }) {
  const [recording, setRecording] = useState(false);

  function handleKeyDown(e) {
    e.preventDefault();
    if (isOnlyModifier(e)) return;
    if (e.key === "Escape") {
      setRecording(false);
      return;
    }
    onChange(shortcutFromEvent(e));
    setRecording(false);
  }

  return (
    <div className="shortcut-row">
      <kbd className="shortcut-kbd">{formatShortcut(value)}</kbd>
      {recording ? (
        <input
          autoFocus
          className="shortcut-capture"
          placeholder="Pressione as teclas..."
          onKeyDown={handleKeyDown}
          onBlur={() => setRecording(false)}
          readOnly
        />
      ) : (
        <button type="button" className="link-btn" onClick={() => setRecording(true)}>
          Alterar
        </button>
      )}
    </div>
  );
}

export default function SettingsModal({ onClose }) {
  const { user, updateUser, hasAdminPanel } = useAuth();
  const { activeChannel, deafened, toggleDeafen, micGain, setMicGainPercent, masterVolume, setMasterVolumePercent } = useVoiceCall();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("perfil");
  const [autoPip, setAutoPip] = useState(getAutoPipEnabled);
  const [autoListenAudio, setAutoListenAudio] = useState(getAutoListenAudioShare);
  const tabs = hasAdminPanel ? [...TABS, ADMIN_TAB] : TABS;

  function handleTabClick(tabId) {
    if (tabId === "administracao") {
      onClose();
      navigate("/admin");
      return;
    }
    setActiveTab(tabId);
  }
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const avatarInputRef = useRef(null);
  const bannerInputRef = useRef(null);
  const [cropTarget, setCropTarget] = useState(null);
  const [customStatus, setCustomStatus] = useState(() => user?.customStatus || "");
  const [customStatusSaving, setCustomStatusSaving] = useState(false);
  const [gifPrefSaving, setGifPrefSaving] = useState(false);

  async function saveGifOnSpeak(value) {
    const prev = !!user?.avatarAnimateOnSpeak;
    updateUser({ avatarAnimateOnSpeak: value });
    setGifPrefSaving(true);
    try {
      const { data } = await api.put("/api/users/me/avatar-animation", { onlyWhenSpeaking: value });
      updateUser({ avatarAnimateOnSpeak: !!data.avatarAnimateOnSpeak });
    } catch (err) {
      updateUser({ avatarAnimateOnSpeak: prev });
      setAvatarError(err.response?.data?.error || "Não deu pra salvar essa opção agora");
    } finally {
      setGifPrefSaving(false);
    }
  }

  async function saveCustomStatus(text) {
    setVisibilityError("");
    setCustomStatusSaving(true);
    try {
      const { data } = await api.put("/api/users/me/custom-status", { text: text.trim() });
      updateUser({ customStatus: data.customStatus || null });
      setCustomStatus(data.customStatus || "");
    } catch (err) {
      setVisibilityError(err.response?.data?.error || "Não deu pra salvar o status agora");
    } finally {
      setCustomStatusSaving(false);
    }
  }
  const [visibilitySaving, setVisibilitySaving] = useState(false);
  const [visibilityError, setVisibilityError] = useState("");

  const [nickname, setNickname] = useState(user?.nickname || "");
  const [bio, setBio] = useState(user?.bio || "");
  const [profileError, setProfileError] = useState("");

  const [myServers, setMyServers] = useState([]);
  const [serverNicknameTarget, setServerNicknameTarget] = useState("");
  const [serverNickname, setServerNickname] = useState("");
  const [serverNicknameLoading, setServerNicknameLoading] = useState(false);
  const [serverNicknameSaving, setServerNicknameSaving] = useState(false);
  const [serverNicknameSaved, setServerNicknameSaved] = useState(false);
  const [serverNicknameError, setServerNicknameError] = useState("");

  const [inputDevices, setInputDevices] = useState([]);
  const [outputDevices, setOutputDevices] = useState([]);
  const [videoDevices, setVideoDevices] = useState([]);
  const [selectedInput, setSelectedInput] = useState(getSavedAudioInput());
  const [selectedOutput, setSelectedOutput] = useState(getSavedAudioOutput());
  const [selectedVideoInput, setSelectedVideoInput] = useState(getSavedVideoInput());
  const [soundEffects, setSoundEffects] = useState(getSoundEffectsEnabled());
  const [noiseSuppressionMode, setNoiseSuppressionMode] = useState(getNoiseSuppressionMode());
  const [desktopNotifications, setDesktopNotifications] = useState(getDesktopNotificationsEnabled());
  const [notificationError, setNotificationError] = useState("");
  const notificationsSupported = typeof Notification !== "undefined";
  const notificationsBlocked = notificationsSupported && Notification.permission === "denied";
  const [muteShortcut, setMuteShortcutState] = useState(getMuteShortcut());
  const [deafenShortcut, setDeafenShortcutState] = useState(getDeafenShortcut());
  const [permissionError, setPermissionError] = useState("");
  const [spotifyStatus, setSpotifyStatus] = useState(null);
  const [spotifyConnecting, setSpotifyConnecting] = useState(false);
  const [spotifyError, setSpotifyError] = useState("");
  const [testing, setTesting] = useState(false);
  const [outputSupported, setOutputSupported] = useState(true);

  const streamRef = useRef(null);
  const audioElRef = useRef(null);
  const { level, start: startMeter, stop: stopMeter } = useMicLevel();
  const testAudioContextRef = useRef(null);
  const testProcessorRef = useRef(null);
  const testDeafenedForTestRef = useRef(false);

  useEffect(() => {
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        stream.getTracks().forEach((t) => t.stop());
        return navigator.mediaDevices.enumerateDevices();
      })
      .then((devices) => {
        setInputDevices(devices.filter((d) => d.kind === "audioinput"));
        setOutputDevices(devices.filter((d) => d.kind === "audiooutput"));
        setVideoDevices(devices.filter((d) => d.kind === "videoinput"));
      })
      .catch((err) => setPermissionError("Não foi possível acessar o microfone: " + err.message));

    setOutputSupported(typeof HTMLMediaElement !== "undefined" && "setSinkId" in HTMLMediaElement.prototype);

    return () => stopTest();
  }, []);

  useEffect(() => {
    api.get("/api/servers").then(({ data }) => setMyServers(data));
  }, []);

  useEffect(() => {
    api.get("/api/spotify/status").then(({ data }) => setSpotifyStatus(data)).catch(() => setSpotifyStatus({ configured: false, connected: false }));
  }, []);

  useEffect(() => {
    if (!spotifyConnecting) return;
    let cancelled = false;
    let attempts = 0;
    const interval = setInterval(() => {
      attempts += 1;
      api
        .get("/api/spotify/status")
        .then(({ data }) => {
          if (cancelled) return;
          if (data.connected && data.canControl) {
            setSpotifyStatus(data);
            setSpotifyConnecting(false);
          } else if (attempts >= 60) {
            setSpotifyConnecting(false);
          }
        })
        .catch(() => {});
    }, 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [spotifyConnecting]);

  async function handleConnectSpotify() {
    setSpotifyError("");
    try {
      const { data } = await api.get("/api/spotify/authorize");
      if (window.concordeDesktop) window.concordeDesktop.openExternal(data.url);
      else window.open(data.url, "_blank", "noopener,noreferrer");
      setSpotifyConnecting(true);
    } catch (err) {
      setSpotifyError(err.response?.data?.error || "Não foi possível iniciar a conexão com o Spotify");
    }
  }

  async function handleDisconnectSpotify() {
    setSpotifyError("");
    try {
      await api.delete("/api/spotify/connection");
      setSpotifyStatus((prev) => ({ ...prev, connected: false }));
    } catch (err) {
      setSpotifyError(err.response?.data?.error || "Não foi possível desconectar sua conta do Spotify");
    }
  }

  useEffect(() => {
    if (!serverNicknameTarget) {
      setServerNickname("");
      return;
    }
    setServerNicknameLoading(true);
    setServerNicknameError("");
    setServerNicknameSaved(false);
    api
      .get(`/api/servers/${serverNicknameTarget}/me/nickname`)
      .then(({ data }) => setServerNickname(data.nickname || ""))
      .catch((err) => setServerNicknameError(err.response?.data?.error || "Não foi possível carregar o apelido"))
      .finally(() => setServerNicknameLoading(false));
  }, [serverNicknameTarget]);

  async function handleSaveServerNickname() {
    setServerNicknameSaving(true);
    setServerNicknameError("");
    setServerNicknameSaved(false);
    try {
      await api.put(`/api/servers/${serverNicknameTarget}/me/nickname`, { nickname: serverNickname.trim() });
      setServerNicknameSaved(true);
    } catch (err) {
      setServerNicknameError(err.response?.data?.error || "Não foi possível salvar o apelido");
    } finally {
      setServerNicknameSaving(false);
    }
  }

  async function startLocalTest() {
    setPermissionError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          ...(selectedInput ? { deviceId: { exact: selectedInput } } : {}),
          echoCancellation: true,
          autoGainControl: true,
          noiseSuppression: false,
        },
      });
      streamRef.current = stream;
      const rawTrack = stream.getAudioTracks()[0];

      let audibleTrack = rawTrack;
      if (noiseSuppressionMode !== "off") {
        try {
          const audioContext = new AudioContext();
          const processor = createNoiseSuppressionProcessor(noiseSuppressionMode);
          await processor.init({ track: rawTrack, audioContext });
          testAudioContextRef.current = audioContext;
          testProcessorRef.current = processor;
          audibleTrack = processor.processedTrack;
        } catch (err) {
          console.warn("Não foi possível aplicar a supressão de ruído no teste:", err);
        }
      }
      const audibleStream = new MediaStream([audibleTrack]);

      if (audioElRef.current) {
        audioElRef.current.srcObject = audibleStream;
        audioElRef.current.muted = false;
        await audioElRef.current.play();
        if (selectedOutput && outputSupported) {
          try {
            await audioElRef.current.setSinkId(selectedOutput);
          } catch (err) {
            console.warn("Não foi possível trocar o dispositivo de saída:", err);
          }
        }
      }

      startMeter(audibleTrack);
      setTesting(true);
      return true;
    } catch (err) {
      setPermissionError("Não consegui abrir o microfone selecionado: " + err.message);
      return false;
    }
  }

  function stopLocalTest() {
    stopMeter();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (testProcessorRef.current) {
      testProcessorRef.current.destroy();
      testProcessorRef.current = null;
    }
    if (testAudioContextRef.current) {
      testAudioContextRef.current.close().catch(() => {});
      testAudioContextRef.current = null;
    }
    if (audioElRef.current) audioElRef.current.srcObject = null;
    setTesting(false);
  }

  async function startTest() {
    if (activeChannel && !deafened) {
      await toggleDeafen();
      testDeafenedForTestRef.current = true;
    }
    const started = await startLocalTest();
    if (!started && testDeafenedForTestRef.current) {
      testDeafenedForTestRef.current = false;
      await toggleDeafen();
    }
  }

  async function stopTest() {
    stopLocalTest();
    if (testDeafenedForTestRef.current) {
      testDeafenedForTestRef.current = false;
      await toggleDeafen();
    }
  }

  useEffect(() => {
    if (!testing) return;
    stopLocalTest();
    startLocalTest();
  }, [noiseSuppressionMode]);

  async function handleSave() {
    setProfileError("");
    try {
      const { data } = await api.put("/api/users/me/profile", { nickname: nickname.trim(), bio: bio.trim() });
      updateUser({ nickname: data.nickname, bio: data.bio });
    } catch (err) {
      setProfileError(err.response?.data?.error || "Falha ao salvar perfil");
      return;
    }

    setSavedAudioInput(selectedInput);
    setSavedAudioOutput(selectedOutput);
    setSavedVideoInput(selectedVideoInput);
    setSoundEffectsEnabled(soundEffects);
    persistNoiseSuppressionMode(noiseSuppressionMode);
    setMuteShortcut(muteShortcut);
    setDeafenShortcut(deafenShortcut);

    if (desktopNotifications && notificationsSupported && Notification.permission !== "granted") {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setDesktopNotificationsEnabled(false);
        setNotificationError("Permissão de notificação negada pelo navegador - não deu pra ligar.");
        stopTest();
        return;
      }
    }
    setDesktopNotificationsEnabled(desktopNotifications);

    stopTest();
    onClose();
  }

  // Escolheu um arquivo -> abre o recorte; confirmou -> envia.
  function handleAvatarChange(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setAvatarError("");
    setCropTarget({ kind: "avatar", file });
  }

  function handleBannerChange(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setAvatarError("");
    setCropTarget({ kind: "banner", file });
  }

  async function uploadCropped(kind, file) {
    setCropTarget(null);
    setAvatarError("");
    setAvatarUploading(kind);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const { data } = await api.post(`/api/users/me/${kind}`, formData);
      updateUser(kind === "avatar" ? { avatarUrl: data.avatarUrl } : { bannerUrl: data.bannerUrl });
    } catch (err) {
      setAvatarError(err.response?.data?.error || (kind === "avatar" ? "Falha ao enviar a foto" : "Falha ao enviar o banner"));
    } finally {
      setAvatarUploading(false);
    }
  }

  async function handleRemoveBanner() {
    setAvatarError("");
    setAvatarUploading("banner");
    try {
      const { data } = await api.delete("/api/users/me/banner");
      updateUser({ bannerUrl: data.bannerUrl || null });
    } catch (err) {
      setAvatarError(err.response?.data?.error || "Falha ao remover o banner");
    } finally {
      setAvatarUploading(false);
    }
  }

  async function handleStatusChange(status) {
    setVisibilityError("");
    setVisibilitySaving(true);
    try {
      const { data } = await api.put("/api/users/me/status", { status });
      updateUser({ status: data.status });
    } catch (err) {
      setVisibilityError(err.response?.data?.error || "Não foi possível salvar isso agora");
    } finally {
      setVisibilitySaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-modal-header">
          <h2>Configurações</h2>
          <button type="button" className="icon-btn" onClick={onClose} title="Fechar">
            <XIcon size={18} />
          </button>
        </div>

        <div className="settings-modal-body">
          <nav className="settings-nav">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={"settings-nav-item" + (activeTab === tab.id ? " active" : "")}
                onClick={() => handleTabClick(tab.id)}
              >
                <tab.Icon size={16} />
                {tab.label}
              </button>
            ))}
          </nav>

          <div className="settings-content">
            {activeTab === "perfil" && (
              <>
                <p className="settings-section-title">Visual do perfil</p>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/webp"
                  ref={avatarInputRef}
                  onChange={handleAvatarChange}
                  hidden
                />
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/webp"
                  ref={bannerInputRef}
                  onChange={handleBannerChange}
                  hidden
                />
                <div className="profile-editor" style={accentStyle(user?.accentColor, undefined, user?.accentColor2)}>
                  <button
                    type="button"
                    className={"profile-editor-banner" + (user?.bannerUrl ? " has-image" : "")}
                    style={user?.bannerUrl ? { backgroundImage: `url("${user.bannerUrl}")` } : undefined}
                    onClick={() => bannerInputRef.current?.click()}
                    disabled={!!avatarUploading}
                    title="Trocar banner"
                  >
                    <span className="profile-editor-hover">
                      {avatarUploading === "banner" ? "Enviando..." : user?.bannerUrl ? "Trocar banner" : "Adicionar banner"}
                    </span>
                  </button>
                  <div className="profile-editor-row">
                    <button
                      type="button"
                      className="profile-editor-avatar"
                      onClick={() => avatarInputRef.current?.click()}
                      disabled={!!avatarUploading}
                      title="Trocar foto"
                    >
                      <Avatar name={user?.username} url={user?.avatarUrl} className="avatar-picker-preview" />
                      <span className="profile-editor-hover">{avatarUploading === "avatar" ? "..." : "Trocar"}</span>
                    </button>
                    <div className="profile-editor-name">
                      <strong>{user?.nickname || user?.username}</strong>
                      <span>@{user?.username}</span>
                    </div>
                  </div>
                  <div className="profile-editor-actions">
                    <button type="button" className="appearance-btn primary" onClick={() => avatarInputRef.current?.click()} disabled={!!avatarUploading}>
                      {avatarUploading === "avatar" ? "Enviando..." : "Trocar foto"}
                    </button>
                    <button type="button" className="appearance-btn" onClick={() => bannerInputRef.current?.click()} disabled={!!avatarUploading}>
                      {avatarUploading === "banner" ? "Enviando..." : user?.bannerUrl ? "Trocar banner" : "Adicionar banner"}
                    </button>
                    {user?.bannerUrl && (
                      <button type="button" className="appearance-btn" onClick={handleRemoveBanner} disabled={!!avatarUploading}>
                        Remover banner
                      </button>
                    )}
                  </div>
                </div>
                <p className="admin-hint" style={{ margin: 0 }}>
                  PNG, JPG, WEBP ou GIF animado, até 8MB. Você escolhe o recorte antes de enviar (GIF vai inteiro, pra
                  continuar animando).
                </p>
                {avatarError && <p className="auth-error">{avatarError}</p>}
                <CardColorsEditor />
                <label className="settings-checkbox-row">
                  <input
                    type="checkbox"
                    checked={!!user?.avatarAnimateOnSpeak}
                    disabled={gifPrefSaving}
                    onChange={(e) => saveGifOnSpeak(e.target.checked)}
                  />
                  Na call, minha foto (GIF) só se mexe enquanto eu estiver falando
                </label>
                {cropTarget && (
                  <ImageCropModal
                    file={cropTarget.file}
                    aspect={cropTarget.kind === "avatar" ? 1 : 3}
                    outputWidth={cropTarget.kind === "avatar" ? 512 : 1500}
                    shape={cropTarget.kind === "avatar" ? "rounded" : "banner"}
                    title={cropTarget.kind === "avatar" ? "Recortar foto de perfil" : "Recortar banner"}
                    onCancel={() => setCropTarget(null)}
                    onConfirm={(f) => uploadCropped(cropTarget.kind, f)}
                  />
                )}

                <div className="settings-divider" />

                <p className="settings-section-title">Status</p>
                <StatusDropdown value={user?.status || "ONLINE"} onChange={handleStatusChange} disabled={visibilitySaving} />
                <div className="settings-field">
                  <label className="settings-label">Status personalizado</label>
                  <div className="settings-inline-save">
                    <input
                      value={customStatus}
                      onChange={(e) => setCustomStatus(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && saveCustomStatus(customStatus)}
                      placeholder="ex.: 🎲 mestrando às 21h"
                      maxLength={80}
                    />
                    <button
                      type="button"
                      onClick={() => saveCustomStatus(customStatus)}
                      disabled={customStatusSaving || customStatus.trim() === (user?.customStatus || "")}
                    >
                      {customStatusSaving ? "Salvando..." : "Salvar"}
                    </button>
                    {user?.customStatus && (
                      <button type="button" className="link-btn" onClick={() => saveCustomStatus("")} disabled={customStatusSaving}>
                        Limpar
                      </button>
                    )}
                  </div>
                  <p className="admin-hint" style={{ margin: 0 }}>
                    Aparece embaixo do seu nome na lista de membros e no seu perfil (some quando você está offline/invisível).
                  </p>
                </div>
                {visibilityError && <p className="auth-error">{visibilityError}</p>}

                <div className="settings-divider" />

                <p className="settings-section-title">Sobre você</p>

                <div className="settings-field">
                  <label className="settings-label">Apelido</label>
                  <input
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    placeholder={user?.username}
                    maxLength={32}
                  />
                  <p className="admin-hint" style={{ margin: 0 }}>
                    Aparece no seu perfil no lugar de "{user?.username}", em QUALQUER servidor. Em branco = usa o
                    nome de usuário.
                  </p>
                </div>

                <div className="settings-field">
                  <label className="settings-label">Sobre mim</label>
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    maxLength={190}
                    rows={3}
                    placeholder="Conte um pouco sobre você..."
                  />
                </div>
                <AboutBlocksEditor />
                {profileError && <p className="auth-error">{profileError}</p>}

                <div className="settings-divider" />

                <p className="settings-section-title">Apelido no servidor</p>
                <p className="admin-hint">
                  Diferente do apelido global acima - esse vale so' DENTRO do servidor escolhido, os outros membros
                  desse servidor especifico veem esse em vez do seu apelido/nome normal.
                </p>

                <div className="settings-field">
                  <label className="settings-label">Servidor</label>
                  <select value={serverNicknameTarget} onChange={(e) => setServerNicknameTarget(e.target.value)}>
                    <option value="">Escolha um servidor...</option>
                    {myServers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                {serverNicknameTarget && (
                  <div className="settings-field">
                    <label className="settings-label">Seu apelido nesse servidor</label>
                    <div className="settings-inline-save">
                      <input
                        value={serverNickname}
                        onChange={(e) => {
                          setServerNickname(e.target.value);
                          setServerNicknameSaved(false);
                        }}
                        maxLength={32}
                        disabled={serverNicknameLoading}
                        placeholder={serverNicknameLoading ? "Carregando..." : "Em branco = usa o apelido global"}
                      />
                      <button
                        type="button"
                        onClick={handleSaveServerNickname}
                        disabled={serverNicknameLoading || serverNicknameSaving}
                      >
                        {serverNicknameSaving ? "Salvando..." : "Salvar"}
                      </button>
                    </div>
                    {serverNicknameSaved && (
                      <p className="admin-hint" style={{ margin: 0, color: "var(--success)" }}>
                        Apelido salvo nesse servidor.
                      </p>
                    )}
                    {serverNicknameError && <p className="auth-error">{serverNicknameError}</p>}
                  </div>
                )}

                <div className="settings-divider" />

                <p className="settings-section-title">
                  Seus servidores — {myServers.length}
                </p>
                {myServers.length === 0 ? (
                  <p className="admin-hint" style={{ margin: 0 }}>
                    Você ainda não está em nenhum servidor.
                  </p>
                ) : (
                  <ul className="settings-server-list">
                    {myServers.map((s) => (
                      <li key={s.id}>
                        <Avatar name={s.name} url={s.iconUrl} className="voice-avatar small" />
                        {s.name}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}

            {activeTab === "audio" && (
              <>
                <p className="settings-section-title">Dispositivos de áudio e vídeo</p>
                <p className="admin-hint">A escolha aqui vale para a próxima vez que você entrar em uma call de voz.</p>

                {permissionError && <p className="auth-error">{permissionError}</p>}

                <div className="settings-field">
                  <label className="settings-label">Microfone (entrada)</label>
                  <select value={selectedInput} onChange={(e) => setSelectedInput(e.target.value)}>
                    <option value="">Padrão do sistema</option>
                    {inputDevices.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label || `Microfone ${d.deviceId.slice(0, 6)}`}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="settings-field">
                  <label className="settings-label">Volume do seu microfone</label>
                  <VolumeSlider value={micGain} onChange={setMicGainPercent} max={200} label="Volume do seu microfone" />
                  <p className="admin-hint" style={{ margin: 0 }}>
                    O quão alto a SUA voz sai pros outros na call - 100% é o normal. Vale na hora, mesmo no meio de
                    uma call.
                  </p>
                </div>

                <div className="settings-field">
                  <label className="settings-label">Alto-falante / fone (saída)</label>
                  <select value={selectedOutput} onChange={(e) => setSelectedOutput(e.target.value)} disabled={!outputSupported}>
                    <option value="">Padrão do sistema</option>
                    {outputDevices.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label || `Saída ${d.deviceId.slice(0, 6)}`}
                      </option>
                    ))}
                  </select>
                  {!outputSupported && (
                    <p className="admin-hint" style={{ margin: 0 }}>
                      Seu navegador não permite escolher a saída de áudio por código (comum no Firefox) — vai usar
                      sempre o dispositivo padrão do sistema.
                    </p>
                  )}
                </div>

                <div className="settings-field">
                  <label className="settings-label">Volume geral (alto-falante)</label>
                  <VolumeSlider value={masterVolume} onChange={setMasterVolumePercent} label="Volume geral" />
                  <p className="admin-hint" style={{ margin: 0 }}>
                    Multiplica por cima do volume individual de cada pessoa/transmissão - abaixa (ou reforça) tudo
                    de uma vez, sem perder as preferências que você já ajustou pra cada um.
                  </p>
                </div>

                <div className="settings-field">
                  <label className="settings-label">Câmera</label>
                  <select value={selectedVideoInput} onChange={(e) => setSelectedVideoInput(e.target.value)}>
                    <option value="">Padrão do sistema</option>
                    {videoDevices.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label || `Câmera ${d.deviceId.slice(0, 6)}`}
                      </option>
                    ))}
                  </select>
                  <p className="admin-hint" style={{ margin: 0 }}>
                    Vale a partir da próxima vez que você ligar a câmera (ícone 📷 na barra de voz).
                  </p>
                </div>

                <div className="settings-test-row">
                  {!testing ? (
                    <button type="button" onClick={startTest}>
                      🎙️ Testar microfone (ouvir a si mesmo)
                    </button>
                  ) : (
                    <button type="button" className="danger" onClick={stopTest}>
                      Parar teste
                    </button>
                  )}
                </div>

                {testing && (
                  <div className="settings-field">
                    <div className="mic-meter-row">
                      <span>Nível captado:</span>
                      <div className="mic-meter-track">
                        <div className="mic-meter-fill" style={{ width: `${level}%` }} />
                      </div>
                      <span className="mic-meter-value">{level}%</span>
                    </div>
                    <p className="admin-hint" style={{ margin: 0 }}>
                      Fale algo — você deve ouvir sua própria voz (com um pequeno atraso) pelo dispositivo de saída
                      escolhido, e a barra deve se mexer. Use fone de ouvido para evitar eco.
                    </p>
                  </div>
                )}

                <audio ref={audioElRef} autoPlay />

                <div className="settings-divider" />

                <div className="settings-field">
                  <label className="settings-label">Supressão de ruído do microfone</label>
                  <select value={noiseSuppressionMode} onChange={(e) => setNoiseSuppressionMode(e.target.value)}>
                    {NOISE_SUPPRESSION_MODES.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                  <p className="admin-hint" style={{ margin: 0 }}>
                    {NOISE_SUPPRESSION_MODES.find((m) => m.value === noiseSuppressionMode)?.description}
                  </p>
                </div>

                <div className="settings-divider" />
                <p className="settings-section-title">Transmissões de áudio</p>
                <label className="settings-checkbox-row">
                  <input
                    type="checkbox"
                    checked={autoListenAudio}
                    onChange={(e) => {
                      setAutoListenAudio(e.target.checked);
                      setAutoListenAudioShare(e.target.checked);
                    }}
                  />
                  Entrar automaticamente quando alguém transmitir áudio na call
                </label>
                <p className="admin-hint" style={{ margin: 0 }}>
                  Ligado: o som (música, jogo...) começa a tocar pra você assim que alguém transmite. Desligado: aparece
                  um botão "Ouvir" na call e você entra só se quiser.
                </p>

                {pipSupported && (
                  <>
                    <div className="settings-divider" />
                    <p className="settings-section-title">Transmissões de tela</p>
                    <label className="settings-checkbox-row">
                      <input
                        type="checkbox"
                        checked={autoPip}
                        onChange={(e) => {
                          setAutoPip(e.target.checked);
                          setAutoPipEnabled(e.target.checked);
                        }}
                      />
                      Janela flutuante automática ao minimizar o Concorde
                    </label>
                    <p className="admin-hint" style={{ margin: 0 }}>
                      Se você estiver assistindo a tela de alguém e minimizar o app (ou trocar de aba no navegador), a
                      transmissão continua numa janelinha por cima das outras. Ao voltar pro Concorde ela fecha sozinha.
                      Também dá pra abrir na hora pelo botão no canto da transmissão.
                    </p>
                  </>
                )}
              </>
            )}

            {activeTab === "atalhos" && (
              <>
                <p className="settings-section-title">Atalhos de teclado</p>
                <p className="admin-hint">Funcionam de qualquer tela do app, desde que você esteja numa call.</p>

                <div className="settings-field">
                  <label className="settings-label">Mutar / desmutar microfone</label>
                  <ShortcutRecorder value={muteShortcut} onChange={setMuteShortcutState} />
                </div>
                <div className="settings-field">
                  <label className="settings-label">Ensurdecer / reativar áudio</label>
                  <ShortcutRecorder value={deafenShortcut} onChange={setDeafenShortcutState} />
                </div>
              </>
            )}

            {activeTab === "notificacoes" && (
              <>
                <p className="settings-section-title">Notificações</p>

                <label className="settings-checkbox-row">
                  <input type="checkbox" checked={soundEffects} onChange={(e) => setSoundEffects(e.target.checked)} />
                  Tocar som quando alguém entrar ou sair de uma call
                  <button type="button" className="link-btn" onClick={playJoinSound} style={{ marginLeft: "auto" }}>
                    Testar som
                  </button>
                </label>

                <label className="settings-checkbox-row">
                  <input
                    type="checkbox"
                    checked={desktopNotifications}
                    disabled={notificationsBlocked}
                    onChange={(e) => {
                      setNotificationError("");
                      setDesktopNotifications(e.target.checked);
                    }}
                  />
                  Notificações no PC quando chegar mensagem nova
                </label>
                {notificationsBlocked && (
                  <p className="admin-hint" style={{ margin: 0 }}>
                    Seu navegador tem notificações bloqueadas pra esse site. Libere nas configurações
                    do navegador (ícone de cadeado na barra de endereço) pra poder ligar isso.
                  </p>
                )}
                {notificationError && <p className="auth-error">{notificationError}</p>}
              </>
            )}

            {activeTab === "aparencia" && <AppearanceSettings />}

            {activeTab === "conexoes" && (
              <>
                <p className="settings-section-title">Spotify</p>
                {spotifyStatus === null ? (
                  <p className="admin-hint">Carregando...</p>
                ) : !spotifyStatus.configured ? (
                  <p className="admin-hint">
                    Integração com Spotify ainda não configurada nesse servidor (falta cadastrar as credenciais no
                    backend).
                  </p>
                ) : (
                  <div className="spotify-connect-card">
                    <MusicNoteIcon size={28} />
                    <div className="spotify-connect-info">
                      <strong>{spotifyStatus.connected ? "Conta conectada" : "Conecte sua conta do Spotify"}</strong>
                      <p className="admin-hint" style={{ margin: 0 }}>
                        {spotifyStatus.connected
                          ? "O que você estiver ouvindo aparece na lista de membros e no seu perfil, e os outros podem \"Ouvir junto\" com você."
                          : "Opcional - mostra pros outros membros (na lista de membros e no seu perfil) a música que você está ouvindo agora e libera o \"Ouvir junto\", igual o Discord. Só você decide conectar."}
                      </p>
                      {spotifyStatus.connected && !spotifyStatus.canControl && (
                        <p className="admin-hint spotify-reconnect-hint">
                          Reconecte pra liberar o "Ouvir junto" - ele precisa de uma permissão nova do Spotify (controlar o
                          player). Ouvir junto com alguém exige Spotify Premium.
                        </p>
                      )}
                    </div>
                    {spotifyStatus.connected ? (
                      <div className="spotify-connect-actions">
                        {!spotifyStatus.canControl && (
                          <button type="button" onClick={handleConnectSpotify} disabled={spotifyConnecting}>
                            {spotifyConnecting ? "Aguardando..." : "Reconectar"}
                          </button>
                        )}
                        <button type="button" className="danger" onClick={handleDisconnectSpotify}>
                          Desconectar
                        </button>
                      </div>
                    ) : (
                      <button type="button" onClick={handleConnectSpotify} disabled={spotifyConnecting}>
                        {spotifyConnecting ? "Aguardando..." : "Conectar Spotify"}
                      </button>
                    )}
                  </div>
                )}
                {spotifyConnecting && (
                  <p className="admin-hint" style={{ margin: 0 }}>
                    Autorize na aba que abriu - assim que terminar, isso aqui atualiza sozinho.
                  </p>
                )}
                {spotifyError && <p className="auth-error">{spotifyError}</p>}

                <SteamConnectCard />
              </>
            )}
          </div>
        </div>

        <div className="settings-actions">
          <button type="button" className="link-btn" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" onClick={handleSave}>
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
