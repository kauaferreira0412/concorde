import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Image, Pressable, View } from "react-native";
import api from "../api";
import { useTokens } from "../theme/ThemeContext";
import { Field, Txt } from "../ui/kit";
import Sheet from "../ui/Sheet";

export const QUICK_REACTIONS = ["👍", "😂", "❤️", "🔥", "😮", "😢", "🎉", "👀"];

const EMOJI_GROUPS = [
  ["Carinhas", "😀 😃 😄 😁 😆 😅 🤣 😂 🙂 😉 😊 😇 🥰 😍 🤩 😘 😋 😛 😜 🤪 😝 🤑 🤗 🤭 🤫 🤔 🤐 🤨 😐 😑 😶 😏 😒 🙄 😬 😮‍💨 🤥 😌 😔 😪 🤤 😴 😷 🤒 🤕 🤢 🤮 🥵 🥶 🥴 😵 🤯 🤠 🥳 😎 🤓 🧐 😕 😟 🙁 😮 😯 😲 😳 🥺 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬 😈 👿 💀 ☠️ 💩 🤡 👹 👺 👻 👽 🤖"],
  ["Gestos", "👍 👎 👌 🤌 🤏 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ ✋ 🤚 🖐️ 🖖 👋 🤝 🙏 👏 🙌 👐 🤲 💪 🫶 🫡 🫠 👀 🧠"],
  ["Corações", "❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❤️‍🔥 💕 💞 💓 💗 💖 💘 💝 💯 💢 💥 💫 💦 💨 🔥 ✨ ⭐ 🌟 ⚡"],
  ["Coisas", "🎉 🎊 🎈 🎁 🏆 🥇 🎮 🕹️ 🎲 🧩 🎵 🎶 🎧 🎤 📸 💻 📱 ⌚ 💡 🔔 📢 🔒 🔑 🗡️ 🛡️ 🏹 🪄 🍕 🍔 🍟 🌮 🍿 🍩 🍪 🎂 🍺 🍻 ☕ 🧃"],
  ["Bichos", "🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🐔 🐧 🐦 🦆 🦉 🐺 🐗 🐴 🦄 🐝 🐛 🦋 🐌 🐞 🐢 🐍 🦖 🐙 🦑 🦀 🐠 🐬 🐳 🦈"],
];

/** Emojis do sistema + os personalizados do servidor (vêm como :nome:). */
export function EmojiSheet({ visible, onClose, onPick, customEmojis = [] }) {
  const t = useTokens();
  return (
    <Sheet visible={visible} onClose={onClose} title="EMOJIS">
      {customEmojis.length > 0 ? (
        <View style={{ gap: 6 }}>
          <Txt weight={900} size={12} color={t.textMuted}>
            DO SERVIDOR
          </Txt>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {customEmojis.map((e) => (
              <Pressable key={e.id} onPress={() => onPick(`:${e.name}:`)} style={{ padding: 4 }} accessibilityLabel={e.name}>
                <Image source={{ uri: e.imageUrl }} style={{ width: 34, height: 34 }} />
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
      {EMOJI_GROUPS.map(([label, list]) => (
        <View key={label} style={{ gap: 6 }}>
          <Txt weight={900} size={12} color={t.textMuted}>
            {label.toUpperCase()}
          </Txt>
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {list.split(" ").map((e) => (
              <Pressable key={e} onPress={() => onPick(e)} style={{ width: "12.5%", alignItems: "center", paddingVertical: 6 }}>
                <Txt size={26}>{e}</Txt>
              </Pressable>
            ))}
          </View>
        </View>
      ))}
    </Sheet>
  );
}

/** GIFs em alta + busca (mesma API do site). */
export function GifSheet({ visible, onClose, onPick }) {
  const t = useTokens();
  const [query, setQuery] = useState("");
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");
  const timer = useRef(null);

  useEffect(() => {
    if (!visible) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setItems(null);
      setError("");
      try {
        const q = query.trim();
        const { data } = q ? await api.get("/api/gifs/search", { params: { q, limit: 30 } }) : await api.get("/api/gifs/trending", { params: { limit: 30 } });
        setItems(data.results || []);
      } catch (err) {
        setItems([]);
        setError(err.response?.data?.error || "Não deu pra buscar GIFs agora.");
      }
    }, query ? 350 : 0);
    return () => clearTimeout(timer.current);
  }, [query, visible]);

  return (
    <Sheet visible={visible} onClose={onClose} title="GIFS">
      <Field value={query} onChangeText={setQuery} placeholder="Buscar GIF..." autoCorrect={false} />
      {error ? (
        <Txt weight={800} color={t.danger}>
          {error}
        </Txt>
      ) : null}
      {items === null ? (
        <ActivityIndicator color={t.text} style={{ marginTop: 20 }} />
      ) : (
        <FlatList
          scrollEnabled={false}
          data={items}
          numColumns={2}
          keyExtractor={(g) => g.id}
          columnWrapperStyle={{ gap: 8 }}
          contentContainerStyle={{ gap: 8 }}
          renderItem={({ item }) => (
            <Pressable style={{ flex: 1 }} onPress={() => onPick(item)} accessibilityLabel={item.title || "GIF"}>
              <Image
                source={{ uri: item.previewUrl || item.url }}
                style={{ width: "100%", aspectRatio: item.width && item.height ? item.width / item.height : 1, borderRadius: 12, borderWidth: 2, borderColor: t.ink, backgroundColor: t.surface2 }}
              />
            </Pressable>
          )}
          ListEmptyComponent={
            !error ? (
              <Txt weight={700} color={t.textMuted}>
                Nenhum GIF encontrado.
              </Txt>
            ) : null
          }
        />
      )}
    </Sheet>
  );
}
