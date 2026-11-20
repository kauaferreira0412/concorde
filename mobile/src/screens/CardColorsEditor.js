import { useState } from "react";
import { Pressable, View } from "react-native";
import api from "../api";
import { CardThemeProvider, useTheme, useTokens } from "../theme/ThemeContext";
import { Avatar, Btn, SectionTitle, Sticker, Txt } from "../ui/kit";
import ColorPicker, { Swatch } from "../ui/ColorPicker";
import { ProfileBanner } from "./ProfileScreen";

// mesmas cores e combinações do site (Configurações → Perfil → Card do perfil)
const FIELDS = [
  { key: "bg", label: "Fundo do card" },
  { key: "surface", label: "Caixas e blocos" },
  { key: "border", label: "Contorno e sombra" },
  { key: "text", label: "Texto principal" },
  { key: "muted", label: "Texto secundário" },
  { key: "accent", label: "Botões e títulos" },
];
const ACCENTS = [
  { field: "accentColor", label: "Faixa do topo e sombra", empty: "do tema", endpoint: "/api/users/me/accent-color" },
  { field: "accentColor2", label: "Faixa: 2ª cor (gradiente)", empty: "sem gradiente", endpoint: "/api/users/me/accent-color-2" },
];
const PRESETS = [
  { name: "Meia-noite", colors: { bg: "#14121F", surface: "#221E36", border: "#000000", text: "#F4F1FF", muted: "#A79FCB", accent: "#8B6CFF", banner: "#3B2A7A" } },
  { name: "Papel", colors: { bg: "#FFFDF7", surface: "#F1ECDF", border: "#1A1423", text: "#1A1423", muted: "#5B5466", accent: "#E5484D", banner: "#F6A56E" } },
  { name: "Menta", colors: { bg: "#0F2A27", surface: "#16403B", border: "#04110F", text: "#E8FFF9", muted: "#9CD9CC", accent: "#6FE3CF", banner: "#1F6B60" } },
  { name: "Vinho", colors: { bg: "#1E0E14", surface: "#33171F", border: "#000000", text: "#FFEFF2", muted: "#D49AA8", accent: "#FF5C7A", banner: "#7A1F35" } },
  { name: "Pôr do sol", colors: { bg: "#2A1630", surface: "#3D2042", border: "#12070F", text: "#FFF4E8", muted: "#E6B9A4", accent: "#FF9F5A", banner: "#E0567A" } },
];
const HEX = /^#[0-9a-fA-F]{6}$/;

function cleanColors(colors) {
  const out = {};
  for (const { key } of FIELDS) if (HEX.test(colors?.[key] || "")) out[key] = colors[key].toUpperCase();
  return out;
}

/** Prévia do card com as cores escolhidas (usa os mesmos tokens que a tela de perfil). */
function Preview({ user, colors }) {
  const t = useTokens();
  return (
    <Sticker radius={18} shadow={4} shadowColor={user?.accentColor ? user.accentColor2 || user.accentColor : undefined}>
      <ProfileBanner bannerUrl={user?.bannerUrl} accent={user?.accentColor} accent2={user?.accentColor2} height={70} />
      <View style={{ paddingHorizontal: 12, marginTop: -26 }}>
        <Avatar name={user?.username} url={user?.avatarUrl} size={56} radius={18} />
      </View>
      <View style={{ padding: 12, paddingTop: 6, gap: 6 }}>
        <Txt weight="display" size={16} numberOfLines={1}>
          {user?.nickname || user?.username}
        </Txt>
        <Txt weight={800} size={12} color={t.textMuted}>
          @{user?.username}
        </Txt>
        <View style={{ alignSelf: "flex-start" }}>
          <Btn small label="Enviar mensagem" onPress={() => {}} />
        </View>
        <SectionTitle color={colors.accent ? t.accentText : undefined}>Sobre mim</SectionTitle>
        <View style={{ borderWidth: 2, borderColor: t.ink, borderRadius: 12, padding: 8, backgroundColor: t.surface2 }}>
          <Txt weight={700} size={13} numberOfLines={2}>
            {user?.bio || "Um pouco sobre você..."}
          </Txt>
        </View>
      </View>
    </Sticker>
  );
}

/** "Card do perfil": cores próprias que todo mundo vê, igual no site. Salva na hora. */
export default function CardColorsEditor({ user, onUserUpdate }) {
  const t = useTokens();
  const theme = useTheme();
  const [colors, setColors] = useState(() => cleanColors(user?.cardColors));
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState("");

  async function saveColors(next) {
    const clean = cleanColors(next);
    const prev = colors;
    setColors(clean);
    setError("");
    try {
      const { data } = await api.put("/api/users/me/card-colors", { colors: clean });
      onUserUpdate(data);
    } catch (err) {
      setColors(prev);
      setError(err.response?.data?.error || "Não deu pra salvar as cores agora.");
    }
  }

  async function saveAccent(field, color) {
    const item = ACCENTS.find((a) => a.field === field);
    try {
      const { data } = await api.put(item.endpoint, { color: color || "" });
      // sem a 1ª cor não existe gradiente
      if (field === "accentColor" && !color && data.accentColor2) {
        const res = await api.put("/api/users/me/accent-color-2", { color: "" });
        onUserUpdate(res.data);
      } else {
        onUserUpdate(data);
      }
    } catch (err) {
      setError(err.response?.data?.error || "Não deu pra salvar a cor agora.");
    }
  }

  async function applySet(set) {
    const { banner, ...rest } = set || {};
    await saveColors(rest);
    await saveAccent("accentColor", banner || null);
    if (user?.accentColor2) await saveAccent("accentColor2", null);
  }

  function applyMyTheme() {
    const c = theme.t;
    applySet({ bg: c.surface, surface: c.surface2, border: c.ink, text: c.text, muted: c.textMuted, accent: c.accent, banner: c.bg });
  }

  const editingValue = editing ? (editing.field ? user?.[editing.field] : colors[editing.key]) : null;
  const custom = Object.keys(colors).length > 0 || !!user?.accentColor;

  return (
    <View style={{ gap: 12 }}>
      <SectionTitle>Card do perfil</SectionTitle>
      <Txt weight={600} size={12} color={t.textMuted}>
        Cores do seu card que todo mundo vê igual, seja qual for o tema de cada um. Cor vazia segue o tema de quem está vendo.
      </Txt>

      <CardThemeProvider colors={colors}>
        <Preview user={user} colors={colors} />
      </CardThemeProvider>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {FIELDS.map((f) => (
          <Pressable key={f.key} onPress={() => setEditing(f)} style={{ width: "47%", flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Swatch color={colors[f.key]} onPress={() => setEditing(f)} label={f.label} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt weight={800} size={13} numberOfLines={1}>
                {f.label}
              </Txt>
              <Txt weight={700} size={11} color={t.textFaint}>
                {colors[f.key] || "do tema"}
              </Txt>
            </View>
          </Pressable>
        ))}
        {ACCENTS.map((a) => {
          const disabled = a.field === "accentColor2" && !user?.accentColor;
          return (
            <Pressable
              key={a.field}
              disabled={disabled}
              onPress={() => setEditing(a)}
              style={{ width: "47%", flexDirection: "row", alignItems: "center", gap: 8, opacity: disabled ? 0.45 : 1 }}
            >
              <Swatch color={user?.[a.field]} onPress={disabled ? undefined : () => setEditing(a)} label={a.label} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt weight={800} size={13} numberOfLines={1}>
                  {a.label}
                </Txt>
                <Txt weight={700} size={11} color={t.textFaint}>
                  {user?.[a.field] || a.empty}
                </Txt>
              </View>
            </Pressable>
          );
        })}
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <Btn small variant="mint" label="Usar meu tema atual" onPress={applyMyTheme} />
        {PRESETS.map((p) => (
          <Btn key={p.name} small variant="surface" label={p.name} onPress={() => applySet(p.colors)} />
        ))}
        {custom ? <Btn small variant="ghost" label="Voltar pro tema" onPress={() => applySet({})} /> : null}
      </View>
      {error ? (
        <Txt weight={800} color={t.danger}>
          {error}
        </Txt>
      ) : null}

      <ColorPicker
        visible={!!editing}
        title={editing ? editing.label.toUpperCase() : ""}
        value={editingValue}
        onClose={() => setEditing(null)}
        onPick={(hex) => {
          const target = editing;
          setEditing(null);
          if (target.field) saveAccent(target.field, hex);
          else saveColors({ ...colors, [target.key]: hex });
        }}
        onClear={
          editingValue
            ? () => {
                const target = editing;
                setEditing(null);
                if (target.field) saveAccent(target.field, null);
                else {
                  const next = { ...colors };
                  delete next[target.key];
                  saveColors(next);
                }
              }
            : undefined
        }
        clearLabel={editing?.field ? "Tirar a cor" : "Usar a do tema"}
      />
    </View>
  );
}
