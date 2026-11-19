import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { NavigationContainer, DarkTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { registerGlobals } from "@livekit/react-native";
import { loadSession, saveSession, setExpiredHandler } from "./src/api";
import { ThemeProvider, useAppTheme } from "./src/theme/ThemeContext";
import LoginScreen from "./src/screens/LoginScreen";
import HomeScreen from "./src/screens/HomeScreen";
import ChatScreen from "./src/screens/ChatScreen";
import VoiceCallScreen from "./src/screens/VoiceCallScreen";

// Precisa rodar uma vez, antes de qualquer uso do LiveKit, pra registrar o WebRTC nativo.
registerGlobals();

const Stack = createNativeStackNavigator();

function Root() {
  const colors = useAppTheme();
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    setExpiredHandler(() => {
      saveSession(null, null);
      setUser(null);
    });
    loadSession()
      .then((stored) => setUser(stored))
      .finally(() => setReady(true));
  }, []);

  async function handleLogin(token, loggedUser) {
    await saveSession(token, loggedUser);
    setUser(loggedUser);
  }

  async function handleLogout() {
    await saveSession(null, null);
    setUser(null);
  }

  const navTheme = {
    ...DarkTheme,
    colors: { ...DarkTheme.colors, background: colors.bg, card: colors.surface, text: colors.text, primary: colors.accent, border: colors.line },
  };

  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <NavigationContainer theme={navTheme}>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          {user ? (
            <>
              <Stack.Screen name="Home">{(props) => <HomeScreen {...props} user={user} onLogout={handleLogout} />}</Stack.Screen>
              <Stack.Screen name="Chat" component={ChatScreen} options={{ headerShown: true }} />
              <Stack.Screen name="VoiceCall" component={VoiceCallScreen} />
            </>
          ) : (
            <Stack.Screen name="Login">{() => <LoginScreen onLogin={handleLogin} />}</Stack.Screen>
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <Root />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
