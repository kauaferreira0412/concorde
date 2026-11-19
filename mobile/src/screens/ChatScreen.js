import { useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Image, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import api, { getToken } from "../api";
import { createChatClient } from "../socket";
import { useAppTheme } from "../theme/ThemeContext";

function formatTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export default function ChatScreen({ route, navigation }) {
  const { channel, dm } = route.params;
  const colors = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [connected, setConnected] = useState(false);
  const clientRef = useRef(null);

  const historyPath = dm ? `/api/dm/channels/${channel.id}/messages` : `/api/channels/${channel.id}/messages`;
  const topic = dm ? `/topic/dm.${channel.id}` : `/topic/channel.${channel.id}`;
  const sendDestination = dm ? `/app/dm.${channel.id}.send` : `/app/channel.${channel.id}.send`;

  useEffect(() => {
    navigation.setOptions({ title: dm ? channel.name : `# ${channel.name}`, headerStyle: { backgroundColor: colors.surface }, headerTintColor: colors.text });
  }, [channel.name, navigation, dm, colors]);

  useEffect(() => {
    let active = true;
    api
      .get(historyPath)
      .then(({ data }) => {
        if (active) setMessages(data);
      })
      .catch(() => {});

    const client = createChatClient(getToken());
    clientRef.current = client;
    client.onConnect = () => {
      setConnected(true);
      client.subscribe(topic, (frame) => {
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
  }, [channel.id, dm, historyPath, topic]);

  function handleSend() {
    const content = text.trim();
    const client = clientRef.current;
    if (!content || !client?.connected) return;
    client.publish({
      destination: sendDestination,
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
          placeholder={connected ? (dm ? `Mensagem para ${channel.name}` : `Mensagem em #${channel.name}`) : "Conectando..."}
          placeholderTextColor={colors.textMuted}
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

function createStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    listContent: { padding: 12 },
    message: { marginBottom: 14 },
    author: { color: colors.text, fontWeight: "700" },
    time: { color: colors.textMuted, fontSize: 11, fontWeight: "400" },
    content: { color: colors.text, marginTop: 2, fontSize: 15 },
    image: { width: 240, height: 180, marginTop: 6, borderRadius: 8 },
    file: { color: colors.accent, marginTop: 4 },
    composer: { flexDirection: "row", alignItems: "flex-end", padding: 8, gap: 8, backgroundColor: colors.surface },
    input: {
      flex: 1,
      backgroundColor: colors.surface2,
      color: colors.text,
      borderRadius: 20,
      paddingHorizontal: 14,
      paddingVertical: 10,
      maxHeight: 120,
      fontSize: 16,
    },
    send: { backgroundColor: colors.accent, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 11 },
    sendDisabled: { opacity: 0.5 },
    sendText: { color: colors.onAccent, fontWeight: "600" },
  });
}
