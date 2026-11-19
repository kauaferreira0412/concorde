import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import {
  AudioSession,
  LiveKitRoom,
  useLocalParticipant,
  useRemoteParticipants,
  useConnectionState,
  useIsSpeaking,
} from "@livekit/react-native";
import { ConnectionState, Track } from "livekit-client";
import api from "../api";
import { colors } from "../theme";

export default function VoiceCallScreen({ route, navigation }) {
  const { channel, server } = route.params;
  const [session, setSession] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    navigation.setOptions({ title: `🔊 ${channel.name}` });
  }, [channel.name, navigation]);

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
      <CallView channel={channel} server={server} onLeave={() => navigation.goBack()} />
    </LiveKitRoom>
  );
}

function CallView({ channel, server, onLeave }) {
  const connectionState = useConnectionState();
  const remoteParticipants = useRemoteParticipants();
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant();

  const connecting = connectionState === ConnectionState.Connecting || connectionState === ConnectionState.Reconnecting;

  return (
    <View style={styles.container}>
      <Text style={styles.channelInfo}>
        {server.name} · {connecting ? "Conectando…" : `${remoteParticipants.length + 1} na call`}
      </Text>

      <View style={styles.participantList}>
        <ParticipantRow name="Você" speaking={false} muted={!isMicrophoneEnabled} isLocal />
        {remoteParticipants.map((p) => (
          <RemoteParticipantRow key={p.identity} participant={p} />
        ))}
      </View>

      <View style={styles.controls}>
        <Pressable
          style={[styles.controlButton, !isMicrophoneEnabled && styles.controlButtonActive]}
          onPress={() => localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled)}
        >
          <Text style={styles.controlIcon}>{isMicrophoneEnabled ? "🎙️" : "🔇"}</Text>
          <Text style={styles.controlLabel}>{isMicrophoneEnabled ? "Mutar" : "Mutado"}</Text>
        </Pressable>
        <Pressable style={[styles.controlButton, styles.leaveControl]} onPress={onLeave}>
          <Text style={styles.controlIcon}>📞</Text>
          <Text style={styles.controlLabel}>Sair</Text>
        </Pressable>
      </View>
    </View>
  );
}

function RemoteParticipantRow({ participant }) {
  const speaking = useIsSpeaking(participant);
  const micPub = participant.getTrackPublication(Track.Source.Microphone);
  const muted = !micPub || micPub.isMuted;
  return <ParticipantRow name={participant.name || participant.identity} speaking={speaking} muted={muted} />;
}

function ParticipantRow({ name, speaking, muted, isLocal }) {
  return (
    <View style={styles.participantRow}>
      <View style={[styles.avatar, speaking && styles.avatarSpeaking]}>
        <Text style={styles.avatarLetter}>{name.charAt(0).toUpperCase()}</Text>
      </View>
      <Text style={styles.participantName}>
        {name}
        {isLocal ? " (você)" : ""}
      </Text>
      {muted ? <Text style={styles.mutedIcon}>🔇</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: colors.bg, justifyContent: "center", alignItems: "center", gap: 16, padding: 20 },
  error: { color: colors.danger, textAlign: "center" },
  container: { flex: 1, backgroundColor: colors.bg, padding: 16 },
  channelInfo: { color: colors.muted, fontSize: 13, textAlign: "center", marginBottom: 16 },
  participantList: { flex: 1, gap: 4 },
  participantRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.card,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  avatarSpeaking: { borderColor: colors.accent },
  avatarLetter: { color: colors.text, fontWeight: "700" },
  participantName: { color: colors.text, fontSize: 15, flex: 1 },
  mutedIcon: { fontSize: 14 },
  controls: { flexDirection: "row", justifyContent: "center", gap: 16, paddingVertical: 20 },
  controlButton: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.card,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 24,
    gap: 4,
    minWidth: 96,
  },
  controlButtonActive: { backgroundColor: colors.danger },
  leaveControl: { backgroundColor: colors.danger },
  controlIcon: { fontSize: 22 },
  controlLabel: { color: colors.text, fontSize: 12 },
  leaveButton: { backgroundColor: colors.accent, paddingVertical: 10, paddingHorizontal: 20, borderRadius: 10 },
  leaveText: { color: "#fff", fontWeight: "600" },
});
