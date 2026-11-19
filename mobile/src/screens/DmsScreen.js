import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import api from "../api";
import { useTokens } from "../theme/ThemeContext";
import { Avatar, Screen, Sticker, Txt } from "../ui/kit";
import Icon from "../ui/icons";
import TopBar from "../ui/TopBar";

const DOT = { ONLINE: "success", AWAY: "orange", DND: "danger" };

export function StatusDot({ status, size = 14 }) {
  const t = useTokens();
  const color = DOT[status] ? t[DOT[status]] : t.textFaint;
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, borderWidth: 2.5, borderColor: t.surface }} />;
}

export function AvatarWithStatus({ name, url, status, size = 46 }) {
  return (
    <View>
      <Avatar name={name} url={url} size={size} />
      <View style={{ position: "absolute", right: -3, bottom: -3 }}>
        <StatusDot status={status} />
      </View>
    </View>
  );
}

function lastLine(m, myId) {
  if (!m) return "Começo da conversa";
  const who = m.authorId === myId ? "Você: " : "";
  if (m.content) return who + m.content;
  if (m.imageUrl) return who + "📷 imagem";
  if (m.fileName) return who + "📎 " + m.fileName;
  if (m.rollNotation) return who + "🎲 " + m.rollNotation;
  return who + "mensagem";
}

function timeAgo(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export default function DmsScreen({ navigation, user }) {
  const t = useTokens();
  const [dms, setDms] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/api/dm/channels");
      const sorted = [...data].sort((a, b) => new Date(b.lastMessage?.createdAt || 0) - new Date(a.lastMessage?.createdAt || 0));
      setDms(sorted);
    } catch {
      setDms((prev) => prev || []);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <Screen>
      <TopBar title="MENSAGENS" subtitle="Conversas diretas" />
      {!dms ? (
        <ActivityIndicator color={t.text} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={dms}
          keyExtractor={(d) => String(d.channelId)}
          contentContainerStyle={{ padding: 14, gap: 10, paddingBottom: 110 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              tintColor={t.text}
              onRefresh={async () => {
                setRefreshing(true);
                await load();
                setRefreshing(false);
              }}
            />
          }
          ListEmptyComponent={
            <Sticker>
              <View style={{ padding: 18, alignItems: "center", gap: 8 }}>
                <Icon name="message" size={28} color={t.textMuted} />
                <Txt weight={800} color={t.textMuted} style={{ textAlign: "center" }}>
                  Nenhuma conversa ainda. Abra o perfil de um amigo e toque em “Enviar mensagem”.
                </Txt>
              </View>
            </Sticker>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() =>
                navigation.navigate("DmChat", {
                  channelId: item.channelId,
                  otherUserId: item.otherUserId,
                  otherUsername: item.otherUsername,
                  otherNickname: item.otherNickname,
                  otherAvatarUrl: item.otherAvatarUrl,
                  otherStatus: item.otherStatus,
                })
              }
            >
              {({ pressed }) => (
                <Sticker radius={18} shadow={3} pressed={pressed}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 12 }}>
                    <AvatarWithStatus name={item.otherUsername} url={item.otherAvatarUrl} status={item.otherStatus} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
                        <Txt weight={900} size={16} numberOfLines={1} style={{ flex: 1 }}>
                          {item.otherNickname || item.otherUsername}
                        </Txt>
                        <Txt weight={700} size={12} color={t.textFaint}>
                          {timeAgo(item.lastMessage?.createdAt)}
                        </Txt>
                      </View>
                      <Txt weight={600} size={13} color={t.textMuted} numberOfLines={1}>
                        {lastLine(item.lastMessage, user?.id)}
                      </Txt>
                    </View>
                  </View>
                </Sticker>
              )}
            </Pressable>
          )}
        />
      )}
    </Screen>
  );
}
