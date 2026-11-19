import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppTheme } from "../theme/ThemeContext";
import ServersPane from "./home/ServersPane";
import MessagesPane from "./home/MessagesPane";
import FriendsPane from "./home/FriendsPane";
import YouPane from "./home/YouPane";

const TABS = [
  { key: "servers", label: "Servidores", icon: "🧩" },
  { key: "messages", label: "Mensagens", icon: "💬" },
  { key: "friends", label: "Amigos", icon: "👥" },
  { key: "you", label: "Você", icon: "🙂" },
];

export default function HomeScreen({ navigation, user, onLogout }) {
  const colors = useAppTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets), [colors, insets]);
  const [tab, setTab] = useState("servers");

  return (
    <View style={styles.screen}>
      <View style={styles.body}>
        {tab === "servers" && <ServersPane navigation={navigation} />}
        {tab === "messages" && <MessagesPane navigation={navigation} />}
        {tab === "friends" && <FriendsPane navigation={navigation} />}
        {tab === "you" && <YouPane user={user} onLogout={onLogout} />}
      </View>

      <View style={styles.tabBar}>
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <Pressable key={t.key} style={styles.tabItem} onPress={() => setTab(t.key)}>
              <Text style={[styles.tabIcon, active && styles.tabIconActive]}>{t.icon}</Text>
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function createStyles(colors, insets) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    body: { flex: 1 },
    tabBar: {
      flexDirection: "row",
      backgroundColor: colors.surface,
      borderTopWidth: 1,
      borderTopColor: colors.line,
      paddingTop: 8,
      paddingBottom: Math.max(insets.bottom, 8),
    },
    tabItem: { flex: 1, alignItems: "center", gap: 2 },
    tabIcon: { fontSize: 20, opacity: 0.6 },
    tabIconActive: { opacity: 1 },
    tabLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "600" },
    tabLabelActive: { color: colors.accent },
  });
}
