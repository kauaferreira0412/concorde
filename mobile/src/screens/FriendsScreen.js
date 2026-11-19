import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import api, { getToken } from "../api";
import { createChatClient } from "../socket";
import { useTokens } from "../theme/ThemeContext";
import { Avatar, Btn, Field, IconBtn, Screen, SectionTitle, Sticker, Txt } from "../ui/kit";
import Icon from "../ui/icons";
import TopBar from "../ui/TopBar";
import { AvatarWithStatus } from "./DmsScreen";

const STATUS = { ONLINE: "Online", AWAY: "Ausente", DND: "Não perturbe", OFFLINE: "Offline" };

export function openDm(navigation, f) {
  navigation.navigate("DmChat", {
    channelId: f.dmChannelId,
    otherUserId: f.userId,
    otherUsername: f.username,
    otherNickname: f.nickname,
    otherAvatarUrl: f.avatarUrl,
    otherStatus: f.status,
  });
}

export default function FriendsScreen({ navigation, onFriendsChanged }) {
  const t = useTokens();
  const [tab, setTab] = useState("online");
  const [friends, setFriends] = useState(null);
  const [requests, setRequests] = useState({ incoming: [], outgoing: [] });
  const [username, setUsername] = useState("");
  const [addMsg, setAddMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [f, r] = await Promise.all([api.get("/api/friends"), api.get("/api/friends/requests")]);
      setFriends(f.data);
      setRequests(r.data);
    } catch {
      setFriends((prev) => prev || []);
    }
    onFriendsChanged?.();
  }, [onFriendsChanged]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // pedidos e mudanças chegam ao vivo
  useEffect(() => {
    const client = createChatClient(getToken());
    client.onConnect = () => client.subscribe("/user/queue/friends", () => load());
    client.activate();
    return () => client.deactivate();
  }, [load]);

  async function act(fn) {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      await load();
    } catch (err) {
      Alert.alert("Amigos", err.response?.data?.error || "Não deu pra fazer isso agora.");
    } finally {
      setBusy(false);
    }
  }

  async function sendRequest() {
    const name = username.trim().replace(/^@/, "");
    if (!name) return;
    setAddMsg(null);
    setBusy(true);
    try {
      await api.post("/api/friends/requests", { username: name });
      setUsername("");
      setAddMsg({ ok: true, text: `Pedido enviado pra @${name}!` });
      await load();
    } catch (err) {
      setAddMsg({ ok: false, text: err.response?.data?.error || "Não deu pra enviar o pedido." });
    } finally {
      setBusy(false);
    }
  }

  const pendingCount = requests.incoming.length + requests.outgoing.length;
  const tabs = [
    ["online", "Online"],
    ["all", "Todos"],
    ["pending", pendingCount ? `Pendentes (${pendingCount})` : "Pendentes"],
    ["add", "Adicionar"],
  ];

  const list =
    tab === "online" ? (friends || []).filter((f) => f.status && f.status !== "OFFLINE") : tab === "all" ? friends || [] : [];

  function FriendRow({ f }) {
    return (
      <Pressable onPress={() => navigation.navigate("Profile", { userId: f.userId })}>
        <Sticker radius={18} shadow={3}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 12 }}>
            <AvatarWithStatus name={f.username} url={f.avatarUrl} status={f.status} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt weight={900} size={16} numberOfLines={1}>
                {f.nickname || f.username}
              </Txt>
              <Txt weight={700} size={12} color={t.textMuted}>
                {STATUS[f.status] || "Offline"}
              </Txt>
            </View>
            {f.dmChannelId ? <IconBtn icon="message" size={40} tone="surface2" label="Enviar mensagem" onPress={() => openDm(navigation, f)} /> : null}
            <IconBtn
              icon="x"
              size={40}
              tone="surface2"
              label="Remover amigo"
              onPress={() =>
                Alert.alert("Remover amigo", `Desfazer a amizade com ${f.nickname || f.username}?`, [
                  { text: "Cancelar", style: "cancel" },
                  { text: "Remover", style: "destructive", onPress: () => act(() => api.delete(`/api/friends/${f.userId}`)) },
                ])
              }
            />
          </View>
        </Sticker>
      </Pressable>
    );
  }

  function RequestRow({ r, incoming }) {
    return (
      <Sticker radius={18} shadow={3}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 12 }}>
          <Avatar name={r.username} url={r.avatarUrl} size={46} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt weight={900} size={16} numberOfLines={1}>
              {r.nickname || r.username}
            </Txt>
            <Txt weight={700} size={12} color={t.textMuted}>
              {incoming ? "quer ser seu amigo" : "pedido enviado"}
            </Txt>
          </View>
          {incoming ? (
            <>
              <IconBtn icon="check" size={40} tone="mint" label="Aceitar" onPress={() => act(() => api.post(`/api/friends/requests/${r.userId}/accept`))} />
              <IconBtn icon="x" size={40} tone="surface2" label="Recusar" onPress={() => act(() => api.post(`/api/friends/requests/${r.userId}/decline`))} />
            </>
          ) : (
            <IconBtn icon="x" size={40} tone="surface2" label="Cancelar pedido" onPress={() => act(() => api.post(`/api/friends/requests/${r.userId}/decline`))} />
          )}
        </View>
      </Sticker>
    );
  }

  return (
    <Screen>
      <TopBar title="AMIGOS" subtitle={friends ? `${friends.length} amigo${friends.length === 1 ? "" : "s"}` : " "} />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 14, paddingTop: 12 }}>
        {tabs.map(([id, label]) => (
          <Pressable
            key={id}
            onPress={() => setTab(id)}
            style={{
              borderWidth: 2.5,
              borderColor: t.ink,
              borderRadius: 999,
              paddingHorizontal: 12,
              paddingVertical: 6,
              backgroundColor: tab === id ? (id === "add" ? t.mint : t.accent) : t.surface,
            }}
          >
            <Txt weight={900} size={13} color={tab === id ? (id === "add" ? t.onPop : t.onAccent) : t.text}>
              {label}
            </Txt>
          </Pressable>
        ))}
      </View>

      {friends === null ? (
        <ActivityIndicator color={t.text} style={{ marginTop: 40 }} />
      ) : tab === "add" ? (
        <View style={{ padding: 14 }}>
          <Sticker radius={20} shadow={4}>
            <View style={{ padding: 16, gap: 10 }}>
              <Txt weight="display" size={16}>
                ADICIONAR AMIGO
              </Txt>
              <Txt weight={700} color={t.textMuted}>
                Digite o nome de usuário da pessoa.
              </Txt>
              <Field value={username} onChangeText={setUsername} placeholder="nome de usuário" autoCapitalize="none" autoCorrect={false} onSubmitEditing={sendRequest} />
              <Btn label="Enviar pedido" icon="plus" onPress={sendRequest} disabled={!username.trim() || busy} />
              {addMsg ? (
                <Txt weight={800} color={addMsg.ok ? t.mintText : t.danger}>
                  {addMsg.text}
                </Txt>
              ) : null}
            </View>
          </Sticker>
        </View>
      ) : tab === "pending" ? (
        <FlatList
          data={[...requests.incoming.map((r) => ({ ...r, incoming: true })), ...requests.outgoing.map((r) => ({ ...r, incoming: false }))]}
          keyExtractor={(r) => `${r.incoming ? "in" : "out"}-${r.userId}`}
          contentContainerStyle={{ padding: 14, gap: 10, paddingBottom: 110 }}
          ListHeaderComponent={requests.incoming.length ? <SectionTitle>Recebidos e enviados</SectionTitle> : null}
          ListEmptyComponent={
            <Txt weight={800} color={t.textMuted} style={{ textAlign: "center", marginTop: 20 }}>
              Nenhum pedido pendente.
            </Txt>
          }
          renderItem={({ item }) => <RequestRow r={item} incoming={item.incoming} />}
        />
      ) : (
        <FlatList
          data={list}
          keyExtractor={(f) => String(f.userId)}
          contentContainerStyle={{ padding: 14, gap: 10, paddingBottom: 110 }}
          ListEmptyComponent={
            <Sticker>
              <View style={{ padding: 18, alignItems: "center", gap: 8 }}>
                <Icon name="users" size={28} color={t.textMuted} />
                <Txt weight={800} color={t.textMuted} style={{ textAlign: "center" }}>
                  {tab === "online" ? "Nenhum amigo online agora." : "Você ainda não tem amigos aqui. Toque em Adicionar!"}
                </Txt>
              </View>
            </Sticker>
          }
          renderItem={({ item }) => <FriendRow f={item} />}
        />
      )}
    </Screen>
  );
}
