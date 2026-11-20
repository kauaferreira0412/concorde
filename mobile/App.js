import { useEffect, useState } from "react";
import { ActivityIndicator, Linking, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import { Bungee_400Regular } from "@expo-google-fonts/bungee";
import { Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold, Nunito_900Black } from "@expo-google-fonts/nunito";
import { NavigationContainer, DarkTheme, DefaultTheme, createNavigationContainerRef } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { getToken, loadSession, saveSession, setExpiredHandler } from "./src/api";
import { ThemeProvider, useTheme } from "./src/theme/ThemeContext";
import LoginScreen from "./src/screens/LoginScreen";
import HomeScreen from "./src/screens/HomeScreen";
import ChannelsScreen from "./src/screens/ChannelsScreen";
import ChatScreen from "./src/screens/ChatScreen";
import VoiceScreen from "./src/screens/VoiceScreen";
import DmChatScreen from "./src/screens/DmChatScreen";
import ProfileScreen from "./src/screens/ProfileScreen";
import EditProfileScreen from "./src/screens/EditProfileScreen";
import { VoiceProvider, useVoice } from "./src/voice/VoiceContext";
import { parseCallLink } from "./src/widgets/activeCalls";
import { useWidgetSync } from "./src/widgets/useWidgetSync";
import VoiceBar from "./src/voice/VoiceBar";
import { DmNotificationsProvider } from "./src/chat/DmNotifications";

SplashScreen.preventAutoHideAsync().catch(() => {});

// cor clara? (decide o texto da barra de status pela cor real do topo, não pelo tema base)
function isLightColor(hex) {
  const n = parseInt(String(hex || "#000000").replace("#", "").slice(0, 6), 16);
  if (Number.isNaN(n)) return false;
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6;
}

const navigationRef = createNavigationContainerRef();
const Stack = createNativeStackNavigator();

/**
 * Links concorde://call/<id> (do widget "Em call agora"): abre a tela da call, que já entra nela.
 * Se o app ainda está carregando, guarda o link e abre assim que der.
 */
function CallLinks({ user, navReady }) {
  const voice = useVoice();
  useWidgetSync(user, voice?.channel?.id);
  useEffect(() => {
    if (!user || !navReady) return undefined;
    function open(url) {
      const channel = parseCallLink(url);
      if (channel && navigationRef.isReady()) navigationRef.navigate("Voice", { channel });
    }
    Linking.getInitialURL().then((url) => url && open(url)).catch(() => {});
    const sub = Linking.addEventListener("url", ({ url }) => open(url));
    return () => sub.remove();
  }, [user, navReady]);
  return null;
}

function Root() {
  const { t, loaded: themeLoaded } = useTheme();
  const [fontsLoaded] = useFonts({ Bungee_400Regular, Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold, Nunito_900Black });
  const [sessionReady, setSessionReady] = useState(false);
  const [user, setUser] = useState(null);
  const [currentRoute, setCurrentRoute] = useState(null);
  const [navReady, setNavReady] = useState(false);

  useEffect(() => {
    setExpiredHandler(() => {
      saveSession(null, null);
      setUser(null);
    });
    loadSession()
      .then((stored) => setUser(stored))
      .finally(() => setSessionReady(true));
  }, []);

  const ready = sessionReady && fontsLoaded && themeLoaded;
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  async function handleLogin(token, loggedUser) {
    await saveSession(token, loggedUser);
    setUser(loggedUser);
  }

  // perfil mudou (foto, cor, status...): guarda o usuário novo junto com a sessão
  function handleUserUpdate(patch) {
    setUser((prev) => {
      const next = prev ? { ...prev, ...patch } : prev;
      if (next) saveSession(getToken(), next).catch(() => {});
      return next;
    });
  }

  async function handleLogout() {
    await saveSession(null, null);
    setUser(null);
  }

  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator color={t.text} />
      </View>
    );
  }

  const base = t.dark ? DarkTheme : DefaultTheme;
  const navTheme = { ...base, colors: { ...base.colors, background: t.bg, card: t.surface, text: t.text, primary: t.accent, border: t.ink } };

  return (
    <VoiceProvider user={user}>
      <DmNotificationsProvider user={user}>
      {/* o topo das telas é a barra na cor de destaque: texto claro em destaque escuro e vice-versa */}
      <StatusBar style={isLightColor(t.accent) ? "dark" : "light"} />
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <NavigationContainer
          theme={navTheme}
          ref={navigationRef}
          onReady={() => {
            setCurrentRoute(navigationRef.getCurrentRoute()?.name);
            setNavReady(true);
          }}
          onStateChange={() => setCurrentRoute(navigationRef.getCurrentRoute()?.name)}
        >
          <Stack.Navigator
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: t.bg },
              animation: "slide_from_right",
              gestureEnabled: true,
              // no iOS cada tela controla a barra de status (o <StatusBar> sozinho não vale): texto claro em topo escuro
              statusBarStyle: isLightColor(t.accent) ? "dark" : "light",
            }}
          >
            {user ? (
              <>
                <Stack.Screen name="Home">
                  {(props) => <HomeScreen {...props} user={user} onLogout={handleLogout} onUserUpdate={handleUserUpdate} />}
                </Stack.Screen>
                <Stack.Screen name="Channels">{(props) => <ChannelsScreen {...props} user={user} />}</Stack.Screen>
                <Stack.Screen name="Chat">{(props) => <ChatScreen {...props} user={user} />}</Stack.Screen>
                <Stack.Screen name="Voice" options={{ animation: "slide_from_bottom" }}>{(props) => <VoiceScreen {...props} user={user} />}</Stack.Screen>
                <Stack.Screen name="DmChat">{(props) => <DmChatScreen {...props} user={user} />}</Stack.Screen>
                <Stack.Screen name="Profile" options={{ animation: "fade_from_bottom" }}>{(props) => <ProfileScreen {...props} user={user} />}</Stack.Screen>
                <Stack.Screen name="EditProfile" options={{ animation: "fade_from_bottom" }}>
                  {(props) => <EditProfileScreen {...props} user={user} onUserUpdate={handleUserUpdate} />}
                </Stack.Screen>
              </>
            ) : (
              <Stack.Screen name="Login">{() => <LoginScreen onLogin={handleLogin} />}</Stack.Screen>
            )}
          </Stack.Navigator>
        </NavigationContainer>
        {user ? <VoiceBar navigationRef={navigationRef} currentRoute={currentRoute} /> : null}
        <CallLinks user={user} navReady={navReady} />
      </View>
      </DmNotificationsProvider>
    </VoiceProvider>
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
