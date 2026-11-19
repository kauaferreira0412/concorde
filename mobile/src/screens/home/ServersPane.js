import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import api from "../../api";
import { useAppTheme } from "../../theme/ThemeContext";

function initialsOf(name) {
  const words = (name || "?").trim().split(/\s+/);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export default function ServersPane({ navigation }) {
  const colors = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [servers, setServers] = useState(null);
  const [activeServer, setActiveServer] = useState(null);
  const [members, setMembers] = useState([]);
  const [sections, setSections] = useState([]);
  const [voicePresence, setVoicePresence] = useState({});
  const [loadingServer, setLoadingServer] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadServers = useCallback(async () => {
    try {
      const { data } = await api.get("/api/servers");
      setServers(data);
      setActiveServer((prev) => prev || data[0] || null);
    } catch {
      setServers((prev) => prev || []);
    }
  }, []);

  const loadServerDetail = useCallback(async (server) => {
    if (!server) return;
    setLoadingServer(true);
    try {
      const [membersRes, channelsRes, categoriesRes] = await Promise.all([
        api.get(`/api/servers/${server.id}/members`),
        api.get(`/api/servers/${server.id}/channels`),
        api.get(`/api/servers/${server.id}/categories`).catch(() => ({ data: [] })),
      ]);
      setMembers(membersRes.data);
      const channels = channelsRes.data;
      const categories = categoriesRes.data;
      const built = [];
      const loose = channels.filter((c) => !c.categoryId);
      if (loose.length) built.push({ title: "Canais", data: loose });
      categories.forEach((cat) => {
        const items = channels.filter((c) => c.categoryId === cat.id);
        if (items.length) built.push({ title: cat.name, data: items });
      });
      setSections(built);

      const voiceChannels = channels.filter((c) => c.type === "VOICE");
      const presenceEntries = await Promise.all(
        voiceChannels.map((c) =>
          api
            .get(`/api/channels/${c.id}/voice-presence`)
            .then(({ data }) => [c.id, data])
            .catch(() => [c.id, []])
        )
      );
      setVoicePresence(Object.fromEntries(presenceEntries));
    } catch {
      setMembers([]);
      setSections([]);
    } finally {
      setLoadingServer(false);
    }
  }, []);

  useEffect(() => {
    // dispara a carga inicial dos servidores (setState acontece async, dentro do .then)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadServers();
  }, [loadServers]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadServerDetail(activeServer);
  }, [activeServer, loadServerDetail]);

  useFocusEffect(
    useCallback(() => {
      if (activeServer) loadServerDetail(activeServer);
    }, [activeServer, loadServerDetail])
  );

  async function handleRefresh() {
    setRefreshing(true);
    await Promise.all([loadServers(), loadServerDetail(activeServer)]);
    setRefreshing(false);
  }

  function openChannel(channel) {
    const isText = channel.type === "TEXT";
    navigation.navigate(isText ? "Chat" : "VoiceCall", { channel, server: activeServer });
  }

  const onlineMembers = members.filter((m) => m.status && m.status !== "OFFLINE");

  if (!servers) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <ScrollView style={styles.rail} contentContainerStyle={styles.railContent} showsVerticalScrollIndicator={false}>
        {servers.map((server) => {
          const active = activeServer?.id === server.id;
          return (
            <Pressable
              key={server.id}
              style={[styles.railItem, active && styles.railItemActive]}
              onPress={() => setActiveServer(server)}
            >
              <Text style={[styles.railText, active && styles.railTextActive]}>{initialsOf(server.name)}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.main}>
        {!activeServer ? (
          <View style={styles.center}>
            <Text style={styles.emptyText}>Você não está em nenhum servidor.</Text>
          </View>
        ) : (
          <FlatList
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.accent} />}
            ListHeaderComponent={
              <>
                <View style={styles.header}>
                  <Text style={styles.serverName} numberOfLines={1}>
                    {activeServer.name}
                  </Text>
                  <Text style={styles.serverSub}>
                    {members.length} membros · {onlineMembers.length} online
                  </Text>
                </View>

                {onlineMembers.length > 0 && (
                  <View style={styles.onlineCard}>
                    <View style={styles.onlineCardHeader}>
                      <Text style={styles.sectionLabel}>CONECTADOS AGORA</Text>
                      <View style={styles.countBadge}>
                        <Text style={styles.countBadgeText}>{onlineMembers.length}</Text>
                      </View>
                    </View>
                    {onlineMembers.slice(0, 8).map((m) => (
                      <View key={m.userId} style={styles.onlineRow}>
                        <View style={styles.dot} />
                        <Text style={styles.onlineName} numberOfLines={1}>
                          {m.nickname || m.username}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}

                <Text style={[styles.sectionLabel, styles.channelsLabel]}>CANAIS</Text>
                {loadingServer && <ActivityIndicator color={colors.accent} style={{ marginVertical: 10 }} />}
              </>
            }
            data={sections}
            keyExtractor={(s) => s.title}
            renderItem={({ item: section }) => (
              <View>
                {section.title !== "Canais" && <Text style={styles.categoryLabel}>{section.title.toUpperCase()}</Text>}
                {section.data.map((channel) => {
                  const isText = channel.type === "TEXT";
                  const presence = voicePresence[channel.id] || [];
                  return (
                    <View key={channel.id}>
                      <Pressable
                        style={[styles.channelRow, !isText && presence.length > 0 && styles.channelRowActive]}
                        onPress={() => openChannel(channel)}
                      >
                        <Text style={styles.channelIcon}>{isText ? "#" : "🔊"}</Text>
                        <Text style={styles.channelName} numberOfLines={1}>
                          {channel.name}
                        </Text>
                        {!isText && presence.length > 0 && (
                          <View style={styles.connectedBadge}>
                            <Text style={styles.connectedBadgeText}>{presence.length} na call</Text>
                          </View>
                        )}
                      </Pressable>
                      {presence.map((p) => (
                        <View key={p.userId} style={styles.participantRow}>
                          <Text style={styles.participantIcon}>{p.micEnabled ? "🎙️" : "🔇"}</Text>
                          <Text style={styles.participantName} numberOfLines={1}>
                            {p.username}
                          </Text>
                          {p.screenSharing && (
                            <View style={styles.liveBadge}>
                              <Text style={styles.liveBadgeText}>AO VIVO</Text>
                            </View>
                          )}
                        </View>
                      ))}
                    </View>
                  );
                })}
              </View>
            )}
            ListEmptyComponent={
              !loadingServer ? <Text style={styles.emptyText}>Nenhum canal neste servidor.</Text> : null
            }
            contentContainerStyle={styles.mainContent}
          />
        )}
      </View>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    wrap: { flex: 1, flexDirection: "row", backgroundColor: colors.bg },
    center: { flex: 1, justifyContent: "center", alignItems: "center" },
    rail: { width: 68, backgroundColor: colors.surface },
    railContent: { paddingVertical: 12, alignItems: "center", gap: 10 },
    railItem: {
      width: 48,
      height: 48,
      borderRadius: 16,
      backgroundColor: colors.surface2,
      justifyContent: "center",
      alignItems: "center",
      borderWidth: 2,
      borderColor: "transparent",
    },
    railItemActive: { backgroundColor: colors.accent, borderColor: colors.onAccent },
    railText: { color: colors.text, fontWeight: "700", fontSize: 13 },
    railTextActive: { color: colors.onAccent },
    main: { flex: 1, backgroundColor: colors.bg },
    mainContent: { padding: 14, paddingBottom: 100 },
    header: { marginBottom: 14 },
    serverName: { color: colors.text, fontSize: 22, fontWeight: "800" },
    serverSub: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
    onlineCard: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 14,
      marginBottom: 18,
      borderWidth: 1,
      borderColor: colors.line,
      gap: 8,
    },
    onlineCardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    sectionLabel: { color: colors.textMuted, fontSize: 12, fontWeight: "700", letterSpacing: 0.5 },
    channelsLabel: { marginBottom: 8 },
    countBadge: { backgroundColor: colors.success, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
    countBadgeText: { color: colors.onAccent, fontSize: 11, fontWeight: "700" },
    onlineRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
    onlineName: { color: colors.text, fontSize: 14, flex: 1 },
    categoryLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "700", marginTop: 14, marginBottom: 6 },
    channelRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingVertical: 11,
      paddingHorizontal: 12,
      borderRadius: 10,
    },
    channelRowActive: { backgroundColor: colors.accent },
    channelIcon: { color: colors.textMuted, fontSize: 16, width: 22, textAlign: "center" },
    channelName: { color: colors.text, fontSize: 15, flex: 1, fontWeight: "600" },
    connectedBadge: { backgroundColor: colors.onAccent, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
    connectedBadgeText: { color: colors.accent, fontSize: 10, fontWeight: "800" },
    participantRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6, paddingLeft: 40, paddingRight: 12 },
    participantIcon: { fontSize: 13 },
    participantName: { color: colors.textMuted, fontSize: 13, flex: 1 },
    liveBadge: { backgroundColor: colors.danger, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1 },
    liveBadgeText: { color: "#fff", fontSize: 9, fontWeight: "800" },
    emptyText: { color: colors.textMuted, textAlign: "center", marginTop: 30, paddingHorizontal: 20 },
  });
}
