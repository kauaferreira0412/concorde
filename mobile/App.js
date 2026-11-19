import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
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
import { VoiceProvider } from "./src/voice/VoiceContext";
import VoiceBar from "./src/voice/VoiceBar";

SplashScreen.preventAutoHideAsync().catch(() => {});

const navigationRef = createNavigationContainerRef();
const Stack = createNativeStackNavigator();

function Root() {
  const { t, loaded: themeLoaded } = useTheme();
  const [fontsLoaded] = useFonts({ Bungee_400Regular, Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold, Nunito_900Black });
  const [sessionReady, setSessionReady] = useState(false);
  const [user, setUser] = useState(null);
  const [currentRoute, setCurrentRoute] = useState(null);

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
      <StatusBar style={t.dark ? "light" : "dark"} />
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <NavigationContainer
          theme={navTheme}
          ref={navigationRef}
          onReady={() => setCurrentRoute(navigationRef.getCurrentRoute()?.name)}
          onStateChange={() => setCurrentRoute(navigationRef.getCurrentRoute()?.name)}
        >
          <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg } }}>
            {user ? (
              <>
                <Stack.Screen name="Home">
                  {(props) => <HomeScreen {...props} user={user} onLogout={handleLogout} onUserUpdate={handleUserUpdate} />}
                </Stack.Screen>
                <Stack.Screen name="Channels" component={ChannelsScreen} />
                <Stack.Screen name="Chat">{(props) => <ChatScreen {...props} user={user} />}</Stack.Screen>
                <Stack.Screen name="Voice">{(props) => <VoiceScreen {...props} user={user} />}</Stack.Screen>
                <Stack.Screen name="DmChat">{(props) => <DmChatScreen {...props} user={user} />}</Stack.Screen>
                <Stack.Screen name="Profile">{(props) => <ProfileScreen {...props} user={user} />}</Stack.Screen>
                <Stack.Screen name="EditProfile">
                  {(props) => <EditProfileScreen {...props} user={user} onUserUpdate={handleUserUpdate} />}
                </Stack.Screen>
              </>
            ) : (
              <Stack.Screen name="Login">{() => <LoginScreen onLogin={handleLogin} />}</Stack.Screen>
            )}
          </Stack.Navigator>
        </NavigationContainer>
        {user ? <VoiceBar navigationRef={navigationRef} currentRoute={currentRoute} /> : null}
      </View>
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
