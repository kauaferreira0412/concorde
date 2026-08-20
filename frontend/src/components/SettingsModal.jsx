import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMicLevel } from "../utils/useMicLevel";
import {
  getNoiseSuppressionMode,
  getSavedAudioInput,
  getSavedAudioOutput,
  getSavedVideoInput,
  getSoundEffectsEnabled,
  setNoiseSuppressionMode,
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
import api from "../api/client";
import Avatar from "./Avatar.jsx";
import StatusDropdown from "./StatusDropdown.jsx";
import { BellIcon, KeyboardIcon, MicIcon, ShieldIcon, UserIcon, XIcon } from "./icons.jsx";

/** Abas da tela de configuracoes - cada uma so' renderiza o seu pedaco (ver SettingsModal). */
const TABS = [
  { id: "perfil", label: "Perfil", Icon: UserIcon },
  { id: "audio", label: "Áudio e vídeo", Icon: MicIcon },
  { id: "atalhos", label: "Atalhos", Icon: KeyboardIcon },
  { id: "notificacoes", label: "Notificações", Icon: BellIcon },
];
// So' aparece pra admin (ver isAdmin abaixo) - fica separada das abas normais porque nao
// renderiza conteudo aqui dentro, so' leva pro /admin (ver handleTabClick).
const ADMIN_TAB = { id: "administracao", label: "Administração", Icon: ShieldIcon };

/** Campo de "gravar atalho": clica em Alterar, aperta a combinacao desejada, pronto. */
function ShortcutRecorder({ value, onChange }) {
  const [recording, setRecording] = useState(false);

  function handleKeyDown(e) {
    e.preventDefault();
    if (isOnlyModifier(e)) return; // espera uma tecla "de verdade" junto do Ctrl/Shift/etc
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

/**
 * Configuracoes de audio: escolher microfone/alto-falante, testar o microfone ouvindo a
 * propria voz, e atalhos de teclado pra mutar/ensurdecer sem precisar clicar em nada.
 * Tudo fica salvo no localStorage e vale a partir da proxima call (ver VoiceCallContext.jsx).
 */
export default function SettingsModal({ onClose }) {
  const { user, updateUser, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("perfil");
  const tabs = isAdmin ? [...TABS, ADMIN_TAB] : TABS;

  // A aba de administracao nao mostra conteudo aqui dentro - so' fecha as configuracoes e
  // leva pro painel de verdade (gerenciar contas/usuarios, ver AdminPage.jsx), que ja existe
  // e e' uma pagina inteira (nao cabe dentro do modal).
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
  const [visibilitySaving, setVisibilitySaving] = useState(false);
  const [visibilityError, setVisibilityError] = useState("");

  // Apelido/bio GLOBAIS (valem em qualquer servidor) - salvos junto com o resto ao clicar
  // em "Salvar" no rodape (ver handleSave). Antes isso vivia numa tela separada
  // (ProfileModal), agora mora aqui junto com o resto do perfil.
  const [nickname, setNickname] = useState(user?.nickname || "");
  const [bio, setBio] = useState(user?.bio || "");
  const [profileError, setProfileError] = useState("");

  // Servidores que o usuario esta - calculado sozinho (so' busca a lista, ver useEffect
  // abaixo) - e o apelido DENTRO de um servidor especifico escolhido no seletor (esse tem
  // salvamento proprio, ja que so' faz sentido depois de escolher pra qual servidor).
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
  const [testing, setTesting] = useState(false);
  const [outputSupported, setOutputSupported] = useState(true);

  const streamRef = useRef(null);
  const audioElRef = useRef(null);
  const { level, start: startMeter, stop: stopMeter } = useMicLevel();
  // Testar microfone tambem precisa passar pela MESMA supressao de ruido escolhida abaixo -
  // senao "bater na mesa pra testar" nunca mostrava diferenca nenhuma entre os modos (bug
  // relatado: "continuo ouvindo com qualquer supressão ligada"), porque esse teste captava o
  // microfone cru direto (getUserMedia -> <audio>), sem passar pelo AudioWorklet nenhum -
  // so' a call de verdade (LiveKit) usava a supressao, ver VoiceCallContext.jsx.
  const testAudioContextRef = useRef(null);
  const testProcessorRef = useRef(null);

  useEffect(() => {
    // O navegador so mostra os nomes dos dispositivos depois de uma permissao de microfone
    // ser concedida pelo menos uma vez - por isso pedimos getUserMedia so pra "destravar" os labels.
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        stream.getTracks().forEach((t) => t.stop());
        return navigator.mediaDevices.enumerateDevices();
      })
      .then((devices) => {
        setInputDevices(devices.filter((d) => d.kind === "audioinput"));
        setOutputDevices(devices.filter((d) => d.kind === "audiooutput"));
        // As cameras tambem aparecem aqui (enumerateDevices lista TODOS os dispositivos, nao
        // so' os de audio que acabamos de pedir permissao) - os nomes delas so' vem
        // preenchidos se a permissao de camera ja' tiver sido concedida em algum momento
        // (ex: ja' ligou a webcam numa call antes) - sem pedir um segundo popup de permissao
        // so' por abrir essa tela.
        setVideoDevices(devices.filter((d) => d.kind === "videoinput"));
      })
      .catch((err) => setPermissionError("Não foi possível acessar o microfone: " + err.message));

    setOutputSupported(typeof HTMLMediaElement !== "undefined" && "setSinkId" in HTMLMediaElement.prototype);

    return () => stopTest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // "Quantos e quais servidores você está" - so' reaproveita a mesma lista que a sidebar ja
  // usa (GET /api/servers), calculada sozinha, sem precisar manter nada a parte.
  useEffect(() => {
    api.get("/api/servers").then(({ data }) => setMyServers(data));
  }, []);

  // Ao escolher um servidor no seletor de apelido, busca o apelido que ja existe la' (se
  // existir) pra pre-preencher o campo, em vez de sempre comecar em branco.
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

  async function startTest() {
    setPermissionError("");
    try {
      // MESMAS constraints que a call de verdade usa (ver audioCaptureDefaults em
      // VoiceCallContext.jsx) - echoCancellation/autoGainControl explicitos aqui tambem
      // (nao so' deixando no padrao do navegador), pra garantir que a captura em si e' idêntica,
      // nao so' o filtro de ruido por cima. noiseSuppression nativa sempre false nos dois lugares
      // (a supressao de verdade e' o AudioWorklet logo abaixo).
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

      // Passa pelo MESMO AudioWorklet de supressao de ruido escolhido abaixo - assim "bater na
      // mesa"/testar o microfone reflete de verdade o que vai acontecer numa call, em vez de
      // sempre tocar o audio cru independente do modo selecionado.
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

      // Toca de volta o que o microfone esta captando (ja' filtrado) - e' assim que voce "se
      // ouve". Recomenda-se usar fone de ouvido para evitar microfonia (eco/feedback).
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
    } catch (err) {
      setPermissionError("Não consegui abrir o microfone selecionado: " + err.message);
    }
  }

  function stopTest() {
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

  // Troca o modo de supressao COM o teste ja' rodando (bater na mesa comparando) - reinicia o
  // teste sozinho pra aplicar o novo modo na hora, sem precisar clicar em "Parar"/"Testar" nele.
  useEffect(() => {
    if (!testing) return;
    stopTest();
    startTest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noiseSuppressionMode]);

  async function handleSave() {
    setProfileError("");
    try {
      const { data } = await api.put("/api/users/me/profile", { nickname: nickname.trim(), bio: bio.trim() });
      updateUser({ nickname: data.nickname, bio: data.bio });
    } catch (err) {
      setProfileError(err.response?.data?.error || "Falha ao salvar perfil");
      return; // nao fecha o modal nem salva o resto - o usuario precisa ver o erro primeiro
    }

    setSavedAudioInput(selectedInput);
    setSavedAudioOutput(selectedOutput);
    setSavedVideoInput(selectedVideoInput);
    setSoundEffectsEnabled(soundEffects);
    setNoiseSuppressionMode(noiseSuppressionMode);
    setMuteShortcut(muteShortcut);
    setDeafenShortcut(deafenShortcut);

    // So' pede permissao ao navegador se o usuario realmente ligou a opcao agora - nunca
    // pede sem ele ter escolhido isso primeiro. Se ele negar, a opcao volta a ficar desligada.
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

  async function handleAvatarChange(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setAvatarError("");
    setAvatarUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const { data } = await api.post("/api/users/me/avatar", formData);
      updateUser({ avatarUrl: data.avatarUrl });
    } catch (err) {
      setAvatarError(err.response?.data?.error || "Falha ao enviar a foto");
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
                <p className="settings-section-title">Foto de perfil</p>
                <div className="avatar-picker">
                  <Avatar name={user?.username} url={user?.avatarUrl} className="avatar-picker-preview" />
                  <div>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/gif,image/webp"
                      ref={avatarInputRef}
                      onChange={handleAvatarChange}
                      hidden
                    />
                    <button type="button" onClick={() => avatarInputRef.current?.click()} disabled={avatarUploading}>
                      {avatarUploading ? "Enviando..." : "Trocar foto"}
                    </button>
                    <p className="admin-hint" style={{ margin: "6px 0 0" }}>
                      PNG, JPG, GIF ou WEBP, até 8MB.
                    </p>
                  </div>
                </div>
                {avatarError && <p className="auth-error">{avatarError}</p>}

                <div className="settings-divider" />

                <p className="settings-section-title">Status</p>
                <StatusDropdown value={user?.status || "ONLINE"} onChange={handleStatusChange} disabled={visibilitySaving} />
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

                {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
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
