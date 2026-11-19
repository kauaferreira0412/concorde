import { useMemo, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import api from "../api";
import { useAppTheme } from "../theme/ThemeContext";

export default function LoginScreen({ onLogin }) {
  const colors = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [usernameOrEmail, setUsernameOrEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!usernameOrEmail.trim() || !password) return;
    setError("");
    setSubmitting(true);
    try {
      const { data } = await api.post("/api/auth/login", {
        usernameOrEmail: usernameOrEmail.trim(),
        password,
        rememberMe: true,
      });
      await onLogin(data.token, data.user);
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.error || "Não foi possível entrar.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.card}>
        <Text style={styles.title}>🛫 Concorde</Text>
        <Text style={styles.subtitle}>Entre com sua conta para continuar</Text>
        <TextInput
          style={styles.input}
          placeholder="Usuário ou email"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          value={usernameOrEmail}
          onChangeText={setUsernameOrEmail}
        />
        <TextInput
          style={styles.input}
          placeholder="Senha"
          placeholderTextColor={colors.textMuted}
          secureTextEntry
          autoCapitalize="none"
          value={password}
          onChangeText={setPassword}
          onSubmitEditing={handleSubmit}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable style={[styles.button, submitting && styles.buttonDisabled]} onPress={handleSubmit} disabled={submitting}>
          {submitting ? <ActivityIndicator color={colors.onAccent} /> : <Text style={styles.buttonText}>Entrar</Text>}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg, justifyContent: "center", padding: 20 },
    card: { backgroundColor: colors.surface, borderRadius: 20, padding: 24, gap: 12, borderWidth: 2, borderColor: colors.line },
    title: { color: colors.text, fontSize: 30, fontWeight: "800", textAlign: "center" },
    subtitle: { color: colors.textMuted, textAlign: "center", marginBottom: 8 },
    input: {
      backgroundColor: colors.surface2,
      color: colors.text,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 16,
      borderWidth: 1,
      borderColor: colors.line,
    },
    error: { color: colors.danger },
    button: { backgroundColor: colors.accent, borderRadius: 14, paddingVertical: 14, alignItems: "center", marginTop: 4 },
    buttonDisabled: { opacity: 0.6 },
    buttonText: { color: colors.onAccent, fontWeight: "700", fontSize: 16 },
  });
}
