import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import api from "../../api";
import { useAppTheme } from "../../theme/ThemeContext";

export default function MessagesPane({ navigation }) {
  const colors = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [channels, setChannels] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/api/dm/channels");
      setChannels(data);
    } catch {
      setChannels((prev) => prev || []);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  if (!channels) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.listContent}
      data={channels}
      keyExtractor={(item) => String(item.channelId)}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.accent} />}
      ListHeaderComponent={<Text style={styles.title}>Mensagens</Text>}
      ListEmptyComponent={<Text style={styles.empty}>Nenhuma conversa ainda.</Text>}
      renderItem={({ item }) => (
        <Pressable
          style={styles.row}
          onPress={() =>
            navigation.navigate("Chat", {
              dm: true,
              channel: { id: item.channelId, name: item.otherNickname || item.otherUsername },
            })
          }
        >
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{(item.otherNickname || item.otherUsername || "?").slice(0, 1).toUpperCase()}</Text>
          </View>
          <View style={styles.rowInfo}>
            <Text style={styles.name} numberOfLines={1}>
              {item.otherNickname || item.otherUsername}
            </Text>
            {item.lastMessage ? (
              <Text style={styles.preview} numberOfLines={1}>
                {item.lastMessage.content || (item.lastMessage.fileName ? `📎 ${item.lastMessage.fileName}` : "")}
              </Text>
            ) : null}
          </View>
          {item.otherStatus && item.otherStatus !== "OFFLINE" && <View style={styles.dot} />}
        </Pressable>
      )}
    />
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    center: { flex: 1, backgroundColor: colors.bg, justifyContent: "center", alignItems: "center" },
    list: { backgroundColor: colors.bg },
    listContent: { padding: 14, paddingBottom: 100 },
    title: { color: colors.text, fontSize: 24, fontWeight: "800", marginBottom: 14 },
    empty: { color: colors.textMuted, textAlign: "center", marginTop: 40 },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 12,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: colors.line,
    },
    avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.accent, justifyContent: "center", alignItems: "center" },
    avatarText: { color: colors.onAccent, fontWeight: "700", fontSize: 18 },
    rowInfo: { flex: 1 },
    name: { color: colors.text, fontSize: 16, fontWeight: "700" },
    preview: { color: colors.textMuted, marginTop: 2, fontSize: 13 },
    dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.success },
  });
}
