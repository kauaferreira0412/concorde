import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, SectionList, StyleSheet, Text, View } from "react-native";
import api from "../api";
import { colors } from "../theme";

export default function ChannelsScreen({ route, navigation }) {
  const { server } = route.params;
  const [sections, setSections] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    navigation.setOptions({ title: server.name });
    Promise.all([
      api.get(`/api/servers/${server.id}/channels`),
      api.get(`/api/servers/${server.id}/categories`).catch(() => ({ data: [] })),
    ])
      .then(([channelsRes, categoriesRes]) => {
        const channels = channelsRes.data;
        const categories = categoriesRes.data;
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
  }, [server.id, server.name, navigation]);

  if (!sections) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <SectionList
      style={styles.list}
      sections={sections}
      keyExtractor={(item) => String(item.id)}
      ListEmptyComponent={<Text style={styles.empty}>{error || "Nenhum canal neste servidor."}</Text>}
      renderSectionHeader={({ section }) => <Text style={styles.header}>{section.title.toUpperCase()}</Text>}
      renderItem={({ item }) => {
        const isText = item.type === "TEXT";
        return (
          <Pressable
            style={styles.row}
            onPress={() =>
              navigation.navigate(isText ? "Chat" : "VoiceCall", { channel: item, server })
            }
          >
            <Text style={styles.icon}>{isText ? "#" : "🔊"}</Text>
            <Text style={styles.name}>{item.name}</Text>
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: colors.bg, justifyContent: "center", alignItems: "center" },
  list: { backgroundColor: colors.bg },
  empty: { color: colors.muted, textAlign: "center", marginTop: 40 },
  header: { color: colors.muted, fontSize: 12, fontWeight: "700", paddingHorizontal: 14, paddingTop: 18, paddingBottom: 6 },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, gap: 8 },
  icon: { color: colors.muted, fontSize: 18, width: 24, textAlign: "center" },
  name: { color: colors.text, fontSize: 16, flex: 1 },
});
