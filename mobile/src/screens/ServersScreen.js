import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import api from "../api";
import { colors } from "../theme";

export default function ServersScreen({ navigation }) {
  const [servers, setServers] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/api/servers");
      setServers(data);
      setError("");
    } catch {
      setError("Não foi possível carregar os servidores.");
      setServers((prev) => prev || []);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  if (!servers) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.list}
      data={servers}
      keyExtractor={(item) => String(item.id)}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.accent} />}
      ListEmptyComponent={<Text style={styles.empty}>{error || "Você não está em nenhum servidor."}</Text>}
      renderItem={({ item }) => (
        <Pressable style={styles.row} onPress={() => navigation.navigate("Channels", { server: item })}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{item.name.slice(0, 1).toUpperCase()}</Text>
          </View>
          <View style={styles.rowInfo}>
            <Text style={styles.name}>{item.name}</Text>
            {item.description ? (
              <Text style={styles.desc} numberOfLines={1}>
                {item.description}
              </Text>
            ) : null}
          </View>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: colors.bg, justifyContent: "center", alignItems: "center" },
  list: { backgroundColor: colors.bg },
  empty: { color: colors.muted, textAlign: "center", marginTop: 40, paddingHorizontal: 20 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.panel,
  },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.accent, justifyContent: "center", alignItems: "center" },
  avatarText: { color: "#fff", fontWeight: "700", fontSize: 18 },
  rowInfo: { flex: 1 },
  name: { color: colors.text, fontSize: 16, fontWeight: "600" },
  desc: { color: colors.muted, marginTop: 2 },
});
