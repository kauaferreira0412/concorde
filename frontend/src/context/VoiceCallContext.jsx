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

const isElectronDesktop = typeof window !== "undefined" && !!window.concordeDesktop;

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

  function avatarUrlOf(participant) {
    try {
      return participant.metadata ? JSON.parse(participant.metadata)?.avatarUrl || null : null;
    } catch {
      return null;
    }
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
    if (audioPub) {
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
    if (/^(musicbot|soundboardbot)-\d+$/.test(identity || "")) return identity;
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
    return (rawPercent / 100) * (masterVolumeRef.current / 100);
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
        webAudioMix: true,
        audioCaptureDefaults: {
          ...(savedInput ? { deviceId: savedInput } : {}),
          noiseSuppression: false,
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
          if (pub.source === Track.Source.ScreenShareAudio) {
            if (!watchedShareIdentitiesRef.current.has(participant.identity)) {
              pub.setSubscribed(false);
              return;
            }
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
      newRoom.on(RoomEvent.TrackUnpublished, (pub) => {
        if (pub.source === Track.Source.ScreenShare) removeVideoTrack(pub.trackSid);
      });
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
        for (const [sid, entry] of [...videoTracksRef.current.entries()]) {
          if (entry.participantIdentity === participant.identity) videoTracksRef.current.delete(sid);
        }
        syncScreenShares();
        if (cameraTracksRef.current.delete(participant.identity)) syncCameraTracks();
      });
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

  async function applyForceMute(muted) {
    forceMutedRef.current = muted;
    if (roomRef.current && !deafenedRef.current && micEnabledRef.current === muted) {
      await toggleMic();
    }
  }

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
