import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, Share, Switch, View } from "react-native";
import api from "../api";
import { useTheme } from "../theme/ThemeContext";
import { BASE_THEMES, resolveColors } from "../theme/themes";
import { useVoice } from "../voice/VoiceContext";
import { Avatar, Btn, Field, Screen, SectionTitle, Sticker, Tag, Txt } from "../ui/kit";
import Icon from "../ui/icons";
import TopBar from "../ui/TopBar";
import { ProfileBanner } from "./ProfileScreen";
import { getSoundsEnabled, setSoundsEnabled } from "../voice/sounds";

const STATUS_LABEL = { ONLINE: "Online", AWAY: "Ausente", DND: "Não perturbe", INVISIBLE: "Invisível" };

/** Miniatura do layout desenhada com as cores do tema (igual às do site). */
function ThemeThumb({ base, colors, height = 70 }) {
  const c = resolveColors(base, colors);
  return (
    <View style={{ height, flexDirection: "row", gap: 5, padding: 7, borderRadius: 10, borderWidth: 2, borderColor: c.ink, backgroundColor: c.bg }}>
      <View style={{ width: "34%", borderRadius: 6, borderWidth: 1.5, borderColor: c.ink, backgroundColor: c.surface, overflow: "hidden" }}>
        <View style={{ height: 12, backgroundColor: c.accent, borderBottomWidth: 1.5, borderBottomColor: c.ink }} />
        <View style={{ height: 5, margin: 4, borderRadius: 3, backgroundColor: c.textMuted, opacity: 0.4 }} />
        <View style={{ height: 7, marginHorizontal: 4, borderRadius: 3, backgroundColor: c.accent }} />
      </View>
      <View style={{ flex: 1, borderRadius: 6, borderWidth: 1.5, borderColor: c.ink, backgroundColor: c.surface, padding: 5, gap: 4 }}>
        <View style={{ flexDirection: "row", gap: 3, alignItems: "center" }}>
          <View style={{ width: 9, height: 9, borderRadius: 3, backgroundColor: c.orange, borderWidth: 1, borderColor: c.ink }} />
          <View style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: c.textMuted, opacity: 0.4 }} />
        </View>
        <View style={{ flexDirection: "row", gap: 3, alignItems: "center" }}>
          <View style={{ width: 9, height: 9, borderRadius: 3, backgroundColor: c.mint, borderWidth: 1, borderColor: c.ink }} />
          <View style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: c.textMuted, opacity: 0.4 }} />
        </View>
        <View style={{ marginTop: "auto", alignSelf: "flex-end", width: "35%", height: 7, borderRadius: 3, backgroundColor: c.accent }} />
      </View>
    </View>
  );
}

function Gallery() {
  const theme = useTheme();
  const { t } = theme;
  const [sort, setSort] = useState("popular");
  const [themes, setThemes] = useState(null);
  const [error, setError] = useState("");
  const [appliedId, setAppliedId] = useState(null);

  useEffect(() => {
    setThemes(null);
    setError("");
    api
      .get("/api/themes", { params: { sort } })
      .then(({ data }) => setThemes(data))
      .catch((err) => {
        setThemes([]);
        setError(err.response?.status === 404 ? "A galeria ainda não está no servidor." : "Não deu pra carregar a galeria agora.");
      });
  }, [sort]);

  function apply(item) {
    theme.applyAppearanceAsPreset(item.name, { base: item.base, colors: item.colors, waves: item.waves });
    setAppliedId(item.id);
    api.post(`/api/themes/${item.id}/use`).catch(() => {});
  }

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {[
          ["popular", "Populares"],
          ["recent", "Recentes"],
        ].map(([id, label]) => (
          <Pressable
            key={id}
            onPress={() => setSort(id)}
            style={{ borderWidth: 2, borderColor: t.ink, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5, backgroundColor: sort === id ? t.accent : t.surface }}
          >
            <Txt weight={900} size={13} color={sort === id ? t.onAccent : t.text}>
              {label}
            </Txt>
          </Pressable>
        ))}
      </View>
      {error ? (
        <Txt weight={800} color={t.danger}>
          {error}
        </Txt>
      ) : null}
      {themes === null ? (
        <ActivityIndicator color={t.text} />
      ) : themes.length === 0 && !error ? (
        <Txt weight={700} color={t.textMuted}>
          Ninguém publicou um tema ainda - dá pra publicar pelo site.
        </Txt>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingRight: 6, paddingBottom: 4 }}>
          {themes.map((item) => (
            <Sticker key={item.id} radius={16} shadow={3} style={{ width: 200 }}>
              <View style={{ height: 112, borderBottomWidth: 2, borderBottomColor: t.ink, backgroundColor: t.surface2 }}>
                {item.coverUrl ? (
                  <Image source={{ uri: item.coverUrl }} style={{ width: "100%", height: "100%" }} />
                ) : (
                  <View style={{ padding: 8 }}>
                    <ThemeThumb base={item.base} colors={item.colors} height={94} />
                  </View>
                )}
                <View style={{ position: "absolute", left: 6, bottom: 6, flexDirection: "row", gap: 4 }}>
                  <Tag label={item.base === "light" ? "CLARO" : "ESCURO"} bg={t.surface} color={t.text} />
                  {item.wallpaperUrl ? <Tag label="FUNDO" bg={t.surface} color={t.text} /> : null}
                </View>
              </View>
              <View style={{ padding: 10, gap: 4 }}>
                <Txt weight={900} numberOfLines={1}>
                  {item.name}
                </Txt>
                <Txt weight={700} size={12} color={t.textMuted} numberOfLines={1}>
                  por {item.authorUsername} · {item.uses} uso{item.uses === 1 ? "" : "s"}
                </Txt>
                <Btn small label={appliedId === item.id ? "Aplicado" : "Aplicar"} icon={appliedId === item.id ? "check" : undefined} onPress={() => apply(item)} style={{ marginTop: 4 }} />
              </View>
            </Sticker>
          ))}
        </ScrollView>
      )}
      <Txt weight={600} size={12} color={t.textMuted}>
        No app vêm as cores do tema. A imagem de fundo dos temas só aparece no site por enquanto.
      </Txt>
    </View>
  );
}

export default function MeScreen({ navigation, user, onLogout, embedded }) {
  const theme = useTheme();
  const { t } = theme;
  const voice = useVoice();
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState(null);
  const [sounds, setSounds] = useState(getSoundsEnabled);

  function confirmLogout() {
    Alert.alert(
      "Sair da conta",
      voice?.channel ? "Você está numa call agora - sair da conta também te desconecta dela. Tem certeza?" : "Tem certeza que quer sair da sua conta?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Sair",
          style: "destructive",
          onPress: async () => {
            if (voice?.channel) await voice.leave();
            onLogout();
          },
        },
      ]
    );
  }

  function importCode() {
    try {
      const name = theme.importPreset(code);
      setCode("");
      setMsg({ ok: true, text: `Tema "${name}" importado e aplicado.` });
    } catch (err) {
      setMsg({ ok: false, text: err.message || "Código de tema inválido" });
    }
  }

  async function shareCode() {
    const active = theme.presets.find((p) => p.id === theme.activePresetId);
    try {
      await Share.share({ message: theme.exportCurrent(active?.name || "Meu tema") });
    } catch {
      // cancelou
    }
  }

  return (
    <Screen>
      <TopBar title="VOCÊ" subtitle="Perfil e aparência" onBack={embedded ? undefined : () => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ padding: 14, gap: 16, paddingBottom: 130 }}>
        <Sticker radius={22} shadow={t.shadow}>
          <ProfileBanner bannerUrl={user?.bannerUrl} accent={user?.accentColor} accent2={user?.accentColor2} height={90} />
          <View style={{ flexDirection: "row", gap: 12, paddingHorizontal: 16, marginTop: -32, alignItems: "flex-end" }}>
            <Avatar name={user?.username} url={user?.avatarUrl} size={76} radius={24} />
            <View style={{ flex: 1, paddingBottom: 4 }}>
              <Txt weight="display" size={18} numberOfLines={1}>
                {(user?.nickname || user?.username || "").toUpperCase()}
              </Txt>
              <Txt weight={800} color={t.textMuted}>
                @{user?.username}
              </Txt>
            </View>
          </View>
          <View style={{ padding: 16, paddingTop: 10, gap: 6 }}>
            <Txt weight={700} color={t.textMuted}>
              {user?.customStatus || STATUS_LABEL[user?.status] || "Online"}
            </Txt>
            {user?.bio ? <Txt weight={600}>{user.bio}</Txt> : null}
            <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap", marginTop: 6 }}>
              <Btn small icon="pencil" label="Editar perfil" onPress={() => navigation.navigate("EditProfile")} />
              <Btn small variant="surface" icon="user" label="Ver meu perfil" onPress={() => navigation.navigate("Profile", { userId: user?.id })} />
            </View>
          </View>
        </Sticker>

        <Sticker radius={22} shadow={4}>
          <View style={{ padding: 16, gap: 14 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Icon name="palette" color={t.text} />
              <Txt weight="display" size={16}>
                APARÊNCIA
              </Txt>
            </View>

            <SectionTitle>Tema base</SectionTitle>
            <View style={{ flexDirection: "row", gap: 12 }}>
              {["light", "dark"].map((base) => {
                const active = theme.base === base;
                return (
                  <Pressable key={base} style={{ flex: 1 }} onPress={() => !active && theme.setBase(base)}>
                    <Sticker radius={14} shadow={active ? 3 : 0} shadowColor={t.accent} border={active ? 3 : 2.5}>
                      <View style={{ padding: 8, gap: 6 }}>
                        <ThemeThumb base={base} colors={{}} />
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                          {active ? <Icon name="check" size={15} color={t.text} /> : null}
                          <Txt weight={900}>{BASE_THEMES[base].label}</Txt>
                        </View>
                      </View>
                    </Sticker>
                  </Pressable>
                );
              })}
            </View>

            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Txt weight={800}>Ondas no fundo</Txt>
              <Switch value={theme.waves} onValueChange={theme.setWaves} trackColor={{ true: t.accent }} />
            </View>

            <SectionTitle>Presets</SectionTitle>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              {theme.presets.map((p) => {
                const c = resolveColors(p.base, p.colors);
                const active = p.id === theme.activePresetId;
                return (
                  <Pressable
                    key={p.id}
                    style={{ width: "47%" }}
                    onPress={() => theme.applyPreset(p.id)}
                    onLongPress={() =>
                      !p.builtin &&
                      Alert.alert("Apagar preset", `Apagar "${p.name}"?`, [
                        { text: "Cancelar", style: "cancel" },
                        { text: "Apagar", style: "destructive", onPress: () => theme.deletePreset(p.id) },
                      ])
                    }
                  >
                    <Sticker radius={12} shadow={active ? 3 : 2} shadowColor={active ? t.accent : undefined}>
                      <View style={{ padding: 9, gap: 6 }}>
                        <View style={{ flexDirection: "row", gap: 3 }}>
                          {["bg", "surface", "accent", "mint", "orange"].map((k) => (
                            <View key={k} style={{ width: 16, height: 16, borderRadius: 5, borderWidth: 1.5, borderColor: t.ink, backgroundColor: c[k] }} />
                          ))}
                        </View>
                        <Txt weight={900} size={13} numberOfLines={1}>
                          {p.name} {active ? "✓" : ""}
                        </Txt>
                        <Txt weight={700} size={11} color={t.textMuted}>
                          {p.builtin ? "padrão" : "seu"} · {p.base === "light" ? "claro" : "escuro"}
                        </Txt>
                      </View>
                    </Sticker>
                  </Pressable>
                );
              })}
            </View>
            <Txt weight={600} size={12} color={t.textMuted}>
              Segure um preset seu pra apagar.
            </Txt>

            <SectionTitle>Código de tema</SectionTitle>
            <Field value={code} onChangeText={setCode} placeholder="Cole aqui o CONCORDE-TEMA:..." autoCapitalize="none" autoCorrect={false} />
            <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
              <Btn small label="Importar" onPress={importCode} disabled={!code.trim()} />
              <Btn small variant="surface" label="Compartilhar o meu" onPress={shareCode} />
            </View>
            {msg ? (
              <Txt weight={800} color={msg.ok ? t.mintText : t.danger}>
                {msg.text}
              </Txt>
            ) : null}

            <SectionTitle>Galeria da comunidade</SectionTitle>
            <Gallery />
          </View>
        </Sticker>

        <Sticker radius={20} shadow={4}>
          <View style={{ padding: 16, gap: 10 }}>
            <SectionTitle>Call</SectionTitle>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Txt weight={800} style={{ flex: 1 }}>
                Sons de entrar, sair, mutar e live
              </Txt>
              <Switch
                value={sounds}
                onValueChange={(v) => {
                  setSounds(v);
                  setSoundsEnabled(v);
                }}
                trackColor={{ true: t.accent }}
              />
            </View>
          </View>
        </Sticker>

        <Btn variant="danger" icon="logout" label="SAIR DA CONTA" onPress={confirmLogout} block />
      </ScrollView>
    </Screen>
  );
}
