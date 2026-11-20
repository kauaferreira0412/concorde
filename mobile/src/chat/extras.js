import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, Switch, View } from "react-native";
import { Image } from "expo-image";
import api from "../api";
import { useTokens } from "../theme/ThemeContext";
import { Avatar, Btn, Field, Sticker, Txt } from "../ui/kit";
import Sheet from "../ui/Sheet";

const MONO = "Menlo";
const URL_TEST = /^https?:\/\/[^\s<]+$/;

// ---------- Markdown (o mesmo subconjunto do site) ----------

/** Quebra o texto em blocos: ```código```, > citação e texto normal. */
function blocksOf(text) {
  const out = [];
  const parts = String(text).split(/```(?:[a-zA-Z0-9]+\n)?([\s\S]*?)```/g);
  parts.forEach((part, i) => {
    if (i % 2 === 1) {
      out.push({ type: "code", text: part.replace(/\n$/, "") });
      return;
    }
    let quote = [];
    let plain = [];
    const flush = () => {
      if (quote.length) out.push({ type: "quote", text: quote.join("\n") });
      if (plain.length) out.push({ type: "text", text: plain.join("\n") });
      quote = [];
      plain = [];
    };
    for (const line of part.split("\n")) {
      if (/^>\s?/.test(line)) {
        if (plain.length) flush();
        quote.push(line.replace(/^>\s?/, ""));
      } else {
        if (quote.length) flush();
        plain.push(line);
      }
    }
    flush();
  });
  return out.filter((b) => b.text.length || b.type === "code");
}

const INLINE = /(`[^`\n]+`|\*\*[^*\n]+\*\*|__[^_\n]+__|~~[^~\n]+~~|\|\|[^|\n]+\|\||\*[^*\n]+\*|_[^_\n]+_|https?:\/\/[^\s<]+|@[A-Za-z0-9_.-]{2,32})/g;

function Spoiler({ children }) {
  const t = useTokens();
  const [open, setOpen] = useState(false);
  return (
    <Txt
      weight={600}
      size={15}
      onPress={() => setOpen(true)}
      style={open ? { backgroundColor: t.surface2 } : { backgroundColor: t.text, color: t.text }}
    >
      {children}
    </Txt>
  );
}

function Inline({ text, myUsername, base }) {
  const t = useTokens();
  return String(text)
    .split(INLINE)
    .map((seg, i) => {
      if (!seg) return null;
      if (/^`[^`]+`$/.test(seg))
        return (
          <Txt key={i} size={14} style={{ fontFamily: MONO, backgroundColor: t.surface2 }}>
            {seg.slice(1, -1)}
          </Txt>
        );
      if (/^\*\*.+\*\*$/.test(seg) || /^__.+__$/.test(seg))
        return (
          <Txt key={i} weight={900} size={15}>
            {seg.slice(2, -2)}
          </Txt>
        );
      if (/^~~.+~~$/.test(seg))
        return (
          <Txt key={i} weight={600} size={15} style={{ textDecorationLine: "line-through" }}>
            {seg.slice(2, -2)}
          </Txt>
        );
      if (/^\|\|.+\|\|$/.test(seg)) return <Spoiler key={i}>{seg.slice(2, -2)}</Spoiler>;
      if (/^\*.+\*$/.test(seg) || /^_.+_$/.test(seg))
        return (
          <Txt key={i} weight={600} size={15} style={{ fontStyle: "italic" }}>
            {seg.slice(1, -1)}
          </Txt>
        );
      if (URL_TEST.test(seg))
        return (
          <Txt key={i} weight={700} size={15} color={t.accentText} style={{ textDecorationLine: "underline" }} onPress={() => Linking.openURL(seg).catch(() => {})}>
            {seg}
          </Txt>
        );
      if (/^@[A-Za-z0-9_.-]{2,32}$/.test(seg)) {
        const me = seg.slice(1) === myUsername;
        return (
          <Txt key={i} weight={900} size={15} color={me ? t.onPop : t.accentText} style={me ? { backgroundColor: t.mentionBg } : null}>
            {seg}
          </Txt>
        );
      }
      return seg;
    });
}

/** Texto da mensagem com markdown, links tocáveis e @menções. */
export function MarkdownText({ text, myUsername }) {
  const t = useTokens();
  return (
    <View style={{ gap: 4 }}>
      {blocksOf(text).map((b, i) =>
        b.type === "code" ? (
          <View key={i} style={{ borderWidth: 2, borderColor: t.ink, borderRadius: 10, backgroundColor: t.surface2, padding: 8 }}>
            <Txt size={13} style={{ fontFamily: MONO }}>
              {b.text}
            </Txt>
          </View>
        ) : b.type === "quote" ? (
          <View key={i} style={{ borderLeftWidth: 4, borderLeftColor: t.textFaint, paddingLeft: 8 }}>
            <Txt weight={600} size={15} color={t.textMuted} style={{ lineHeight: 22 }}>
              <Inline text={b.text} myUsername={myUsername} />
            </Txt>
          </View>
        ) : (
          <Txt key={i} weight={600} size={15} style={{ lineHeight: 22 }}>
            <Inline text={b.text} myUsername={myUsername} />
          </Txt>
        )
      )}
    </View>
  );
}

// ---------- Prévia de link ----------

const previewCache = new Map();

export function firstLink(text) {
  const m = /https?:\/\/[^\s<]+/.exec(text || "");
  if (!m) return null;
  // GIF/imagem direta já aparece como imagem
  if (/\.(gif|png|jpe?g|webp)(\?|$)/i.test(m[0])) return null;
  return m[0];
}

export function LinkPreviewCard({ url }) {
  const t = useTokens();
  const [data, setData] = useState(() => previewCache.get(url) || null);

  useEffect(() => {
    if (previewCache.has(url)) {
      setData(previewCache.get(url));
      return;
    }
    let active = true;
    api
      .get("/api/link-preview", { params: { url } })
      .then(({ data: d }) => {
        const value = d && (d.title || d.description || d.image) ? d : false;
        previewCache.set(url, value);
        if (active) setData(value);
      })
      .catch(() => previewCache.set(url, false));
    return () => {
      active = false;
    };
  }, [url]);

  if (!data) return null;
  return (
    <Pressable onPress={() => Linking.openURL(url).catch(() => {})} style={{ marginTop: 6, alignSelf: "stretch", maxWidth: 340 }}>
      <Sticker radius={12} shadow={2} bg={t.surface2}>
        <View style={{ borderLeftWidth: 4, borderLeftColor: t.accent, padding: 10, gap: 4 }}>
          {data.siteName ? (
            <Txt weight={800} size={12} color={t.textMuted} numberOfLines={1}>
              {data.siteName}
            </Txt>
          ) : null}
          {data.title ? (
            <Txt weight={900} size={14} color={t.accentText} numberOfLines={2}>
              {data.title}
            </Txt>
          ) : null}
          {data.description ? (
            <Txt weight={600} size={13} color={t.textMuted} numberOfLines={3}>
              {data.description}
            </Txt>
          ) : null}
          {data.image ? (
            <Image
              source={{ uri: data.image }}
              cachePolicy="memory-disk"
              style={{ width: "100%", height: 150, borderRadius: 8, marginTop: 4, backgroundColor: t.surface }}
              contentFit="cover"
            />
          ) : null}
        </View>
      </Sticker>
    </Pressable>
  );
}

// ---------- Digitando ----------

/** Mostra quem está digitando (some sozinho depois de uns segundos sem novidade). */
export function useTyping() {
  const [typers, setTypers] = useState({});
  const timers = useRef({});
  function onEvent(ev, myId) {
    if (!ev || ev.userId === myId) return;
    clearTimeout(timers.current[ev.userId]);
    if (ev.typing) {
      setTypers((p) => ({ ...p, [ev.userId]: ev.username }));
      timers.current[ev.userId] = setTimeout(() => setTypers((p) => {
        const n = { ...p };
        delete n[ev.userId];
        return n;
      }), 6000);
    } else {
      setTypers((p) => {
        const n = { ...p };
        delete n[ev.userId];
        return n;
      });
    }
  }
  useEffect(() => () => Object.values(timers.current).forEach(clearTimeout), []);
  return [Object.values(typers), onEvent];
}

export function TypingLine({ names }) {
  const t = useTokens();
  if (!names.length) return null;
  const label =
    names.length === 1 ? `${names[0]} está digitando...` : names.length === 2 ? `${names[0]} e ${names[1]} estão digitando...` : "Várias pessoas estão digitando...";
  return (
    <Txt weight={800} size={12} color={t.textMuted} style={{ paddingHorizontal: 14, paddingTop: 6 }} numberOfLines={1}>
      ✍️ {label}
    </Txt>
  );
}

// ---------- @menção ----------

export function MentionSuggestions({ text, members, onPick }) {
  const t = useTokens();
  const m = /(^|\s)@([A-Za-z0-9_.-]{0,32})$/.exec(text);
  if (!m || !members?.length) return null;
  const q = m[2].toLowerCase();
  const list = members
    .filter((x) => x.username.toLowerCase().startsWith(q) || (x.nickname || "").toLowerCase().startsWith(q))
    .slice(0, 8);
  if (!list.length) return null;
  return (
    <ScrollView horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 10, paddingTop: 8 }}>
      {list.map((x) => (
        <Pressable
          key={x.userId}
          onPress={() => onPick(text.replace(/@([A-Za-z0-9_.-]{0,32})$/, `@${x.username} `))}
          style={{ flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 2, borderColor: t.ink, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: t.surface2 }}
        >
          <Avatar name={x.username} url={x.avatarUrl} size={20} radius={7} />
          <Txt weight={900} size={13}>
            @{x.username}
          </Txt>
        </Pressable>
      ))}
    </ScrollView>
  );
}

// ---------- Enquete ----------

export function PollSheet({ visible, onClose, onCreate }) {
  const t = useTokens();
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [multiple, setMultiple] = useState(false);
  const clean = options.map((o) => o.trim()).filter(Boolean);
  const valid = question.trim() && clean.length >= 2;
  return (
    <Sheet visible={visible} onClose={onClose} title="NOVA ENQUETE">
      <Field value={question} onChangeText={setQuestion} placeholder="Pergunta" maxLength={200} />
      {options.map((o, i) => (
        <Field
          key={i}
          value={o}
          onChangeText={(v) => setOptions((prev) => prev.map((x, j) => (j === i ? v : x)))}
          placeholder={`Opção ${i + 1}`}
          maxLength={80}
        />
      ))}
      {options.length < 10 ? <Btn small variant="surface" icon="plus" label="Opção" onPress={() => setOptions((p) => [...p, ""])} /> : null}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Txt weight={800} style={{ flex: 1 }}>
          Permitir várias escolhas
        </Txt>
        <Switch value={multiple} onValueChange={setMultiple} trackColor={{ true: t.accent }} />
      </View>
      <Btn
        label="Criar enquete"
        disabled={!valid}
        onPress={() => {
          onCreate({ question: question.trim(), options: clean, multipleChoice: multiple });
          setQuestion("");
          setOptions(["", ""]);
          setMultiple(false);
        }}
      />
    </Sheet>
  );
}

// ---------- Fixadas / Busca ----------

function ResultRow({ m, onPress }) {
  const t = useTokens();
  return (
    <Pressable onPress={onPress}>
      <Sticker radius={14} shadow={2} bg={t.surface2}>
        <View style={{ flexDirection: "row", gap: 10, padding: 10 }}>
          <Avatar name={m.authorUsername} url={m.authorAvatarUrl} size={34} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt weight={900} size={13}>
              {m.authorUsername}{" "}
              <Txt weight={700} size={11} color={t.textFaint}>
                {new Date(m.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
              </Txt>
            </Txt>
            <Txt weight={600} size={14} numberOfLines={3}>
              {m.content || (m.imageUrl ? "📷 imagem" : m.fileName ? `📎 ${m.fileName}` : "mensagem")}
            </Txt>
          </View>
        </View>
      </Sticker>
    </Pressable>
  );
}

export function PinnedSheet({ visible, onClose, base, onJump }) {
  const t = useTokens();
  const [list, setList] = useState(null);
  useEffect(() => {
    if (!visible) return;
    setList(null);
    api
      .get(`${base}/messages/pinned`)
      .then(({ data }) => setList(data || []))
      .catch(() => setList([]));
  }, [visible, base]);
  return (
    <Sheet visible={visible} onClose={onClose} title="MENSAGENS FIXADAS">
      {list === null ? (
        <ActivityIndicator color={t.text} />
      ) : list.length === 0 ? (
        <Txt weight={700} color={t.textMuted}>
          Nenhuma mensagem fixada ainda.
        </Txt>
      ) : (
        list.map((m) => <ResultRow key={m.id} m={m} onPress={() => onJump(m.id)} />)
      )}
    </Sheet>
  );
}

export function SearchSheet({ visible, onClose, base, onJump }) {
  const t = useTokens();
  const [q, setQ] = useState("");
  const [list, setList] = useState(null);
  const timer = useRef(null);
  useEffect(() => {
    clearTimeout(timer.current);
    if (!visible || !q.trim()) {
      setList(null);
      return;
    }
    timer.current = setTimeout(() => {
      setList(undefined);
      api
        .get(`${base}/messages/search`, { params: { q: q.trim() } })
        .then(({ data }) => setList(data || []))
        .catch(() => setList([]));
    }, 350);
    return () => clearTimeout(timer.current);
  }, [q, visible, base]);
  return (
    <Sheet visible={visible} onClose={onClose} title="BUSCAR">
      <Field value={q} onChangeText={setQ} placeholder="Buscar nesta conversa..." autoFocus autoCorrect={false} />
      <Txt weight={600} size={12} color={t.textMuted}>
        Busca pelo texto das mensagens.
      </Txt>
      {list === undefined ? (
        <ActivityIndicator color={t.text} />
      ) : list === null ? null : list.length === 0 ? (
        <Txt weight={700} color={t.textMuted}>
          Nada encontrado.
        </Txt>
      ) : (
        list.map((m) => <ResultRow key={m.id} m={m} onPress={() => onJump(m.id)} />)
      )}
    </Sheet>
  );
}

