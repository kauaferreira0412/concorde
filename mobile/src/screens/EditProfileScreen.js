import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Switch, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import api from "../api";
import { useTokens } from "../theme/ThemeContext";
import { Avatar, Btn, Field, IconBtn, Screen, SectionTitle, Sticker, Txt } from "../ui/kit";
import TopBar from "../ui/TopBar";
import { ProfileBanner } from "./ProfileScreen";
import { Image } from "expo-image";
import CardColorsEditor from "./CardColorsEditor";
import { blockFromPreview, looksLikeUrl, normalizeUrl } from "../utils/linkAutofill";

const STATUSES = [
  ["ONLINE", "Online", "success"],
  ["AWAY", "Ausente", "orange"],
  ["DND", "Não perturbe", "danger"],
  ["INVISIBLE", "Invisível", "textFaint"],
];
const BLOCK_TYPES = { music: "Música", game: "Jogo", link: "Link" };

export default function EditProfileScreen({ navigation, user, onUserUpdate }) {
  const t = useTokens();
  const [nickname, setNickname] = useState(user?.nickname || "");
  const [bio, setBio] = useState(user?.bio || "");
  const [customStatus, setCustomStatus] = useState(user?.customStatus || "");
  const [blocks, setBlocks] = useState(() =>
    (user?.aboutBlocks || []).map((b) => ({ ...b, subtitle: b.subtitle || "", url: b.url || "", image: b.image || null }))
  );
  // colou um link no bloco: busca a prévia e preenche título, detalhe e capa (igual ao site)
  const [lookup, setLookup] = useState({});
  const lookupTimers = useRef({});
  const autoRef = useRef({});
  useEffect(() => {
    const timers = lookupTimers.current;
    return () => Object.values(timers).forEach(clearTimeout);
  }, []);

  function onUrlChange(i, value) {
    setBlocks((prev) => prev.map((x, j) => (j === i ? { ...x, url: value } : x)));
    clearTimeout(lookupTimers.current[i]);
    if (!looksLikeUrl(value)) return;
    lookupTimers.current[i] = setTimeout(() => fetchPreview(i, value), 500);
  }

  async function fetchPreview(i, value) {
    setLookup((p) => ({ ...p, [i]: "busy" }));
    try {
      const { data } = await api.get("/api/link-preview", { params: { url: normalizeUrl(value) } });
      setBlocks((prev) =>
        prev.map((b, j) => {
          if (j !== i || b.url.trim() !== value.trim()) return b;
          const found = blockFromPreview(data, b.type);
          if (!found) return b;
          const last = autoRef.current[i] || {};
          const next = { ...b, image: found.image || b.image };
          if (found.title && (!b.title.trim() || b.title === last.title)) next.title = found.title;
          if (found.subtitle && b.type !== "link" && (!b.subtitle.trim() || b.subtitle === last.subtitle)) next.subtitle = found.subtitle;
          autoRef.current[i] = { title: next.title, subtitle: next.subtitle };
          return next;
        })
      );
      setLookup((p) => ({ ...p, [i]: undefined }));
    } catch {
      setLookup((p) => ({ ...p, [i]: "fail" }));
    }
  }
  const [uploading, setUploading] = useState(null);
  // a foto escolhida aparece na hora, enquanto sobe (antes só aparecia quando o envio terminava)
  const [preview, setPreview] = useState({});
  const [saving, setSaving] = useState(false);

  async function call(fn, okMsg) {
    try {
      const { data } = await fn();
      onUserUpdate(data);
      if (okMsg) Alert.alert("Perfil", okMsg);
      return true;
    } catch (err) {
      Alert.alert("Perfil", err.response?.data?.error || "Não deu pra salvar agora.");
      return false;
    }
  }

  async function pick(kind) {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permissão", "Libere o acesso às fotos nas configurações do aparelho.");
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.85,
      // o recorte do iOS é sempre quadrado: só usa pra foto de perfil
      allowsEditing: kind === "avatar",
      aspect: [1, 1],
    });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    let uri = a.uri;
    let type = a.mimeType && /png|gif|webp|jpe?g/.test(a.mimeType) ? a.mimeType : "image/jpeg";
    setPreview((p) => ({ ...p, [kind]: uri }));
    setUploading(kind);
    // foto da galeria vem com vários MB: reduz (igual ao recorte do site) pra subir rápido. GIF vai inteiro.
    if (type !== "image/gif") {
      try {
        const width = kind === "avatar" ? 512 : 1500;
        const ctx = ImageManipulator.manipulate(a.uri);
        if ((a.width || 0) > width) ctx.resize({ width });
        const rendered = await ctx.renderAsync();
        const saved = await rendered.saveAsync({ compress: 0.85, format: SaveFormat.JPEG });
        uri = saved.uri;
        type = "image/jpeg";
      } catch {
        // não deu pra reduzir: manda a original
      }
    }
    const form = new FormData();
    form.append("file", { uri, name: `${kind}.${type.split("/")[1].replace("jpeg", "jpg")}`, type });
    await call(async () => {
      const response = await api.post(`/api/users/me/${kind}`, form, { headers: { "Content-Type": "multipart/form-data" } });
      // já baixa a foto nova pro cache antes de trocar, pra não piscar
      const next = kind === "avatar" ? response.data?.avatarUrl : response.data?.bannerUrl;
      if (next) await Image.prefetch(next, "memory-disk").catch(() => {});
      return response;
    });
    setPreview((p) => ({ ...p, [kind]: undefined }));
    setUploading(null);
  }

  async function saveAll() {
    setSaving(true);
    const okProfile = await call(() => api.put("/api/users/me/profile", { nickname: nickname.trim(), bio: bio.trim() }));
    const okStatus =
      okProfile && customStatus.trim() !== (user?.customStatus || "")
        ? await call(() => api.put("/api/users/me/custom-status", { text: customStatus.trim() }))
        : okProfile;
    const clean = blocks.map((b) => ({
      type: b.type,
      title: b.title.trim(),
      subtitle: b.subtitle?.trim() || null,
      url: b.url?.trim() || null,
      image: b.image || null,
    }));
    const missing = clean.findIndex((b) => !b.title || (b.type === "link" && !b.url));
    let okBlocks = okStatus;
    if (okStatus) {
      if (missing >= 0) {
        Alert.alert("Blocos", `O bloco ${missing + 1} precisa de ${clean[missing].title ? "um link" : "um título"}.`);
        okBlocks = false;
      } else {
        okBlocks = await call(() => api.put("/api/users/me/about-blocks", { blocks: clean }));
      }
    }
    setSaving(false);
    if (okBlocks) navigation.goBack();
  }

  return (
    <Screen>
      <TopBar
        title="EDITAR PERFIL"
        subtitle={`@${user?.username}`}
        onBack={() => navigation.goBack()}
        right={saving ? <ActivityIndicator color={t.onAccent} /> : <IconBtn icon="check" tone="mint" size={40} label="Salvar" onPress={saveAll} />}
      />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ width: "100%", maxWidth: 720, alignSelf: "center", padding: 14, gap: 16, paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
          <Sticker radius={22} shadow={t.shadow}>
            <Pressable onPress={() => pick("banner")}>
              <ProfileBanner bannerUrl={preview.banner || user?.bannerUrl} accent={user?.accentColor} accent2={user?.accentColor2} height={110} />
            </Pressable>
            <View style={{ flexDirection: "row", gap: 12, paddingHorizontal: 16, marginTop: -36, alignItems: "flex-end" }}>
              <Pressable onPress={() => pick("avatar")}>
                <Avatar name={user?.username} url={preview.avatar || user?.avatarUrl} size={80} radius={24} />
              </Pressable>
              {uploading ? <ActivityIndicator color={t.text} style={{ marginBottom: 10 }} /> : null}
            </View>
            <View style={{ padding: 16, gap: 10 }}>
              <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
                <Btn small label="Trocar foto" onPress={() => pick("avatar")} disabled={!!uploading} />
                <Btn small variant="surface" label={user?.bannerUrl ? "Trocar banner" : "Adicionar banner"} onPress={() => pick("banner")} disabled={!!uploading} />
                {user?.bannerUrl ? (
                  <Btn small variant="surface" label="Tirar banner" onPress={() => call(() => api.delete("/api/users/me/banner"))} disabled={!!uploading} />
                ) : null}
              </View>
              <Txt weight={600} size={12} color={t.textMuted}>
                PNG, JPG, WEBP ou GIF, até 8MB.
              </Txt>
            </View>
          </Sticker>

          <Sticker radius={20} shadow={4}>
            <View style={{ padding: 16, gap: 10 }}>
              <CardColorsEditor user={user} onUserUpdate={onUserUpdate} />
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 6 }}>
                <Txt weight={800} style={{ flex: 1 }}>
                  Na call, minha foto (GIF) só se mexe enquanto eu falo
                </Txt>
                <Switch
                  value={!!user?.avatarAnimateOnSpeak}
                  onValueChange={(v) => call(() => api.put("/api/users/me/avatar-animation", { onlyWhenSpeaking: v }))}
                  trackColor={{ true: t.accent }}
                />
              </View>
            </View>
          </Sticker>

          <Sticker radius={20} shadow={4}>
            <View style={{ padding: 16, gap: 10 }}>
              <SectionTitle>Status</SectionTitle>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {STATUSES.map(([id, label, color]) => {
                  const active = (user?.status || "ONLINE") === id;
                  return (
                    <Pressable
                      key={id}
                      onPress={() => call(() => api.put("/api/users/me/status", { status: id }))}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 6,
                        borderWidth: 2.5,
                        borderColor: t.ink,
                        borderRadius: 999,
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        backgroundColor: active ? t.accent : t.surface2,
                      }}
                    >
                      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: t[color] }} />
                      <Txt weight={900} size={13} color={active ? t.onAccent : t.text}>
                        {label}
                      </Txt>
                    </Pressable>
                  );
                })}
              </View>
              <SectionTitle style={{ marginTop: 6 }}>Status personalizado</SectionTitle>
              <Field value={customStatus} onChangeText={setCustomStatus} placeholder="ex.: 🎲 mestrando às 21h" maxLength={80} />
            </View>
          </Sticker>

          <Sticker radius={20} shadow={4}>
            <View style={{ padding: 16, gap: 10 }}>
              <SectionTitle>Apelido</SectionTitle>
              <Field value={nickname} onChangeText={setNickname} placeholder={user?.username} maxLength={32} />
              <SectionTitle style={{ marginTop: 6 }}>Sobre mim</SectionTitle>
              <Field value={bio} onChangeText={setBio} placeholder="Conte um pouco sobre você..." maxLength={190} multiline inputStyle={{ minHeight: 80, textAlignVertical: "top" }} />

              <SectionTitle style={{ marginTop: 6 }}>Blocos do perfil</SectionTitle>
              <Txt weight={600} size={12} color={t.textMuted}>
                Música do momento, jogos favoritos e links (até 8). Cole o link que o resto se preenche sozinho.
              </Txt>
              {blocks.map((b, i) => (
                <View key={i} style={{ gap: 8, padding: 10, borderRadius: 14, borderWidth: 2.5, borderColor: t.ink, backgroundColor: t.surface2 }}>
                  <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
                    {b.image ? (
                      <Pressable
                        onPress={() => setBlocks((prev) => prev.map((x, j) => (j === i ? { ...x, image: null } : x)))}
                        accessibilityLabel="Tirar a capa"
                      >
                        <Image source={{ uri: b.image }} style={{ width: 34, height: 34, borderRadius: 9, borderWidth: 2, borderColor: t.ink }} />
                      </Pressable>
                    ) : null}
                    {Object.entries(BLOCK_TYPES).map(([type, label]) => (
                      <Pressable
                        key={type}
                        onPress={() => setBlocks((prev) => prev.map((x, j) => (j === i ? { ...x, type } : x)))}
                        style={{ borderWidth: 2, borderColor: t.ink, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, backgroundColor: b.type === type ? t.accent : t.surface }}
                      >
                        <Txt weight={900} size={12} color={b.type === type ? t.onAccent : t.text}>
                          {label}
                        </Txt>
                      </Pressable>
                    ))}
                    <View style={{ flex: 1 }} />
                    <IconBtn icon="trash" size={34} tone="surface" label="Remover bloco" onPress={() => setBlocks((prev) => prev.filter((_, j) => j !== i))} />
                  </View>
                  <Field
                    value={b.title}
                    onChangeText={(v) => setBlocks((prev) => prev.map((x, j) => (j === i ? { ...x, title: v } : x)))}
                    placeholder={b.type === "music" ? "Música" : b.type === "game" ? "Jogo" : "Nome do link"}
                    maxLength={60}
                  />
                  {b.type !== "link" ? (
                    <Field
                      value={b.subtitle}
                      onChangeText={(v) => setBlocks((prev) => prev.map((x, j) => (j === i ? { ...x, subtitle: v } : x)))}
                      placeholder={b.type === "music" ? "Artista" : "Detalhe (ex.: main bardo)"}
                      maxLength={80}
                    />
                  ) : null}
                  <Field
                    value={b.url}
                    onChangeText={(v) => onUrlChange(i, v)}
                    placeholder={b.type === "link" ? "https://..." : "Cole o link (Spotify, YouTube, Steam...)"}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                    maxLength={300}
                  />
                  {lookup[i] ? (
                    <Txt weight={700} size={12} color={t.textMuted}>
                      {lookup[i] === "busy" ? "Buscando o link..." : "Não deu pra ler esse link."}
                    </Txt>
                  ) : b.image ? (
                    <Txt weight={700} size={12} color={t.textFaint}>
                      Toque na capa pra tirar.
                    </Txt>
                  ) : null}
                </View>
              ))}
              {blocks.length < 8 ? (
                <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                  {Object.entries(BLOCK_TYPES).map(([type, label]) => (
                    <Btn key={type} small variant="surface" icon="plus" label={label} onPress={() => setBlocks((prev) => [...prev, { type, title: "", subtitle: "", url: "", image: null }])} />
                  ))}
                </View>
              ) : null}
            </View>
          </Sticker>

          <Btn label={saving ? "SALVANDO..." : "SALVAR PERFIL"} icon="check" onPress={saveAll} disabled={saving} block />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
