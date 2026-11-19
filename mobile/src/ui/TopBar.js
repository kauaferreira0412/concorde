import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTokens } from "../theme/ThemeContext";
import { IconBtn, Txt } from "./kit";

/** Topo das telas no estilo do site: faixa colorida, título em Bungee e botões em adesivo. */
export default function TopBar({ title, subtitle, onBack, right, tone = "accent" }) {
  const t = useTokens();
  const insets = useSafeAreaInsets();
  const bg = tone === "accent" ? t.accent : t.surface;
  const fg = tone === "accent" ? t.onAccent : t.text;
  return (
    <View
      style={{
        paddingTop: insets.top + 6,
        paddingBottom: 12,
        paddingHorizontal: 12,
        backgroundColor: bg,
        borderBottomWidth: 2.5,
        borderBottomColor: t.ink,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
      }}
    >
      {onBack ? <IconBtn icon="chevronLeft" size={40} onPress={onBack} label="Voltar" /> : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt weight="display" size={20} color={fg} numberOfLines={1}>
          {title}
        </Txt>
        {subtitle ? (
          <Txt weight={800} size={12} color={fg} style={{ opacity: 0.85 }} numberOfLines={1}>
            {subtitle}
          </Txt>
        ) : null}
      </View>
      {right}
    </View>
  );
}
