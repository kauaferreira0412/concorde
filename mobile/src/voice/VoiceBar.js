import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useVoice } from "./VoiceContext";
import { TABBAR_HEIGHT } from "../screens/HomeScreen";
import { useTokens } from "../theme/ThemeContext";
import { IconBtn, Sticker, Tag, Txt } from "../ui/kit";
import Icon from "../ui/icons";

/** Barrinha "em call" que fica embaixo enquanto você navega pelo app (fora da tela da call). */
export default function VoiceBar({ navigationRef, currentRoute }) {
  const voice = useVoice();
  const t = useTokens();
  const insets = useSafeAreaInsets();
  if (!voice?.channel || currentRoute === "Voice" || currentRoute === "Login") return null;
  const live = voice.streams.length > 0;

  return (
    <View style={{ position: "absolute", left: 10, right: 10, bottom: currentRoute === "Home" ? TABBAR_HEIGHT + insets.bottom + 8 : Math.max(10, insets.bottom) }}>
      <Sticker bg={t.voiceBg} radius={18} shadow={4}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 8, paddingLeft: 12 }}>
          <Pressable
            style={{ flex: 1, minWidth: 0 }}
            onPress={() => navigationRef.current?.navigate("Voice", { channel: voice.channel })}
            accessibilityLabel="Abrir a call"
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Txt weight={900} size={11} color={t.mintText} style={{ letterSpacing: 0.6 }}>
                ● EM CALL
              </Txt>
              {live ? <Tag label="AO VIVO" /> : null}
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Icon name="volume" size={15} color={t.text} />
              <Txt weight={900} size={15} numberOfLines={1} style={{ flexShrink: 1 }}>
                {voice.channel.name}
              </Txt>
            </View>
          </Pressable>
          <IconBtn
            icon={voice.micEnabled ? "mic" : "micOff"}
            tone={voice.micEnabled ? "surface" : "off"}
            size={42}
            onPress={voice.toggleMic}
            label="Microfone"
          />
          <IconBtn icon="phoneOff" tone="danger" size={42} onPress={() => voice.leave()} label="Sair da call" />
        </View>
      </Sticker>
    </View>
  );
}
