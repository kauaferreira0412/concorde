import { useEffect, useRef, useState } from "react";
import { FlatList, Image, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import api, { getToken } from "../api";
import { createChatClient } from "../socket";
import { colors } from "../theme";

function formatTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export default function ChatScreen({ route, navigation }) {
  const { channel } = route.params;
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [connected, setConnected] = useState(false);
  const clientRef = useRef(null);

  useEffect(() => {
    navigation.setOptions({ title: `# ${channel.name}` });
  }, [channel.name, navigation]);

  useEffect(() => {
    let active = true;
    api
      .get(`/api/channels/${channel.id}/messages`)
      .then(({ data }) => {
        if (active) setMessages(data);
      })
      .catch(() => {});

    const client = createChatClient(getToken());
    clientRef.current = client;
    client.onConnect = () => {
      setConnected(true);
      client.subscribe(`/topic/channel.${channel.id}`, (frame) => {
        const event = JSON.parse(frame.body);
        setMessages((prev) => {
          if (event.messageId && !event.message) return prev.filter((m) => m.id !== event.messageId);
          if (!event.message) return prev;
          const index = prev.findIndex((m) => m.id === event.message.id);
          if (index >= 0) {
            const next = prev.slice();
            next[index] = event.message;
            return next;
          }
          return [...prev, event.message];
        });
      });
    };
    client.onWebSocketClose = () => setConnected(false);
    client.activate();

    return () => {
      active = false;
      client.deactivate();
    };
  }, [channel.id]);

  function handleSend() {
    const content = text.trim();
    const client = clientRef.current;
    if (!content || !client?.connected) return;
    client.publish({
      destination: `/app/channel.${channel.id}.send`,
      body: JSON.stringify({
        content,
        imageUrl: null,
        replyToId: null,
        fileUrl: null,
        fileName: null,
        fileType: null,
        fileSize: null,
      }),
    });
    setText("");
  }

  const data = [...messages].reverse();

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
      <FlatList
        inverted
        data={data}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <View style={styles.message}>
            <Text style={styles.author}>
              {item.authorUsername} <Text style={styles.time}>{formatTime(item.createdAt)}</Text>
            </Text>
            {item.content ? <Text style={styles.content}>{item.content}</Text> : null}
            {item.imageUrl ? <Image source={{ uri: item.imageUrl }} style={styles.image} resizeMode="contain" /> : null}
            {item.fileName ? <Text style={styles.file}>📎 {item.fileName}</Text> : null}
          </View>
        )}
      />
      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          placeholder={connected ? `Mensagem em #${channel.name}` : "Conectando..."}
          placeholderTextColor={colors.muted}
          value={text}
          onChangeText={setText}
          multiline
        />
        <Pressable style={[styles.send, !connected && styles.sendDisabled]} onPress={handleSend} disabled={!connected}>
          <Text style={styles.sendText}>Enviar</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  listContent: { padding: 12 },
  message: { marginBottom: 14 },
  author: { color: colors.text, fontWeight: "700" },
  time: { color: colors.muted, fontSize: 11, fontWeight: "400" },
  content: { color: colors.text, marginTop: 2, fontSize: 15 },
  image: { width: 240, height: 180, marginTop: 6, borderRadius: 8 },
  file: { color: colors.accent, marginTop: 4 },
  composer: { flexDirection: "row", alignItems: "flex-end", padding: 8, gap: 8, backgroundColor: colors.panel },
  input: {
    flex: 1,
    backgroundColor: colors.input,
    color: colors.text,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxHeight: 120,
    fontSize: 16,
  },
  send: { backgroundColor: colors.accent, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 11 },
  sendDisabled: { opacity: 0.5 },
  sendText: { color: "#fff", fontWeight: "600" },
});
