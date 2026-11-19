import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useAppTheme, useThemeSettings } from "../../theme/ThemeContext";
import { THEME_TOKENS } from "../../theme/themes";

const SWATCHES = ["#7C5CFF", "#FF5C8A", "#E5484D", "#FF8A3D", "#FFC93D", "#A3E635", "#3DDC97", "#2EC4F1", "#3D7BFF", "#C084FC"];

export default function YouPane({ user, onLogout }) {
  const colors = useAppTheme();
  const theme = useThemeSettings();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [editingToken, setEditingToken] = useState(null);

  if (!theme) return null;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{(user?.username || "?").slice(0, 1).toUpperCase()}</Text>
        </View>
        <Text style={styles.username}>{user?.nickname || user?.username}</Text>
        {user?.username && user?.nickname ? <Text style={styles.handle}>@{user.username}</Text> : null}
      </View>

      <Text style={styles.sectionLabel}>APARÊNCIA</Text>
      <View style={styles.baseToggle}>
        <Pressable
          style={[styles.baseOption, theme.base === "dark" && styles.baseOptionActive]}
          onPress={() => theme.setBase("dark")}
        >
          <Text style={[styles.baseOptionText, theme.base === "dark" && styles.baseOptionTextActive]}>Escuro</Text>
        </Pressable>
        <Pressable
          style={[styles.baseOption, theme.base === "light" && styles.baseOptionActive]}
          onPress={() => theme.setBase("light")}
        >
          <Text style={[styles.baseOptionText, theme.base === "light" && styles.baseOptionTextActive]}>Claro</Text>
        </Pressable>
      </View>

      <Text style={styles.subLabel}>Temas prontos</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.presetRow} contentContainerStyle={{ gap: 10 }}>
        {theme.presets.map((preset) => {
          const active = theme.activePresetId === preset.id;
          const swatchColor = preset.colors?.accent || (preset.base === "light" ? "#6B3FD6" : "#7C4DEB");
          return (
            <Pressable key={preset.id} style={[styles.presetChip, active && styles.presetChipActive]} onPress={() => theme.applyPreset(preset.id)}>
              <View style={[styles.presetDot, { backgroundColor: swatchColor }]} />
              <Text style={[styles.presetName, active && styles.presetNameActive]} numberOfLines={1}>
                {preset.name}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <Text style={styles.subLabel}>Cores customizadas</Text>
      <View style={styles.tokenGrid}>
        {THEME_TOKENS.map((token) => {
          const value = colors[token.key];
          return (
            <Pressable
              key={token.key}
              style={styles.tokenItem}
              onPress={() => setEditingToken(editingToken === token.key ? null : token.key)}
            >
              <View style={[styles.tokenSwatch, { backgroundColor: value }]} />
              <Text style={styles.tokenLabel} numberOfLines={1}>
                {token.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {editingToken && (
        <View style={styles.editorCard}>
          <Text style={styles.editorTitle}>{THEME_TOKENS.find((t) => t.key === editingToken)?.label}</Text>
          <View style={styles.swatchRow}>
            {SWATCHES.map((hex) => (
              <Pressable
                key={hex}
                style={[styles.swatchButton, { backgroundColor: hex }]}
                onPress={() => theme.setColor(editingToken, hex)}
              />
            ))}
          </View>
        </View>
      )}

      <Pressable style={styles.resetButton} onPress={theme.resetAll}>
        <Text style={styles.resetButtonText}>Restaurar cores do tema</Text>
      </Pressable>

      <Pressable style={styles.logoutButton} onPress={onLogout}>
        <Text style={styles.logoutButtonText}>Sair da conta</Text>
      </Pressable>
    </ScrollView>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    content: { padding: 16, paddingBottom: 110, gap: 6 },
    profileCard: { alignItems: "center", gap: 6, paddingVertical: 20 },
    avatar: { width: 76, height: 76, borderRadius: 38, backgroundColor: colors.accent, justifyContent: "center", alignItems: "center" },
    avatarText: { color: colors.onAccent, fontSize: 28, fontWeight: "800" },
    username: { color: colors.text, fontSize: 20, fontWeight: "800", marginTop: 4 },
    handle: { color: colors.textMuted, fontSize: 13 },
    sectionLabel: { color: colors.textMuted, fontSize: 12, fontWeight: "700", marginTop: 10, marginBottom: 10 },
    subLabel: { color: colors.textMuted, fontSize: 12, fontWeight: "700", marginTop: 18, marginBottom: 8 },
    baseToggle: { flexDirection: "row", backgroundColor: colors.surface2, borderRadius: 14, padding: 4, gap: 4 },
    baseOption: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center" },
    baseOptionActive: { backgroundColor: colors.accent },
    baseOptionText: { color: colors.textMuted, fontWeight: "700" },
    baseOptionTextActive: { color: colors.onAccent },
    presetRow: { flexGrow: 0 },
    presetChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: colors.surface,
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderWidth: 2,
      borderColor: colors.line,
      maxWidth: 160,
    },
    presetChipActive: { borderColor: colors.accent },
    presetDot: { width: 14, height: 14, borderRadius: 7 },
    presetName: { color: colors.text, fontWeight: "600", fontSize: 13 },
    presetNameActive: { color: colors.accent },
    tokenGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    tokenItem: { width: "30%", alignItems: "center", gap: 6, backgroundColor: colors.surface, borderRadius: 14, padding: 10, borderWidth: 1, borderColor: colors.line },
    tokenSwatch: { width: 36, height: 36, borderRadius: 10, borderWidth: 1, borderColor: colors.line },
    tokenLabel: { color: colors.textMuted, fontSize: 10, textAlign: "center" },
    editorCard: { backgroundColor: colors.surface, borderRadius: 14, padding: 14, marginTop: 14, gap: 10, borderWidth: 1, borderColor: colors.line },
    editorTitle: { color: colors.text, fontWeight: "700" },
    swatchRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    swatchButton: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: colors.line },
    resetButton: { alignItems: "center", paddingVertical: 12, marginTop: 16 },
    resetButtonText: { color: colors.textMuted, fontWeight: "600" },
    logoutButton: { backgroundColor: colors.danger, borderRadius: 14, paddingVertical: 14, alignItems: "center", marginTop: 10 },
    logoutButtonText: { color: "#fff", fontWeight: "700" },
  });
}
