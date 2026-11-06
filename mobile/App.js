import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { NavigationContainer, DarkTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { loadSession, saveSession, setExpiredHandler } from "./src/api";
import { colors } from "./src/theme";
import LoginScreen from "./src/screens/LoginScreen";
import ServersScreen from "./src/screens/ServersScreen";
import ChannelsScreen from "./src/screens/ChannelsScreen";
import ChatScreen from "./src/screens/ChatScreen";

const Stack = createNativeStackNavigator();

const navTheme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.bg, card: colors.panel, text: colors.text, primary: colors.accent },
};

export default function App() {
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

  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <NavigationContainer theme={navTheme}>
        <Stack.Navigator>
          {user ? (
            <>
              <Stack.Screen
                name="Servers"
                component={ServersScreen}
                options={{
                  title: "Concorde",
                  headerRight: () => (
                    <Pressable onPress={handleLogout}>
                      <Text style={{ color: colors.muted }}>Sair</Text>
                    </Pressable>
                  ),
                }}
              />
              <Stack.Screen name="Channels" component={ChannelsScreen} />
              <Stack.Screen name="Chat" component={ChatScreen} />
            </>
          ) : (
            <Stack.Screen name="Login" options={{ headerShown: false }}>
              {() => <LoginScreen onLogin={handleLogin} />}
            </Stack.Screen>
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
