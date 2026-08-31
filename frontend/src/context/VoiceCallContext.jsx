import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { DisconnectReason, Room, RoomEvent, Track } from "livekit-client";
import api from "../api/client";
import { useAuth } from "./AuthContext.jsx";
import { useAlert } from "./AlertContext.jsx";
import { useMicLevel } from "../utils/useMicLevel";
import {
  getMasterVolume,
  getMicGain,
  getNoiseSuppressionMode,
  getSavedAudioInput,
  getSavedAudioOutput,
  getSavedParticipantVolume,
  getSavedStreamVolume,
  getSavedVideoInput,
  setMasterVolume as persistMasterVolume,
  setMicGain as persistMicGain,
  setSavedParticipantVolume,
  setSavedStreamVolume,
} from "../utils/audioSettings";
import { createNoiseSuppressionProcessor } from "../utils/noiseSuppression";
import {
  playJoinSound,
  playLeaveSound,
  playMuteSound,
  playScreenShareStartSound,
  playScreenShareStopSound,
  playUnmuteSound,
} from "../utils/soundEffects";
import { getDeafenShortcut, getMuteShortcut, shortcutFromEvent, syncGlobalShortcuts } from "../utils/keyboardShortcuts";
import {
  publishVoiceDeafenState,
  publishVoiceForceDeafen,
  publishVoiceForceMute,
  publishVoiceJoin,
  publishVoiceKick,
  publishVoiceLeave,
  publishVoiceMicState,
  publishVoiceMove,
  publishVoiceWatching,
  subscribeToVoiceControl,
  subscribeToVoicePresence,
} from "../ws/chatSocket";
import ScreenSharePicker from "../components/ScreenSharePicker.jsx";
import { startWindowAudioTrack } from "../utils/windowAudioTrack";
import { startSystemAudioExcludingSelfTrack } from "../utils/systemAudioTrack";

const VoiceCallContext = createContext(null);

// window.concordeDesktop so' existe dentro do app Electron (ver electron/preload.cjs) - no
// navegador normal isso e' sempre undefined, e o app inteiro cai pro fluxo padrao de
// getDisplayMedia (ver toggleScreenShare), sem nenhuma mudanca de comportamento.
const isElectronDesktop = typeof window !== "undefined" && !!window.concordeDesktop;

// Um F5/recarregar destroi a pagina inteira - inclusive a conexao WebRTC, isso e' assim
// em qualquer app web (o proprio Discord na web tambem desconecta). O que da pra fazer e'
// lembrar em qual canal voce estava e reconectar sozinho assim que a pagina volta a carregar.
const ACTIVE_CHANNEL_KEY = "activeVoiceChannel";

function saveActiveChannel(channel) {
  sessionStorage.setItem(ACTIVE_CHANNEL_KEY, JSON.stringify(channel));
}
function clearActiveChannel() {
  sessionStorage.removeItem(ACTIVE_CHANNEL_KEY);
}
function loadActiveChannel() {
  try {
    const raw = sessionStorage.getItem(ACTIVE_CHANNEL_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Reorganiza o snapshot de presenca de voz (lista de VoiceParticipantInfo, ver
 *  VoicePresenceService.java no backend) por quem esta sendo ASSISTIDO - "user-<id>" (a
 *  identity de quem compartilha, mesmo formato usado pelo LiveKit) -> lista de quem esta
 *  vendo agora. Usado tanto pelo push via WebSocket quanto pelo poll de reforco via REST (ver
 *  os dois useEffect mais abaixo que chamam isso). */
function watchersByIdentity(list) {
  const map = {};
  (list || []).forEach((p) => {
    (p.watchingUserIds || []).forEach((sharerId) => {
      const key = "user-" + sharerId;
      (map[key] || (map[key] = [])).push({ userId: p.userId, name: p.username, avatarUrl: p.avatarUrl });
    });
  });
  return map;
}

/**
 * Estado global da call de voz (fora do componente de canal), para os icones de
 * mutar/ensurdecer na barra inferior funcionarem de qualquer tela, e para a call
 * continuar conectada mesmo se voce navegar para outro canal de texto.
 *
 * IMPORTANTE sobre closures: joinChannel/leaveChannel/toggleMic/toggleDeafen sao funcoes
 * comuns (nao useCallback) que so leem de REFS, nunca de variaveis de estado direto. Isso e'
 * proposital - a versao anterior usava useCallback com arrays de dependencia, e como
 * joinChannel chamava leaveChannel (que por sua vez dependia de "activeChannel"), o
 * joinChannel acabava presa a uma versao antiga (closure velha) do leaveChannel sempre que
 * so as deps do proprio joinChannel mudavam. Na pratica isso fazia trocar de canal (ou
 * reconectar no F5) nao avisar o backend que voce saiu do canal anterior, deixando "fantasmas"
 * em Conectados Agora. Ler tudo de refs elimina essa classe inteira de bug.
 */
export function VoiceCallProvider({ stompClient, stompConnected, children }) {
  const { user } = useAuth();
  const { showAlert } = useAlert();
  const [activeChannel, setActiveChannelState] = useState(null); // { id, name, serverId }
  const [connected, setConnected] = useState(false);
  const [micEnabled, setMicEnabledState] = useState(true);
  const [deafened, setDeafenedState] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [cameraEnabled, setCameraEnabledState] = useState(false);
  const [participants, setParticipants] = useState([]); // dentro da call, com quem realmente entrou
  const [speakingIds, setSpeakingIds] = useState(new Set());
  const [screenShares, setScreenShares] = useState([]); // [{ sid, name, isLocal, watching, track }]
  // Webcam de quem estiver com a camera ligada (voce e/ou outros) - funciona igual no
  // navegador e no app desktop, e' so' getUserMedia comum via LiveKit (setCameraEnabled),
  // sem nenhuma parte nativa envolvida. Ver toggleCamera/CameraTile em VoiceChannel.jsx.
  const [cameraTracks, setCameraTracks] = useState([]); // [{ identity, name, isLocal, track }]
  const [participantVolumes, setParticipantVolumesState] = useState({}); // identity -> 0..300 (voz)
  const [streamVolumes, setStreamVolumesState] = useState({}); // identity -> 0..300 (audio da transmissao de tela dessa pessoa)
  // Volume do SEU microfone (o que sai pra fora) e volume MESTRE (alto-falante, multiplica por
  // cima de todo volume individual) - ver utils/audioSettings.js. Estado (nao so' ref) pra
  // alimentar os sliders em Configuracoes.
  const [micGain, setMicGainState] = useState(getMicGain());
  const [masterVolume, setMasterVolumeState] = useState(getMasterVolume());
  // So' usado no app desktop (Electron) - true enquanto o seletor customizado de tela/janela
  // esta aberto, esperando o usuario escolher o que compartilhar (ver ScreenSharePicker.jsx).
  const [screenPickerOpen, setScreenPickerOpen] = useState(false);
  // O que EU posso fazer no servidor do canal em que estou agora (ver ServerPermission no
  // backend) - controla o que os menus de moderacao mostram (ChannelSidebar.jsx) e se um
  // forceMute/forceDeafen aplicado em mim pode ser revertido por mim mesmo (ver toggleMic/
  // toggleDeafen abaixo).
  const [myPermissions, setMyPermissions] = useState([]);
  // Ping da conexao de voz (ida-e-volta do sinal ate' o LiveKit, em ms) - mostrado na barra de
  // status (ver ChannelSidebar.jsx), igual ao print de referencia do usuario. Vem de
  // room.engine.client.rtt (medido internamente pelo proprio SDK do LiveKit via ping/pong do
  // canal de sinalizacao), so' fica lendo de novo em intervalo (ver startPingMeter abaixo).
  const [pingMs, setPingMs] = useState(null);
  const { level: micLevel, start: startMicMeter, stop: stopMicMeter } = useMicLevel();

  const roomRef = useRef(null);
  // trackSid -> { track (null se nao estiver "assistindo"), pub (RemoteTrackPublication, pra
  // poder inscrever/desinscrever - null pra sua propria tela), participantIdentity,
  // participantName, isLocal }
  const videoTracksRef = useRef(new Map());
  // identities de quem voce ESCOLHEU assistir a tela (ver toggleWatchScreenShare) - por
  // padrao ninguem esta aqui: video/audio de compartilhamento de tela de outra pessoa so'
  // baixa de verdade depois que voce clica pra entrar naquela transmissao especifica (pedido
  // explicito do usuario: "quero que o usuario escolha entrar em cada live ou nao", em vez de
  // todo mundo ja ver/ouvir automaticamente assim que alguem comeca a compartilhar).
  const watchedShareIdentitiesRef = useRef(new Set());
  // identity -> { track (LocalVideoTrack ou RemoteVideoTrack), name, isLocal } - diferente de
  // videoTracksRef (compartilhamento de tela, um "palco" so' de cada vez), camera mostra TODOS
  // que estiverem com ela ligada ao mesmo tempo, em tiles pequenos - ver CameraTile.
  const cameraTracksRef = useRef(new Map());
  const cameraEnabledRef = useRef(false);
  const micAudioTracksRef = useRef(new Map()); // identity -> RemoteAudioTrack (voz, pro controle de volume)
  const screenAudioTracksRef = useRef(new Map()); // identity -> RemoteAudioTrack (audio da transmissao de tela dessa pessoa)
  const participantVolumesRef = useRef(new Map()); // identity -> 0..300, fonte da verdade sincrona
  const streamVolumesRef = useRef(new Map());
  // O SEU proprio track de microfone publicado agora (LocalAudioTrack, ver
  // RoomEvent.LocalTrackPublished) - guardado pra dar pra reaplicar o volume do microfone NA
  // HORA se voce mudar isso em Configuracoes no meio de uma call (ver setMicGainPercent),
  // sem precisar desmutar/mutar pra fazer efeito.
  const localMicTrackRef = useRef(null);
  // true bem no comecinho de QUALQUER desconexao que a GENTE pediu (sair da call, trocar de
  // canal - ver disconnectInternal) - o handler de RoomEvent.Disconnected (ver joinChannel)
  // confere isso pra saber se e' uma queda de VERDADE (ele NAO pediu) ou so' o eco da nossa
  // propria saida, sem tratar a segunda como um problema.
  const intentionalDisconnectRef = useRef(false);
  // Volume MESTRE (alto-falante) - multiplica por cima de todo volume individual (ver
  // resolveParticipantVolume/resolveStreamVolume abaixo e setMasterVolumePercent). Ref (nao so'
  // estado) porque precisa ser lido de forma sincrona dentro de closures antigas do LiveKit
  // (RoomEvent handlers registrados uma unica vez ao entrar na call).
  const masterVolumeRef = useRef(getMasterVolume());
  // So' preenchido no app desktop (Electron), quando o compartilhamento foi iniciado pelo
  // ScreenSharePicker (video/audio capturados "na mao" via chromeMediaSourceId, nao pelo
  // setScreenShareEnabled padrao do LiveKit) - precisa pra saber COMO parar depois.
  const electronScreenTracksRef = useRef({ video: null, audio: null });
  const joiningRef = useRef(false); // evita duas conexoes simultaneas (ex: React StrictMode chamando o efeito 2x)
  // Ensurdecido e' diferente de so mutar: quem ensurdece nao esta OUVINDO ninguem, nao so
  // calado. Isso nao vem do LiveKit (ele so sabe de audio publicado) - propagamos via
  // presenca (mesmo canal que alimenta "Conectados agora"), pra mostrar um icone diferente
  // de quem so mutou o microfone.
  const presenceDeafenedRef = useRef(new Map()); // userId (string) -> deafened
  // De quem esta assistindo a transmissao de tela de CADA UM agora - "user-<id do dono>" ->
  // [{userId, name, avatarUrl}] de quem esta vendo. Vem da MESMA presenca de voz que alimenta
  // presenceDeafenedRef acima (ver watchersByIdentity/publishVoiceWatching) - precisa ser
  // ESTADO (nao ref) porque alimenta o icone de "quem esta vendo" no quadrado de transmissao
  // (VoiceChannel.jsx), que precisa re-renderizar quando isso muda.
  const [screenShareWatchers, setScreenShareWatchers] = useState({});
  const presenceSubRef = useRef(null);
  const controlSubRef = useRef(null); // ver subscribeToVoiceControl - comandos de moderacao endereçados a mim
  const myPermissionsRef = useRef(new Set());
  // Um moderador aplicou isso em MIM (ver VoiceModerationController no backend) - enquanto
  // for true, so' consigo reverter sozinho se eu TAMBEM tiver a permissao correspondente
  // (regra pedida explicitamente: "o alvo so' pode se livrar se tiver permissao tambem").
  const forceMutedRef = useRef(false);
  const forceDeafenedRef = useRef(false);
  const pingIntervalRef = useRef(null);

  // "Fonte da verdade" pras funcoes assincronas - sempre atualizados junto com o setState
  // correspondente, nunca via useEffect (evita qualquer janela de tempo desatualizada).
  const activeChannelRef = useRef(null);
  const micEnabledRef = useRef(true);
  const deafenedRef = useRef(false);
  const screenSharingRef = useRef(false);
  const stompClientRef = useRef(stompClient);
  const stompConnectedRef = useRef(stompConnected);
  const userRef = useRef(user);

  useEffect(() => {
    stompClientRef.current = stompClient;
    stompConnectedRef.current = stompConnected;
  }, [stompClient, stompConnected]);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  function setActiveChannel(channel) {
    activeChannelRef.current = channel;
    setActiveChannelState(channel);
  }
  // Sempre republica pra presenca (o que alimenta "Conectados agora"/a lista aninhada sob
  // cada canal - ver ChannelSidebar.jsx) junto com a mudanca local, direto aqui no setter -
  // antes cada lugar que mudava o mic/deafen local tinha que lembrar de chamar
  // publishVoiceMicState/publishVoiceDeafenState por conta propria, e um lugar (o catch de
  // falha ao ligar o microfone dentro de joinChannel) esquecia disso: o mic ficava desligado
  // localmente mas a presenca continuava dizendo que estava ligado (ou vice-versa depois),
  // deixando a lista errada PRA SEMPRE (nada mais corrigia sozinho depois). Botando aqui no
  // setter, nenhum lugar (atual ou futuro) consegue esquecer.
  function setMicEnabled(value) {
    micEnabledRef.current = value;
    setMicEnabledState(value);
    if (activeChannelRef.current && stompClientRef.current && stompConnectedRef.current) {
      publishVoiceMicState(stompClientRef.current, activeChannelRef.current.id, value);
    }
  }
  function setDeafened(value) {
    deafenedRef.current = value;
    setDeafenedState(value);
    if (activeChannelRef.current && stompClientRef.current && stompConnectedRef.current) {
      publishVoiceDeafenState(stompClientRef.current, activeChannelRef.current.id, value);
    }
  }
  function setCameraEnabled(value) {
    cameraEnabledRef.current = value;
    setCameraEnabledState(value);
  }

  /**
   * Aplica (ou remove) a supressao de ruido por IA escolhida em Configuracoes E o volume do
   * PROPRIO microfone (ver getMicGain/setMicGainPercent) no track do microfone que acabou de
   * ser publicado - ver utils/noiseSuppression.js pro porque disso existir (RNNoise/GTCRN em
   * vez da constraint nativa fraca do navegador, e o GainNode embutido no mesmo processador pro
   * volume). Chamado sempre que o microfone e' (re)publicado (ver RoomEvent.LocalTrackPublished
   * em joinChannel) - cobre entrar na call, desmutar, liberar um ensurdecido e trocar de
   * dispositivo de entrada, automaticamente, sem precisar lembrar de chamar isso em cada lugar
   * separado - E chamado de novo na hora se voce mudar o volume do microfone NO MEIO de uma
   * call (ver setMicGainPercent), pra nao precisar desmutar/mutar pra fazer efeito.
   */
  async function applyNoiseSuppression(track) {
    const mode = getNoiseSuppressionMode();
    const gainPercent = getMicGain();
    try {
      const processor = createNoiseSuppressionProcessor(mode, gainPercent);
      if (!processor) {
        if (track.getProcessor?.()) await track.stopProcessor();
        return;
      }
      await track.setProcessor(processor);
    } catch (err) {
      console.warn(`Não foi possível aplicar a supressão de ruído (${mode}):`, err);
    }
  }

  /** Le room.engine.client.rtt a cada 2s (API interna do SDK, mas estavel - o proprio LiveKit
   *  ja mede isso via ping/pong do canal de sinalizacao, nao precisamos reinventar). */
  function startPingMeter(room) {
    stopPingMeter();
    const read = () => {
      const rtt = room?.engine?.client?.rtt;
      setPingMs(typeof rtt === "number" && rtt > 0 ? rtt : null);
    };
    read();
    pingIntervalRef.current = setInterval(read, 2000);
  }
  function stopPingMeter() {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    setPingMs(null);
  }

  function syncCameraTracks() {
    setCameraTracks(
      [...cameraTracksRef.current.entries()].map(([identity, v]) => ({ identity, ...v }))
    );
  }

  /** Busca o que eu posso fazer nesse servidor (ver ServerPermission) - chamado ao entrar
   *  num canal de voz. Falha em silencio (fica sem nenhuma permissao) se der erro de rede,
   *  nunca trava a entrada na call por causa disso. */
  async function fetchMyPermissions(serverId) {
    try {
      const { data } = await api.get(`/api/servers/${serverId}/me/permissions`);
      myPermissionsRef.current = new Set(data || []);
      setMyPermissions(data || []);
    } catch (err) {
      console.warn("Não foi possível carregar suas permissões nesse servidor:", err);
      myPermissionsRef.current = new Set();
      setMyPermissions([]);
    }
  }

  useEffect(() => {
    return () => {
      roomRef.current?.disconnect();
      stopMicMeter();
      stopPingMeter();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Se a pagina acabou de carregar e existe um canal salvo de antes de um F5/recarregar,
  // reconecta sozinho nele - mas so depois que o WebSocket de chat conectar, senao o "entrei
  // nesse canal" nunca chega no backend e voce some de Conectados Agora pros outros.
  useEffect(() => {
    if (!stompConnected || activeChannelRef.current) return;
    const saved = loadActiveChannel();
    if (saved) joinChannel(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stompConnected]);

  // Reconectou o WebSocket de CHAT enquanto voce ja' estava numa call (rede caiu e voltou por
  // um instante, notebook dormiu, etc.) - isso e' uma conexao TOTALMENTE separada da call de
  // voz em si (LiveKit), mais resiliente e que normalmente nem chega a cair nesses casos. O
  // problema: o backend usa o socket de chat pra saber "quem esta na call" (ver
  // VoiceDisconnectListener no backend) - quando ele cai, mesmo que so por um segundo, o
  // backend automaticamente tira voce da lista de presenca de todo mundo, e sem isso aqui
  // ninguem nunca ficava sabendo que voce voltou: a call de audio continuava tocando normal
  // (dai o bug relatado - "ouço a pessoa mas ela nao aparece mais na call"), so' a LISTA que
  // ficava desatualizada pra sempre, ate' a pessoa sair e entrar de novo manualmente.
  useEffect(() => {
    if (!stompConnected || !activeChannelRef.current || !stompClientRef.current) return;
    const channelId = activeChannelRef.current.id;
    publishVoiceJoin(stompClientRef.current, channelId);
    publishVoiceMicState(stompClientRef.current, channelId, micEnabledRef.current);
    publishVoiceDeafenState(stompClientRef.current, channelId, deafenedRef.current);
    publishVoiceWatching(stompClientRef.current, channelId, currentWatchingUserIds());
    // A subscricao antiga morreu junto com a sessao STOMP anterior - refaz do zero.
    try {
      presenceSubRef.current?.unsubscribe();
    } catch {
      /* sessao antiga ja' nem existe mais no servidor, tanto faz */
    }
    presenceSubRef.current = subscribeToVoicePresence(stompClientRef.current, channelId, (list) => {
      presenceDeafenedRef.current = new Map(list.map((p) => [String(p.userId), p.deafened]));
      setScreenShareWatchers(watchersByIdentity(list));
      if (roomRef.current) refreshParticipants(roomRef.current);
    });
    try {
      controlSubRef.current?.unsubscribe();
    } catch {
      /* idem */
    }
    controlSubRef.current = subscribeToVoiceControl(stompClientRef.current, channelId, handleVoiceControlEvent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stompConnected]);

  // Reforco pro mesmo problema do efeito acima, so' que pra quando NENHUM disconnect/reconnect
  // chega a ser detectado (reportado pelo usuario com prints: o STOMP continua "conectado" o
  // tempo todo do ponto de vista do cliente, audio/fala continuam 100% normais pelo LiveKit,
  // mas os broadcasts de presenca desse canal simplesmente param de chegar pra ele especifico -
  // sem nenhum evento pra reagir, o unico jeito confiavel de nunca mais ficar preso
  // desatualizado "pra sempre" e' tambem buscar o snapshot de verdade via REST de tempos em
  // tempos, em vez de confiar 100% no push.
  useEffect(() => {
    if (!activeChannel) return;
    const channelId = activeChannel.id;
    const interval = setInterval(() => {
      api
        .get(`/api/channels/${channelId}/voice-presence`)
        .then(({ data }) => {
          presenceDeafenedRef.current = new Map((data || []).map((p) => [String(p.userId), p.deafened]));
          setScreenShareWatchers(watchersByIdentity(data));
          if (roomRef.current) refreshParticipants(roomRef.current);
          // "Usuario fantasma" NO SENTIDO INVERSO do bug acima: fala/ouve normal pelo LiveKit
          // (a call de audio nunca caiu), mas sumiu da lista de presenca do lado do SERVIDOR -
          // por exemplo, a mensagem STOMP de "entrei" se perdeu no meio do caminho sem nenhum
          // disconnect/reconnect pra disparar o efeito que reanuncia isso (ver useEffect
          // [stompConnected] acima). Reportado: "usuarios que falam e ouvem a gente na call mas
          // nao mostram que estao na call". Se EU ainda estiver conectado ao LiveKit mas nao
          // aparecer nessa lista, reanuncia sozinho - dentro de no maximo 12s isso se corrige
          // sem precisar sair/entrar na call na mao.
          const myUserId = userRef.current?.id;
          const iAmPresent = (data || []).some((p) => String(p.userId) === String(myUserId));
          if (roomRef.current && myUserId != null && !iAmPresent && stompClientRef.current && stompConnectedRef.current) {
            console.warn("Presenca de voz sumiu do lado do servidor enquanto ainda conectado ao LiveKit - reanunciando.");
            publishVoiceJoin(stompClientRef.current, channelId);
            publishVoiceMicState(stompClientRef.current, channelId, micEnabledRef.current);
            publishVoiceDeafenState(stompClientRef.current, channelId, deafenedRef.current);
          }
        })
        .catch(() => {});
    }, 12000);
    return () => clearInterval(interval);
  }, [activeChannel]);

  // Avisa o navegador pra perguntar "tem certeza que quer sair?" se voce fechar a aba ou
  // der F5 estando numa call - o texto do aviso e' fixo pelo proprio navegador por seguranca,
  // nao da pra customizar, mas a confirmacao em si funciona em todo navegador moderno.
  useEffect(() => {
    function handleBeforeUnload(e) {
      if (!activeChannel) return;
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [activeChannel]);

  // Atalhos de mutar/ensurdecer (configuraveis em Configuracoes) - lidos direto do localStorage
  // a cada disparo, entao uma mudanca em Configuracoes vale na hora, sem re-render.
  //
  // No navegador normal, so da pra ouvir "keydown" - e isso so' dispara com a janela do
  // Concorde em FOCO (limitacao de seguranca do proprio navegador, impossivel de contornar
  // fora de um app nativo). No app desktop (Electron), window.concordeDesktop existe e a gente
  // usa atalho GLOBAL de verdade (registrado no SO, ver electron/main.cjs/preload.cjs) -
  // continua funcionando com o Concorde em segundo plano (era exatamente o bug relatado: "so
  // funciona com o Concorde em tela principal"). Por isso o listener de "keydown" abaixo so'
  // roda fora do Electron - deixar os dois ativos ao mesmo tempo faria o atalho disparar
  // DUAS vezes (uma pelo SO, outra pelo navegador) sempre que o Concorde estivesse em foco,
  // desmutando/mutando de volta na hora.
  useEffect(() => {
    if (window.concordeDesktop) {
      // Registra na entrada do app (e de novo toda vez que o usuario salva um atalho novo em
      // Configuracoes, ver keyboardShortcuts.js) - assim funciona mesmo sem abrir Configuracoes
      // nessa sessao.
      syncGlobalShortcuts();
      const unsubscribe = window.concordeDesktop.onGlobalShortcut((action) => {
        if (!roomRef.current) return;
        if (action === "mute") toggleMic();
        else if (action === "deafen") toggleDeafen();
      });
      return unsubscribe;
    }

    function handleKeyDown(e) {
      if (!roomRef.current) return;
      const combo = shortcutFromEvent(e);
      if (combo === getMuteShortcut()) {
        e.preventDefault();
        toggleMic();
      } else if (combo === getDeafenShortcut()) {
        e.preventDefault();
        toggleDeafen();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  /** A foto de perfil viaja no "metadata" do participante do LiveKit (ver LiveKitService.java no backend). */
  function avatarUrlOf(participant) {
    try {
      return participant.metadata ? JSON.parse(participant.metadata)?.avatarUrl || null : null;
    } catch {
      return null;
    }
  }

  /** Extrai o userId numerico de uma identity do LiveKit no formato "user-42". */
  function userIdFromIdentity(identity) {
    return identity?.startsWith("user-") ? identity.slice(5) : null;
  }

  function deafenedOf(identity) {
    const userId = userIdFromIdentity(identity);
    return userId ? presenceDeafenedRef.current.get(userId) || false : false;
  }

  function refreshParticipants(activeRoom) {
    const local = activeRoom.localParticipant;
    const list = [
      {
        identity: local.identity,
        name: `${userRef.current?.username || local.identity} (você)`,
        avatarUrl: userRef.current?.avatarUrl || avatarUrlOf(local),
        // isMicrophoneEnabled reflete o estado real do LiveKit - usamos ele (em vez do
        // estado local isolado) pra ficar sempre consistente com o que os outros veem de voce.
        micEnabled: local.isMicrophoneEnabled,
        deafened: deafenedRef.current,
        isLocal: true,
      },
      ...[...activeRoom.remoteParticipants.values()].map((p) => ({
        identity: p.identity,
        name: p.name || p.identity,
        avatarUrl: avatarUrlOf(p),
        micEnabled: p.isMicrophoneEnabled,
        deafened: deafenedOf(p.identity),
        isLocal: false,
      })),
    ];
    setParticipants(list);
  }

  function syncScreenShares() {
    setScreenShares(
      [...videoTracksRef.current.entries()].map(([sid, v]) => ({
        sid,
        name: v.participantName,
        participantIdentity: v.participantIdentity,
        isLocal: v.isLocal,
        // "assistindo" = a gente tem o track de video de verdade em maos agora. Fica falso
        // ate' voce clicar pro quadrado pra entrar nessa transmissao (ver toggleWatchScreenShare)
        // sem por isso sumir da lista - continua la, so' sem baixar video ate' entrar.
        watching: !!v.track,
        track: v.track || null,
      }))
    );
  }

  /** Cria ou atualiza a entrada de uma transmissao de tela (mescla com o que ja existia). */
  function upsertScreenShare(sid, patch) {
    const identity = patch.participantIdentity ?? videoTracksRef.current.get(sid)?.participantIdentity;
    // So' existe UM compartilhamento de tela ativo por pessoa de cada vez (LiveKit substitui
    // a publicacao anterior sozinho ao chamar setScreenShareEnabled de novo) - se JA existe uma
    // entrada de OUTRO sid pra essa mesma pessoa, e' resto de uma publicacao antiga que nunca
    // foi limpa direito (ex: reconexao abrupta sem TrackUnpublished, ver
    // RoomEvent.ParticipantDisconnected acima) - remove antes de adicionar a nova, senao a
    // pessoa aparece compartilhando tela duas vezes ao mesmo tempo (reportado, com print).
    if (identity) {
      for (const [otherSid, entry] of [...videoTracksRef.current.entries()]) {
        if (otherSid !== sid && entry.participantIdentity === identity) videoTracksRef.current.delete(otherSid);
      }
    }
    const merged = { ...(videoTracksRef.current.get(sid) || {}), ...patch };
    videoTracksRef.current.set(sid, merged);
    syncScreenShares();
  }

  /** A transmissao acabou de verdade (a pessoa parou de compartilhar) - some da lista. */
  function removeVideoTrack(sid) {
    videoTracksRef.current.delete(sid);
    syncScreenShares();
  }

  /**
   * Voce ESCOLHE entrar (ou sair) de uma transmissao especifica - so' a partir daqui o video/
   * audio dela realmente baixa (ver gate em RoomEvent.TrackSubscribed abaixo, que usa
   * watchedShareIdentitiesRef pra decidir se aceita ou recusa a inscricao automatica do
   * LiveKit). Nao se aplica a sua propria tela (isLocal / sem pub).
   */
  const toggleWatchScreenShare = useCallback(async (sid) => {
    const entry = videoTracksRef.current.get(sid);
    if (!entry || entry.isLocal || !entry.pub) return;
    const nextWatching = !entry.track;
    if (nextWatching) watchedShareIdentitiesRef.current.add(entry.participantIdentity);
    else watchedShareIdentitiesRef.current.delete(entry.participantIdentity);
    // Avisa quem esta compartilhando (e todo mundo mais no canal) quem voce esta assistindo
    // agora - pra alimentar o icone de "quem esta vendo" no quadrado de transmissao (ver
    // ScreenShareTile/screenShareWatchers, VoiceChannel.jsx/VoiceCallContext.jsx).
    if (activeChannelRef.current && stompClientRef.current && stompConnectedRef.current) {
      publishVoiceWatching(stompClientRef.current, activeChannelRef.current.id, currentWatchingUserIds());
    }
    try {
      await entry.pub.setSubscribed(nextWatching);
    } catch (err) {
      console.warn("Não foi possível mudar a inscrição da transmissão:", err);
    }
    // O audio da transmissao e' uma publicacao SEPARADA (Track.Source.ScreenShareAudio) da
    // do video - sem isso aqui, "Parar de assistir" so' cortava o video e voce continuava
    // ouvindo o audio da transmissao rolando sozinho. Inscreve/desinscreve os dois juntos,
    // sempre no mesmo estado (assistindo = video + audio; parado = nenhum dos dois).
    const participant = roomRef.current?.remoteParticipants.get(entry.participantIdentity);
    const audioPub = participant?.getTrackPublication(Track.Source.ScreenShareAudio);
    if (audioPub) {
      try {
        await audioPub.setSubscribed(nextWatching);
      } catch (err) {
        console.warn("Não foi possível mudar a inscrição do áudio da transmissão:", err);
      }
    }
    // O proprio evento TrackSubscribed/TrackUnsubscribed do LiveKit vai atualizar entry.track
    // e chamar syncScreenShares quando a mudanca for confirmada.
  }, []);

  /** identity e' "user-<id>" pra gente (ver VoiceController no backend) ou "musicbot-<channelId>"/
   *  "soundboardbot-<channelId>" pros bots (Melodion, de musica, e Batera, do soundboard - ver
   *  music-bot/src/session.js e soundboardSession.js) - devolve a CHAVE de persistencia certa
   *  pra gravar/ler o volume no localStorage, nao por sessao de call. Pro bot, usa a propria
   *  identity (unica por canal) como chave - sem isso, o volume ajustado pra ele nunca batia
   *  no "if (userId)" abaixo (regex so' aceitava "user-N"), entao ficava preso so' no Map em
   *  memoria e resetava pro padrao toda vez que a pessoa saia e entrava de novo na call
   *  (reportado - pra outras PESSOAS ja' persistia normal). */
  function userIdFromIdentity(identity) {
    const match = /^user-(\d+)$/.exec(identity || "");
    if (match) return match[1];
    if (/^(musicbot|soundboardbot)-\d+$/.test(identity || "")) return identity;
    return null;
  }

  /** Lista NUMERICA (userId de verdade, o que o backend espera - ver
   *  VoicePresenceService.setWatching) de quem voce esta assistindo AGORA, a partir de
   *  watchedShareIdentitiesRef (identities "user-<id>") - filtra fora os bots (nunca
   *  compartilham tela, "musicbot-<x>"/"soundboardbot-<x>" nao batem no formato numerico) e
   *  qualquer identity que nao reconheca. Usada tanto pra publicar de novo ao (re)conectar
   *  quanto ao mudar quem voce assiste (ver toggleWatchScreenShare). */
  function currentWatchingUserIds() {
    return [...watchedShareIdentitiesRef.current]
      .map((identity) => userIdFromIdentity(identity))
      .filter((id) => id && /^\d+$/.test(id))
      .map(Number);
  }

  /**
   * Le o volume de voz que deve valer AGORA pra essa pessoa - do Map em memoria se ja' foi
   * lido/ajustado nessa call, senao do localStorage (preferencia de uma call anterior), senao
   * 100% (padrao). Preenche o Map E o estado do React na primeira leitura, pra o slider no
   * popover de moderacao ja' abrir mostrando o valor certo (nao sempre "100%") mesmo antes de
   * voce mexer nele de novo.
   */
  function resolveParticipantVolume(identity) {
    if (participantVolumesRef.current.has(identity)) return participantVolumesRef.current.get(identity);
    const userId = userIdFromIdentity(identity);
    const value = (userId && getSavedParticipantVolume(userId)) ?? 100;
    participantVolumesRef.current.set(identity, value);
    setParticipantVolumesState(Object.fromEntries(participantVolumesRef.current));
    return value;
  }

  /** Mesma ideia do resolveParticipantVolume acima, pro audio da transmissao de tela. */
  function resolveStreamVolume(identity) {
    if (streamVolumesRef.current.has(identity)) return streamVolumesRef.current.get(identity);
    const userId = userIdFromIdentity(identity);
    const value = (userId && getSavedStreamVolume(userId)) ?? 100;
    streamVolumesRef.current.set(identity, value);
    setStreamVolumesState(Object.fromEntries(streamVolumesRef.current));
    return value;
  }

  /** Volume de 0-300% (participante/transmissao) JA multiplicado pelo volume MESTRE (0-300%,
   *  ver masterVolumeRef/setMasterVolumePercent) - e' esse numero final que vai pro
   *  track.setVolume() de verdade. Centralizado aqui pra nenhum dos varios lugares que chamam
   *  setVolume() (attach inicial, reconectar, tirar do ensurdecido etc) esquecer de aplicar o
   *  mestre junto. */
  function effectiveVolume(rawPercent) {
    return (rawPercent / 100) * (masterVolumeRef.current / 100);
  }

  function setParticipantVolume(identity, percent) {
    const clamped = Math.max(0, Math.min(300, Math.round(percent)));
    participantVolumesRef.current.set(identity, clamped);
    setParticipantVolumesState(Object.fromEntries(participantVolumesRef.current));
    // Gravado por PESSOA (userId), sobrevive a ela sair/entrar de novo na call, voce sair/
    // entrar, ou ate' fechar e abrir o app - pedido explicito do usuario (antes so' vivia num
    // Map em memoria, resetava pro padrao toda vez que o track era republicado).
    const userId = userIdFromIdentity(identity);
    if (userId) setSavedParticipantVolume(userId, clamped);
    // Ensurdecido tem prioridade - so' aplica o volume de verdade no track se voce estiver
    // ouvindo alguem no momento; a preferencia fica salva e volta a valer depois (ver
    // toggleMic/clearDeafened), senao mexer no slider "furaria" o silencio sem querer.
    if (!deafenedRef.current) {
      micAudioTracksRef.current.get(identity)?.setVolume(effectiveVolume(clamped));
    }
  }

  function setStreamVolume(identity, percent) {
    const clamped = Math.max(0, Math.min(300, Math.round(percent)));
    streamVolumesRef.current.set(identity, clamped);
    setStreamVolumesState(Object.fromEntries(streamVolumesRef.current));
    const userId = userIdFromIdentity(identity);
    if (userId) setSavedStreamVolume(userId, clamped);
    if (!deafenedRef.current) {
      screenAudioTracksRef.current.get(identity)?.setVolume(effectiveVolume(clamped));
    }
  }

  /** Volume MESTRE (alto-falante) - multiplica por cima de TODO volume individual (voz e
   *  transmissao de tela de qualquer pessoa), sem mexer nas preferencias individuais salvas de
   *  cada uma (ver effectiveVolume acima). Reaplica na hora em quem esta tocando agora mesmo -
   *  senao so' valeria na proxima vez que cada track fosse reanexado. */
  function setMasterVolumePercent(percent) {
    const clamped = Math.max(0, Math.min(300, Math.round(percent)));
    masterVolumeRef.current = clamped;
    setMasterVolumeState(clamped);
    persistMasterVolume(clamped);
    if (deafenedRef.current) return; // ensurdecido ja' esta tudo a 0, nada pra reaplicar agora
    micAudioTracksRef.current.forEach((track, identity) => track.setVolume(effectiveVolume(resolveParticipantVolume(identity))));
    screenAudioTracksRef.current.forEach((track, identity) => track.setVolume(effectiveVolume(resolveStreamVolume(identity))));
  }

  /** Volume do SEU proprio microfone (0-200%, o que sai pra fora pros outros) - reaplica na
   *  hora se voce estiver com o microfone publicado agora (ver localMicTrackRef), sem precisar
   *  desmutar/mutar pra fazer efeito (ver applyNoiseSuppression). */
  function setMicGainPercent(percent) {
    const clamped = Math.max(0, Math.min(200, Math.round(percent)));
    setMicGainState(clamped);
    persistMicGain(clamped);
    if (localMicTrackRef.current) applyNoiseSuppression(localMicTrackRef.current);
  }

  /** Desconecta e limpa tudo - usado tanto no "Sair da call" quanto ao trocar de canal. */
  async function disconnectInternal() {
    intentionalDisconnectRef.current = true;
    const channelLeaving = activeChannelRef.current;
    if (channelLeaving && stompClientRef.current && stompConnectedRef.current) {
      publishVoiceLeave(stompClientRef.current, channelLeaving.id);
    }
    presenceSubRef.current?.unsubscribe();
    presenceSubRef.current = null;
    controlSubRef.current?.unsubscribe();
    controlSubRef.current = null;
    presenceDeafenedRef.current = new Map();
    forceMutedRef.current = false;
    forceDeafenedRef.current = false;
    myPermissionsRef.current = new Set();
    setMyPermissions([]);
    clearActiveChannel();
    await roomRef.current?.disconnect();
    roomRef.current = null;
    localMicTrackRef.current = null;
    videoTracksRef.current.clear();
    watchedShareIdentitiesRef.current = new Set();
    setScreenShareWatchers({});
    micAudioTracksRef.current.clear();
    screenAudioTracksRef.current.clear();
    participantVolumesRef.current = new Map();
    streamVolumesRef.current = new Map();
    // Se voce estava compartilhando via seletor customizado (Electron), o track foi
    // capturado "na mao" (getUserMedia) - precisa parar explicitamente, o room.disconnect()
    // acima nao necessariamente libera a captura de tela/audio do sistema sozinho.
    electronScreenTracksRef.current.video?.stop();
    electronScreenTracksRef.current.audio?.stop();
    electronScreenTracksRef.current.audio?._concordeCleanup?.();
    electronScreenTracksRef.current = { video: null, audio: null };
    cameraTracksRef.current.clear();
    setCameraTracks([]);
    setCameraEnabled(false);
    stopMicMeter();
    stopPingMeter();
    setConnected(false);
    setActiveChannel(null);
    setParticipants([]);
    setSpeakingIds(new Set());
    setScreenSharing(false);
    screenSharingRef.current = false;
    setDeafened(false);
    setScreenShares([]);
    setParticipantVolumesState({});
    setStreamVolumesState({});
  }

  async function joinChannel(channel) {
    if (joiningRef.current) return; // evita duas conexoes simultaneas pro mesmo clique/efeito
    joiningRef.current = true;
    try {
      if (roomRef.current) {
        await disconnectInternal();
      }

      const { data } = await api.post(`/api/channels/${channel.id}/voice-token`);
      const savedInput = getSavedAudioInput();
      const savedOutput = getSavedAudioOutput();

      const newRoom = new Room({
        adaptiveStream: true,
        dynacast: true,
        // Sem isso, o volume de cada participante/transmissao fica preso ao <audio>.volume
        // do navegador, que trava em 100% - com webAudioMix ligado, o LiveKit passa a
        // controlar o audio por um GainNode (Web Audio API), que aceita valores acima de 1
        // (ate' 300% aqui - ver setParticipantVolume/setStreamVolume).
        webAudioMix: true,
        // noiseSuppression nativa do navegador DESLIGADA de proposito - a supressao de
        // verdade agora e' feita por IA (RNNoise/GTCRN, ver utils/noiseSuppression.js e o
        // RoomEvent.LocalTrackPublished abaixo). Aplicar as duas juntas (nativa + IA) foi
        // provavelmente a causa do "corta o audio inteiro" relatado em alguns microfones -
        // dois filtros agressivos brigando entre si.
        audioCaptureDefaults: {
          ...(savedInput ? { deviceId: savedInput } : {}),
          noiseSuppression: false,
        },
        // O PADRAO do proprio livekit-client pra transmissao de tela e' baixo de proposito
        // (h1080fps15 = so' 15fps e 2.5Mbps, pensado pra economizar banda no caso comum) - na
        // pratica isso faz QUALQUER transmissao de tela parecer "travando" (15fps e' bem
        // perceptivel, principalmente em jogos/video) mesmo com internet de sobra (reportado:
        // "as vezes fica boa, as vezes trava"). 1080p 30fps/6Mbps CRAVADO - pedido explicito do
        // usuario (chegou a pedir 60fps antes, mas voltou atras: "pra nao ficar pesado pra
        // ninguem, limite... em ate' somente trinta fps cravado, deve ficar sempre com trinta
        // fps, para nao travar" - quem assiste, principalmente com PC/internet mais fraca, sente
        // mais o peso de 60fps constante do que ganha em fluidez). maxFramerate aqui e' o TETO
        // de codificacao (a captura tambem precisa ser limitada a 30 pra bater com isso, ver
        // frameRate/maxFrameRate mais abaixo, no navegador e no Electron).
        publishDefaults: {
          screenShareEncoding: { maxBitrate: 6_000_000, maxFramerate: 30, priority: "high" },
          // O PADRAO do proprio livekit-client pra transmissao de tela, quando falta banda, e'
          // "maintain-resolution" (o WebRTC prefere derrubar o FRAMERATE pra manter a imagem
          // nitida - bom pra compartilhar documento/planilha, pessimo pra jogo com movimento
          // rapido: vira uma sequencia de fotos travadas em vez de continuar fluido so' com
          // menos nitidez). "maintain-framerate" inverte essa prioridade - sob a MESMA pressao
          // de rede, o WebRTC prefere perder um pouco de nitidez a perder fluidez (reportado:
          // "trava, principalmente em jogos mais freneticos"). Continua valendo com o teto em
          // 30fps: garante que, se a rede apertar, os 30fps cravados sao o ULTIMO a cair (a
          // resolucao cai primeiro).
          degradationPreference: "maintain-framerate",
        },
      });

      newRoom.on(RoomEvent.TrackSubscribed, (track, pub, participant) => {
        if (track.kind === Track.Kind.Video && pub.source === Track.Source.ScreenShare) {
          // O LiveKit auto-inscreve todo track novo por padrao (inclusive telas dos outros) -
          // se ninguem pediu explicitamente pra assistir ESSA pessoa ainda (ver
          // toggleWatchScreenShare/watchedShareIdentitiesRef), recusa a inscricao na hora e so'
          // registra que a transmissao existe (o quadrado clicavel aparece, sem baixar video
          // nenhum) - pedido explicito do usuario pra ninguem ver automaticamente.
          if (!watchedShareIdentitiesRef.current.has(participant.identity)) {
            pub.setSubscribed(false);
            upsertScreenShare(pub.trackSid, {
              track: null,
              pub,
              participantIdentity: participant.identity,
              participantName: participant.name || participant.identity,
              isLocal: false,
            });
          } else {
            upsertScreenShare(pub.trackSid, {
              track,
              pub,
              participantIdentity: participant.identity,
              participantName: participant.name || participant.identity,
              isLocal: false,
            });
          }
        } else if (track.kind === Track.Kind.Video && pub.source === Track.Source.Camera) {
          cameraTracksRef.current.set(participant.identity, {
            track,
            name: participant.name || participant.identity,
            isLocal: false,
          });
          syncCameraTracks();
        } else if (track.kind === Track.Kind.Audio) {
          // Voz (microfone) e audio da transmissao de tela tem controle de volume separado
          // um do outro - guarda a referencia do track de cada um pra poder ajustar depois.
          // Se voce estiver ensurdecido, entra silenciado (volume 0) independente da
          // preferencia salva - ela so' volta a valer quando voce reativar o audio.
          const silenced = deafenedRef.current;
          if (pub.source === Track.Source.ScreenShareAudio) {
            // Mesma trava do video acima (watchedShareIdentitiesRef) - o audio da transmissao
            // de quem voce nao escolheu assistir tambem nao toca sozinho.
            if (!watchedShareIdentitiesRef.current.has(participant.identity)) {
              pub.setSubscribed(false);
              return;
            }
          }
          // ATTACH ANTES de setVolume(), de proposito - track.setVolume() do livekit-client so'
          // aplica de verdade nos elementos JA' anexados (attachedElements); chamado antes do
          // attach() ele so' GUARDA o numero (elementVolume) pra aplicar de novo depois, dentro
          // do proprio attach(). O problema: essa reaplicacao e' um "if (this.elementVolume)" -
          // um "if" comum, e 0 e' falsy em JS! Quando o volume salvo e' EXATAMENTE 0 (silenciar
          // alguem por completo), esse "if" nunca entra, o gainNode nunca recebe o 0 de verdade,
          // e a pessoa continua audivel mesmo com o slider mostrando 0% - exatamente o bug
          // relatado (Anderson zera o Luis Henrique, ele sai/entra, volta a ouvir ele). Anexar
          // primeiro garante que attachedElements ja' NAO esta' vazio quando setVolume() roda,
          // entao ele aplica direto no gainNode, sem depender dessa reaplicacao com bug do 0.
          const el = track.attach();
          if (deafenedRef.current) el.muted = true;
          if (pub.source === Track.Source.Microphone) {
            micAudioTracksRef.current.set(participant.identity, track);
            track.setVolume(silenced ? 0 : effectiveVolume(resolveParticipantVolume(participant.identity)));
          } else if (pub.source === Track.Source.ScreenShareAudio) {
            screenAudioTracksRef.current.set(participant.identity, track);
            track.setVolume(silenced ? 0 : effectiveVolume(resolveStreamVolume(participant.identity)));
          }
          // O microfone so fica "inscrito" (chega aqui) depois que a pessoa efetivamente
          // publica o track - se a gente nao atualizar a lista agora, quem entrou na call
          // fica preso mostrando "mudo" pros outros ate' a proxima vez que mutar/desmutar
          // (o snapshot de ParticipantConnected roda ANTES do mic estar publicado).
          if (pub.source === Track.Source.Microphone) refreshParticipants(newRoom);
        }
      });
      newRoom.on(RoomEvent.TrackUnsubscribed, (track, pub, participant) => {
        if (pub.source === Track.Source.ScreenShare) {
          // So' desanexa o video (perdeu o track) - a aba continua na lista, ver
          // toggleWatchScreenShare. Some de vez so' quando a pessoa PARA de compartilhar
          // (RoomEvent.TrackUnpublished, abaixo).
          const entry = videoTracksRef.current.get(pub.trackSid);
          if (entry) {
            entry.track = null;
            syncScreenShares();
          }
        }
        if (pub.source === Track.Source.Microphone) {
          micAudioTracksRef.current.delete(participant.identity);
          refreshParticipants(newRoom);
        }
        if (pub.source === Track.Source.ScreenShareAudio) screenAudioTracksRef.current.delete(participant.identity);
        if (pub.source === Track.Source.Camera) {
          cameraTracksRef.current.delete(participant.identity);
          syncCameraTracks();
        }
        track.detach().forEach((el) => el.remove());
      });
      // A pessoa parou de compartilhar a tela de vez (nao so' alguem deixou de assistir).
      newRoom.on(RoomEvent.TrackUnpublished, (pub) => {
        if (pub.source === Track.Source.ScreenShare) removeVideoTrack(pub.trackSid);
      });
      // Fica sabendo de uma tela compartilhada NOVA (alguem que ja estava na call comeca a
      // compartilhar agora) ANTES dela ser baixada - mais confiavel que so' reagir depois em
      // TrackSubscribed (fica sujeito a corrida: o LiveKit auto-inscreve e baixa por um
      // instante ate' a gente conseguir cancelar) - recusa a inscricao aqui, na hora, se
      // ninguem pediu pra assistir essa pessoa ainda, e ja registra o quadrado "clique pra
      // assistir" mesmo assim (reportado pelo usuario: telas de amigos as vezes nem apareciam
      // disponiveis pra escolher assistir). Telas que JA estavam ativas quando voce entrou na
      // call continuam cobertas pelo TrackSubscribed abaixo (esse evento so' dispara pra
      // publicacoes novas DEPOIS que voce ja esta conectado).
      newRoom.on(RoomEvent.TrackPublished, (pub, participant) => {
        if (pub.source !== Track.Source.ScreenShare && pub.source !== Track.Source.ScreenShareAudio) return;
        const watching = watchedShareIdentitiesRef.current.has(participant.identity);
        if (!watching) pub.setSubscribed(false);
        if (pub.source === Track.Source.ScreenShare) {
          upsertScreenShare(pub.trackSid, {
            track: watching ? pub.track : null,
            pub,
            participantIdentity: participant.identity,
            participantName: participant.name || participant.identity,
            isLocal: false,
          });
        }
      });
      // Sua propria tela compartilhada e sua propria camera tambem entram na lista, pra
      // voce poder conferir o que esta sendo transmitido (assim como as dos outros).
      newRoom.on(RoomEvent.LocalTrackPublished, (pub, participant) => {
        // Toda vez que o microfone e' (re)publicado - primeira vez ao entrar, desmutar,
        // liberar um ensurdecido, trocar de dispositivo de entrada (dispara restart) - aplica
        // a supressao de ruido escolhida em Configuracoes (ver utils/noiseSuppression.js). Um
        // lugar so' pra isso em vez de espalhar em cada setMicrophoneEnabled(true) espalhado
        // pelo arquivo (join/toggleMic/toggleDeafen) - nenhum lugar (atual ou futuro) esquece.
        if (pub.source === Track.Source.Microphone && pub.track) {
          localMicTrackRef.current = pub.track;
          applyNoiseSuppression(pub.track);
        }
        if (pub.source === Track.Source.ScreenShare && pub.track) {
          upsertScreenShare(pub.trackSid, {
            track: pub.track,
            pub: null, // sem pub remoto - nao faz sentido "parar de assistir" sua propria tela
            participantIdentity: participant.identity,
            participantName: `${participant.name || participant.identity} (você)`,
            isLocal: true,
          });
        }
        if (pub.source === Track.Source.Camera && pub.track) {
          cameraTracksRef.current.set(participant.identity, {
            track: pub.track,
            name: `${participant.name || participant.identity} (você)`,
            isLocal: true,
          });
          syncCameraTracks();
        }
      });
      newRoom.on(RoomEvent.LocalTrackUnpublished, (pub) => {
        if (pub.source === Track.Source.ScreenShare) removeVideoTrack(pub.trackSid);
        if (pub.source === Track.Source.Camera) {
          cameraTracksRef.current.delete(newRoom.localParticipant.identity);
          syncCameraTracks();
        }
      });
      // Toca so quando OUTRA pessoa entra/sai enquanto voce ja esta na call - o efeito de
      // voce mesmo entrando/saindo e' tocado explicitamente logo abaixo, uma vez so.
      // Reconexao completa depois de uma queda de rede/PC hibernado/aba muito tempo em
      // segundo plano - ver resyncFromRoom acima pra detalhe do que isso corrige.
      newRoom.on(RoomEvent.Reconnected, () => {
        resyncFromRoom(newRoom);
      });
      // Desconexao de VERDADE - o LiveKit ja tentou reconectar sozinho por baixo dos panos
      // (RoomEvent.Reconnected acima) e desistiu, OU foi um kick/servidor caiu/etc. Sem esse
      // handler, activeChannel/connected NUNCA mudavam sozinhos nesse caso - a tela ficava
      // "presa" mostrando que voce ainda esta na call (o app achava que so' o LiveKit tinha
      // ficado quieto por um instante), mesmo com o audio JA morto de verdade (nao fala nem
      // ouve mais) - exatamente o bug relatado: "cai da call, mas continua aparecendo que
      // esta". "intentionalDisconnectRef" distingue isso de um disconnect() que a GENTE pediu
      // (sair/trocar de canal, ver disconnectInternal) - so' reage aqui na queda que NINGUEM
      // pediu.
      newRoom.on(RoomEvent.Disconnected, (reason) => {
        if (intentionalDisconnectRef.current) {
          intentionalDisconnectRef.current = false; // reseta pra proxima vez
          return;
        }
        console.warn("Desconectado da call de voz sem pedir (motivo LiveKit):", reason);
        let message =
          "Você perdeu a conexão com a call de voz (internet instável?). Entre de novo se quiser continuar.";
        if (reason === DisconnectReason.PARTICIPANT_REMOVED) {
          message = "Você foi removido dessa call de voz por um moderador.";
        } else if (reason === DisconnectReason.ROOM_DELETED || reason === DisconnectReason.SERVER_SHUTDOWN) {
          message = "Essa call de voz foi encerrada.";
        } else if (reason === DisconnectReason.DUPLICATE_IDENTITY) {
          message = "Você entrou nessa call em outro lugar (outra aba/dispositivo) - essa conexão foi encerrada.";
        }
        disconnectInternal();
        playLeaveSound();
        showAlert(message);
      });
      newRoom.on(RoomEvent.ParticipantConnected, () => {
        refreshParticipants(newRoom);
        playJoinSound();
      });
      newRoom.on(RoomEvent.ParticipantDisconnected, (participant) => {
        refreshParticipants(newRoom);
        playLeaveSound();
        // Rede varia (a mesma pressao de rede que causa o "trava" na transmissao, ver fix
        // anterior) pode fazer um participante cair de um jeito ABRUPTO (timeout do servidor,
        // sem handshake limpo de "parei de compartilhar") - nesse caso TrackUnpublished pode
        // nunca disparar pra tela/camera dele, deixando uma entrada FANTASMA presa em
        // videoTracksRef/cameraTracksRef pra sempre. Se ela reconectar e compartilhar nova
        // tela, entra uma entrada NOVA (trackSid diferente) do lado da velha, que ninguem
        // nunca removeu - reportado: "tem gente compartilhando tela duas vezes repetida".
        // Reforco: ao desconectar de vez, garante que NENHUM resto dessa pessoa continua
        // preso, independente de TrackUnpublished ter disparado ou nao.
        for (const [sid, entry] of [...videoTracksRef.current.entries()]) {
          if (entry.participantIdentity === participant.identity) videoTracksRef.current.delete(sid);
        }
        syncScreenShares();
        if (cameraTracksRef.current.delete(participant.identity)) syncCameraTracks();
      });
      // O LiveKit calcula quem esta falando com base no nivel de audio - so quem esta
      // dentro da call (conectado ao LiveKit) recebe isso, ninguem de fora ve.
      newRoom.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        setSpeakingIds(new Set(speakers.map((p) => p.identity)));
      });
      // Mostra o icone de "mudo" pra QUALQUER participante (nao so voce mesmo).
      newRoom.on(RoomEvent.TrackMuted, (pub, participant) => {
        refreshParticipants(newRoom);
        // setCameraEnabled(false) NAO despublica o track (diferente de tela compartilhada) -
        // so' muta ele, mantendo a publicacao viva (ver toggleCamera). Sem isso aqui, o tile
        // da camera continuava na tela mostrando um quadrado preto congelado depois de
        // desligar a camera, porque LocalTrackUnpublished/TrackUnsubscribed nunca disparava.
        if (pub.source === Track.Source.Camera) {
          cameraTracksRef.current.delete(participant.identity);
          syncCameraTracks();
        }
      });
      newRoom.on(RoomEvent.TrackUnmuted, (pub, participant) => {
        refreshParticipants(newRoom);
        if (pub.source === Track.Source.Camera && pub.track) {
          const isLocal = participant.identity === newRoom.localParticipant.identity;
          cameraTracksRef.current.set(participant.identity, {
            track: pub.track,
            name: isLocal ? `${participant.name || participant.identity} (você)` : participant.name || participant.identity,
            isLocal,
          });
          syncCameraTracks();
        }
      });

      try {
        await newRoom.connect(data.wsUrl, data.token);
      } catch (err) {
        clearActiveChannel();
        showAlert("Não foi possível conectar na call: " + err.message);
        return;
      }

      if (savedOutput) {
        try {
          await newRoom.switchActiveDevice("audiooutput", savedOutput);
        } catch (err) {
          console.warn("Não foi possível aplicar a saída de áudio escolhida:", err);
        }
      }

      roomRef.current = newRoom;
      setActiveChannel(channel);
      saveActiveChannel(channel);
      setConnected(true);
      startPingMeter(newRoom);
      // Punicao GRAVADA (ver Membership no backend) - se voce ja' estava mutado/ensurdecido a
      // força antes de sair, entra de novo na call ja' assim, ate' alguem com permissao tirar
      // (pedido explicito do usuario: sair/entrar nao pode "resetar" isso).
      forceMutedRef.current = data.forceMuted;
      forceDeafenedRef.current = data.forceDeafened;
      setDeafened(data.forceDeafened);
      if (channel.serverId) fetchMyPermissions(channel.serverId);
      if (stompClientRef.current && stompConnectedRef.current) {
        publishVoiceJoin(stompClientRef.current, channel.id);
        presenceSubRef.current = subscribeToVoicePresence(stompClientRef.current, channel.id, (list) => {
          presenceDeafenedRef.current = new Map(list.map((p) => [String(p.userId), p.deafened]));
          setScreenShareWatchers(watchersByIdentity(list));
          if (roomRef.current) refreshParticipants(roomRef.current);
        });
        controlSubRef.current = subscribeToVoiceControl(stompClientRef.current, channel.id, handleVoiceControlEvent);
      }
      playJoinSound(); // voce tambem ouve quando VOCE entra numa call, nao so quando os outros entram

      if (data.forceMuted || data.forceDeafened) {
        // Mutado/ensurdecido a força - nem tenta ligar o microfone (fica sem publicar audio
        // nenhum, nao so' "ligado e desligado de novo em seguida").
        setMicEnabled(false);
      } else {
        try {
          await newRoom.localParticipant.setMicrophoneEnabled(true);
          setMicEnabled(true);
          const micPub = newRoom.localParticipant.getTrackPublication(Track.Source.Microphone);
          if (micPub?.track?.mediaStreamTrack) startMicMeter(micPub.track.mediaStreamTrack);
        } catch (err) {
          setMicEnabled(false);
          showAlert(
            "Conectado, mas não consegui acessar seu microfone (permissão negada ou nenhum dispositivo encontrado): " +
              err.message
          );
        }
      }
      // So agora (depois do microfone ja ter sido ligado/negado de verdade) que a lista de
      // participantes reflete o estado real - antes disso ela mostrava "mudo" por engano,
      // porque local.isMicrophoneEnabled ainda estava false no momento da leitura.
      refreshParticipants(newRoom);
    } finally {
      joiningRef.current = false;
    }
  }

  async function leaveChannel() {
    if (!roomRef.current) return;
    playLeaveSound(); // voce tambem ouve quando VOCE sai, nao so quando os outros saem
    await disconnectInternal();
  }

  /**
   * Restaura o volume de voz/transmissao de tela de todo mundo pro que estava configurado
   * antes de ensurdecer (ou 100% por padrao). Importante: precisa ser via track.setVolume(),
   * nao "el.muted" - com webAudioMix ligado (ver joinChannel) o LiveKit toca o audio por fora
   * do elemento <audio>, direto pelo Web Audio API, entao mutar o elemento sozinho nao
   * restaura nada de verdade (esse era o bug: "desmutar enquanto ensurdecido" continuava
   * sem tocar nada ate' clicar de novo no icone de ensurdecer, que ai' sim passava por aqui).
   */
  function restoreListenVolumes(room) {
    micAudioTracksRef.current.forEach((track, identity) => {
      track.setVolume(effectiveVolume(resolveParticipantVolume(identity)));
    });
    screenAudioTracksRef.current.forEach((track, identity) => {
      track.setVolume(effectiveVolume(resolveStreamVolume(identity)));
    });
    // Reforco pro caso raro de webAudioMix nao estar disponivel (cai pro elemento nativo).
    room.remoteParticipants.forEach((participant) => {
      participant.audioTrackPublications.forEach((pub) => {
        pub.track?.attachedElements.forEach((el) => (el.muted = false));
      });
    });
  }

  /** O que voce OUVE precisa ficar em silencio enquanto estiver ensurdecido - reaplica direto
   *  em cima do que ja' existe (mic + audio de transmissao de todo mundo), sem duplicar a
   *  logica de mutar/restaurar em dois lugares diferentes (toggleDeafen/clearDeafened). */
  function applyListenSilence(room) {
    const activeRoom = room || roomRef.current;
    if (!activeRoom) return;
    if (deafenedRef.current) {
      micAudioTracksRef.current.forEach((track) => track.setVolume(0));
      screenAudioTracksRef.current.forEach((track) => track.setVolume(0));
      activeRoom.remoteParticipants.forEach((participant) => {
        participant.audioTrackPublications.forEach((pub) => {
          pub.track?.attachedElements.forEach((el) => (el.muted = true));
        });
      });
    } else {
      restoreListenVolumes(activeRoom);
    }
  }

  /**
   * Depois de ficar muito tempo sem mexer no app (PC hibernou, rede caiu, aba ficou muito
   * tempo em segundo plano), o LiveKit as vezes precisa fazer uma reconexao completa por
   * baixo dos panos (ver RoomEvent.Reconnected abaixo) - e nessa hora os eventos incrementais
   * que a gente escuta pra manter cameraTracksRef/micAudioTracksRef em dia (TrackMuted/
   * Unmuted/Subscribed/Unsubscribed) podem se perder ou chegar fora de ordem. Isso deixava:
   * (1) alguem aparecendo com a camera "aberta" sem estar (tile fantasma que nunca foi limpo),
   * (2) voce ensurdecido voltando a OUVIR todo mundo sozinho (volume resetado pro padrao no
   * reconnect, sem reaplicar o setVolume(0) do ensurdecido), e (3) seu proprio microfone
   * ficando preso "publicado" internamente mesmo mutado, fazendo ninguem te ouvir depois de
   * desmutar (so' saindo e entrando de novo na call "consertava"). Aqui a gente reconstroi
   * TUDO a partir do estado real e atual do LiveKit (nao confia mais no que foi acumulado
   * incrementalmente) e reaplica mic/ensurdecido - sem precisar sair da call.
   */
  function resyncFromRoom(room) {
    cameraTracksRef.current.clear();
    micAudioTracksRef.current.clear();
    screenAudioTracksRef.current.clear();
    const silenced = deafenedRef.current;
    room.remoteParticipants.forEach((participant) => {
      participant.trackPublications.forEach((pub) => {
        if (!pub.isSubscribed || !pub.track) return;
        if (pub.source === Track.Source.Camera) {
          cameraTracksRef.current.set(participant.identity, {
            track: pub.track,
            name: participant.name || participant.identity,
            isLocal: false,
          });
        } else if (pub.source === Track.Source.Microphone) {
          micAudioTracksRef.current.set(participant.identity, pub.track);
          // Precisa estar anexado ANTES do setVolume() - ver comentario grande no
          // RoomEvent.TrackSubscribed acima pro bug do "0 e' falsy" que isso evita.
          if (pub.track.attachedElements.length === 0) pub.track.attach();
          pub.track.setVolume(silenced ? 0 : effectiveVolume(resolveParticipantVolume(participant.identity)));
          pub.track.attachedElements.forEach((el) => (el.muted = silenced));
        } else if (pub.source === Track.Source.ScreenShareAudio) {
          // Se a reconexao trouxe de volta o audio de uma transmissao que voce NAO escolheu
          // assistir (mesma regra do watchedShareIdentitiesRef em TrackSubscribed), desfaz a
          // inscricao de novo - nao deve tocar sozinho so' porque reconectou.
          if (!watchedShareIdentitiesRef.current.has(participant.identity)) {
            pub.setSubscribed(false);
            return;
          }
          screenAudioTracksRef.current.set(participant.identity, pub.track);
          if (pub.track.attachedElements.length === 0) pub.track.attach();
          pub.track.setVolume(silenced ? 0 : effectiveVolume(resolveStreamVolume(participant.identity)));
          pub.track.attachedElements.forEach((el) => (el.muted = silenced));
        }
      });
    });

    // Mesma logica pro video de compartilhamento de tela: reconstroi so' as entradas dos
    // OUTROS (preserva a sua propria, isLocal, que nao vem de remoteParticipants) a partir de
    // quem voce escolheu assistir - se a reconexao trouxe de volta uma inscricao de video que
    // voce nao pediu, desfaz de novo.
    for (const [sid, entry] of [...videoTracksRef.current.entries()]) {
      if (!entry.isLocal) videoTracksRef.current.delete(sid);
    }
    room.remoteParticipants.forEach((participant) => {
      const pub = participant.getTrackPublication(Track.Source.ScreenShare);
      if (!pub) return;
      const watching = watchedShareIdentitiesRef.current.has(participant.identity);
      if (pub.isSubscribed !== watching) pub.setSubscribed(watching);
      videoTracksRef.current.set(pub.trackSid, {
        track: watching ? pub.track : null,
        pub,
        participantIdentity: participant.identity,
        participantName: participant.name || participant.identity,
        isLocal: false,
      });
    });
    syncScreenShares();

    syncCameraTracks();
    refreshParticipants(room);

    // Reaplica seu proprio mic: so' fica publicado se voce quer mic ligado E nao tem
    // nenhuma trava (ensurdecido, mutado/ensurdecido a força) ativa agora.
    const shouldPublishMic =
      micEnabledRef.current && !deafenedRef.current && !forceMutedRef.current && !forceDeafenedRef.current;
    room.localParticipant.setMicrophoneEnabled(shouldPublishMic).catch(() => {});
  }

  /** Tira o ensurdecido sem mexer no microfone (isso quem chama decide) - reaproveitado tanto
   *  pelo botao de ensurdecer/reativar quanto por "desmutar enquanto ensurdecido" (ver toggleMic). */
  function clearDeafened(room) {
    setDeafened(false);
    if (activeChannelRef.current && stompClientRef.current && stompConnectedRef.current) {
      publishVoiceDeafenState(stompClientRef.current, activeChannelRef.current.id, false);
    }
    restoreListenVolumes(room);
  }

  /**
   * Reage a um comando de moderacao (mover/expulsar/mutar/ensurdecer) endereçado a MIM - ver
   * VoiceModerationController no backend. O broadcast vai pra todo mundo olhando o canal
   * (mesmo padrao da presenca), cada cliente filtra e ignora o que nao e' pra ele.
   */
  function handleVoiceControlEvent(event) {
    if (!event || String(event.targetUserId) !== String(userRef.current?.id)) return;
    if (event.type === "MOVE") {
      joinChannel({ id: event.toChannelId, name: event.toChannelName, serverId: activeChannelRef.current?.serverId });
    } else if (event.type === "KICK") {
      leaveChannel();
    } else if (event.type === "FORCE_MUTE") {
      applyForceMute(event.muted);
    } else if (event.type === "FORCE_DEAFEN") {
      applyForceDeafen(event.deafened);
    }
  }

  /**
   * Um moderador me mutou/desmutou a força - reflete o estado de verdade na hora nos dois
   * sentidos (o desmutar tambem precisa realmente religar o microfone, senao a pessoa
   * continua aparecendo/ficando muda mesmo depois do moderador "liberar").
   *
   * Excecao: se eu estiver ENSURDECIDO agora (por mim mesmo OU a força, tanto faz) e o
   * moderador so' liberar o MUTE, isso NAO liga meu microfone sozinho - ensurdecido
   * continua implicando mudo ate' o ensurdecido em si acabar (ver toggleDeafen). Sem isso,
   * "desmutar" enquanto ensurdecido acabava tirando o ensurdecido de tabela (efeito colateral
   * pensado pra quando EU clico no meu proprio botao de mic, nao pra quando um moderador
   * libera um mute separado que eu apliquei em mim mesmo).
   */
  async function applyForceMute(muted) {
    forceMutedRef.current = muted;
    if (roomRef.current && !deafenedRef.current && micEnabledRef.current === muted) {
      await toggleMic();
    }
  }

  /**
   * Mesma ideia pro ensurdecido a força - libera/aplica de verdade nos dois sentidos.
   * Ensurdecer TAMBEM tranca o microfone (forceMutedRef junto) - enquanto isso estiver
   * ligado, a pessoa nao fala nem ouve, e nem consegue se desmutar sozinha so' porque o
   * "Ensurdecer" e o "Mutar" sao botoes diferentes (pedido explicito do usuario). Libera os
   * dois juntos tambem, ja que o mute nesse caso e' so' consequencia do ensurdecido.
   */
  async function applyForceDeafen(deafened) {
    forceDeafenedRef.current = deafened;
    forceMutedRef.current = deafened;
    if (roomRef.current && deafenedRef.current !== deafened) {
      await toggleDeafen();
    }
  }

  async function toggleMic() {
    const room = roomRef.current;
    if (!room) return;
    const next = !micEnabledRef.current;
    // Um moderador te mutou a força (ver applyForceMute), OU te ensurdeceu (que tranca o mic
    // junto, ver applyForceDeafen) - so' consegue se desmutar sozinho se voce TAMBEM tiver a
    // permissao correspondente (regra pedida explicitamente pelo usuario).
    if (next && forceDeafenedRef.current && !myPermissionsRef.current.has("DEAFEN_MEMBERS")) {
      showAlert(
        "Você foi ensurdecido por um moderador - isso também tranca seu microfone. Só quem também tem permissão de ensurdecer membros consegue reverter."
      );
      return;
    }
    if (next && forceMutedRef.current && !myPermissionsRef.current.has("MUTE_MEMBERS")) {
      showAlert("Você foi mutado por um moderador - só quem também tem permissão de mutar membros consegue reverter isso.");
      return;
    }
    // "Desmutar enquanto ensurdecido" nao faz sentido sozinho (voce continuaria sem ouvir
    // ninguem, so' emudo de novo na proxima fala) - igual ao Discord, clicar em desmutar
    // aqui tambem tira o ensurdecido.
    if (next && deafenedRef.current) clearDeafened(room);
    await room.localParticipant.setMicrophoneEnabled(next);
    setMicEnabled(next);
    if (next) playUnmuteSound();
    else playMuteSound();
    if (activeChannelRef.current && stompClientRef.current && stompConnectedRef.current) {
      publishVoiceMicState(stompClientRef.current, activeChannelRef.current.id, next);
    }
    if (next) {
      const micPub = room.localParticipant.getTrackPublication(Track.Source.Microphone);
      if (micPub?.track?.mediaStreamTrack) startMicMeter(micPub.track.mediaStreamTrack);
    } else {
      stopMicMeter();
    }
  }

  async function toggleDeafen() {
    const room = roomRef.current;
    if (!room) return;
    const next = !deafenedRef.current;
    // Um moderador te ensurdeceu a força (ver applyForceDeafen) - mesma regra do mic acima.
    if (!next && forceDeafenedRef.current && !myPermissionsRef.current.has("DEAFEN_MEMBERS")) {
      showAlert("Você foi ensurdecido por um moderador - só quem também tem permissão de ensurdecer membros consegue reverter isso.");
      return;
    }
    setDeafened(next);
    if (next) playMuteSound();
    else playUnmuteSound();
    if (activeChannelRef.current && stompClientRef.current && stompConnectedRef.current) {
      publishVoiceDeafenState(stompClientRef.current, activeChannelRef.current.id, next);
    }
    // refreshParticipants tambem le deafenedRef.current pro seu proprio card - atualiza agora
    // que o ref ja mudou, senao "Na call" so mostraria o icone novo na proxima mudanca de outra pessoa.
    if (roomRef.current) refreshParticipants(roomRef.current);

    // Ensurdecer zera o volume de TODO audio que voce ouve - voz e audio de transmissao de
    // tela - e, como no Discord, tambem desliga seu proprio microfone; ao reativar, volta
    // pro estado de mic anterior. Ver applyListenSilence (mesma logica usada quando voce
    // "desmuta enquanto ensurdecido" pelo botao de microfone, ver clearDeafened/toggleMic).
    applyListenSilence(room);

    if (next) {
      if (micEnabledRef.current) {
        await room.localParticipant.setMicrophoneEnabled(false);
        setMicEnabled(false);
        stopMicMeter();
        if (activeChannelRef.current && stompClientRef.current && stompConnectedRef.current) {
          publishVoiceMicState(stompClientRef.current, activeChannelRef.current.id, false);
        }
      }
    } else if (!forceMutedRef.current) {
      // Reativando o audio: o microfone SO' nao volta se ainda tiver uma trava de mute
      // separada ativa (um force-mute independente que ninguem liberou ainda) - senao volta
      // a falar normalmente sozinho, sem precisar clicar em desmutar de novo tambem (regra
      // pedida explicitamente: "quando ele se desensurdecer, volta tudo normal, tanto falar
      // quanto ouvir"). Antes disso dependia de lembrar se o mic estava ligado ANTES de
      // ensurdecer (micEnabledBeforeDeafenRef) - que ficava errado nesse cenario (ensurdecer
      // enquanto ja' mutado a força, depois so' o mute ser liberado): o "antes" registrado
      // era "desligado", entao nunca voltava. Agora e' so' "nenhuma trava ativa = liga".
      await room.localParticipant.setMicrophoneEnabled(true);
      setMicEnabled(true);
      const micPub = room.localParticipant.getTrackPublication(Track.Source.Microphone);
      if (micPub?.track?.mediaStreamTrack) startMicMeter(micPub.track.mediaStreamTrack);
      if (activeChannelRef.current && stompClientRef.current && stompConnectedRef.current) {
        publishVoiceMicState(stompClientRef.current, activeChannelRef.current.id, true);
      }
    }
  }

  /**
   * Liga/desliga a webcam - funciona igual no navegador e no app desktop (Electron), sem
   * nenhuma parte nativa: e' so' getUserMedia comum (video), publicado como Track.Source.Camera
   * via LiveKit. Aparece pros outros (e pra voce mesmo) como um tile em CameraTile - ver
   * VoiceChannel.jsx.
   */
  async function toggleCamera() {
    const room = roomRef.current;
    if (!room) return;
    const next = !cameraEnabledRef.current;
    try {
      const savedVideoInput = getSavedVideoInput();
      await room.localParticipant.setCameraEnabled(
        next,
        savedVideoInput ? { deviceId: savedVideoInput } : undefined
      );
      setCameraEnabled(next);
    } catch (err) {
      showAlert("Não foi possível acessar sua câmera (permissão negada ou nenhum dispositivo encontrado): " + err.message);
    }
  }

  /**
   * No NAVEGADOR normal usa o dialogo nativo (getDisplayMedia via LiveKit), com as mesmas
   * restricoes de sempre pra evitar eco (ver comentario mais abaixo). No app DESKTOP
   * (Electron) abre o seletor customizado (ScreenSharePicker) em vez de comecar direto - Tela
   * Inteira leva audio do sistema inteiro; Janela leva audio isolado so' daquele processo -
   * ver nota detalhada em startElectronScreenShare.
   */
  async function toggleScreenShare() {
    const room = roomRef.current;
    if (!room) return;

    if (!screenSharingRef.current) {
      if (isElectronDesktop) {
        setScreenPickerOpen(true); // o inicio de verdade acontece em startElectronScreenShare
        return;
      }
      screenSharingRef.current = true;
      // Captura tambem audio, igual ao "compartilhar com áudio" do Discord - mas so' o da
      // ABA sendo compartilhada, nunca o audio do SISTEMA inteiro:
      // - systemAudio: "exclude" tira a opcao "compartilhar audio do sistema" do dialogo do
      //   navegador. Sem isso, ao compartilhar uma Janela ou a Tela Inteira o Chrome/Edge so'
      //   oferece capturar TODO o audio que estiver tocando no computador (inclusive a
      //   propria chamada de voz saindo pela caixa de som) - e' isso que causava o eco: cada
      //   um ouvia a propria voz "voltando" pela captura do sistema. Compartilhando uma ABA
      //   do navegador o audio ja vem isolado (so' daquela aba); Janela/Tela Inteira, sem
      //   essa opcao, ficam sem audio nenhum - e' a troca certa, silencio e' melhor que eco.
      // - selfBrowserSurface: "exclude" nao deixa escolher compartilhar a propria aba do
      //   Concorde (geraria um espelho infinito, video dentro de video).
      // - echoCancellation/noiseSuppression: reduz ainda mais qualquer resquicio de eco.
      await room.localParticipant.setScreenShareEnabled(true, {
        video: {
          displaySurface: "browser", // sugere ABA como opcao padrao (audio mais limpo)
          // Cravado em 30fps (ver publishDefaults.screenShareEncoding acima, na criacao da
          // Room) - "max" impede o navegador de capturar mais que isso (pedido explicito do
          // usuario, pra transmissao nunca ficar pesada pra quem esta assistindo).
          frameRate: { ideal: 30, max: 30 },
        },
        audio: { echoCancellation: true, noiseSuppression: true },
        systemAudio: "exclude",
        selfBrowserSurface: "exclude",
      });
      setScreenSharing(true);
      playScreenShareStartSound();
      return;
    }

    // Parando de compartilhar.
    screenSharingRef.current = false;
    if (electronScreenTracksRef.current.video) {
      await stopElectronScreenShare();
    } else {
      await room.localParticipant.setScreenShareEnabled(false);
    }
    setScreenSharing(false);
    playScreenShareStopSound();
  }

  /** Fecha o seletor de tela/janela sem compartilhar nada (usuario clicou em Cancelar). */
  function closeScreenPicker() {
    setScreenPickerOpen(false);
  }

  /**
   * Chamado pelo ScreenSharePicker quando o usuario escolhe uma fonte - so' existe no app
   * desktop (Electron). Captura video sempre via chromeMediaSourceId; o audio muda de
   * jeito conforme o que foi escolhido, igual o Discord de verdade:
   * - Tela Inteira: audio do SISTEMA INTEIRO, via getUserMedia (nativo do Electron/Chromium).
   * - Janela: audio ISOLADO so' daquele processo (WASAPI Process Loopback por PID, via a
   *   biblioteca "process-audio-capture" - ver electron/main.cjs/windowAudioTrack.js).
   *   Testado e confirmado que isola de verdade (dois sons simultaneos, so' o do processo
   *   escolhido aparece).
   */
  async function startElectronScreenShare(source) {
    const room = roomRef.current;
    if (!room) return;
    setScreenPickerOpen(false);
    const wantSystemAudio = source.type === "screen";
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        // Audio "cru" do getUserMedia (chromeMediaSource: desktop) NUNCA e' usado mais - ele
        // pega o loopback do sistema INTEIRO sem excluir nada (nem o proprio Concorde, o que
        // causava eco pra quem esta' assistindo). O audio de Tela Inteira agora vem separado
        // (ver startSystemAudioExcludingSelfTrack abaixo), igual o de Janela ja' vinha (ver
        // startWindowAudioTrack) - so' o VIDEO continua saindo direto daqui.
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: "desktop",
            chromeMediaSourceId: source.id,
            maxWidth: 1920,
            maxHeight: 1080,
            // Bate com o TETO de encoding (30fps cravado, ver publishDefaults.screenShareEncoding
            // na criacao da Room) - pedido explicito do usuario, pra transmissao nunca ficar
            // pesada pra quem esta assistindo.
            maxFrameRate: 30,
          },
        },
      });
      const videoTrack = stream.getVideoTracks()[0];
      let audioTrack = null;

      if (wantSystemAudio) {
        // Tela Inteira leva o audio do SISTEMA INTEIRO (jogo, musica, qualquer coisa tocando),
        // MENOS o audio do proprio Concorde - pedido explicito do usuario: continuar ouvindo a
        // call normal enquanto compartilha, sem ficar mudo. Ver systemAudioTrack.js/
        // main.cjs (concorde:start-system-audio-excluding-self) pro motivo de nao dar pra
        // simplesmente "excluir" o Concorde de uma captura so' (a lib so' captura POR
        // PROCESSO/inclusiva) - a solucao e' capturar todo mundo MENOS o Concorde, um processo
        // de cada vez, e juntar tudo numa faixa so' aqui.
        audioTrack = await startSystemAudioExcludingSelfTrack();
        if (audioTrack?._concordeWarning) {
          // Comecou, mas nao conseguiu capturar NENHUM processo tocando som agora (ver
          // main.cjs) - avisa direto em vez de deixar a transmissao sair muda sem explicacao.
          showAlert(audioTrack._concordeWarning);
        } else if (audioTrack) {
          showAlert(
            "Compartilhando o áudio do sistema (exceto o do Concorde) - programas que você abrir DEPOIS de já estar compartilhando podem levar alguns segundos pra aparecer no áudio."
          );
        }
      } else {
        // Janela especifica: pega o audio isolado daquele processo (ver comentario acima).
        // source.id vem do desktopCapturer no formato "window:<hwnd>:0".
        const hwnd = Number(source.id.split(":")[1]);
        if (Number.isFinite(hwnd) && hwnd > 0) {
          audioTrack = await startWindowAudioTrack(hwnd);
        }
      }

      electronScreenTracksRef.current = { video: videoTrack, audio: audioTrack };
      // Nao existe botao nativo de "parar de compartilhar" aqui (dialogo e' nosso, nao do
      // navegador) - se o usuario fechar a janela compartilhada ou parar a captura por
      // fora, o track termina sozinho (onended) e precisamos refletir isso na UI.
      videoTrack.onended = () => {
        if (screenSharingRef.current) toggleScreenShare();
      };
      await room.localParticipant.publishTrack(videoTrack, { source: Track.Source.ScreenShare, name: "screen" });
      if (audioTrack) {
        await room.localParticipant.publishTrack(audioTrack, {
          source: Track.Source.ScreenShareAudio,
          name: "screen_audio",
        });
      }
      screenSharingRef.current = true;
      setScreenSharing(true);
      playScreenShareStartSound();
    } catch (err) {
      console.warn("Não foi possível iniciar o compartilhamento de tela:", err);
      showAlert("Não foi possível compartilhar essa tela/janela: " + err.message);
    }
  }

  async function stopElectronScreenShare() {
    const room = roomRef.current;
    const { video, audio } = electronScreenTracksRef.current;
    if (video) {
      video.onended = null;
      await room?.localParticipant.unpublishTrack(video, true);
    }
    if (audio) {
      await room?.localParticipant.unpublishTrack(audio, true);
      // Existe tanto pra audio de Janela (startWindowAudioTrack) quanto de Tela Inteira
      // (startSystemAudioExcludingSelfTrack) - os dois pendicam a mesma limpeza (desliga a(s)
      // captura(s) nativa(s) + o AudioContext) no proprio track (ver _concordeCleanup em
      // windowAudioTrack.js/systemAudioTrack.js).
      await audio._concordeCleanup?.();
    }
    electronScreenTracksRef.current = { video: null, audio: null };
  }

  /**
   * Acoes de moderacao (mover/expulsar/mutar/ensurdecer OUTRO membro) - ver
   * VoiceModerationController no backend, que confere a permissao de verdade (essas funcoes
   * aqui so' publicam o pedido, nao fazem nada sozinhas se a permissao faltar). Funcionam
   * mesmo se EU nao estiver em nenhuma call - channelId e' o canal onde o ALVO esta agora
   * (ver ChannelSidebar.jsx), nao precisa ser o meu activeChannel.
   */
  function moveParticipant(channelId, targetUserId, toChannelId) {
    if (stompClientRef.current && stompConnectedRef.current) {
      publishVoiceMove(stompClientRef.current, channelId, targetUserId, toChannelId);
    }
  }
  function kickParticipant(channelId, targetUserId) {
    if (stompClientRef.current && stompConnectedRef.current) {
      publishVoiceKick(stompClientRef.current, channelId, targetUserId);
    }
  }
  function forceMuteParticipant(channelId, targetUserId, muted) {
    if (stompClientRef.current && stompConnectedRef.current) {
      publishVoiceForceMute(stompClientRef.current, channelId, targetUserId, muted);
    }
  }
  function forceDeafenParticipant(channelId, targetUserId, deafened) {
    if (stompClientRef.current && stompConnectedRef.current) {
      publishVoiceForceDeafen(stompClientRef.current, channelId, targetUserId, deafened);
    }
  }

  return (
    <VoiceCallContext.Provider
      value={{
        activeChannel,
        connected,
        micEnabled,
        deafened,
        screenSharing,
        cameraEnabled,
        cameraTracks,
        participants,
        speakingIds,
        micLevel,
        pingMs,
        screenShares,
        toggleWatchScreenShare,
        screenShareWatchers,
        participantVolumes,
        streamVolumes,
        setParticipantVolume,
        setStreamVolume,
        micGain,
        setMicGainPercent,
        masterVolume,
        setMasterVolumePercent,
        joinChannel,
        leaveChannel,
        toggleMic,
        toggleDeafen,
        toggleScreenShare,
        toggleCamera,
        myPermissions,
        moveParticipant,
        kickParticipant,
        forceMuteParticipant,
        forceDeafenParticipant,
      }}
    >
      {children}
      {screenPickerOpen && <ScreenSharePicker onSelect={startElectronScreenShare} onClose={closeScreenPicker} />}
    </VoiceCallContext.Provider>
  );
}

export function useVoiceCall() {
  return useContext(VoiceCallContext);
}
