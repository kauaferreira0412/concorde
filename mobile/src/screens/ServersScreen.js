import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, View } from "react-native";
import { Image } from "expo-image";
import api from "../api";
import { useTokens } from "../theme/ThemeContext";
import { Screen, Sticker, Txt } from "../ui/kit";
import Icon from "../ui/icons";
import TopBar from "../ui/TopBar";
import { Enter, stagger } from "../ui/anim";
import { useLayout } from "../ui/layout";

function sortByUserOrder(servers, order) {
  if (!Array.isArray(order) || order.length === 0) return servers;
  const pos = new Map(order.map((id, i) => [id, i]));
  return [...servers].sort((a, b) => (pos.get(a.id) ?? 1e9) - (pos.get(b.id) ?? 1e9));
}

function ServerTile({ server, onPress }) {
  const t = useTokens();
  const [pressed, setPressed] = useState(false);
  return (
    <Pressable style={{ flex: 1 }} onPress={onPress} onPressIn={() => setPressed(true)} onPressOut={() => setPressed(false)}>
      <Sticker radius={20} shadow={4} pressed={pressed}>
        <View style={{ padding: 14, alignItems: "center", gap: 10 }}>
          {server.iconUrl ? (
            <Image cachePolicy="memory-disk" transition={120} recyclingKey={server.iconUrl} source={{ uri: server.iconUrl }} style={{ width: 64, height: 64, borderRadius: 20, borderWidth: 2.5, borderColor: t.ink }} />
          ) : (
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 20,
                borderWidth: 2.5,
                borderColor: t.ink,
                backgroundColor: t.accent,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Txt weight="display" size={22} color={t.onAccent}>
                {server.name.slice(0, 2).toUpperCase()}
              </Txt>
            </View>
          )}
          <Txt weight={900} size={14} numberOfLines={1} style={{ textAlign: "center" }}>
            {server.name}
          </Txt>
        </View>
      </Sticker>
    </Pressable>
  );
}

export default function ServersScreen({ navigation, user }) {
  const t = useTokens();
  const [servers, setServers] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const layout = useLayout();
  const cols = layout.wide ? layout.columns(190, 6) : 2;

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/api/servers");
      setServers(sortByUserOrder(data, user?.serverOrder));
      setError("");
    } catch {
      setError("Não foi possível carregar os servidores.");
      setServers((prev) => prev || []);
    }
  }, [user?.serverOrder]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  return (
    <Screen>
      <TopBar
        title="SERVIDORES"
        subtitle={servers ? `${servers.length} servidor${servers.length === 1 ? "" : "es"}` : " "}
      />
      {!servers ? (
        <ActivityIndicator color={t.text} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={servers}
          key={`cols-${cols}`}
          numColumns={cols}
          keyExtractor={(item) => String(item.id)}
          columnWrapperStyle={{ gap: 12 }}
          contentContainerStyle={{ padding: 14, gap: 12, paddingBottom: 120 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={t.text} />}
          ListEmptyComponent={
            <Sticker style={{ margin: 6 }}>
              <View style={{ padding: 18, alignItems: "center", gap: 8 }}>
                <Icon name="user" size={28} color={t.textMuted} />
                <Txt weight={800} color={t.textMuted} style={{ textAlign: "center" }}>
                  {error || "Você não está em nenhum servidor ainda."}
                </Txt>
              </View>
            </Sticker>
          }
          renderItem={({ item, index }) => (
            <>
              <Enter kind="pop" delay={stagger(index)} style={{ flex: 1 }}>
                <ServerTile server={item} onPress={() => navigation.navigate("Channels", { server: item })} />
              </Enter>
              {index === servers.length - 1
                ? Array.from({ length: (cols - (servers.length % cols)) % cols }, (_, i) => <View key={`f${i}`} style={{ flex: 1 }} />)
                : null}
            </>
          )}
        />
      )}
    </Screen>
  );
}
