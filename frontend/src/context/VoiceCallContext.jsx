import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Room, RoomEvent, Track } from "livekit-client";
import api from "../api/client";
import { useAuth } from "./AuthContext.jsx";
import { useMicLevel } from "../utils/useMicLevel";
import { getNoiseSuppressionEnabled, getSavedAudioInput, getSavedAudioOutput } from "../utils/audioSettings";
import {
  playJoinSound,
  playLeaveSound,
  playMuteSound,
  playScreenShareStartSound,
  playScreenShareStopSound,
  playUnmuteSound,
} from "../utils/soundEffects";
import { getDeafenShortcut, getMuteShortcut, shortcutFromEvent } from "../utils/keyboardShortcuts";
import {
  publishVoiceDeafenState,
  publishVoiceJoin,
  publishVoiceLeave,
  publishVoiceMicState,
  subscribeToVoicePresence,
} from "../ws/chatSocket";
import ScreenSharePicker from "../components/ScreenSharePicker.jsx";

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
  const [activeChannel, setActiveChannelState] = useState(null); // { id, name, serverId }
  const [connected, setConnected] = useState(false);
  const [micEnabled, setMicEnabledState] = useState(true);
  const [deafened, setDeafenedState] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [participants, setParticipants] = useState([]); // dentro da call, com quem realmente entrou
  const [speakingIds, setSpeakingIds] = useState(new Set());
  const [screenShares, setScreenShares] = useState([]); // [{ sid, name, isLocal, watching }]
  const [selectedScreenShareSid, setSelectedScreenShareSid] = useState(null);
  const [participantVolumes, setParticipantVolumesState] = useState({}); // identity -> 0..200 (voz)
  const [streamVolumes, setStreamVolumesState] = useState({}); // identity -> 0..200 (audio da transmissao de tela dessa pessoa)
  // So' usado no app desktop (Electron) - true enquanto o seletor customizado de tela/janela
  // esta aberto, esperando o usuario escolher o que compartilhar (ver ScreenSharePicker.jsx).
  const [screenPickerOpen, setScreenPickerOpen] = useState(false);
  const { level: micLevel, start: startMicMeter, stop: stopMicMeter } = useMicLevel();

  const roomRef = useRef(null);
  const videoContainerElRef = useRef(null); // registrado pelo VoiceChannel quando esta na tela
  // trackSid -> { track (null se nao estiver "assistindo"), pub (RemoteTrackPublication, pra
  // poder inscrever/desinscrever - null pra sua propria tela), participantIdentity,
  // participantName, isLocal }
  const videoTracksRef = useRef(new Map());
  const selectedSidRef = useRef(null);
  const micAudioTracksRef = useRef(new Map()); // identity -> RemoteAudioTrack (voz, pro controle de volume)
  const screenAudioTracksRef = useRef(new Map()); // identity -> RemoteAudioTrack (audio da transmissao de tela dessa pessoa)
  const participantVolumesRef = useRef(new Map()); // identity -> 0..200, fonte da verdade sincrona
  const streamVolumesRef = useRef(new Map());
  const micEnabledBeforeDeafenRef = useRef(true);
  // So' preenchido no app desktop (Electron), quando o compartilhamento foi iniciado pelo
  // ScreenSharePicker (video/audio capturados "na mao" via chromeMediaSourceId, nao pelo
  // setScreenShareEnabled padrao do LiveKit) - precisa pra saber COMO parar depois.
  const electronScreenTracksRef = useRef({ video: null, audio: null });
  // true so' durante Tela Inteira COM audio do sistema ligado (Electron) - nesse modo, tudo
  // que sai pela caixa de som entra na captura, entao a voz de quem esta na call tocando ali
  // "vaza" de volta pro compartilhamento (cada um se ouve com delay). Enquanto isso estiver
  // true, silenciamos localmente a voz/audio dos outros - ver muteRemoteAudioForCapture.
  const systemAudioSharingRef = useRef(false);
  const joiningRef = useRef(false); // evita duas conexoes simultaneas (ex: React StrictMode chamando o efeito 2x)
  // Ensurdecido e' diferente de so mutar: quem ensurdece nao esta OUVINDO ninguem, nao so
  // calado. Isso nao vem do LiveKit (ele so sabe de audio publicado) - propagamos via
  // presenca (mesmo canal que alimenta "Conectados agora"), pra mostrar um icone diferente
  // de quem so mutou o microfone.
  const presenceDeafenedRef = useRef(new Map()); // userId (string) -> deafened
  const presenceSubRef = useRef(null);

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
  function setMicEnabled(value) {
    micEnabledRef.current = value;
    setMicEnabledState(value);
  }
  function setDeafened(value) {
    deafenedRef.current = value;
    setDeafenedState(value);
  }

  useEffect(() => {
    return () => {
      roomRef.current?.disconnect();
      stopMicMeter();
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

  // Atalhos globais de mutar/ensurdecer (configuraveis em Configuracoes) - lidos direto do
  // localStorage a cada tecla, entao uma mudanca em Configuracoes vale na hora, sem re-render.
  useEffect(() => {
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
        // quando o usuario escolhe parar de assistir (ver toggleWatchScreenShare) sem por
        // isso sumir da lista de abas - continua la, so' sem baixar video ate' voltar a assistir.
        watching: !!v.track,
      }))
    );
  }

  /** Renderiza dentro do container atual (se houver) so a tela SELECIONADA - nao todas de uma vez. */
  function renderSelectedVideo(sid) {
    const container = videoContainerElRef.current;
    if (!container) return;
    container.innerHTML = "";
    const entry = sid ? videoTracksRef.current.get(sid) : null;
    if (entry?.track) {
      const el = entry.track.attach();
      el.dataset.participant = entry.participantIdentity;
      container.appendChild(el);
    }
  }

  const selectScreenShare = useCallback((sid) => {
    selectedSidRef.current = sid;
    setSelectedScreenShareSid(sid);
    renderSelectedVideo(sid);
  }, []);

  /** Cria ou atualiza a entrada de uma transmissao de tela (mescla com o que ja existia). */
  function upsertScreenShare(sid, patch) {
    const merged = { ...(videoTracksRef.current.get(sid) || {}), ...patch };
    videoTracksRef.current.set(sid, merged);
    syncScreenShares();
    // Se ninguem estava selecionado ainda, mostra essa automaticamente assim que o video
    // chegar (ex: primeira pessoa a compartilhar, ou voce mesmo iniciando o seu).
    if (!selectedSidRef.current && merged.track) {
      selectScreenShare(sid);
    } else if (selectedSidRef.current === sid) {
      renderSelectedVideo(sid);
    }
  }

  /** A transmissao acabou de verdade (a pessoa parou de compartilhar) - some da lista. */
  function removeVideoTrack(sid) {
    videoTracksRef.current.delete(sid);
    syncScreenShares();
    if (selectedSidRef.current === sid) {
      const next = [...videoTracksRef.current.keys()][0] || null;
      selectScreenShare(next);
    }
  }

  /**
   * Deixa de assistir (ou volta a assistir) uma transmissao sem sair da call de voz - so'
   * cancela a inscricao do video no LiveKit (para de baixar aquele fluxo), a aba continua
   * la pra retomar quando quiser. Nao se aplica a sua propria tela (isLocal / sem pub).
   */
  const toggleWatchScreenShare = useCallback(async (sid) => {
    const entry = videoTracksRef.current.get(sid);
    if (!entry || entry.isLocal || !entry.pub) return;
    try {
      await entry.pub.setSubscribed(!entry.track);
    } catch (err) {
      console.warn("Não foi possível mudar a inscrição da transmissão:", err);
    }
    // O proprio evento TrackSubscribed/TrackUnsubscribed do LiveKit vai atualizar entry.track
    // e chamar syncScreenShares/renderSelectedVideo quando a mudanca for confirmada.
  }, []);

  function setParticipantVolume(identity, percent) {
    const clamped = Math.max(0, Math.min(200, Math.round(percent)));
    participantVolumesRef.current.set(identity, clamped);
    setParticipantVolumesState(Object.fromEntries(participantVolumesRef.current));
    // Ensurdecido/compartilhamento com audio do sistema tem prioridade - so' aplica o volume
    // de verdade no track se voce estiver ouvindo alguem no momento; a preferencia fica salva
    // e volta a valer depois (ver toggleMic/clearDeafened/muteRemoteAudioForCapture), senao
    // mexer no slider "furaria" o silencio sem querer.
    if (!deafenedRef.current && !systemAudioSharingRef.current) {
      micAudioTracksRef.current.get(identity)?.setVolume(clamped / 100);
    }
  }

  function setStreamVolume(identity, percent) {
    const clamped = Math.max(0, Math.min(200, Math.round(percent)));
    streamVolumesRef.current.set(identity, clamped);
    setStreamVolumesState(Object.fromEntries(streamVolumesRef.current));
    if (!deafenedRef.current && !systemAudioSharingRef.current) {
      screenAudioTracksRef.current.get(identity)?.setVolume(clamped / 100);
    }
  }

  /**
   * So' existe no app desktop (Electron): enquanto Tela Inteira estiver compartilhando com
   * audio do sistema, a captura pega TUDO que sai pela caixa de som - inclusive a voz de quem
   * esta na call tocando ali. Sem isso, cada pessoa ouviria a propria voz voltando (com
   * delay) pelo seu compartilhamento. Silencia localmente a voz/audio dos outros enquanto
   * dura o compartilhamento (nao mexe no SEU microfone - voce continua podendo falar
   * normalmente, so' nao ouve os outros ate' parar de compartilhar).
   */
  function muteRemoteAudioForCapture(mute) {
    systemAudioSharingRef.current = mute;
    if (mute) {
      micAudioTracksRef.current.forEach((track) => track.setVolume(0));
      screenAudioTracksRef.current.forEach((track) => track.setVolume(0));
    } else if (!deafenedRef.current) {
      micAudioTracksRef.current.forEach((track, identity) => {
        track.setVolume((participantVolumesRef.current.get(identity) ?? 100) / 100);
      });
      screenAudioTracksRef.current.forEach((track, identity) => {
        track.setVolume((streamVolumesRef.current.get(identity) ?? 100) / 100);
      });
    }
  }

  /** Desconecta e limpa tudo - usado tanto no "Sair da call" quanto ao trocar de canal. */
  async function disconnectInternal() {
    const channelLeaving = activeChannelRef.current;
    if (channelLeaving && stompClientRef.current && stompConnectedRef.current) {
      publishVoiceLeave(stompClientRef.current, channelLeaving.id);
    }
    presenceSubRef.current?.unsubscribe();
    presenceSubRef.current = null;
    presenceDeafenedRef.current = new Map();
    clearActiveChannel();
    await roomRef.current?.disconnect();
    roomRef.current = null;
    videoTracksRef.current.clear();
    selectedSidRef.current = null;
    micAudioTracksRef.current.clear();
    screenAudioTracksRef.current.clear();
    participantVolumesRef.current = new Map();
    streamVolumesRef.current = new Map();
    // Se voce estava compartilhando via seletor customizado (Electron), o track foi
    // capturado "na mao" (getUserMedia) - precisa parar explicitamente, o room.disconnect()
    // acima nao necessariamente libera a captura de tela/audio do sistema sozinho.
    electronScreenTracksRef.current.video?.stop();
    electronScreenTracksRef.current.audio?.stop();
    electronScreenTracksRef.current = { video: null, audio: null };
    systemAudioSharingRef.current = false;
    stopMicMeter();
    setConnected(false);
    setActiveChannel(null);
    setParticipants([]);
    setSpeakingIds(new Set());
    setScreenSharing(false);
    screenSharingRef.current = false;
    setDeafened(false);
    setScreenShares([]);
    setSelectedScreenShareSid(null);
    setParticipantVolumesState({});
    setStreamVolumesState({});
    if (videoContainerElRef.current) videoContainerElRef.current.innerHTML = "";
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
        // (ate' 200% aqui - ver setParticipantVolume/setStreamVolume).
        webAudioMix: true,
        audioCaptureDefaults: {
          ...(savedInput ? { deviceId: savedInput } : {}),
          noiseSuppression: getNoiseSuppressionEnabled(),
        },
      });

      newRoom.on(RoomEvent.TrackSubscribed, (track, pub, participant) => {
        if (track.kind === Track.Kind.Video && pub.source === Track.Source.ScreenShare) {
          upsertScreenShare(pub.trackSid, {
            track,
            pub,
            participantIdentity: participant.identity,
            participantName: participant.name || participant.identity,
            isLocal: false,
          });
        } else if (track.kind === Track.Kind.Audio) {
          // Voz (microfone) e audio da transmissao de tela tem controle de volume separado
          // um do outro - guarda a referencia do track de cada um pra poder ajustar depois.
          // Se voce estiver ensurdecido OU compartilhando Tela Inteira com audio do sistema
          // (ver muteRemoteAudioForCapture), entra silenciado (volume 0) independente da
          // preferencia salva - ela so' volta a valer quando voce reativar o audio.
          const silenced = deafenedRef.current || systemAudioSharingRef.current;
          if (pub.source === Track.Source.Microphone) {
            micAudioTracksRef.current.set(participant.identity, track);
            track.setVolume(silenced ? 0 : (participantVolumesRef.current.get(participant.identity) ?? 100) / 100);
          } else if (pub.source === Track.Source.ScreenShareAudio) {
            screenAudioTracksRef.current.set(participant.identity, track);
            track.setVolume(silenced ? 0 : (streamVolumesRef.current.get(participant.identity) ?? 100) / 100);
          }
          // audio toca sozinho, nao precisa aparecer na tela - o "el.muted" aqui e' so' um
          // reforco pro caso raro de webAudioMix nao estar disponivel (cai pro elemento nativo);
          // o controle de verdade (inclusive do ensurdecido) e' via track.setVolume() acima,
          // porque com webAudioMix ligado (ver joinChannel) o audio toca por fora do elemento
          // <audio>, direto pelo Web Audio API - mutar o elemento sozinho nao silencia nada.
          const el = track.attach();
          if (deafenedRef.current) el.muted = true;
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
            if (selectedSidRef.current === pub.trackSid) renderSelectedVideo(pub.trackSid);
          }
        }
        if (pub.source === Track.Source.Microphone) {
          micAudioTracksRef.current.delete(participant.identity);
          refreshParticipants(newRoom);
        }
        if (pub.source === Track.Source.ScreenShareAudio) screenAudioTracksRef.current.delete(participant.identity);
        track.detach().forEach((el) => el.remove());
      });
      // A pessoa parou de compartilhar a tela de vez (nao so' alguem deixou de assistir).
      newRoom.on(RoomEvent.TrackUnpublished, (pub) => {
        if (pub.source === Track.Source.ScreenShare) removeVideoTrack(pub.trackSid);
      });
      // Sua propria tela compartilhada tambem entra na lista, pra voce poder conferir
      // o que esta sendo transmitido (assim como as dos outros).
      newRoom.on(RoomEvent.LocalTrackPublished, (pub, participant) => {
        if (pub.source === Track.Source.ScreenShare && pub.track) {
          upsertScreenShare(pub.trackSid, {
            track: pub.track,
            pub: null, // sem pub remoto - nao faz sentido "parar de assistir" sua propria tela
            participantIdentity: participant.identity,
            participantName: `${participant.name || participant.identity} (você)`,
            isLocal: true,
          });
        }
      });
      newRoom.on(RoomEvent.LocalTrackUnpublished, (pub) => {
        if (pub.source === Track.Source.ScreenShare) removeVideoTrack(pub.trackSid);
      });
      // Toca so quando OUTRA pessoa entra/sai enquanto voce ja esta na call - o efeito de
      // voce mesmo entrando/saindo e' tocado explicitamente logo abaixo, uma vez so.
      newRoom.on(RoomEvent.ParticipantConnected, () => {
        refreshParticipants(newRoom);
        playJoinSound();
      });
      newRoom.on(RoomEvent.ParticipantDisconnected, () => {
        refreshParticipants(newRoom);
        playLeaveSound();
      });
      // O LiveKit calcula quem esta falando com base no nivel de audio - so quem esta
      // dentro da call (conectado ao LiveKit) recebe isso, ninguem de fora ve.
      newRoom.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        setSpeakingIds(new Set(speakers.map((p) => p.identity)));
      });
      // Mostra o icone de "mudo" pra QUALQUER participante (nao so voce mesmo).
      newRoom.on(RoomEvent.TrackMuted, () => refreshParticipants(newRoom));
      newRoom.on(RoomEvent.TrackUnmuted, () => refreshParticipants(newRoom));

      try {
        await newRoom.connect(data.wsUrl, data.token);
      } catch (err) {
        clearActiveChannel();
        alert("Não foi possível conectar na call: " + err.message);
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
      setDeafened(false);
      if (stompClientRef.current && stompConnectedRef.current) {
        publishVoiceJoin(stompClientRef.current, channel.id);
        presenceSubRef.current = subscribeToVoicePresence(stompClientRef.current, channel.id, (list) => {
          presenceDeafenedRef.current = new Map(list.map((p) => [String(p.userId), p.deafened]));
          if (roomRef.current) refreshParticipants(roomRef.current);
        });
      }
      playJoinSound(); // voce tambem ouve quando VOCE entra numa call, nao so quando os outros entram

      try {
        await newRoom.localParticipant.setMicrophoneEnabled(true);
        setMicEnabled(true);
        const micPub = newRoom.localParticipant.getTrackPublication(Track.Source.Microphone);
        if (micPub?.track?.mediaStreamTrack) startMicMeter(micPub.track.mediaStreamTrack);
      } catch (err) {
        setMicEnabled(false);
        alert(
          "Conectado, mas não consegui acessar seu microfone (permissão negada ou nenhum dispositivo encontrado): " +
            err.message
        );
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

  /** Tira o ensurdecido sem mexer no microfone (isso quem chama decide) - reaproveitado tanto
   *  pelo botao de ensurdecer/reativar quanto por "desmutar enquanto ensurdecido" (ver toggleMic). */
  function clearDeafened(room) {
    setDeafened(false);
    if (activeChannelRef.current && stompClientRef.current && stompConnectedRef.current) {
      publishVoiceDeafenState(stompClientRef.current, activeChannelRef.current.id, false);
    }
    room.remoteParticipants.forEach((participant) => {
      participant.audioTrackPublications.forEach((pub) => {
        pub.track?.attachedElements.forEach((el) => (el.muted = false));
      });
    });
  }

  async function toggleMic() {
    const room = roomRef.current;
    if (!room) return;
    const next = !micEnabledRef.current;
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
    // pro estado de mic anterior. Importante: precisa ser via track.setVolume(), nao
    // "el.muted" - com webAudioMix ligado (ver joinChannel) o LiveKit toca o audio por fora
    // do elemento <audio>, direto pelo Web Audio API, entao mutar o elemento nao silencia
    // nada de verdade (era esse o bug: dava pra continuar ouvindo todo mundo ensurdecido).
    if (next) {
      micAudioTracksRef.current.forEach((track) => track.setVolume(0));
      screenAudioTracksRef.current.forEach((track) => track.setVolume(0));
    } else {
      micAudioTracksRef.current.forEach((track, identity) => {
        track.setVolume((participantVolumesRef.current.get(identity) ?? 100) / 100);
      });
      screenAudioTracksRef.current.forEach((track, identity) => {
        track.setVolume((streamVolumesRef.current.get(identity) ?? 100) / 100);
      });
    }
    // Reforco pro caso raro de webAudioMix nao estar disponivel (cai pro elemento nativo) -
    // o controle de verdade e' o setVolume() acima.
    room.remoteParticipants.forEach((participant) => {
      participant.audioTrackPublications.forEach((pub) => {
        pub.track?.attachedElements.forEach((el) => (el.muted = next));
      });
    });

    if (next) {
      micEnabledBeforeDeafenRef.current = micEnabledRef.current;
      if (micEnabledRef.current) {
        await room.localParticipant.setMicrophoneEnabled(false);
        setMicEnabled(false);
        stopMicMeter();
        if (activeChannelRef.current && stompClientRef.current && stompConnectedRef.current) {
          publishVoiceMicState(stompClientRef.current, activeChannelRef.current.id, false);
        }
      }
    } else if (micEnabledBeforeDeafenRef.current) {
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
   * No NAVEGADOR normal usa o dialogo nativo (getDisplayMedia via LiveKit), com as mesmas
   * restricoes de sempre pra evitar eco (ver comentario mais abaixo). No app DESKTOP
   * (Electron) abre o seletor customizado (ScreenSharePicker) em vez de comecar direto - os
   * dois modos (Tela Inteira e Janela) levam o audio do sistema inteiro (ver nota detalhada
   * em startElectronScreenShare sobre por que nao da' pra isolar so' o audio de uma janela
   * hoje) e, pra ninguem se ouvir de volta, a call fica localmente muda enquanto dura o
   * compartilhamento - ver muteRemoteAudioForCapture.
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
        video: { displaySurface: "browser" }, // sugere ABA como opcao padrao (audio mais limpo)
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
   * desktop (Electron). Captura video + audio via chromeMediaSourceId e publica os tracks
   * manualmente no LiveKit (em vez de setScreenShareEnabled, que so' sabe chamar
   * getDisplayMedia).
   *
   * NOTA sobre o audio na Janela: essa API legada (chromeMediaSource "desktop" via
   * desktopCapturer) nunca teve filtro de audio por janela de verdade - o id so' controla o
   * VIDEO, o audio sempre e' "o que estiver tocando no PC inteiro", nao so' daquela janela
   * (tentamos isolar por modulo nativo WASAPI e por essa mesma API - nenhum dos dois
   * conseguiu de verdade). Ou seja: tanto Tela Inteira quanto Janela levam o audio do SISTEMA
   * INTEIRO igual. Pra evitar cada um se ouvir de volta (a voz de quem esta na call tocando
   * na caixa de som entraria na propria captura), ver muteRemoteAudioForCapture logo abaixo -
   * silencia localmente a call inteira enquanto qualquer um dos dois modos estiver ativo.
   */
  async function startElectronScreenShare(source) {
    const room = roomRef.current;
    if (!room) return;
    setScreenPickerOpen(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { mandatory: { chromeMediaSource: "desktop", chromeMediaSourceId: source.id } },
        video: {
          mandatory: {
            chromeMediaSource: "desktop",
            chromeMediaSourceId: source.id,
            maxWidth: 1920,
            maxHeight: 1080,
            maxFrameRate: 30,
          },
        },
      });
      const videoTrack = stream.getVideoTracks()[0];
      const audioTrack = stream.getAudioTracks()[0] || null;

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
      // So' quando tem audio do sistema mesmo (Tela Inteira) - Janela nao tem esse risco,
      // ja que nao leva audio nenhum (ver comentario no topo da funcao).
      if (audioTrack) muteRemoteAudioForCapture(true);
      playScreenShareStartSound();
    } catch (err) {
      console.warn("Não foi possível iniciar o compartilhamento de tela:", err);
      alert("Não foi possível compartilhar essa tela/janela: " + err.message);
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
    }
    if (systemAudioSharingRef.current) muteRemoteAudioForCapture(false);
    electronScreenTracksRef.current = { video: null, audio: null };
  }

  /** Chamado pelo VoiceChannel quando monta/desmonta, para anexar/soltar o video no container certo. */
  const registerVideoContainer = useCallback((el) => {
    videoContainerElRef.current = el;
    if (el) renderSelectedVideo(selectedSidRef.current);
  }, []);

  return (
    <VoiceCallContext.Provider
      value={{
        activeChannel,
        connected,
        micEnabled,
        deafened,
        screenSharing,
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
        joinChannel,
        leaveChannel,
        toggleMic,
        toggleDeafen,
        toggleScreenShare,
        registerVideoContainer,
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
