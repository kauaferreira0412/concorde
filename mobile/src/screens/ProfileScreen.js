import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { Image } from "expo-image";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import api from "../api";
import { CardThemeProvider, useTokens } from "../theme/ThemeContext";
import { mix } from "../theme/themes";
import { Avatar, Btn, Screen, SectionTitle, Sticker, Txt } from "../ui/kit";
import Icon from "../ui/icons";
import TopBar from "../ui/TopBar";
import { StatusDot } from "./DmsScreen";

const STATUS = {
  ONLINE: "Online",
  AWAY: "Ausente",
  DND: "Não perturbe",
  OFFLINE: "Offline",
  INVISIBLE: "Invisível",
};
const BLOCKS = {
  music: { group: "Música do momento", icon: "volume" },
  game: { group: "Jogos favoritos", icon: "smile" },
  link: { group: "Links", icon: "send" },
};

/** Faixa do topo: banner, ou a cor do perfil (gradiente com a 2ª cor), igual ao site. */
export function ProfileBanner({ bannerUrl, accent, accent2, height = 120 }) {
  const t = useTokens();
  // a faixa escolhida no "Card do perfil" ganha da cor de destaque
  const c1 = t.cardBanner || accent || t.accent;
  const c2 =
    t.cardBanner ||
    (accent
      ? accent2 || mix(accent, 70, "#000000")
      : mix(t.accent, 70, "#000000"));
  return (
    <View
      style={{
        height,
        borderBottomWidth: 2.5,
        borderBottomColor: t.ink,
        overflow: "hidden",
      }}
    >
      {bannerUrl ? (
        <Image
          cachePolicy="memory-disk"
          transition={120}
          recyclingKey={bannerUrl}
          source={{ uri: bannerUrl }}
          style={{ width: "100%", height: "100%" }}
        />
      ) : (
        <Svg width="100%" height="100%">
          <Defs>
            <LinearGradient id="g" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={c1} />
              <Stop offset="1" stopColor={c2} />
            </LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#g)" />
        </Svg>
      )}
    </View>
  );
}

export function AboutBlocksView({ blocks }) {
  const t = useTokens();
  if (!Array.isArray(blocks) || blocks.length === 0) return null;
  return ["music", "game", "link"]
    .filter((type) => blocks.some((b) => b.type === type))
    .map((type) => (
      <View key={type} style={{ gap: 6 }}>
        <SectionTitle>{BLOCKS[type].group}</SectionTitle>
        {blocks
          .filter((b) => b.type === type)
          .map((b, i) => (
            <Pressable
              key={i}
              disabled={!b.url}
              onPress={() => b.url && Linking.openURL(b.url).catch(() => {})}
            >
              <Sticker radius={14} shadow={2} bg={t.surface2}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                    padding: 10,
                  }}
                >
                  {b.image ? (
                    <Image
                      source={{ uri: b.image }}
                      cachePolicy="memory-disk"
                      recyclingKey={b.image}
                      style={{
                        width: type === "game" ? 72 : 44,
                        height: type === "game" ? 34 : 44,
                        borderRadius: 10,
                        borderWidth: 2,
                        borderColor: t.ink,
                      }}
                    />
                  ) : (
                    <View
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 10,
                        borderWidth: 2,
                        borderColor: t.ink,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor:
                          type === "music"
                            ? t.mint
                            : type === "game"
                              ? t.orange
                              : t.hoverStrong,
                      }}
                    >
                      <Icon
                        name={BLOCKS[type].icon}
                        size={16}
                        color={type === "link" ? t.text : t.onPop}
                      />
                    </View>
                  )}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Txt weight={900} numberOfLines={1}>
                      {b.title}
                    </Txt>
                    {b.subtitle || b.url ? (
                      <Txt
                        weight={700}
                        size={12}
                        color={t.textMuted}
                        numberOfLines={1}
                      >
                        {b.subtitle ||
                          b.url.replace(/^https?:\/\/(www\.)?/, "")}
                      </Txt>
                    ) : null}
                  </View>
                </View>
              </Sticker>
            </Pressable>
          ))}
      </View>
    ));
}

export default function ProfileScreen({ route, navigation, user }) {
  const t = useTokens();
  const { userId } = route.params;
  const isMe = userId === user?.id;
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState("");
  const [friend, setFriend] = useState(null);
  const [busy, setBusy] = useState(false);

  async function loadFriend() {
    if (isMe) return;
    try {
      const { data } = await api.get(`/api/friends/status/${userId}`);
      setFriend(data);
    } catch {
      setFriend(null);
    }
  }

  useEffect(() => {
    api
      .get(`/api/users/${userId}/profile`)
      .then(({ data }) => setProfile(data))
      .catch((err) =>
        setError(
          err.response?.data?.error || "Não foi possível carregar esse perfil.",
        ),
      );
    loadFriend();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function act(fn) {
    setBusy(true);
    try {
      await fn();
      await loadFriend();
    } catch (err) {
      Alert.alert(
        "Amigos",
        err.response?.data?.error || "Não deu pra fazer isso agora.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <TopBar
        title={
          profile
            ? (profile.nickname || profile.username).toUpperCase()
            : "PERFIL"
        }
        subtitle={profile ? `@${profile.username}` : " "}
        onBack={() => navigation.goBack()}
      />
      {!profile ? (
        error ? (
          <Txt weight={800} color={t.danger} style={{ margin: 20 }}>
            {error}
          </Txt>
        ) : (
          <ActivityIndicator color={t.text} style={{ marginTop: 40 }} />
        )
      ) : (
        <ScrollView
          contentContainerStyle={{
            width: "100%",
            maxWidth: 720,
            alignSelf: "center",
            padding: 14,
            paddingBottom: 120,
          }}
        >
          <CardThemeProvider colors={profile.cardColors}>
            <ProfileCard
              profile={profile}
              isMe={isMe}
              friend={friend}
              busy={busy}
              act={act}
              navigation={navigation}
            />
          </CardThemeProvider>
        </ScrollView>
      )}
    </Screen>
  );
}

/** O card em si: lê os tokens de dentro do CardThemeProvider (cores próprias do perfil). */
function ProfileCard({ profile, isMe, friend, busy, act, navigation }) {
  const t = useTokens();
  return (
    <Sticker
      radius={22}
      shadow={t.shadow}
      shadowColor={
        profile.accentColor
          ? profile.accentColor2 || profile.accentColor
          : undefined
      }
    >
      <ProfileBanner
        bannerUrl={profile.bannerUrl}
        accent={profile.accentColor}
        accent2={profile.accentColor2}
      />
      <View
        style={{
          flexDirection: "row",
          gap: 12,
          paddingHorizontal: 16,
          marginTop: -40,
          alignItems: "flex-end",
        }}
      >
        <View>
          <Avatar
            name={profile.username}
            url={profile.avatarUrl}
            size={84}
            radius={26}
          />
          <View style={{ position: "absolute", right: -2, bottom: -2 }}>
            <StatusDot status={profile.status} size={20} />
          </View>
        </View>
      </View>
      <View style={{ padding: 16, gap: 12 }}>
        <View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Txt
              weight="display"
              size={22}
              style={{ flexShrink: 1 }}
              numberOfLines={1}
            >
              {profile.nickname || profile.username}
            </Txt>
            {profile.role === "ADMIN" ? (
              <View
                style={{
                  borderWidth: 2,
                  borderColor: t.ink,
                  borderRadius: 999,
                  paddingHorizontal: 8,
                  backgroundColor: t.orange,
                }}
              >
                <Txt weight={900} size={11} color={t.onPop}>
                  ADMIN
                </Txt>
              </View>
            ) : null}
          </View>
          <Txt weight={800} color={t.textMuted}>
            @{profile.username} · {STATUS[profile.status] || "Offline"}
          </Txt>
        </View>
        {profile.customStatus ? (
          <View
            style={{
              borderWidth: 2,
              borderColor: profile.accentColor || t.ink,
              borderRadius: 14,
              padding: 10,
              backgroundColor: t.surface2,
            }}
          >
            <Txt weight={800}>{profile.customStatus}</Txt>
          </View>
        ) : null}

        {isMe ? (
          <Btn
            icon="pencil"
            label="Editar perfil"
            onPress={() => navigation.navigate("EditProfile")}
          />
        ) : friend ? (
          friend.status === "FRIENDS" ? (
            <Btn
              icon="message"
              label="Enviar mensagem"
              onPress={() =>
                navigation.navigate("DmChat", {
                  channelId: friend.dmChannelId,
                  otherUserId: profile.id,
                  otherUsername: profile.username,
                  otherNickname: profile.nickname,
                  otherAvatarUrl: profile.avatarUrl,
                  otherStatus: profile.status,
                })
              }
            />
          ) : friend.status === "INCOMING" ? (
            <Btn
              icon="check"
              variant="mint"
              label="Aceitar pedido de amizade"
              disabled={busy}
              onPress={() =>
                act(() =>
                  api.post(`/api/friends/requests/${profile.id}/accept`),
                )
              }
            />
          ) : friend.status === "OUTGOING" ? (
            <Btn variant="surface" label="Pedido de amizade enviado" disabled />
          ) : friend.status === "NONE" ? (
            <Btn
              icon="plus"
              label="Adicionar amigo"
              disabled={busy}
              onPress={() =>
                act(() =>
                  api.post("/api/friends/requests", {
                    username: profile.username,
                  }),
                )
              }
            />
          ) : null
        ) : null}

        <View style={{ gap: 6 }}>
          <SectionTitle
            color={
              profile.accentColor
                ? mix(profile.accentColor, 75, t.text)
                : undefined
            }
          >
            Sobre mim
          </SectionTitle>
          <Txt weight={600} color={profile.bio ? t.text : t.textMuted}>
            {profile.bio ||
              (isMe
                ? "Você ainda não escreveu nada sobre você."
                : "Essa pessoa ainda não escreveu nada sobre ela.")}
          </Txt>
        </View>
        <AboutBlocksView blocks={profile.aboutBlocks} />
        <View style={{ gap: 6 }}>
          <SectionTitle>Membro desde</SectionTitle>
          <Txt weight={700}>
            {new Date(profile.createdAt).toLocaleDateString("pt-BR", {
              day: "2-digit",
              month: "long",
              year: "numeric",
            })}
          </Txt>
        </View>
      </View>
    </Sticker>
  );
}
