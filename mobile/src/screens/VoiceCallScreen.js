import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import {
  AudioSession,
  LiveKitRoom,
  useLocalParticipant,
  useRemoteParticipants,
  useConnectionState,
  useIsSpeaking,
  useTrackVolume,
} from "@livekit/react-native";
import { ConnectionState, Track } from "livekit-client";
import api from "../api";
import { useAppTheme } from "../theme/ThemeContext";

export default function VoiceCallScreen({ route, navigation }) {
  const { channel, server } = route.params;
  const colors = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [session, setSession] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    AudioSession.startAudioSession();
    return () => {
      AudioSession.stopAudioSession();
    };
  }, []);

  useEffect(() => {
    let active = true;
    api
      .post(`/api/channels/${channel.id}/voice-token`)
      .then(({ data }) => {
        if (active) setSession(data);
      })
      .catch(() => {
        if (active) setError("Não foi possível entrar no canal de voz.");
      });
    return () => {
      active = false;
    };
  }, [channel.id]);

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error}</Text>
        <Pressable style={styles.leaveButton} onPress={() => navigation.goBack()}>
          <Text style={styles.leaveText}>Voltar</Text>
        </Pressable>
      </View>
    );
  }

  if (!session) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <LiveKitRoom
      serverUrl={session.wsUrl}
      token={session.token}
      connect={true}
      audio={true}
      video={false}
      onDisconnected={() => navigation.goBack()}
    >
      <CallView channel={channel} server={server} colors={colors} styles={styles} onLeave={() => navigation.goBack()} />
    </LiveKitRoom>
  );
}

function CallView({ channel, server, colors, styles, onLeave }) {
  const connectionState = useConnectionState();
  const remoteParticipants = useRemoteParticipants();
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant();
  const [deafened, setDeafened] = useState(false);

  const connecting = connectionState === ConnectionState.Connecting || connectionState === ConnectionState.Reconnecting;
  const micTrack = localParticipant?.getTrackPublication(Track.Source.Microphone)?.track;
  const micLevel = useTrackVolume(micTrack);

  function toggleDeafen() {
    const next = !deafened;
    setDeafened(next);
    remoteParticipants.forEach((p) => {
      p.audioTrackPublications.forEach((pub) => {
        try {
          pub.setEnabled?.(!next);
        } catch {
          // participante pode não suportar - ignora
        }
      });
    });
    if (next) localParticipant.setMicrophoneEnabled(false);
  }

  const allTiles = [{ local: true, participant: localParticipant }, ...remoteParticipants.map((p) => ({ local: false, participant: p }))];

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={onLeave} style={styles.backButton}>
          <Text style={styles.backIcon}>‹</Text>
        </Pressable>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            🔊 {channel.name}
          </Text>
          <Text style={styles.headerSub}>
            {server?.name ? `${server.name} · ` : ""}
            {connecting ? "Conectando…" : `${remoteParticipants.length + 1} na call`}
          </Text>
        </View>
        {!connecting && (
          <View style={styles.onCallBadge}>
            <Text style={styles.onCallBadgeText}>NA CALL</Text>
          </View>
        )}
      </View>

      <FlatList
        data={allTiles}
        keyExtractor={(item) => (item.local ? "local" : item.participant.identity)}
        numColumns={2}
        contentContainerStyle={styles.grid}
        columnWrapperStyle={styles.gridRow}
        ListFooterComponent={
          <View style={styles.shareTile}>
            <Text style={styles.shareIcon}>🖥️</Text>
            <Text style={styles.shareTitle}>COMPARTILHAR TELA</Text>
            <Text style={styles.shareSub}>Não disponível no app mobile</Text>
          </View>
        }
        renderItem={({ item }) =>
          item.local ? (
            <ParticipantTile
              name="Você"
              isLocal
              muted={!isMicrophoneEnabled}
              speaking={false}
              styles={styles}
              colors={colors}
            />
          ) : (
            <RemoteTile participant={item.participant} styles={styles} colors={colors} />
          )
        }
      />

      <View style={styles.micLevelCard}>
        <Text style={styles.micLevelLabel}>SEU MIC</Text>
        <View style={styles.micLevelTrack}>
          <View style={[styles.micLevelFill, { width: `${Math.min(100, Math.round(micLevel * 100))}%` }]} />
        </View>
      </View>

      <Soundboard channelId={channel.id} colors={colors} styles={styles} />

      <View style={styles.controls}>
        <Pressable
          style={[styles.controlButton, !isMicrophoneEnabled && styles.controlButtonActive]}
          onPress={() => localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled)}
        >
          <Text style={styles.controlIcon}>{isMicrophoneEnabled ? "🎙️" : "🔇"}</Text>
        </Pressable>
        <Pressable style={[styles.controlButton, deafened && styles.controlButtonActive]} onPress={toggleDeafen}>
          <Text style={styles.controlIcon}>{deafened ? "🔕" : "🎧"}</Text>
        </Pressable>
        <Pressable style={[styles.controlButton, styles.leaveControl]} onPress={onLeave}>
          <Text style={styles.controlIcon}>📞</Text>
        </Pressable>
      </View>
    </View>
  );
}

function RemoteTile({ participant, styles, colors }) {
  const speaking = useIsSpeaking(participant);
  const micPub = participant.getTrackPublication(Track.Source.Microphone);
  const muted = !micPub || micPub.isMuted;
  return <ParticipantTile name={participant.name || participant.identity} speaking={speaking} muted={muted} styles={styles} colors={colors} />;
}

function ParticipantTile({ name, speaking, muted, isLocal, styles }) {
  return (
    <View style={[styles.tile, speaking && styles.tileSpeaking]}>
      <View style={[styles.tileAvatar, speaking && styles.tileAvatarSpeaking]}>
        <Text style={styles.tileAvatarLetter}>{name.charAt(0).toUpperCase()}</Text>
      </View>
      <Text style={styles.tileName} numberOfLines={1}>
        {name}
        {isLocal ? " (você)" : ""}
      </Text>
      {speaking ? (
        <View style={styles.tileWave}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={styles.tileWaveBar} />
          ))}
        </View>
      ) : (
        muted && <Text style={styles.tileMuted}>🔇</Text>
      )}
    </View>
  );
}

function Soundboard({ channelId, colors, styles }) {
  const [clips, setClips] = useState(null);
  const [playingId, setPlayingId] = useState(null);

  useEffect(() => {
    let active = true;
    api
      .get("/api/soundboard")
      .then(({ data }) => {
        if (active) setClips(data);
      })
      .catch(() => {
        if (active) setClips([]);
      });
    return () => {
      active = false;
    };
  }, []);

  async function play(clip) {
    setPlayingId(clip.id);
    try {
      await api.post(`/api/channels/${channelId}/soundboard/play/${clip.id}`);
    } catch {
      // som não tocou - o usuário só não vê o destaque de "tocando"
    } finally {
      setTimeout(() => setPlayingId(null), 400);
    }
  }

  const list = clips || [];
  if (!list.length) return null;

  return (
    <View style={styles.soundboard}>
      <Text style={styles.soundboardLabel}>SOUNDBOARD · {list.length}</Text>
      <FlatList
        data={list}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(c) => String(c.id)}
        contentContainerStyle={{ gap: 8 }}
        renderItem={({ item }) => (
          <Pressable
            style={[styles.soundTile, playingId === item.id && { borderColor: colors.accent }]}
            onPress={() => play(item)}
          >
            <Text style={styles.soundIcon}>🎵</Text>
            <Text style={styles.soundName} numberOfLines={1}>
              {item.name}
            </Text>
          </Pressable>
        )}
      />
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    center: { flex: 1, backgroundColor: colors.bg, justifyContent: "center", alignItems: "center", gap: 16, padding: 20 },
    error: { color: colors.danger, textAlign: "center" },
    screen: { flex: 1, backgroundColor: colors.bg },
    header: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, paddingTop: 54, backgroundColor: colors.surface },
    backButton: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surface2, justifyContent: "center", alignItems: "center" },
    backIcon: { color: colors.text, fontSize: 20, fontWeight: "700" },
    headerInfo: { flex: 1 },
    headerTitle: { color: colors.text, fontSize: 16, fontWeight: "800" },
    headerSub: { color: colors.textMuted, fontSize: 12, marginTop: 1 },
    onCallBadge: { backgroundColor: colors.orange, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 },
    onCallBadgeText: { color: "#2A1600", fontSize: 10, fontWeight: "800" },
    grid: { padding: 12, gap: 10 },
    gridRow: { gap: 10 },
    tile: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: 18,
      padding: 16,
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      minHeight: 130,
      borderWidth: 2,
      borderColor: "transparent",
    },
    tileSpeaking: { borderColor: colors.accent },
    tileAvatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.surface2, justifyContent: "center", alignItems: "center" },
    tileAvatarSpeaking: { backgroundColor: colors.accent },
    tileAvatarLetter: { color: colors.text, fontSize: 20, fontWeight: "800" },
    tileName: { color: colors.text, fontSize: 13, fontWeight: "600", maxWidth: "100%" },
    tileMuted: { fontSize: 13 },
    tileWave: { flexDirection: "row", gap: 3, height: 14, alignItems: "flex-end" },
    tileWaveBar: { width: 3, height: 10, backgroundColor: colors.accent, borderRadius: 2 },
    shareTile: {
      backgroundColor: colors.surface,
      borderRadius: 18,
      borderWidth: 2,
      borderColor: colors.line,
      borderStyle: "dashed",
      padding: 20,
      alignItems: "center",
      gap: 4,
      marginHorizontal: 0,
    },
    shareIcon: { fontSize: 26 },
    shareTitle: { color: colors.text, fontWeight: "700", fontSize: 12, letterSpacing: 0.5 },
    shareSub: { color: colors.textMuted, fontSize: 11 },
    micLevelCard: { marginHorizontal: 14, marginBottom: 10, gap: 6 },
    micLevelLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "700" },
    micLevelTrack: { height: 8, borderRadius: 4, backgroundColor: colors.surface2, overflow: "hidden" },
    micLevelFill: { height: "100%", backgroundColor: colors.success, borderRadius: 4 },
    soundboard: { marginHorizontal: 14, marginBottom: 10, gap: 8 },
    soundboardLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "700" },
    soundTile: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: colors.line,
      paddingHorizontal: 12,
      paddingVertical: 10,
      alignItems: "center",
      gap: 4,
      minWidth: 80,
    },
    soundIcon: { fontSize: 16 },
    soundName: { color: colors.text, fontSize: 11, maxWidth: 80 },
    controls: { flexDirection: "row", justifyContent: "center", gap: 16, paddingVertical: 16, paddingBottom: 30 },
    controlButton: {
      width: 56,
      height: 56,
      borderRadius: 28,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface2,
    },
    controlButtonActive: { backgroundColor: colors.danger },
    leaveControl: { backgroundColor: colors.danger },
    controlIcon: { fontSize: 24 },
    leaveButton: { backgroundColor: colors.accent, paddingVertical: 10, paddingHorizontal: 20, borderRadius: 10 },
    leaveText: { color: colors.onAccent, fontWeight: "600" },
  });
}
