import { useCallback, useState } from "react";
import { Pressable, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import api from "../api";
import { useTokens } from "../theme/ThemeContext";
import { Avatar, Txt } from "../ui/kit";
import Icon from "../ui/icons";
import ServersScreen from "./ServersScreen";
import DmsScreen from "./DmsScreen";
import FriendsScreen from "./FriendsScreen";
import MeScreen from "./MeScreen";
import { Enter } from "../ui/anim";
import { useLayout } from "../ui/layout";
import { useDmNotifications } from "../chat/DmNotifications";

export const TABBAR_HEIGHT = 66;
export const RAIL_WIDTH = 92;

function TabBar({ tab, setTab, user, friendsBadge, vertical }) {
  const t = useTokens();
  const { unread } = useDmNotifications();
  const insets = useSafeAreaInsets();
  const tabs = [
    { key: "servers", label: "Servidores", icon: "servers" },
    { key: "dms", label: "Mensagens", icon: "message", badge: unread.size },
    { key: "friends", label: "Amigos", icon: "users", badge: friendsBadge },
    { key: "me", label: "Você" },
  ];
  return (
    <View
      style={
        vertical
          ? {
              width: RAIL_WIDTH + insets.left,
              paddingLeft: insets.left,
              paddingTop: insets.top + 14,
              paddingBottom: insets.bottom + 14,
              gap: 10,
              backgroundColor: t.surface,
              borderRightWidth: 2.5,
              borderRightColor: t.ink,
            }
          : {
              flexDirection: "row",
              backgroundColor: t.surface,
              borderTopWidth: 2.5,
              borderTopColor: t.ink,
              paddingBottom: insets.bottom,
              height: TABBAR_HEIGHT + insets.bottom,
            }
      }
    >
      {tabs.map((item) => {
        const active = tab === item.key;
        return (
          <Pressable
            key={item.key}
            onPress={() => setTab(item.key)}
            style={vertical ? { alignItems: "center", paddingVertical: 8, gap: 4 } : { flex: 1, alignItems: "center", justifyContent: "center", gap: 3 }}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={item.label}
          >
            <View
              style={{
                paddingHorizontal: 14,
                paddingVertical: 4,
                borderRadius: 999,
                borderWidth: 2,
                borderColor: active ? t.ink : "transparent",
                backgroundColor: active ? t.accent : "transparent",
              }}
            >
              {item.key === "me" ? (
                <Avatar name={user?.username} url={user?.avatarUrl} size={24} radius={8} />
              ) : (
                <Icon name={item.icon} size={22} color={active ? t.onAccent : t.textMuted} />
              )}
              {item.badge > 0 ? (
                <View
                  style={{
                    position: "absolute",
                    top: -6,
                    right: -2,
                    minWidth: 18,
                    height: 18,
                    borderRadius: 9,
                    paddingHorizontal: 4,
                    backgroundColor: t.danger,
                    borderWidth: 2,
                    borderColor: t.ink,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Txt weight={900} size={10} color="#fff">
                    {item.badge > 9 ? "9+" : item.badge}
                  </Txt>
                </View>
              ) : null}
            </View>
            <Txt weight={900} size={11} color={active ? t.text : t.textMuted}>
              {item.label}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Tela principal com as abas de baixo (igual ao site no celular). */
export default function HomeScreen({ navigation, route, user, onLogout, onUserUpdate }) {
  const t = useTokens();
  const [tab, setTab] = useState(route.params?.tab || "servers");
  const [friendsBadge, setFriendsBadge] = useState(0);

  const loadBadge = useCallback(() => {
    api
      .get("/api/friends/requests")
      .then(({ data }) => setFriendsBadge(data.incoming?.length || 0))
      .catch(() => {});
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadBadge();
    }, [loadBadge])
  );

  const layout = useLayout();
  const props = { navigation, user, onLogout, onUserUpdate, embedded: true, onFriendsChanged: loadBadge };
  return (
    <View style={{ flex: 1, backgroundColor: t.bg, flexDirection: layout.wide ? "row" : "column" }}>
      {layout.wide ? <TabBar tab={tab} setTab={setTab} user={user} friendsBadge={friendsBadge} vertical /> : null}
      <Enter key={tab} kind="rise" distance={18} style={{ flex: 1 }}>
        {tab === "servers" ? <ServersScreen {...props} /> : null}
        {tab === "dms" ? <DmsScreen {...props} /> : null}
        {tab === "friends" ? <FriendsScreen {...props} /> : null}
        {tab === "me" ? <MeScreen {...props} /> : null}
      </Enter>
      {layout.wide ? null : <TabBar tab={tab} setTab={setTab} user={user} friendsBadge={friendsBadge} />}
    </View>
  );
}
