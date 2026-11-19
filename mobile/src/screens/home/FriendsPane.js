import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import api from "../../api";
import { useAppTheme } from "../../theme/ThemeContext";

export default function FriendsPane({ navigation }) {
  const colors = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [friends, setFriends] = useState(null);
  const [requests, setRequests] = useState({ incoming: [], outgoing: [] });
  const [refreshing, setRefreshing] = useState(false);
  const [username, setUsername] = useState("");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    try {
      const [friendsRes, requestsRes] = await Promise.all([
        api.get("/api/friends"),
        api.get("/api/friends/requests"),
      ]);
      setFriends(friendsRes.data);
      setRequests(requestsRes.data);
    } catch {
      setFriends((prev) => prev || []);
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

  async function sendRequest() {
    const name = username.trim();
    if (!name) return;
    setSending(true);
    setMessage("");
    try {
      await api.post("/api/friends/requests", { username: name });
      setUsername("");
      setMessage("Pedido enviado!");
      load();
    } catch (err) {
      setMessage(err.response?.data?.error || "Não foi possível enviar o pedido.");
    } finally {
      setSending(false);
    }
  }

  async function respond(userId, accept) {
    try {
      await api.post(`/api/friends/requests/${userId}/${accept ? "accept" : "decline"}`);
      load();
    } catch {
      // ignora - lista recarrega do mesmo jeito no próximo foco
    }
  }

  function openDm(friend) {
    if (!friend.dmChannelId) return;
    navigation.navigate("Chat", { dm: true, channel: { id: friend.dmChannelId, name: friend.nickname || friend.username } });
  }

  if (!friends) {
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
      data={friends}
      keyExtractor={(item) => String(item.userId)}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.accent} />}
      ListHeaderComponent={
        <>
          <Text style={styles.title}>Amigos</Text>
          <View style={styles.addCard}>
            <TextInput
              style={styles.input}
              placeholder="Adicionar por nome de usuário"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              value={username}
              onChangeText={setUsername}
              onSubmitEditing={sendRequest}
            />
            <Pressable style={[styles.sendButton, sending && { opacity: 0.6 }]} onPress={sendRequest} disabled={sending}>
              <Text style={styles.sendButtonText}>Enviar</Text>
            </Pressable>
          </View>
          {message ? <Text style={styles.message}>{message}</Text> : null}

          {requests.incoming.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>PEDIDOS RECEBIDOS</Text>
              {requests.incoming.map((r) => (
                <View key={r.userId} style={styles.requestRow}>
                  <Text style={styles.name} numberOfLines={1}>
                    {r.nickname || r.username}
                  </Text>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <Pressable style={styles.acceptButton} onPress={() => respond(r.userId, true)}>
                      <Text style={styles.acceptText}>Aceitar</Text>
                    </Pressable>
                    <Pressable style={styles.declineButton} onPress={() => respond(r.userId, false)}>
                      <Text style={styles.declineText}>Recusar</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </>
          )}

          <Text style={styles.sectionLabel}>SEUS AMIGOS · {friends.length}</Text>
        </>
      }
      ListEmptyComponent={<Text style={styles.empty}>Você ainda não tem amigos adicionados.</Text>}
      renderItem={({ item }) => (
        <Pressable style={styles.row} onPress={() => openDm(item)}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{(item.nickname || item.username || "?").slice(0, 1).toUpperCase()}</Text>
          </View>
          <Text style={styles.name} numberOfLines={1}>
            {item.nickname || item.username}
          </Text>
          {item.status && item.status !== "OFFLINE" && <View style={styles.dot} />}
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
    addCard: { flexDirection: "row", gap: 8 },
    input: {
      flex: 1,
      backgroundColor: colors.surface2,
      color: colors.text,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderWidth: 1,
      borderColor: colors.line,
    },
    sendButton: { backgroundColor: colors.accent, borderRadius: 12, paddingHorizontal: 16, justifyContent: "center" },
    sendButtonText: { color: colors.onAccent, fontWeight: "700" },
    message: { color: colors.textMuted, marginTop: 8 },
    sectionLabel: { color: colors.textMuted, fontSize: 12, fontWeight: "700", marginTop: 18, marginBottom: 8 },
    requestRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 10,
      marginBottom: 6,
      borderWidth: 1,
      borderColor: colors.line,
    },
    acceptButton: { backgroundColor: colors.success, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
    acceptText: { color: "#07241c", fontWeight: "700", fontSize: 12 },
    declineButton: { backgroundColor: colors.surface2, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
    declineText: { color: colors.textMuted, fontWeight: "700", fontSize: 12 },
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
    avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.accent, justifyContent: "center", alignItems: "center" },
    avatarText: { color: colors.onAccent, fontWeight: "700" },
    name: { color: colors.text, fontSize: 15, fontWeight: "600", flex: 1 },
    dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.success },
    empty: { color: colors.textMuted, textAlign: "center", marginTop: 20 },
  });
}
