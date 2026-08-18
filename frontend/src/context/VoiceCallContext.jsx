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

const VoiceCallContext = createContext(null);

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
    micAudioTracksRef.current.get(identity)?.setVolume(clamped / 100);
  }

  function setStreamVolume(identity, percent) {
    const clamped = Math.max(0, Math.min(200, Math.round(percent)));
    streamVolumesRef.current.set(identity, clamped);
    setStreamVolumesState(Object.fromEntries(streamVolumesRef.current));
    screenAudioTracksRef.current.get(identity)?.setVolume(clamped / 100);
  }

  /** Pega o MediaStreamTrack do seu proprio microfone ja publicado na call, pra "Testar
   *  microfone" tocar de volta o que esta sendo captado sem precisar abrir outro getUserMedia
   *  (diferente do teste de Configuracoes, que roda fora de uma call). */
  function getLocalMicTrack() {
    const pub = roomRef.current?.localParticipant?.getTrackPublication(Track.Source.Microphone);
    return pub?.track?.mediaStreamTrack || null;
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
          if (pub.source === Track.Source.Microphone) {
            micAudioTracksRef.current.set(participant.identity, track);
            track.setVolume((participantVolumesRef.current.get(participant.identity) ?? 100) / 100);
          } else if (pub.source === Track.Source.ScreenShareAudio) {
            screenAudioTracksRef.current.set(participant.identity, track);
            track.setVolume((streamVolumesRef.current.get(participant.identity) ?? 100) / 100);
          }
          const el = track.attach(); // audio toca sozinho, nao precisa aparecer na tela
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

  async function toggleMic() {
    const room = roomRef.current;
    if (!room) return;
    const next = !micEnabledRef.current;
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

    // Ensurdecer muta o audio de todo mundo que voce ouve (e, como no Discord, tambem
    // desliga seu proprio microfone; ao reativar, volta pro estado de mic anterior).
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

  async function toggleScreenShare() {
    const room = roomRef.current;
    if (!room) return;
    const next = !screenSharingRef.current;
    screenSharingRef.current = next;
    // { audio: true } captura tambem o audio do sistema/da aba, igual ao "compartilhar com áudio" do Discord
    await room.localParticipant.setScreenShareEnabled(next, { audio: true });
    setScreenSharing(next);
    if (next) playScreenShareStartSound();
    else playScreenShareStopSound();
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
        getLocalMicTrack,
        joinChannel,
        leaveChannel,
        toggleMic,
        toggleDeafen,
        toggleScreenShare,
        registerVideoContainer,
      }}
    >
      {children}
    </VoiceCallContext.Provider>
  );
}

export function useVoiceCall() {
  return useContext(VoiceCallContext);
}
