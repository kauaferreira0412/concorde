import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AudioSession } from "@livekit/react-native";
import { DisconnectReason, Room, RoomEvent, Track } from "livekit-client";
import api, { getToken } from "../api";
import { createChatClient } from "../socket";
import { playSound } from "./sounds";

const VoiceContext = createContext(null);
const VOLUMES_KEY = "concorde:participant-volumes";

function isSoundboardBot(identity) {
  return /^soundboardbot-\d+$/.test(identity || "");
}

function avatarUrlOf(participant) {
  try {
    return participant.metadata ? JSON.parse(participant.metadata)?.avatarUrl || null : null;
  } catch {
    return null;
  }
}

export function userIdFromIdentity(identity) {
  return identity?.startsWith("user-") ? Number(identity.slice(5)) : null;
}

const isAudioOnlyShare = (pub) => pub?.source === Track.Source.ScreenShareAudio && pub.trackName === "audio_only";

/**
 * Call de voz nativa (LiveKit). Fica viva enquanto o usuário navega pelo app e, no iPhone,
 * continua em segundo plano (UIBackgroundModes audio + voip no app.json).
 */
export function VoiceProvider({ user, children }) {
  const [channel, setChannel] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [participants, setParticipants] = useState([]);
  const [streams, setStreams] = useState([]);
  const [audioShares, setAudioShares] = useState([]);
  const [micEnabled, setMicEnabledState] = useState(false);
  const [deafened, setDeafenedState] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [facing, setFacing] = useState("user");
  const [volumes, setVolumesState] = useState({});
  const [permissions, setPermissions] = useState([]);

  const roomRef = useRef(null);
  const stompRef = useRef(null);
  const channelRef = useRef(null);
  const micRef = useRef(false);
  const deafRef = useRef(false);
  const forceMutedRef = useRef(false);
  const watchingRef = useRef(new Set());
  // transmissões só de áudio que eu parei de ouvir (o padrão é ouvir, igual ao site)
  const declinedAudioRef = useRef(new Set());
  const presenceRef = useRef(new Map());
  const volumesRef = useRef({});
  const joinSeqRef = useRef(0);
  const userRef = useRef(user);
  userRef.current = user;

  // volumes por pessoa ficam salvos no aparelho (por id de usuário, igual ao site)
  useEffect(() => {
    AsyncStorage.getItem(VOLUMES_KEY)
      .then((raw) => {
        if (!raw) return;
        const parsed = JSON.parse(raw);
        volumesRef.current = parsed && typeof parsed === "object" ? parsed : {};
        setVolumesState(volumesRef.current);
      })
      .catch(() => {});
  }, []);

  const publish = useCallback((suffix, body) => {
    const client = stompRef.current;
    const ch = channelRef.current;
    if (!client?.connected || !ch) return;
    try {
      client.publish({ destination: `/app/channel.${ch.id}.voice.${suffix}`, body: JSON.stringify(body) });
    } catch {
      // caiu no meio: o join reanuncia ao reconectar
    }
  }, []);

  function volumeKey(identity, kind) {
    const id = isSoundboardBot(identity) ? "soundboardbot" : userIdFromIdentity(identity) ?? identity;
    return kind === "stream" ? `stream:${id}` : String(id);
  }

  function volumeOf(identity, kind = "voice") {
    const v = volumesRef.current[volumeKey(identity, kind)];
    return typeof v === "number" ? v : 100;
  }

  /** Aplica o volume (0–200%) nas faixas de áudio já recebidas dessa pessoa. */
  function applyVolume(identity) {
    const room = roomRef.current;
    const p = room?.remoteParticipants.get(identity);
    if (!p) return;
    for (const pub of p.audioTrackPublications.values()) {
      const kind = pub.source === Track.Source.ScreenShareAudio ? "stream" : "voice";
      pub.track?.setVolume?.(volumeOf(identity, kind) / 100);
    }
  }

  const refresh = useCallback(() => {
    const room = roomRef.current;
    if (!room) {
      setParticipants([]);
      setStreams([]);
      return;
    }
    const all = [room.localParticipant, ...room.remoteParticipants.values()].filter((p) => !isSoundboardBot(p.identity));
    setParticipants(
      all.map((p) => {
        const isLocal = p === room.localParticipant;
        const micPub = p.getTrackPublication(Track.Source.Microphone);
        const camPub = p.getTrackPublication(Track.Source.Camera);
        const userId = userIdFromIdentity(p.identity);
        const pres = presenceRef.current.get(String(userId)) || {};
        return {
          identity: p.identity,
          userId,
          name: isLocal ? userRef.current?.username || p.name : p.name || p.identity,
          avatarUrl: isLocal ? userRef.current?.avatarUrl || avatarUrlOf(p) : avatarUrlOf(p),
          isLocal,
          speaking: p.isSpeaking,
          muted: !micPub || micPub.isMuted,
          deafened: isLocal ? deafRef.current : !!pres.deafened,
          forceMuted: !!pres.forceMuted,
          forceDeafened: !!pres.forceDeafened,
          camera: camPub?.track && !camPub.isMuted ? { participant: p, publication: camPub } : null,
          streaming: !!p.getTrackPublication(Track.Source.ScreenShare),
          audioLive: isAudioOnlyShare(p.getTrackPublication(Track.Source.ScreenShareAudio)),
        };
      })
    );
    const list = [];
    for (const p of room.remoteParticipants.values()) {
      const pub = p.getTrackPublication(Track.Source.ScreenShare);
      if (!pub) continue;
      list.push({
        identity: p.identity,
        name: p.name || p.identity,
        avatarUrl: avatarUrlOf(p),
        watching: watchingRef.current.has(p.identity),
        participant: p,
        publication: pub,
        hasVideo: !!pub.track,
      });
    }
    setStreams(list);
    const shares = [];
    for (const p of room.remoteParticipants.values()) {
      if (isSoundboardBot(p.identity)) continue;
      const pub = p.getTrackPublication(Track.Source.ScreenShareAudio);
      if (!isAudioOnlyShare(pub)) continue;
      shares.push({
        identity: p.identity,
        name: p.name || p.identity,
        avatarUrl: avatarUrlOf(p),
        listening: !declinedAudioRef.current.has(p.identity),
      });
    }
    setAudioShares(shares);
  }, []);

  /** O que a gente recebe de cada um: voz e câmera sempre (menos ensurdecido), live só se estiver assistindo. */
  const wants = useCallback((pub, identity) => {
    if (pub.source === Track.Source.Microphone) return !deafRef.current;
    if (pub.source === Track.Source.ScreenShareAudio) {
      return isAudioOnlyShare(pub)
        ? !deafRef.current && !declinedAudioRef.current.has(identity)
        : !deafRef.current && watchingRef.current.has(identity);
    }
    if (pub.source === Track.Source.ScreenShare) return watchingRef.current.has(identity);
    if (pub.source === Track.Source.Camera) return true;
    return false;
  }, []);

  const applySubscriptions = useCallback(() => {
    const room = roomRef.current;
    if (!room) return;
    for (const p of room.remoteParticipants.values()) {
      for (const pub of p.trackPublications.values()) {
        const want = wants(pub, p.identity);
        if (pub.isSubscribed !== want) pub.setSubscribed(want);
      }
    }
  }, [wants]);

  function setMic(value) {
    micRef.current = value;
    setMicEnabledState(value);
    publish("mic", { micEnabled: value });
  }

  function setDeaf(value) {
    deafRef.current = value;
    setDeafenedState(value);
    publish("deafen", { deafened: value });
  }

  function publishWatching() {
    publish("watching", {
      watchingUserIds: [...watchingRef.current].map(userIdFromIdentity).filter((id) => id != null),
    });
  }

  /** skipPresenceLeave: sem avisar o servidor que saiu (outro aparelho assumiu a call). */
  const leave = useCallback(async ({ skipPresenceLeave = false, silent = false } = {}) => {
    joinSeqRef.current++;
    const room = roomRef.current;
    const client = stompRef.current;
    const wasIn = !!channelRef.current;
    roomRef.current = null;
    stompRef.current = null;
    if (client) {
      try {
        if (!skipPresenceLeave && client.connected && channelRef.current) {
          client.publish({ destination: `/app/channel.${channelRef.current.id}.voice.leave`, body: "{}" });
        }
      } catch {
        // ignora
      }
      // dá um instante pro "saí" sair antes de fechar o socket
      setTimeout(() => client.deactivate(), 300);
    }
    channelRef.current = null;
    watchingRef.current = new Set();
    declinedAudioRef.current = new Set();
    presenceRef.current = new Map();
    setAudioShares([]);
    setConnecting(false);
    setChannel(null);
    setParticipants([]);
    setStreams([]);
    setPermissions([]);
    micRef.current = false;
    deafRef.current = false;
    forceMutedRef.current = false;
    setMicEnabledState(false);
    setDeafenedState(false);
    setCameraOn(false);
    if (room) {
      room.removeAllListeners();
      await room.disconnect().catch(() => {});
    }
    await AudioSession.stopAudioSession().catch(() => {});
    if (wasIn && !silent) playSound("leave");
  }, []);

  async function toggleMic() {
    const room = roomRef.current;
    if (!room) return;
    const next = !micRef.current;
    if (next && forceMutedRef.current) {
      Alert.alert("Microfone bloqueado", "Um moderador silenciou você nesse canal.");
      return;
    }
    if (next && deafRef.current) {
      setDeaf(false);
      applySubscriptions();
    }
    try {
      await room.localParticipant.setMicrophoneEnabled(next);
      setMic(next);
      playSound(next ? "unmute" : "mute");
    } catch (err) {
      Alert.alert("Microfone", "Não deu pra ligar o microfone: " + (err?.message || err));
    }
    refresh();
  }

  async function toggleDeafen() {
    const room = roomRef.current;
    if (!room) return;
    const next = !deafRef.current;
    setDeaf(next);
    applySubscriptions();
    if (next && micRef.current) {
      await room.localParticipant.setMicrophoneEnabled(false).catch(() => {});
      setMic(false);
    }
    playSound(next ? "mute" : "unmute");
    refresh();
  }

  async function toggleCamera() {
    const room = roomRef.current;
    if (!room) return;
    const next = !cameraOn;
    try {
      await room.localParticipant.setCameraEnabled(next, next ? { facingMode: facing, resolution: { width: 1280, height: 720, frameRate: 24 } } : undefined);
      setCameraOn(next);
    } catch (err) {
      Alert.alert("Câmera", "Não deu pra ligar a câmera (permissão negada?): " + (err?.message || err));
    }
    refresh();
  }

  /** Troca entre a câmera frontal e a traseira sem desligar. */
  async function switchCamera() {
    const room = roomRef.current;
    const next = facing === "user" ? "environment" : "user";
    setFacing(next);
    const track = room?.localParticipant.getTrackPublication(Track.Source.Camera)?.track;
    if (!track) return;
    try {
      await track.restartTrack({ facingMode: next });
    } catch {
      // fallback: alterna direto no WebRTC nativo
      try {
        track.mediaStreamTrack?._switchCamera?.();
      } catch {
        Alert.alert("Câmera", "Não deu pra trocar de câmera agora.");
      }
    }
    refresh();
  }

  function toggleWatch(identity) {
    if (watchingRef.current.has(identity)) watchingRef.current.delete(identity);
    else watchingRef.current.add(identity);
    watchingRef.current = new Set(watchingRef.current);
    applySubscriptions();
    publishWatching();
    refresh();
  }

  /** Parar / voltar a ouvir uma transmissão só de áudio. */
  function toggleListenAudio(identity) {
    if (declinedAudioRef.current.has(identity)) declinedAudioRef.current.delete(identity);
    else declinedAudioRef.current.add(identity);
    applySubscriptions();
    refresh();
  }

  /** Volume do soundboard (vale pra todos os bots de som, igual ao site). */
  function setSoundboardVolume(percent) {
    const clamped = Math.max(0, Math.min(200, Math.round(percent)));
    volumesRef.current = { ...volumesRef.current, soundboardbot: clamped };
    setVolumesState(volumesRef.current);
    AsyncStorage.setItem(VOLUMES_KEY, JSON.stringify(volumesRef.current)).catch(() => {});
    const room = roomRef.current;
    if (room) for (const p of room.remoteParticipants.values()) if (isSoundboardBot(p.identity)) applyVolume(p.identity);
  }

  function setVolume(identity, percent, kind = "voice") {
    const clamped = Math.max(0, Math.min(200, Math.round(percent)));
    volumesRef.current = { ...volumesRef.current, [volumeKey(identity, kind)]: clamped };
    setVolumesState(volumesRef.current);
    AsyncStorage.setItem(VOLUMES_KEY, JSON.stringify(volumesRef.current)).catch(() => {});
    applyVolume(identity);
  }

  // ---------- moderação (o servidor confere a permissão de novo) ----------
  const moderation = {
    kick: (userId) => publish("kick", { targetUserId: userId }),
    move: (userId, toChannelId) => publish("move", { targetUserId: userId, toChannelId }),
    forceMute: (userId, muted) => publish("force-mute", { targetUserId: userId, muted }),
    forceDeafen: (userId, deaf) => publish("force-deafen", { targetUserId: userId, deafened: deaf }),
  };

  async function handleControl(event) {
    if (!event || String(event.targetUserId) !== String(userRef.current?.id)) return;
    if (event.type === "KICK") {
      await leave();
      Alert.alert("Call", "Você foi removido da call.");
    } else if (event.type === "MOVE") {
      const target = { id: event.toChannelId, name: event.toChannelName, serverId: channelRef.current?.serverId };
      await leave({ silent: true });
      join(target);
    } else if (event.type === "FORCE_MUTE" || event.type === "FORCE_DEAFEN") {
      const forced = event.type === "FORCE_MUTE" ? event.muted : event.deafened;
      forceMutedRef.current = !!forced;
      const room = roomRef.current;
      if (forced && room && micRef.current) {
        await room.localParticipant.setMicrophoneEnabled(false).catch(() => {});
        setMic(false);
      }
      if (event.type === "FORCE_DEAFEN") {
        setDeaf(!!forced);
        applySubscriptions();
      }
      refresh();
    }
  }
  const handleControlRef = useRef(handleControl);
  handleControlRef.current = handleControl;

  const join = useCallback(
    async (target) => {
      if (!target) return;
      if (channelRef.current?.id === target.id && roomRef.current) return;
      if (roomRef.current) await leave({ silent: true });
      const seq = ++joinSeqRef.current;
      setConnecting(true);
      try {
        const { data } = await api.post(`/api/channels/${target.id}/voice-token`);
        if (seq !== joinSeqRef.current) return;

        await AudioSession.startAudioSession();
        // Duas conexões (envio e recebimento separados), igual ao site. A conexão única padrão das
        // versões novas quebrava o microfone no iPhone quando alguém estava em live.
        const room = new Room({ adaptiveStream: false, dynacast: false, singlePeerConnection: false });
        roomRef.current = room;
        channelRef.current = target;
        watchingRef.current = new Set();
        setChannel(target);

        if (target.serverId) {
          api
            .get(`/api/servers/${target.serverId}/me/permissions`)
            .then(({ data: perms }) => seq === joinSeqRef.current && setPermissions(Array.isArray(perms) ? perms : []))
            .catch(() => {});
        }

        const update = () => refresh();
        room
          .on(RoomEvent.ParticipantConnected, (p) => {
            if (!isSoundboardBot(p.identity)) playSound("join");
            update();
          })
          .on(RoomEvent.ParticipantDisconnected, (p) => {
            if (watchingRef.current.delete(p.identity)) publishWatching();
            if (!isSoundboardBot(p.identity)) playSound("leave");
            update();
          })
          .on(RoomEvent.ActiveSpeakersChanged, update)
          .on(RoomEvent.TrackMuted, update)
          .on(RoomEvent.TrackUnmuted, update)
          .on(RoomEvent.LocalTrackPublished, update)
          .on(RoomEvent.LocalTrackUnpublished, update)
          .on(RoomEvent.TrackPublished, (pub, participant) => {
            pub.setSubscribed(wants(pub, participant.identity));
            if (pub.source === Track.Source.ScreenShare || isAudioOnlyShare(pub)) playSound("liveStart");
            update();
          })
          .on(RoomEvent.TrackSubscribed, (track, pub, participant) => {
            if (track.kind === Track.Kind.Audio) applyVolume(participant.identity);
            update();
          })
          .on(RoomEvent.TrackUnsubscribed, update)
          .on(RoomEvent.TrackUnpublished, (pub, participant) => {
            if (pub.source === Track.Source.ScreenShare || isAudioOnlyShare(pub)) playSound("liveStop");
            if (pub.source === Track.Source.ScreenShare && watchingRef.current.delete(participant.identity)) publishWatching();
            update();
          })
          .on(RoomEvent.Disconnected, (reason) => {
            if (roomRef.current !== room) return;
            if (reason === DisconnectReason.DUPLICATE_IDENTITY) {
              leave({ skipPresenceLeave: true });
              Alert.alert("Call", "Você entrou nessa call em outro aparelho - aqui ela foi encerrada.");
            } else if (reason === DisconnectReason.PARTICIPANT_REMOVED) {
              leave({ skipPresenceLeave: true });
              Alert.alert("Call", "Você foi removido dessa call.");
            } else {
              leave();
            }
          });

        await room.connect(data.wsUrl, data.token, { autoSubscribe: false });
        if (seq !== joinSeqRef.current) {
          room.removeAllListeners();
          room.disconnect().catch(() => {});
          return;
        }
        applySubscriptions();
        playSound("join");

        // presença (aparece na lista lateral dos outros) + comandos de moderação
        const client = createChatClient(getToken());
        stompRef.current = client;
        client.onConnect = () => {
          client.subscribe(`/topic/channel.${target.id}.voice`, (frame) => {
            try {
              const list = JSON.parse(frame.body);
              presenceRef.current = new Map(list.map((p) => [String(p.userId), p]));
              refresh();
            } catch {
              // ignora
            }
          });
          client.publish({ destination: `/app/channel.${target.id}.voice.join`, body: "{}" });
          client.subscribe(`/topic/channel.${target.id}.voice.control`, (frame) => {
            try {
              handleControlRef.current(JSON.parse(frame.body));
            } catch {
              // ignora evento quebrado
            }
          });
          client.publish({ destination: `/app/channel.${target.id}.voice.mic`, body: JSON.stringify({ micEnabled: micRef.current }) });
          client.publish({ destination: `/app/channel.${target.id}.voice.deafen`, body: JSON.stringify({ deafened: deafRef.current }) });
        };
        client.activate();

        forceMutedRef.current = !!(data.forceMuted || data.forceDeafened);
        if (data.forceDeafened) {
          setDeaf(true);
          applySubscriptions();
        }
        if (!forceMutedRef.current) {
          try {
            await room.localParticipant.setMicrophoneEnabled(true);
            setMic(true);
          } catch (err) {
            setMic(false);
            Alert.alert("Microfone", "Conectado, mas sem acesso ao microfone: " + (err?.message || err));
          }
        }
        refresh();
      } catch (err) {
        if (seq === joinSeqRef.current) {
          await leave({ silent: true });
          Alert.alert("Call", err?.response?.data?.error || "Não foi possível entrar na call agora.");
        }
      } finally {
        if (seq === joinSeqRef.current) setConnecting(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [leave, refresh, wants, applySubscriptions]
  );

  // saiu da conta: sai da call
  useEffect(() => {
    if (!user && roomRef.current) leave({ silent: true });
  }, [user, leave]);

  const localCamera = useMemo(() => {
    const room = roomRef.current;
    const pub = room?.localParticipant.getTrackPublication(Track.Source.Camera);
    return cameraOn && pub?.track ? { participant: room.localParticipant, publication: pub } : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraOn, participants]);

  const value = {
    channel,
    connecting,
    participants,
    streams,
    audioShares,
    toggleListenAudio,
    soundboardVolume: typeof volumes.soundboardbot === "number" ? volumes.soundboardbot : 100,
    setSoundboardVolume,
    micEnabled,
    deafened,
    cameraOn,
    facing,
    localCamera,
    volumes,
    permissions,
    join,
    leave,
    toggleMic,
    toggleDeafen,
    toggleCamera,
    switchCamera,
    toggleWatch,
    setVolume,
    getVolume: volumeOf,
    moderation,
  };

  return <VoiceContext.Provider value={value}>{children}</VoiceContext.Provider>;
}

export function useVoice() {
  return useContext(VoiceContext);
}
