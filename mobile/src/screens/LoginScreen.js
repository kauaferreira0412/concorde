import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import api from "../api";
import { colors } from "../theme";

export default function LoginScreen({ onLogin }) {
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
        <Text style={styles.title}>Concorde</Text>
        <Text style={styles.subtitle}>Entre com sua conta para continuar</Text>
        <TextInput
          style={styles.input}
          placeholder="Usuário ou email"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          autoCorrect={false}
          value={usernameOrEmail}
          onChangeText={setUsernameOrEmail}
        />
        <TextInput
          style={styles.input}
          placeholder="Senha"
          placeholderTextColor={colors.muted}
          secureTextEntry
          autoCapitalize="none"
          value={password}
          onChangeText={setPassword}
          onSubmitEditing={handleSubmit}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable style={[styles.button, submitting && styles.buttonDisabled]} onPress={handleSubmit} disabled={submitting}>
          {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Entrar</Text>}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, justifyContent: "center", padding: 20 },
  card: { backgroundColor: colors.card, borderRadius: 12, padding: 20, gap: 12 },
  title: { color: colors.text, fontSize: 28, fontWeight: "700", textAlign: "center" },
  subtitle: { color: colors.muted, textAlign: "center", marginBottom: 8 },
  input: { backgroundColor: colors.input, color: colors.text, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  error: { color: colors.danger },
  button: { backgroundColor: colors.accent, borderRadius: 8, paddingVertical: 14, alignItems: "center", marginTop: 4 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
});
