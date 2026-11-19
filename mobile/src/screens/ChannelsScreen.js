import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, SectionList, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import api from "../api";
import { useTokens } from "../theme/ThemeContext";
import { useVoice } from "../voice/VoiceContext";
import { Avatar, Screen, SectionTitle, Sticker, Tag, Txt } from "../ui/kit";
import Icon from "../ui/icons";
import TopBar from "../ui/TopBar";
import ChatView from "../chat/ChatView";
import { useLayout } from "../ui/layout";

const PRESENCE_REFRESH_MS = 8000;

function ChannelRow({ item, onPress, connected, people, selected }) {
  const t = useTokens();
  const isText = item.type === "TEXT";
  const isVoice = item.type === "VOICE";
  const enabled = isText || isVoice;
  const [pressed, setPressed] = useState(false);
  const icon = isText ? "hash" : isVoice ? "volume" : "map";
  const active = connected || selected;
  return (
    <View style={{ marginHorizontal: 12, marginBottom: 6 }}>
      <Pressable
        disabled={!enabled}
        onPress={onPress}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        style={{ opacity: enabled ? 1 : 0.5 }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            paddingHorizontal: 12,
            paddingVertical: 11,
            borderRadius: 14,
            borderWidth: 2.5,
            borderColor: active || pressed ? t.ink : "transparent",
            backgroundColor: active ? t.accent : pressed ? t.hover : "transparent",
          }}
        >
          <Icon name={icon} size={18} color={active ? t.onAccent : t.textMuted} />
          <Txt weight={800} size={16} color={active ? t.onAccent : t.text} style={{ flex: 1 }} numberOfLines={1}>
            {item.name}
          </Txt>
          {active ? <Tag label="CONECTADO" bg={t.danger} /> : null}
          {!enabled ? (
            <Txt weight={700} size={12} color={t.textMuted}>
              em breve
            </Txt>
          ) : null}
        </View>
      </Pressable>
      {isVoice && people?.length ? (
        <View style={{ paddingLeft: 30, paddingTop: 4, gap: 4 }}>
          {people.map((p) => (
            <View key={p.userId} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 2 }}>
              <Avatar name={p.username} url={p.avatarUrl} size={24} radius={8} />
              <Txt weight={800} size={14} style={{ flex: 1 }} numberOfLines={1}>
                {p.username}
              </Txt>
              {p.screenSharing ? <Tag label="AO VIVO" /> : null}
              {!p.micEnabled || p.deafened ? <Icon name={p.deafened ? "headphonesOff" : "micOff"} size={14} color={t.danger} /> : null}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export default function ChannelsScreen({ route, navigation, user }) {
  const t = useTokens();
  const voice = useVoice();
  const { server } = route.params;
  const [sections, setSections] = useState(null);
  const [presence, setPresence] = useState({});
  const [error, setError] = useState("");
  const layout = useLayout();
  const [openText, setOpenText] = useState(null);

  useEffect(() => {
    Promise.all([
      api.get(`/api/servers/${server.id}/channels`),
      api.get(`/api/servers/${server.id}/categories`).catch(() => ({ data: [] })),
    ])
      .then(([channelsRes, categoriesRes]) => {
        const channels = [...channelsRes.data].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
        const categories = [...categoriesRes.data].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
        const built = [];
        const loose = channels.filter((c) => !c.categoryId);
        if (loose.length) built.push({ title: "Canais", data: loose });
        categories.forEach((cat) => {
          const items = channels.filter((c) => c.categoryId === cat.id);
          if (items.length) built.push({ title: cat.name, data: items });
        });
        setSections(built);
      })
      .catch(() => {
        setError("Não foi possível carregar os canais.");
        setSections([]);
      });
  }, [server.id]);

  // no iPad abre o primeiro canal de texto do lado, como no desktop
  useEffect(() => {
    if (!layout.wide || openText || !sections) return;
    const first = sections.flatMap((x) => x.data).find((c) => c.type === "TEXT");
    if (first) setOpenText(first);
  }, [layout.wide, sections, openText]);

  // quem está em cada canal de voz (igual à lista lateral do site)
  const loadPresence = useCallback(async () => {
    if (!sections) return;
    const voiceChannels = sections.flatMap((s) => s.data).filter((c) => c.type === "VOICE");
    const entries = await Promise.all(
      voiceChannels.map((c) =>
        api
          .get(`/api/channels/${c.id}/voice-presence`)
          .then(({ data }) => [c.id, data])
          .catch(() => [c.id, []])
      )
    );
    setPresence(Object.fromEntries(entries));
  }, [sections]);

  useFocusEffect(
    useCallback(() => {
      loadPresence();
      const timer = setInterval(loadPresence, PRESENCE_REFRESH_MS);
      return () => clearInterval(timer);
    }, [loadPresence])
  );

  return (
    <Screen>
      <TopBar title={server.name.toUpperCase()} subtitle={server.description || "Canais do servidor"} onBack={() => navigation.goBack()} />
      {!sections ? (
        <ActivityIndicator color={t.text} style={{ marginTop: 40 }} />
      ) : (
        <View style={{ flex: 1, flexDirection: "row" }}>
        <View style={layout.wide ? { width: layout.sideWidth, padding: 12, paddingRight: 0 } : { flex: 1, padding: 12, paddingBottom: 0 }}>
          <Sticker shadow={t.shadow} radius={22} style={{ flex: 1 }} innerStyle={{ flex: 1 }}>
            <SectionList
              sections={sections}
              keyExtractor={(item) => String(item.id)}
              stickySectionHeadersEnabled={false}
              contentContainerStyle={{ paddingVertical: 10, paddingBottom: 110 }}
              ListEmptyComponent={
                <Txt weight={800} color={t.textMuted} style={{ textAlign: "center", marginTop: 30 }}>
                  {error || "Nenhum canal neste servidor."}
                </Txt>
              }
              renderSectionHeader={({ section }) => <SectionTitle style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6 }}>{section.title}</SectionTitle>}
              renderItem={({ item }) => (
                <ChannelRow
                  item={item}
                  connected={item.type === "VOICE" && voice.channel?.id === item.id}
                  selected={layout.wide && item.type === "TEXT" && openText?.id === item.id}
                  people={presence[item.id]}
                  onPress={() =>
                    item.type === "VOICE"
                      ? navigation.navigate("Voice", { channel: { ...item, serverId: server.id } })
                      : layout.wide
                        ? setOpenText(item)
                        : navigation.navigate("Chat", { channel: item, server })
                  }
                />
              )}
            />
          </Sticker>
        </View>
        {layout.wide && openText ? (
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 22, paddingTop: 14 }}>
              <Icon name="hash" size={20} color={t.text} />
              <Txt weight="display" size={18} numberOfLines={1} style={{ flex: 1 }}>
                {openText.name}
              </Txt>
            </View>
            <ChatView
              key={openText.id}
              kind="channel"
              channelId={openText.id}
              serverId={server.id}
              readOnly={openText.adminOnly && user?.role !== "ADMIN"}
              placeholder={`Manda no #${openText.name}...`}
              user={user}
              navigation={navigation}
            />
          </View>
        ) : null}
        </View>
      )}
    </Screen>
  );
}
