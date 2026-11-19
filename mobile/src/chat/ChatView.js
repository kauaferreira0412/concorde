import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Image, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import api, { getToken } from "../api";
import { createChatClient } from "../socket";
import { useTokens } from "../theme/ThemeContext";
import { mix, toneFor } from "../theme/themes";
import { useVoice } from "../voice/VoiceContext";
import { playSound } from "../voice/sounds";
import { Avatar, Field, IconBtn, Sticker, Txt } from "../ui/kit";
import Icon from "../ui/icons";
import Sheet, { SheetItem } from "../ui/Sheet";
import { EmojiSheet, GifSheet, QUICK_REACTIONS } from "./Pickers";
import { Enter } from "../ui/anim";

const GROUP_MS = 5 * 60 * 1000;
const URL_RE = /(https?:\/\/[^\s<]+)/g;
const IS_URL = /^https?:\/\/[^\s<]+$/;
const CUSTOM_EMOJI_RE = /^:([a-z0-9_]{2,30}):$/;

function formatTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function dayKey(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayLabel(iso) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (dayKey(d) === dayKey(today)) return "HOJE";
  if (dayKey(d) === dayKey(yesterday)) return "ONTEM";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" }).toUpperCase();
}

function isGrouped(prev, m) {
  if (!prev || !m) return false;
  if (prev.authorId !== m.authorId || dayKey(prev.createdAt) !== dayKey(m.createdAt)) return false;
  if (m.replyToId) return false;
  return new Date(m.createdAt) - new Date(prev.createdAt) < GROUP_MS;
}

function summary(m) {
  if (!m) return "";
  if (m.content) return m.content;
  if (m.imageUrl) return "📷 imagem";
  if (m.fileName) return `📎 ${m.fileName}`;
  return "mensagem";
}

/** Texto com links tocáveis e @menções destacadas. */
function RichText({ text, myUsername }) {
  const t = useTokens();
  const parts = String(text).split(URL_RE);
  return (
    <Txt weight={600} size={15} style={{ lineHeight: 22 }}>
      {parts.map((part, i) => {
        if (IS_URL.test(part)) {
          return (
            <Txt key={i} weight={700} size={15} color={t.accentText} style={{ textDecorationLine: "underline" }} onPress={() => Linking.openURL(part).catch(() => {})}>
              {part}
            </Txt>
          );
        }
        return part.split(/(@[A-Za-z0-9_.-]{2,32})/g).map((seg, j) =>
          /^@[A-Za-z0-9_.-]{2,32}$/.test(seg) ? (
            <Txt
              key={`${i}-${j}`}
              weight={900}
              size={15}
              color={seg.slice(1) === myUsername ? t.onPop : t.accentText}
              style={seg.slice(1) === myUsername ? { backgroundColor: t.mentionBg } : null}
            >
              {seg}
            </Txt>
          ) : (
            seg
          )
        );
      })}
    </Txt>
  );
}

function DiceCard({ m }) {
  const t = useTokens();
  const results = (m.rollResultsCsv || "").split(",").filter(Boolean);
  return (
    <Sticker radius={14} shadow={2} bg={t.surface2} style={{ alignSelf: "flex-start", marginTop: 4 }}>
      <View style={{ padding: 10, gap: 4 }}>
        <Txt weight={900}>🎲 {m.rollNotation}</Txt>
        <Txt weight={700} color={t.textMuted}>
          [{results.join(", ")}]
        </Txt>
        <Txt weight="display" size={20}>
          = {m.rollTotal}
        </Txt>
      </View>
    </Sticker>
  );
}

function PollCard({ poll, me, onVote }) {
  const t = useTokens();
  const total = poll.options.reduce((s, o) => s + o.voterUserIds.length, 0);
  return (
    <Sticker radius={14} shadow={2} style={{ marginTop: 4 }}>
      <View style={{ padding: 12, gap: 8 }}>
        <Txt weight={900} size={15}>
          📊 {poll.question}
        </Txt>
        {poll.options.map((o) => {
          const votes = o.voterUserIds.length;
          const mine = me?.id != null && o.voterUserIds.includes(me.id);
          const pct = total ? Math.round((votes / total) * 100) : 0;
          return (
            <Pressable key={o.id} onPress={() => onVote?.(poll.id, o.id)} disabled={!onVote}>
              <View style={{ borderWidth: 2, borderColor: mine ? t.accent : t.ink, borderRadius: 12, overflow: "hidden", backgroundColor: t.surface2 }}>
                <View style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${pct}%`, backgroundColor: mine ? t.hoverStrong : t.hover }} />
                <View style={{ flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 10, paddingVertical: 8 }}>
                  <Txt weight={800} style={{ flex: 1 }}>
                    {mine ? "✓ " : ""}
                    {o.text}
                  </Txt>
                  <Txt weight={900}>{votes}</Txt>
                </View>
              </View>
            </Pressable>
          );
        })}
        <Txt weight={700} size={12} color={t.textMuted}>
          {total} voto{total === 1 ? "" : "s"}
          {poll.multipleChoice ? " · várias escolhas" : ""}
        </Txt>
      </View>
    </Sticker>
  );
}

function Message({ m, prev, me, customEmojis, onLongPress, onReact, onOpenImage, onOpenProfile, onJump, onVote }) {
  const t = useTokens();
  const grouped = isGrouped(prev, m);
  const newDay = !prev || dayKey(prev.createdAt) !== dayKey(m.createdAt);
  const compact = grouped && !newDay;
  const tone = t["tone" + toneFor(m.authorUsername).toUpperCase()];
  const accent = m.authorId === me?.id ? me?.accentColor : m.authorAccentColor;
  const nameColor = accent ? mix(accent, 78, t.text) : tone.name;
  const mentioned = me?.username && m.content && new RegExp(`@${me.username}\\b`).test(m.content);

  return (
    <View>
      {newDay ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 12 }}>
          <View style={{ flex: 1, height: 2.5, backgroundColor: t.lineSoft, borderRadius: 2 }} />
          <View style={{ borderWidth: 2, borderColor: t.ink, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2, backgroundColor: t.surface2 }}>
            <Txt weight={900} size={11} color={t.textMuted}>
              {dayLabel(m.createdAt)}
            </Txt>
          </View>
          <View style={{ flex: 1, height: 2.5, backgroundColor: t.lineSoft, borderRadius: 2 }} />
        </View>
      ) : null}
      <Pressable
        onLongPress={() => onLongPress(m)}
        delayLongPress={280}
        style={({ pressed }) => ({
          flexDirection: "row",
          gap: 12,
          marginTop: compact ? 2 : 10,
          paddingVertical: 3,
          paddingHorizontal: 6,
          marginHorizontal: -6,
          borderRadius: 12,
          backgroundColor: pressed ? t.hover : mentioned ? mix(t.orange, 18, t.surface) : "transparent",
          borderLeftWidth: mentioned ? 4 : 0,
          borderLeftColor: t.orange,
        })}
      >
        {compact ? (
          <View style={{ width: 40 }} />
        ) : (
          <Pressable onPress={() => onOpenProfile(m.authorId)}>
            <Avatar name={m.authorUsername} url={m.authorAvatarUrl} size={40} />
          </Pressable>
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          {m.replyToId ? (
            <Pressable onPress={() => m.replyTo && onJump(m.replyTo.id)} style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 3 }}>
              <Icon name="reply" size={13} color={t.textMuted} />
              <Txt weight={900} size={12} color={t.textMuted}>
                {m.replyTo ? m.replyTo.authorUsername : ""}
              </Txt>
              <Txt weight={600} size={12} color={t.textMuted} numberOfLines={1} style={{ flex: 1 }}>
                {m.replyTo ? summary(m.replyTo) : "Mensagem original removida"}
              </Txt>
            </Pressable>
          ) : null}
          {compact ? null : (
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
              <Txt weight={900} size={15} color={nameColor} numberOfLines={1} style={{ flexShrink: 1 }} onPress={() => onOpenProfile(m.authorId)}>
                {m.authorUsername}
              </Txt>
              <Txt weight={700} size={12} color={t.textFaint}>
                {formatTime(m.createdAt)}
              </Txt>
              {m.editedAt ? (
                <Txt weight={600} size={11} color={t.textFaint}>
                  (editado)
                </Txt>
              ) : null}
            </View>
          )}
          {m.rollNotation ? (
            <DiceCard m={m} />
          ) : m.poll ? (
            <PollCard poll={m.poll} me={me} onVote={onVote} />
          ) : m.content ? (
            <RichText text={m.content} myUsername={me?.username} />
          ) : null}
          {m.imageUrl ? (
            <Pressable onPress={() => onOpenImage(m.imageUrl)} onLongPress={() => onLongPress(m)} style={{ marginTop: 6, alignSelf: "flex-start" }}>
              <Sticker radius={14} shadow={2}>
                <Image source={{ uri: m.imageUrl }} style={{ width: 240, height: 180 }} resizeMode="cover" />
              </Sticker>
            </Pressable>
          ) : null}
          {m.fileName ? (
            <Pressable onPress={() => m.fileUrl && Linking.openURL(m.fileUrl).catch(() => {})} style={{ marginTop: 6, alignSelf: "flex-start" }}>
              <Sticker radius={12} shadow={2} bg={t.surface2}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 9 }}>
                  <Icon name="file" size={18} color={t.accentText} />
                  <Txt weight={800} size={14} color={t.accentText} numberOfLines={1} style={{ maxWidth: 210 }}>
                    {m.fileName}
                  </Txt>
                </View>
              </Sticker>
            </Pressable>
          ) : null}
          {m.reactions?.length ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
              {m.reactions.map((r) => {
                const mine = me?.id != null && r.userIds.includes(me.id);
                const custom = CUSTOM_EMOJI_RE.exec(r.emoji);
                const url = custom ? customEmojis[custom[1]] : null;
                return (
                  <Pressable
                    key={r.emoji}
                    onPress={() => onReact(m, r.emoji)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 4,
                      paddingHorizontal: 8,
                      paddingVertical: 2,
                      borderRadius: 999,
                      borderWidth: 2,
                      borderColor: mine ? t.accent : t.ink,
                      backgroundColor: mine ? t.hoverStrong : t.surface2,
                    }}
                  >
                    {url ? <Image source={{ uri: url }} style={{ width: 18, height: 18 }} /> : <Txt size={14}>{custom ? "⭐" : r.emoji}</Txt>}
                    <Txt weight={900} size={12}>
                      {r.userIds.length}
                    </Txt>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </View>
      </Pressable>
    </View>
  );
}

/**
 * Chat completo (canal de servidor ou DM).
 * kind: "channel" | "dm"; channelId; serverId (pra emojis do servidor); readOnly; placeholder.
 */
export default function ChatView({ kind = "channel", channelId, serverId, readOnly, placeholder, user, navigation, emptyText }) {
  const t = useTokens();
  const voice = useVoice();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState(null);
  const [text, setText] = useState("");
  const [connected, setConnected] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  const [editing, setEditing] = useState(null);
  const [actionFor, setActionFor] = useState(null);
  const [emojiMode, setEmojiMode] = useState(null); // "text" | {messageId}
  const [gifOpen, setGifOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [viewer, setViewer] = useState(null);
  const [customEmojiList, setCustomEmojiList] = useState([]);
  const clientRef = useRef(null);
  const listRef = useRef(null);
  // mensagens que já estavam no histórico não animam; só as que chegam depois
  const historyIdsRef = useRef(new Set());

  const isDm = kind === "dm";
  const topic = isDm ? `/topic/dm.${channelId}` : `/topic/channel.${channelId}`;
  const dest = (action) => (isDm ? `/app/dm.${channelId}.${action}` : `/app/channel.${channelId}.${action}`);
  const base = isDm ? `/api/dm/channels/${channelId}` : `/api/channels/${channelId}`;
  const customEmojis = useMemo(() => Object.fromEntries(customEmojiList.map((e) => [e.name, e.imageUrl])), [customEmojiList]);

  useEffect(() => {
    if (!serverId) return;
    api
      .get(`/api/servers/${serverId}/emojis`)
      .then(({ data }) => setCustomEmojiList(data || []))
      .catch(() => {});
  }, [serverId]);

  useEffect(() => {
    let active = true;
    setMessages(null);
    api
      .get(`${base}/messages`)
      .then(({ data }) => {
        if (!active) return;
        historyIdsRef.current = new Set(data.map((m) => m.id));
        setMessages(data);
      })
      .catch(() => active && setMessages([]));

    const client = createChatClient(getToken());
    clientRef.current = client;
    client.onConnect = () => {
      setConnected(true);
      client.subscribe(topic, (frame) => {
        const event = JSON.parse(frame.body);
        setMessages((prev) => {
          const list = prev || [];
          if (event.messageId && !event.message) return list.filter((m) => m.id !== event.messageId);
          if (!event.message) return list;
          const index = list.findIndex((m) => m.id === event.message.id);
          if (index >= 0) {
            const next = list.slice();
            next[index] = event.message;
            return next;
          }
          if (isDm && event.message.authorId !== user?.id) playSound("message");
          return [...list, event.message];
        });
      });
    };
    client.onWebSocketClose = () => setConnected(false);
    client.activate();
    return () => {
      active = false;
      client.deactivate();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, kind]);

  function publish(action, body) {
    const client = clientRef.current;
    if (!client?.connected) {
      Alert.alert("Chat", "Sem conexão com o chat agora - tenta de novo em instantes.");
      return false;
    }
    client.publish({ destination: dest(action), body: JSON.stringify(body) });
    return true;
  }

  function send({ content = "", imageUrl = null, file = null } = {}) {
    const ok = publish("send", {
      content,
      imageUrl,
      replyToId: replyTo?.id || null,
      fileUrl: file?.url || null,
      fileName: file?.name || null,
      fileType: file?.contentType || file?.type || null,
      fileSize: file?.size || null,
    });
    if (ok) setReplyTo(null);
    return ok;
  }

  function handleSend() {
    const content = text.trim();
    if (!content) return;
    if (editing) {
      if (publish("edit", { messageId: editing.id, content })) {
        setEditing(null);
        setText("");
      }
      return;
    }
    // atalho do site: /roll 2d20+3
    const roll = /^\/roll\s+(.+)$/i.exec(content);
    if (roll) {
      if (publish("roll", { notation: roll[1].trim() })) setText("");
      return;
    }
    if (send({ content })) setText("");
  }

  function react(m, emoji) {
    publish("react", { messageId: m.id, emoji });
  }

  async function upload(asset, kindOfUpload) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", { uri: asset.uri, name: asset.name, type: asset.type });
      if (kindOfUpload === "image") {
        const { data } = await api.post(`${base}/attachments`, form, { headers: { "Content-Type": "multipart/form-data" } });
        send({ content: text.trim(), imageUrl: data.url });
        setText("");
      } else {
        const { data } = await api.post(`${base}/files`, form, { headers: { "Content-Type": "multipart/form-data" } });
        send({ content: text.trim(), file: data });
        setText("");
      }
    } catch (err) {
      Alert.alert("Envio", err.response?.data?.error || "Não deu pra enviar o arquivo (máx. 8MB pra imagens, 25MB pra arquivos).");
    } finally {
      setUploading(false);
    }
  }

  async function pickImage(fromCamera) {
    setAttachOpen(false);
    const perm = fromCamera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permissão", fromCamera ? "Libere a câmera nas configurações do aparelho." : "Libere o acesso às fotos nas configurações do aparelho.");
      return;
    }
    const opts = { mediaTypes: ["images"], quality: 0.8, allowsEditing: false };
    const res = fromCamera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    const type = a.mimeType && /png|gif|webp|jpe?g/.test(a.mimeType) ? a.mimeType : "image/jpeg";
    const ext = type.split("/")[1].replace("jpeg", "jpg");
    upload({ uri: a.uri, name: a.fileName?.replace(/\.(heic|heif)$/i, ".jpg") || `foto.${ext}`, type }, "image");
  }

  async function pickFile() {
    setAttachOpen(false);
    const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    upload({ uri: a.uri, name: a.name || "arquivo", type: a.mimeType || "application/octet-stream" }, "file");
  }

  function openProfile(userId) {
    if (userId) navigation.navigate("Profile", { userId });
  }

  const data = useMemo(() => [...(messages || [])].reverse(), [messages]);
  const canManage = (m) => user?.role === "ADMIN" || m.authorId === user?.id;

  function jumpTo(id) {
    const index = data.findIndex((m) => m.id === id);
    if (index >= 0) listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      {/* com call ativa, a barrinha "EM CALL" fica embaixo: abre espaço pra ela */}
      <View style={{ flex: 1, padding: 12, paddingBottom: voice?.channel ? 72 + insets.bottom : 0 }}>
        <Sticker shadow={t.shadow} radius={22} style={{ flex: 1 }} innerStyle={{ flex: 1 }}>
          {messages === null ? (
            <ActivityIndicator color={t.text} style={{ marginTop: 30 }} />
          ) : (
            <FlatList
              ref={listRef}
              inverted
              data={data}
              keyExtractor={(item) => String(item.id)}
              contentContainerStyle={{ padding: 14 }}
              onScrollToIndexFailed={() => {}}
              renderItem={({ item, index }) => {
                const msg = (
                <Message
                  m={item}
                  prev={data[index + 1]}
                  me={user}
                  customEmojis={customEmojis}
                  onLongPress={setActionFor}
                  onReact={react}
                  onOpenImage={setViewer}
                  onOpenProfile={openProfile}
                  onJump={jumpTo}
                  onVote={!isDm ? (pollId, optionId) => publish("poll.vote", { pollId, optionId }) : undefined}
                />
                );
                return historyIdsRef.current.has(item.id) ? msg : <Enter kind="rise">{msg}</Enter>;
              }}
              ListEmptyComponent={
                <Txt weight={800} color={t.textMuted} style={{ textAlign: "center", padding: 20, transform: [{ scaleY: -1 }] }}>
                  {emptyText || "Ninguém falou nada ainda. Manda a primeira!"}
                </Txt>
              }
            />
          )}

          {readOnly ? (
            <Txt weight={800} color={t.textMuted} style={{ padding: 14, textAlign: "center" }}>
              Só admins postam nesse canal.
            </Txt>
          ) : (
            <View style={{ borderTopWidth: 2.5, borderTopColor: t.lineSoft }}>
              {replyTo || editing ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingTop: 8 }}>
                  <Icon name={editing ? "pencil" : "reply"} size={15} color={t.accentText} />
                  <Txt weight={800} size={13} color={t.textMuted} style={{ flex: 1 }} numberOfLines={1}>
                    {editing ? "Editando mensagem" : `Respondendo ${replyTo.authorUsername}: ${summary(replyTo)}`}
                  </Txt>
                  <Pressable
                    onPress={() => {
                      setReplyTo(null);
                      if (editing) {
                        setEditing(null);
                        setText("");
                      }
                    }}
                    hitSlop={10}
                  >
                    <Icon name="x" size={16} color={t.textMuted} />
                  </Pressable>
                </View>
              ) : null}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "flex-end",
                  gap: 8,
                  padding: 10,
                  paddingBottom: 10 + (voice?.channel ? 0 : Math.max(0, insets.bottom - 18)),
                }}
              >
                {editing ? null : uploading ? (
                  <View style={{ width: 46, height: 46, alignItems: "center", justifyContent: "center" }}>
                    <ActivityIndicator color={t.text} />
                  </View>
                ) : (
                  <IconBtn icon="plus" tone="mint" size={46} onPress={() => setAttachOpen(true)} label="Anexar" />
                )}
                <Field
                  style={{ flex: 1 }}
                  inputStyle={{ maxHeight: 120 }}
                  placeholder={connected ? placeholder : "Conectando..."}
                  value={text}
                  onChangeText={setText}
                  multiline
                />
                <IconBtn icon="smile" tone="surface2" size={46} onPress={() => setEmojiMode("text")} label="Emoji" />
                <IconBtn icon={editing ? "check" : "send"} tone="accent" size={46} onPress={handleSend} label={editing ? "Salvar" : "Enviar"} />
              </View>
            </View>
          )}
        </Sticker>
      </View>

      {/* ações da mensagem (segurar) */}
      <Sheet visible={!!actionFor} onClose={() => setActionFor(null)} title="MENSAGEM">
        {actionFor ? (
          <>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
              {QUICK_REACTIONS.map((e) => (
                <Pressable
                  key={e}
                  onPress={() => {
                    react(actionFor, e);
                    setActionFor(null);
                  }}
                  style={{ width: 40, height: 40, borderRadius: 12, borderWidth: 2, borderColor: t.ink, backgroundColor: t.surface2, alignItems: "center", justifyContent: "center" }}
                >
                  <Txt size={20}>{e}</Txt>
                </Pressable>
              ))}
            </View>
            <SheetItem
              icon="smile"
              label="Mais emojis"
              onPress={() => {
                const m = actionFor;
                setActionFor(null);
                setTimeout(() => setEmojiMode({ messageId: m.id, message: m }), 350);
              }}
            />
            {!readOnly ? (
              <SheetItem
                icon="reply"
                label="Responder"
                onPress={() => {
                  setEditing(null);
                  setReplyTo(actionFor);
                  setActionFor(null);
                }}
              />
            ) : null}
            {actionFor.content ? (
              <SheetItem
                icon="file"
                label="Copiar texto"
                onPress={() => {
                  Clipboard.setStringAsync(actionFor.content).catch(() => {});
                  setActionFor(null);
                }}
              />
            ) : null}
            {actionFor.authorId === user?.id && actionFor.content && !actionFor.poll && !actionFor.rollNotation ? (
              <SheetItem
                icon="pencil"
                label="Editar"
                onPress={() => {
                  setReplyTo(null);
                  setEditing(actionFor);
                  setText(actionFor.content);
                  setActionFor(null);
                }}
              />
            ) : null}
            {canManage(actionFor) ? (
              <SheetItem
                icon="trash"
                label="Apagar"
                danger
                onPress={() => {
                  const m = actionFor;
                  setActionFor(null);
                  Alert.alert("Apagar mensagem", "Tem certeza? Isso não dá pra desfazer.", [
                    { text: "Cancelar", style: "cancel" },
                    { text: "Apagar", style: "destructive", onPress: () => publish("delete", { messageId: m.id }) },
                  ]);
                }}
              />
            ) : null}
          </>
        ) : null}
      </Sheet>

      {/* anexar */}
      <Sheet visible={attachOpen} onClose={() => setAttachOpen(false)} title="ENVIAR">
        <SheetItem icon="image" label="Foto da galeria" onPress={() => pickImage(false)} />
        <SheetItem icon="camera" label="Tirar foto" onPress={() => pickImage(true)} />
        <SheetItem
          icon="gif"
          label="GIF"
          onPress={() => {
            setAttachOpen(false);
            setTimeout(() => setGifOpen(true), 350);
          }}
        />
        <SheetItem icon="file" label="Arquivo" onPress={pickFile} />
      </Sheet>

      <EmojiSheet
        visible={!!emojiMode}
        onClose={() => setEmojiMode(null)}
        customEmojis={customEmojiList}
        onPick={(e) => {
          if (emojiMode === "text") setText((v) => v + e);
          else if (emojiMode?.message) react(emojiMode.message, e);
          setEmojiMode(null);
        }}
      />
      <GifSheet
        visible={gifOpen}
        onClose={() => setGifOpen(false)}
        onPick={(gif) => {
          send({ imageUrl: gif.url });
          setGifOpen(false);
        }}
      />

      <Modal visible={!!viewer} transparent animationType="fade" onRequestClose={() => setViewer(null)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.92)", justifyContent: "center" }} onPress={() => setViewer(null)}>
          {viewer ? <Image source={{ uri: viewer }} style={{ width: "100%", height: "80%" }} resizeMode="contain" /> : null}
          <View style={{ position: "absolute", top: insets.top + 10, right: 14 }}>
            <IconBtn icon="x" size={42} onPress={() => setViewer(null)} label="Fechar" />
          </View>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}
