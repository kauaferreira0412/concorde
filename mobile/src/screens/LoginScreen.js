import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { Image } from "expo-image";
import api from "../api";
import { useTokens } from "../theme/ThemeContext";
import { Btn, Field, Screen, Sticker, Txt } from "../ui/kit";

const MASCOT = require("../../assets/splash-icon.png");

export default function LoginScreen({ onLogin }) {
  const t = useTokens();
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
    <Screen>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 20 }} keyboardShouldPersistTaps="handled">
          <Sticker shadow={t.shadow} radius={24}>
            <View style={{ padding: 24, gap: 14, alignItems: "stretch" }}>
              <View style={{ alignItems: "center", gap: 6 }}>
                <Sticker bg={t.mint} radius={22} shadow={3} innerStyle={{ padding: 6 }}>
                  <Image source={MASCOT} style={{ width: 84, height: 84 }} />
                </Sticker>
                <Txt weight="display" size={28} style={{ marginTop: 6 }}>
                  CONCORDE
                </Txt>
                <Txt weight={700} color={t.textMuted}>
                  Entre com sua conta para continuar
                </Txt>
              </View>
              <Field
                placeholder="Usuário ou email"
                autoCapitalize="none"
                autoCorrect={false}
                value={usernameOrEmail}
                onChangeText={setUsernameOrEmail}
                returnKeyType="next"
              />
              <Field
                placeholder="Senha"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
                onSubmitEditing={handleSubmit}
                returnKeyType="go"
              />
              {error ? (
                <Txt weight={800} color={t.danger}>
                  {error}
                </Txt>
              ) : null}
              {submitting ? (
                <ActivityIndicator color={t.accent} style={{ marginVertical: 12 }} />
              ) : (
                <Btn label="ENTRAR" onPress={handleSubmit} disabled={!usernameOrEmail.trim() || !password} block />
              )}
            </View>
          </Sticker>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
