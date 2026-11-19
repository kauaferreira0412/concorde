import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AudioPresets, DisconnectReason, Room, RoomEvent, Track } from "livekit-client";
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
  publishVoiceScreenShare,
  publishVoiceSpeaking,
  subscribeToVoiceSpeaking,
  publishVoiceWatching,
  subscribeToVoiceControl,
  subscribeToVoicePresence,
} from "../ws/chatSocket";
import ScreenSharePicker from "../components/ScreenSharePicker.jsx";
import { startWindowAudioTrack } from "../utils/windowAudioTrack";
import { getAutoListenAudioShare } from "../utils/audioShareListen";
import { startSystemAudioExcludingSelfTrack } from "../utils/systemAudioTrack";

const VoiceCallContext = createContext(null);

const isElectronDesktop = typeof window !== "undefined" && !!window.concordeDesktop;
// Navegador de celular: o navegador congela o Web Audio quando a aba vai pro fundo (minimizar,
// trocar de app, PiP). Aí usamos <audio> comum pra tocar a call e o filtro de ruído nativo do
// aparelho no microfone - os dois continuam rodando em segundo plano.
const isMobileBrowser =
  typeof window !== "undefined" &&
  !isElectronDesktop &&
  (/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || "") ||
    (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent || "")));

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

export function VoiceCallProvider({ stompClient, stompConnected, children }) {
  const { user } = useAuth();
  const { showAlert } = useAlert();
  const [activeChannel, setActiveChannelState] = useState(null);
  const [connected, setConnected] = useState(false);
  const [micEnabled, setMicEnabledState] = useState(true);
  const [deafened, setDeafenedState] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  // Transmissão só de áudio (som do PC/janela/aba, sem vídeo): toca sozinha pra todo mundo da call.
  const [audioSharing, setAudioSharingState] = useState(false);
  const audioSharingRef = useRef(false);
  const audioShareTrackRef = useRef(null);
  const [audioPickerOpen, setAudioPickerOpen] = useState(false);
  const [audioShares, setAudioShares] = useState([]);
  // de quem eu estou ouvindo a transmissão de áudio (com o automático desligado, começa vazio)
  const listeningAudioRef = useRef(new Set());
  const declinedAudioRef = useRef(new Set());
  // Anuncia na presença de voz quem está transmitindo (tag "AO VIVO" na lista lateral de qualquer canal).
  useEffect(() => {
    const channelId = activeChannel?.id;
    if (!channelId || !stompClientRef.current || !stompConnectedRef.current) return;
    try {
      publishVoiceScreenShare(stompClientRef.current, channelId, screenSharing || audioSharing);
    } catch {
      // stomp caiu no meio: o reanúncio do join manda o estado de novo
    }
  }, [screenSharing, audioSharing, activeChannel?.id]);
  const [cameraEnabled, setCameraEnabledState] = useState(false);
  const [participants, setParticipants] = useState([]);
  const [speakingIds, setSpeakingIds] = useState(new Set());
  const [screenShares, setScreenShares] = useState([]);
  const [cameraTracks, setCameraTracks] = useState([]);
  const [participantVolumes, setParticipantVolumesState] = useState({});
  const [streamVolumes, setStreamVolumesState] = useState({});
  const [micGain, setMicGainState] = useState(getMicGain());
  const [masterVolume, setMasterVolumeState] = useState(getMasterVolume());
  const [screenPickerOpen, setScreenPickerOpen] = useState(false);
  const [myPermissions, setMyPermissions] = useState([]);
  const [pingMs, setPingMs] = useState(null);
  const { level: micLevel, start: startMicMeter, stop: stopMicMeter } = useMicLevel();

  // "Falando" do próprio usuário vem do medidor local do mic (instantâneo e sensível), não do LiveKit,
  // que só marca acima de um limiar alto e com atraso. Liga na hora; desliga após um respiro.
  const SPEAK_ON = 7;
  const SPEAK_OFF = 4;
  const SPEAK_HOLD_MS = 320;
  const [localVoiceActive, setLocalVoiceActive] = useState(false);
  const lastLoudAtRef = useRef(0);
  const canSpeak = !!activeChannel && micEnabled && !deafened;
  useEffect(() => {
    if (!canSpeak) {
      if (localVoiceActive) setLocalVoiceActive(false);
      return undefined;
    }
    const now = performance.now();
    if (micLevel >= SPEAK_ON || (localVoiceActive && micLevel >= SPEAK_OFF)) {
      lastLoudAtRef.current = now;
      if (!localVoiceActive) setLocalVoiceActive(true);
      return undefined;
    }
    if (!localVoiceActive) return undefined;
    const wait = Math.max(0, SPEAK_HOLD_MS - (now - lastLoudAtRef.current));
    const t = setTimeout(() => setLocalVoiceActive(false), wait);
    return () => clearTimeout(t);
  }, [micLevel, canSpeak, localVoiceActive]);

  // Avisa o servidor quando EU começo/paro de falar: quem está na call ou fora dela vê o anel verde sem atraso.
  const sentSpeakingRef = useRef(false);
  useEffect(() => {
    const channelId = activeChannel?.id;
    if (!channelId) {
      sentSpeakingRef.current = false;
      return;
    }
    if (sentSpeakingRef.current === localVoiceActive || !stompClientRef.current || !stompConnectedRef.current) return;
    try {
      publishVoiceSpeaking(stompClientRef.current, channelId, localVoiceActive);
      sentSpeakingRef.current = localVoiceActive;
    } catch {
      // stomp caiu: o próximo evento manda de novo
    }
  }, [localVoiceActive, activeChannel?.id, stompConnected]);

  // Quem fala na MINHA call: usa o aviso que cada um manda (rápido); pra quem nunca mandou (bots,
  // versão antiga do app) continua valendo o LiveKit.
  const [remoteSpeaking, setRemoteSpeaking] = useState(() => new Map());
  useEffect(() => {
    setRemoteSpeaking(new Map());
    const channelId = activeChannel?.id;
    if (!channelId || !stompClient || !stompConnected) return undefined;
    let sub;
    try {
      sub = subscribeToVoiceSpeaking(stompClient, channelId, ({ userId, speaking }) => {
        setRemoteSpeaking((prev) => {
          if (prev.get(userId) === speaking) return prev;
          const next = new Map(prev);
          next.set(userId, speaking);
          return next;
        });
      });
    } catch {
      return undefined;
    }
    return () => {
      try {
        sub?.unsubscribe();
      } catch {
        // conexão já caiu
      }
    };
  }, [activeChannel?.id, stompClient, stompConnected]);

  // Troquei a opção do GIF com a call aberta: avisa os outros pela metadata do LiveKit e redesenha o meu card.
  const gifOnSpeakPref = !!user?.avatarAnimateOnSpeak;
  useEffect(() => {
    const room = roomRef.current;
    if (!room || !connected) return;
    refreshParticipants(room);
    let meta = {};
    try {
      meta = room.localParticipant.metadata ? JSON.parse(room.localParticipant.metadata) : {};
    } catch {
      meta = {};
    }
    if (!!meta.gifOnSpeak === gifOnSpeakPref) return;
    room.localParticipant
      .setMetadata(JSON.stringify({ ...meta, avatarUrl: user?.avatarUrl || meta.avatarUrl, gifOnSpeak: gifOnSpeakPref }))
      .catch(() => {});
  }, [gifOnSpeakPref, connected]); // eslint-disable-line react-hooks/exhaustive-deps

  const mergedSpeakingIds = useMemo(() => {
    const myIdentity = user?.id ? `user-${user.id}` : null;
    const out = new Set();
    for (const id of speakingIds) {
      if (id === myIdentity) continue;
      const m = /^user-(\d+)$/.exec(id);
      if (m && remoteSpeaking.has(Number(m[1]))) continue;
      out.add(id);
    }
    for (const [uid, on] of remoteSpeaking) if (on && uid !== user?.id) out.add(`user-${uid}`);
    if (myIdentity && localVoiceActive) out.add(myIdentity);
    return out;
  }, [speakingIds, remoteSpeaking, localVoiceActive, user?.id]);

  const roomRef = useRef(null);
  const videoTracksRef = useRef(new Map());
  const watchedShareIdentitiesRef = useRef(new Set());
  const cameraTracksRef = useRef(new Map());
  const cameraEnabledRef = useRef(false);
  const micAudioTracksRef = useRef(new Map());
  const screenAudioTracksRef = useRef(new Map());
  const participantVolumesRef = useRef(new Map());
  const streamVolumesRef = useRef(new Map());
  const localMicTrackRef = useRef(null);
  const intentionalDisconnectRef = useRef(false);
  const masterVolumeRef = useRef(getMasterVolume());
  const electronScreenTracksRef = useRef({ video: null, audio: null });
  const joiningRef = useRef(false);
  const presenceDeafenedRef = useRef(new Map());
  const [screenShareWatchers, setScreenShareWatchers] = useState({});
  const presenceSubRef = useRef(null);
  const controlSubRef = useRef(null);
  const myPermissionsRef = useRef(new Set());
  const forceMutedRef = useRef(false);
  const forceDeafenedRef = useRef(false);
  const pingIntervalRef = useRef(null);

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

  // Celular: a call aparece nos controles de mídia do sistema (ajuda o navegador a não congelar a aba
  // em segundo plano) e, ao voltar pra aba, religa o áudio e o microfone se o sistema tiver derrubado.
  useEffect(() => {
    if (!isMobileBrowser || !connected || !activeChannel) return;
    const ms = typeof navigator !== "undefined" ? navigator.mediaSession : null;
    try {
      if (ms && typeof MediaMetadata !== "undefined") {
        ms.metadata = new MediaMetadata({ title: activeChannel.name || "Call", artist: "Concorde - em call" });
        ms.playbackState = "playing";
      }
    } catch {
      // sem Media Session: tudo bem
    }

    async function onVisible() {
      if (document.visibilityState !== "visible") return;
      const room = roomRef.current;
      if (!room) return;
      room.startAudio().catch(() => {});
      const micPub = room.localParticipant.getTrackPublication(Track.Source.Microphone);
      const mst = micPub?.track?.mediaStreamTrack;
      if (micEnabledRef.current && micPub?.track && mst && (mst.readyState === "ended" || mst.muted)) {
        try {
          await micPub.track.restartTrack();
          if (micPub.track.mediaStreamTrack) startMicMeter(micPub.track.mediaStreamTrack);
        } catch (err) {
          console.warn("Não deu pra religar o microfone ao voltar pra aba:", err);
        }
      }
    }
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onVisible);
      try {
        if (ms) {
          ms.metadata = null;
          ms.playbackState = "none";
        }
      } catch {
        // ignora
      }
    };
  }, [connected, activeChannel]); // eslint-disable-line react-hooks/exhaustive-deps

  function setActiveChannel(channel) {
    activeChannelRef.current = channel;
    setActiveChannelState(channel);
  }
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

  async function applyNoiseSuppression(track) {
    if (isMobileBrowser) {
      // o filtro por IA roda em Web Audio, que para em segundo plano; o nativo do aparelho não para
      if (track.getProcessor?.()) await track.stopProcessor().catch(() => {});
      return;
    }
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
  }, []);

  useEffect(() => {
    if (!stompConnected || activeChannelRef.current) return;
    const saved = loadActiveChannel();
    if (saved) joinChannel(saved);
  }, [stompConnected]);

  useEffect(() => {
    if (!stompConnected || !activeChannelRef.current || !stompClientRef.current) return;
    const channelId = activeChannelRef.current.id;
    publishVoiceJoin(stompClientRef.current, channelId);
    publishVoiceMicState(stompClientRef.current, channelId, micEnabledRef.current);
    publishVoiceDeafenState(stompClientRef.current, channelId, deafenedRef.current);
    publishVoiceWatching(stompClientRef.current, channelId, currentWatchingUserIds());
    publishVoiceScreenShare(stompClientRef.current, channelId, screenSharingRef.current || audioSharingRef.current);
    try {
      presenceSubRef.current?.unsubscribe();
    } catch {
    }
    presenceSubRef.current = subscribeToVoicePresence(stompClientRef.current, channelId, (list) => {
      presenceDeafenedRef.current = new Map(list.map((p) => [String(p.userId), p.deafened]));
      setScreenShareWatchers(watchersByIdentity(list));
      if (roomRef.current) refreshParticipants(roomRef.current);
    });
    try {
      controlSubRef.current?.unsubscribe();
    } catch {
    }
    controlSubRef.current = subscribeToVoiceControl(stompClientRef.current, channelId, handleVoiceControlEvent);
  }, [stompConnected]);

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
          const myUserId = userRef.current?.id;
          const iAmPresent = (data || []).some((p) => String(p.userId) === String(myUserId));
          if (roomRef.current && myUserId != null && !iAmPresent && stompClientRef.current && stompConnectedRef.current) {
            console.warn("Presenca de voz sumiu do lado do servidor enquanto ainda conectado ao LiveKit - reanunciando.");
            publishVoiceJoin(stompClientRef.current, channelId);
            publishVoiceMicState(stompClientRef.current, channelId, micEnabledRef.current);
            publishVoiceDeafenState(stompClientRef.current, channelId, deafenedRef.current);
            publishVoiceScreenShare(stompClientRef.current, channelId, screenSharingRef.current || audioSharingRef.current);
          }
        })
        .catch(() => {});
    }, 12000);
    return () => clearInterval(interval);
  }, [activeChannel]);

  useEffect(() => {
    function handleBeforeUnload(e) {
      if (!activeChannel) return;
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [activeChannel]);

  useEffect(() => {
    if (window.concordeDesktop) {
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

  function gifOnSpeakOf(participant) {
    try {
      return participant.metadata ? !!JSON.parse(participant.metadata)?.gifOnSpeak : false;
    } catch {
      return false;
    }
  }

  function avatarUrlOf(participant) {
    try {
      return participant.metadata ? JSON.parse(participant.metadata)?.avatarUrl || null : null;
    } catch {
      return null;
    }
  }

  // Ouço essa transmissão de áudio? Automático ligado = sim, a não ser que eu tenha saído dela.
  function wantsAudioShare(identity) {
    if (listeningAudioRef.current.has(identity)) return true;
    if (declinedAudioRef.current.has(identity)) return false;
    return getAutoListenAudioShare();
  }

  function isAudioOnlyPub(pub) {
    return !!pub && pub.source === Track.Source.ScreenShareAudio && pub.trackName === "audio_only";
  }

  function isSoundboardBot(identity) {
    return /^soundboardbot-\d+$/.test(identity || "");
  }

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
        gifOnSpeak: !!userRef.current?.avatarAnimateOnSpeak,
        micEnabled: local.isMicrophoneEnabled,
        deafened: deafenedRef.current,
        isLocal: true,
      },
      // o bot do soundboard só toca o áudio: não aparece como alguém na call
      ...[...activeRoom.remoteParticipants.values()].filter((p) => !isSoundboardBot(p.identity)).map((p) => ({
        identity: p.identity,
        name: p.name || p.identity,
        avatarUrl: avatarUrlOf(p),
        gifOnSpeak: gifOnSpeakOf(p),
        micEnabled: p.isMicrophoneEnabled,
        deafened: deafenedOf(p.identity),
        isLocal: false,
      })),
    ];
    setParticipants(list);
    const shares = [];
    if (audioSharingRef.current) {
      shares.push({ identity: local.identity, name: userRef.current?.username || local.identity, avatarUrl: userRef.current?.avatarUrl || null, isLocal: true });
    }
    for (const p of activeRoom.remoteParticipants.values()) {
      const pub = p.getTrackPublication(Track.Source.ScreenShareAudio);
      if (isAudioOnlyPub(pub)) {
        if (wantsAudioShare(p.identity)) listeningAudioRef.current.add(p.identity);
        shares.push({
          identity: p.identity,
          name: p.name || p.identity,
          avatarUrl: avatarUrlOf(p),
          isLocal: false,
          listening: listeningAudioRef.current.has(p.identity),
        });
      }
    }
    setAudioShares(shares);
  }

  function syncScreenShares() {
    setScreenShares(
      [...videoTracksRef.current.entries()].map(([sid, v]) => ({
        sid,
        name: v.participantName,
        participantIdentity: v.participantIdentity,
        isLocal: v.isLocal,
        watching: !!v.track,
        track: v.track || null,
      }))
    );
  }

  function upsertScreenShare(sid, patch) {
    const identity = patch.participantIdentity ?? videoTracksRef.current.get(sid)?.participantIdentity;
    if (identity) {
      for (const [otherSid, entry] of [...videoTracksRef.current.entries()]) {
        if (otherSid !== sid && entry.participantIdentity === identity) videoTracksRef.current.delete(otherSid);
      }
    }
    const merged = { ...(videoTracksRef.current.get(sid) || {}), ...patch };
    videoTracksRef.current.set(sid, merged);
    syncScreenShares();
  }

  function removeVideoTrack(sid) {
    videoTracksRef.current.delete(sid);
    syncScreenShares();
  }

  const toggleWatchScreenShare = useCallback(async (sid) => {
    const entry = videoTracksRef.current.get(sid);
    if (!entry || entry.isLocal || !entry.pub) return;
    const nextWatching = !entry.track;
    if (nextWatching) watchedShareIdentitiesRef.current.add(entry.participantIdentity);
    else watchedShareIdentitiesRef.current.delete(entry.participantIdentity);
    if (activeChannelRef.current && stompClientRef.current && stompConnectedRef.current) {
      publishVoiceWatching(stompClientRef.current, activeChannelRef.current.id, currentWatchingUserIds());
    }
    try {
      await entry.pub.setSubscribed(nextWatching);
    } catch (err) {
      console.warn("Não foi possível mudar a inscrição da transmissão:", err);
    }
    const participant = roomRef.current?.remoteParticipants.get(entry.participantIdentity);
    const audioPub = participant?.getTrackPublication(Track.Source.ScreenShareAudio);
    if (audioPub && !isAudioOnlyPub(audioPub)) {
      try {
        await audioPub.setSubscribed(nextWatching);
      } catch (err) {
        console.warn("Não foi possível mudar a inscrição do áudio da transmissão:", err);
      }
    }
  }, []);

  function userIdFromIdentity(identity) {
    const match = /^user-(\d+)$/.exec(identity || "");
    if (match) return match[1];
    // o soundboard tem um volume só, valendo em qualquer canal
    if (/^soundboardbot-\d+$/.test(identity || "")) return "soundboardbot";
    if (/^musicbot-\d+$/.test(identity || "")) return identity;
    return null;
  }

  function currentWatchingUserIds() {
    return [...watchedShareIdentitiesRef.current]
      .map((identity) => userIdFromIdentity(identity))
      .filter((id) => id && /^\d+$/.test(id))
      .map(Number);
  }

  function resolveParticipantVolume(identity) {
    if (participantVolumesRef.current.has(identity)) return participantVolumesRef.current.get(identity);
    const userId = userIdFromIdentity(identity);
    const value = (userId && getSavedParticipantVolume(userId)) ?? 100;
    participantVolumesRef.current.set(identity, value);
    setParticipantVolumesState(Object.fromEntries(participantVolumesRef.current));
    return value;
  }

  function resolveStreamVolume(identity) {
    if (streamVolumesRef.current.has(identity)) return streamVolumesRef.current.get(identity);
    const userId = userIdFromIdentity(identity);
    const value = (userId && getSavedStreamVolume(userId)) ?? 100;
    streamVolumesRef.current.set(identity, value);
    setStreamVolumesState(Object.fromEntries(streamVolumesRef.current));
    return value;
  }

  function effectiveVolume(rawPercent) {
    const v = (rawPercent / 100) * (masterVolumeRef.current / 100);
    // sem Web Audio (celular) o volume vai direto no <audio>, que só vai até 1
    return isMobileBrowser ? Math.min(1, v) : v;
  }

  function setParticipantVolume(identity, percent) {
    const clamped = Math.max(0, Math.min(300, Math.round(percent)));
    participantVolumesRef.current.set(identity, clamped);
    setParticipantVolumesState(Object.fromEntries(participantVolumesRef.current));
    const userId = userIdFromIdentity(identity);
    if (userId) setSavedParticipantVolume(userId, clamped);
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

  function setMasterVolumePercent(percent) {
    const clamped = Math.max(0, Math.min(300, Math.round(percent)));
    masterVolumeRef.current = clamped;
    setMasterVolumeState(clamped);
    persistMasterVolume(clamped);
    if (deafenedRef.current) return;
    micAudioTracksRef.current.forEach((track, identity) => track.setVolume(effectiveVolume(resolveParticipantVolume(identity))));
    screenAudioTracksRef.current.forEach((track, identity) => track.setVolume(effectiveVolume(resolveStreamVolume(identity))));
  }

  function setMicGainPercent(percent) {
    const clamped = Math.max(0, Math.min(200, Math.round(percent)));
    setMicGainState(clamped);
    persistMicGain(clamped);
    if (localMicTrackRef.current) applyNoiseSuppression(localMicTrackRef.current);
  }

  async function disconnectInternal({ skipPresenceLeave = false } = {}) {
    intentionalDisconnectRef.current = true;
    const channelLeaving = activeChannelRef.current;
    // substituído por outro aparelho/aba: a presença agora é dele, não avisa "saí"
    if (!skipPresenceLeave && channelLeaving && stompClientRef.current && stompConnectedRef.current) {
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
    electronScreenTracksRef.current.video?.stop();
    electronScreenTracksRef.current.audio?.stop();
    electronScreenTracksRef.current.audio?._concordeCleanup?.();
    electronScreenTracksRef.current = { video: null, audio: null };
    if (audioShareTrackRef.current) {
      audioShareTrackRef.current.stop();
      audioShareTrackRef.current._concordeCleanup?.();
      audioShareTrackRef.current = null;
    }
    audioSharingRef.current = false;
    setAudioSharingState(false);
    setAudioShares([]);
    setAudioPickerOpen(false);
    listeningAudioRef.current = new Set();
    declinedAudioRef.current = new Set();
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
    if (joiningRef.current) return;
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
        webAudioMix: !isMobileBrowser,
        audioCaptureDefaults: {
          ...(savedInput ? { deviceId: savedInput } : {}),
          noiseSuppression: isMobileBrowser,
          ...(isMobileBrowser ? { echoCancellation: true, autoGainControl: true } : {}),
        },
        publishDefaults: {
          screenShareEncoding: { maxBitrate: 6_000_000, maxFramerate: 30, priority: "high" },
          degradationPreference: "maintain-framerate",
        },
      });

      newRoom.on(RoomEvent.TrackSubscribed, (track, pub, participant) => {
        if (track.kind === Track.Kind.Video && pub.source === Track.Source.ScreenShare) {
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
          const silenced = deafenedRef.current;
          if (pub.source === Track.Source.ScreenShareAudio && !isAudioOnlyPub(pub)) {
            if (!watchedShareIdentitiesRef.current.has(participant.identity)) {
              pub.setSubscribed(false);
              return;
            }
          }
          if (isAudioOnlyPub(pub) && !wantsAudioShare(participant.identity)) {
            pub.setSubscribed(false);
            refreshParticipants(newRoom);
            return;
          }
          const el = track.attach();
          if (deafenedRef.current) el.muted = true;
          if (pub.source === Track.Source.Microphone) {
            micAudioTracksRef.current.set(participant.identity, track);
            track.setVolume(silenced ? 0 : effectiveVolume(resolveParticipantVolume(participant.identity)));
          } else if (pub.source === Track.Source.ScreenShareAudio) {
            screenAudioTracksRef.current.set(participant.identity, track);
            track.setVolume(silenced ? 0 : effectiveVolume(resolveStreamVolume(participant.identity)));
          }
          if (pub.source === Track.Source.Microphone) refreshParticipants(newRoom);
        }
      });
      newRoom.on(RoomEvent.TrackUnsubscribed, (track, pub, participant) => {
        if (pub.source === Track.Source.ScreenShare) {
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
      newRoom.on(RoomEvent.TrackUnpublished, (pub, participant) => {
        if (isAudioOnlyPub(pub)) {
          // a próxima transmissão dessa pessoa volta a seguir a preferência "entrar automaticamente"
          listeningAudioRef.current.delete(participant?.identity);
          declinedAudioRef.current.delete(participant?.identity);
          playScreenShareStopSound();
          refreshParticipants(newRoom);
        }
        if (pub.source === Track.Source.ScreenShare) {
          removeVideoTrack(pub.trackSid);
          playScreenShareStopSound(); // alguém da call fechou a live
        }
      });
      newRoom.on(RoomEvent.TrackPublished, (pub, participant) => {
        if (pub.source !== Track.Source.ScreenShare && pub.source !== Track.Source.ScreenShareAudio) return;
        if (isAudioOnlyPub(pub)) {
          // transmissão só de áudio: entra direto se o automático estiver ligado; senão aparece o "Ouvir"
          if (!wantsAudioShare(participant.identity)) pub.setSubscribed(false);
          playScreenShareStartSound();
          refreshParticipants(newRoom);
          return;
        }
        const watching = watchedShareIdentitiesRef.current.has(participant.identity);
        if (!watching) pub.setSubscribed(false);
        if (pub.source === Track.Source.ScreenShare) {
          playScreenShareStartSound(); // alguém da call abriu a live
          upsertScreenShare(pub.trackSid, {
            track: watching ? pub.track : null,
            pub,
            participantIdentity: participant.identity,
            participantName: participant.name || participant.identity,
            isLocal: false,
          });
        }
      });
      newRoom.on(RoomEvent.LocalTrackPublished, (pub, participant) => {
        if (pub.source === Track.Source.Microphone && pub.track) {
          localMicTrackRef.current = pub.track;
          applyNoiseSuppression(pub.track);
        }
        if (pub.source === Track.Source.ScreenShare && pub.track) {
          upsertScreenShare(pub.trackSid, {
            track: pub.track,
            pub: null,
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
      newRoom.on(RoomEvent.Reconnected, () => {
        resyncFromRoom(newRoom);
      });
      newRoom.on(RoomEvent.Disconnected, (reason) => {
        if (intentionalDisconnectRef.current) {
          intentionalDisconnectRef.current = false;
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
        disconnectInternal({ skipPresenceLeave: reason === DisconnectReason.DUPLICATE_IDENTITY });
        playLeaveSound();
        showAlert(message);
      });
      newRoom.on(RoomEvent.ParticipantConnected, (participant) => {
        refreshParticipants(newRoom);
        if (!isSoundboardBot(participant.identity)) playJoinSound();
      });
      newRoom.on(RoomEvent.ParticipantDisconnected, (participant) => {
        refreshParticipants(newRoom);
        if (!isSoundboardBot(participant.identity)) playLeaveSound();
        for (const [sid, entry] of [...videoTracksRef.current.entries()]) {
          if (entry.participantIdentity === participant.identity) videoTracksRef.current.delete(sid);
        }
        syncScreenShares();
        if (cameraTracksRef.current.delete(participant.identity)) syncCameraTracks();
      });
      // alguém trocou a opção "GIF só mexe ao falar" no meio da call
      newRoom.on(RoomEvent.ParticipantMetadataChanged, () => refreshParticipants(newRoom));
      newRoom.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        setSpeakingIds(new Set(speakers.map((p) => p.identity)));
      });
      newRoom.on(RoomEvent.TrackMuted, (pub, participant) => {
        refreshParticipants(newRoom);
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
      playJoinSound();

      if (data.forceMuted || data.forceDeafened) {
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
      refreshParticipants(newRoom);
    } finally {
      joiningRef.current = false;
    }
  }

  async function leaveChannel() {
    if (!roomRef.current) return;
    playLeaveSound();
    await disconnectInternal();
  }

  function restoreListenVolumes(room) {
    micAudioTracksRef.current.forEach((track, identity) => {
      track.setVolume(effectiveVolume(resolveParticipantVolume(identity)));
    });
    screenAudioTracksRef.current.forEach((track, identity) => {
      track.setVolume(effectiveVolume(resolveStreamVolume(identity)));
    });
    room.remoteParticipants.forEach((participant) => {
      participant.audioTrackPublications.forEach((pub) => {
        pub.track?.attachedElements.forEach((el) => (el.muted = false));
      });
    });
  }

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
          if (pub.track.attachedElements.length === 0) pub.track.attach();
          pub.track.setVolume(silenced ? 0 : effectiveVolume(resolveParticipantVolume(participant.identity)));
          pub.track.attachedElements.forEach((el) => (el.muted = silenced));
        } else if (pub.source === Track.Source.ScreenShareAudio) {
          if (
            isAudioOnlyPub(pub)
              ? !wantsAudioShare(participant.identity)
              : !watchedShareIdentitiesRef.current.has(participant.identity)
          ) {
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

    const shouldPublishMic =
      micEnabledRef.current && !deafenedRef.current && !forceMutedRef.current && !forceDeafenedRef.current;
    room.localParticipant.setMicrophoneEnabled(shouldPublishMic).catch(() => {});
  }

  function clearDeafened(room) {
    setDeafened(false);
    if (activeChannelRef.current && stompClientRef.current && stompConnectedRef.current) {
      publishVoiceDeafenState(stompClientRef.current, activeChannelRef.current.id, false);
    }
    restoreListenVolumes(room);
  }

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

  // Como o usuário estava antes da ação do moderador: ao liberar, volta pra isso (nunca liga o mic à força).
  const micBeforeForceRef = useRef(null);
  const deafBeforeForceRef = useRef(null);

  async function applyForceMute(muted) {
    if (muted) {
      if (micBeforeForceRef.current === null) micBeforeForceRef.current = micEnabledRef.current;
      forceMutedRef.current = true;
      if (roomRef.current && !deafenedRef.current && micEnabledRef.current) await toggleMic();
      return;
    }
    forceMutedRef.current = false;
    const wasOn = micBeforeForceRef.current;
    micBeforeForceRef.current = null;
    if (roomRef.current && wasOn && !deafenedRef.current && !micEnabledRef.current) await toggleMic();
    else if (activeChannelRef.current && stompClientRef.current && stompConnectedRef.current) {
      publishVoiceMicState(stompClientRef.current, activeChannelRef.current.id, micEnabledRef.current);
    }
  }

  async function applyForceDeafen(deafened) {
    if (deafened) {
      if (deafBeforeForceRef.current === null) deafBeforeForceRef.current = deafenedRef.current;
      if (micBeforeForceRef.current === null) micBeforeForceRef.current = micEnabledRef.current;
      forceDeafenedRef.current = true;
      forceMutedRef.current = true;
      if (roomRef.current && !deafenedRef.current) await toggleDeafen();
      return;
    }
    forceDeafenedRef.current = false;
    forceMutedRef.current = false;
    const wasDeaf = deafBeforeForceRef.current;
    const wasMicOn = micBeforeForceRef.current;
    deafBeforeForceRef.current = null;
    micBeforeForceRef.current = null;
    if (roomRef.current && !wasDeaf && deafenedRef.current) {
      await toggleDeafen();
      // sair do ensurdecido religa o mic; se a pessoa estava mutada antes, mantém mutada
      if (wasMicOn === false && micEnabledRef.current) await toggleMic();
    } else if (activeChannelRef.current && stompClientRef.current && stompConnectedRef.current) {
      publishVoiceMicState(stompClientRef.current, activeChannelRef.current.id, micEnabledRef.current);
      publishVoiceDeafenState(stompClientRef.current, activeChannelRef.current.id, deafenedRef.current);
    }
  }

  async function toggleMic() {
    const room = roomRef.current;
    if (!room) return;
    const next = !micEnabledRef.current;
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
    if (roomRef.current) refreshParticipants(roomRef.current);

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
      await room.localParticipant.setMicrophoneEnabled(true);
      setMicEnabled(true);
      const micPub = room.localParticipant.getTrackPublication(Track.Source.Microphone);
      if (micPub?.track?.mediaStreamTrack) startMicMeter(micPub.track.mediaStreamTrack);
      if (activeChannelRef.current && stompClientRef.current && stompConnectedRef.current) {
        publishVoiceMicState(stompClientRef.current, activeChannelRef.current.id, true);
      }
    }
  }

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

  async function toggleScreenShare() {
    const room = roomRef.current;
    if (!room) return;

    if (!screenSharingRef.current) {
      if (isElectronDesktop) {
        setScreenPickerOpen(true);
        return;
      }
      screenSharingRef.current = true;
      await room.localParticipant.setScreenShareEnabled(true, {
        video: {
          displaySurface: "browser",
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

    screenSharingRef.current = false;
    if (electronScreenTracksRef.current.video) {
      await stopElectronScreenShare();
    } else {
      await room.localParticipant.setScreenShareEnabled(false);
    }
    setScreenSharing(false);
    playScreenShareStopSound();
  }

  async function publishAudioShare(track) {
    const room = roomRef.current;
    if (!room || !track) return;
    audioShareTrackRef.current = track;
    track.onended = () => {
      if (audioSharingRef.current) stopAudioShare();
    };
    await room.localParticipant.publishTrack(track, {
      source: Track.Source.ScreenShareAudio,
      name: "audio_only",
      audioPreset: AudioPresets?.musicHighQuality,
      dtx: false,
      red: false,
    });
    audioSharingRef.current = true;
    setAudioSharingState(true);
    refreshParticipants(room);
    playScreenShareStartSound();
  }

  async function stopAudioShare() {
    const room = roomRef.current;
    const track = audioShareTrackRef.current;
    audioShareTrackRef.current = null;
    audioSharingRef.current = false;
    setAudioSharingState(false);
    if (track) {
      track.onended = null;
      try {
        await room?.localParticipant.unpublishTrack(track, true);
      } catch {
        track.stop();
      }
      await track._concordeCleanup?.();
    }
    if (room) refreshParticipants(room);
    playScreenShareStopSound();
  }

  /** Entrar/sair de uma transmissão de áudio de outra pessoa. */
  async function toggleListenAudioShare(identity) {
    const room = roomRef.current;
    const participant = room?.remoteParticipants.get(identity);
    const pub = participant?.getTrackPublication(Track.Source.ScreenShareAudio);
    if (!pub || !isAudioOnlyPub(pub)) return;
    const next = !listeningAudioRef.current.has(identity);
    if (next) {
      listeningAudioRef.current.add(identity);
      declinedAudioRef.current.delete(identity);
    } else {
      listeningAudioRef.current.delete(identity);
      declinedAudioRef.current.add(identity);
    }
    try {
      await pub.setSubscribed(next);
    } catch (err) {
      console.warn("Não foi possível mudar a inscrição do áudio:", err);
    }
    refreshParticipants(room);
  }

  /** Liga/desliga a transmissão só de áudio. */
  async function toggleAudioShare() {
    const room = roomRef.current;
    if (!room) return;
    if (audioSharingRef.current) {
      await stopAudioShare();
      return;
    }
    if (screenSharingRef.current) {
      showAlert("Pare a transmissão de tela antes - ela já manda o áudio junto.");
      return;
    }
    if (isElectronDesktop) {
      setAudioPickerOpen(true);
      return;
    }
    try {
      // o navegador só deixa capturar áudio junto com uma tela/aba; o vídeo é descartado na hora
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        systemAudio: "include",
        selfBrowserSurface: "exclude",
      });
      stream.getVideoTracks().forEach((t) => t.stop());
      const audioTrack = stream.getAudioTracks()[0];
      if (!audioTrack) {
        showAlert('Nenhum áudio veio junto - escolha uma ABA (ou a tela inteira no Windows) e marque "Compartilhar áudio".');
        return;
      }
      await publishAudioShare(audioTrack);
    } catch (err) {
      if (err?.name !== "NotAllowedError") showAlert("Não foi possível transmitir o áudio: " + err.message);
    }
  }

  async function startElectronAudioShare(source) {
    setAudioPickerOpen(false);
    try {
      let audioTrack = null;
      if (source.type === "screen") {
        audioTrack = await startSystemAudioExcludingSelfTrack();
      } else {
        const hwnd = Number(source.id.split(":")[1]);
        if (Number.isFinite(hwnd) && hwnd > 0) audioTrack = await startWindowAudioTrack(hwnd);
      }
      if (!audioTrack) {
        showAlert("Não foi possível capturar o áudio agora - tente de novo ou escolha outra janela.");
        return;
      }
      await publishAudioShare(audioTrack);
    } catch (err) {
      showAlert("Não foi possível transmitir o áudio: " + err.message);
    }
  }

  function closeScreenPicker() {
    setScreenPickerOpen(false);
  }

  async function startElectronScreenShare(source) {
    const room = roomRef.current;
    if (!room) return;
    setScreenPickerOpen(false);
    const wantSystemAudio = source.type === "screen";
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
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
      let audioTrack = null;

      if (wantSystemAudio) {
        audioTrack = await startSystemAudioExcludingSelfTrack();
        if (!audioTrack) {
          showAlert(
            "Não foi possível capturar o áudio do sistema agora (só o vídeo vai ser compartilhado) - tente parar e compartilhar de novo."
          );
        }
      } else {
        const hwnd = Number(source.id.split(":")[1]);
        if (Number.isFinite(hwnd) && hwnd > 0) {
          audioTrack = await startWindowAudioTrack(hwnd);
        }
      }

      electronScreenTracksRef.current = { video: videoTrack, audio: audioTrack };
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
      await audio._concordeCleanup?.();
    }
    electronScreenTracksRef.current = { video: null, audio: null };
  }

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
        speakingIds: mergedSpeakingIds,
        soundboardVolume: activeChannel ? participantVolumes[`soundboardbot-${activeChannel.id}`] ?? (getSavedParticipantVolume("soundboardbot") ?? 100) : 100,
        setSoundboardVolume: (v) => activeChannel && setParticipantVolume(`soundboardbot-${activeChannel.id}`, v),
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
        audioSharing,
        audioShares,
        toggleAudioShare,
        toggleListenAudioShare,
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
      {audioPickerOpen && (
        <ScreenSharePicker mode="audio" onSelect={startElectronAudioShare} onClose={() => setAudioPickerOpen(false)} />
      )}
    </VoiceCallContext.Provider>
  );
}

export function useVoiceCall() {
  return useContext(VoiceCallContext);
}
