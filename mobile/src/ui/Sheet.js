import { Modal, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTokens } from "../theme/ThemeContext";
import { Txt } from "./kit";
import Icon from "./icons";
import { Enter } from "./anim";

/** Folha que sobe de baixo (menus de ações), no estilo adesivo. */
export default function Sheet({ visible, onClose, title, children }) {
  const t = useTokens();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: t.backdrop }} onPress={onClose} />
      <Enter kind="rise" distance={60} style={{ maxHeight: "85%" }}>
      <View
        style={{
          backgroundColor: t.surface,
          borderTopLeftRadius: 26,
          borderTopRightRadius: 26,
          borderWidth: 2.5,
          borderBottomWidth: 0,
          borderColor: t.ink,
          paddingBottom: insets.bottom + 12,
          flexShrink: 1,
        }}
      >
        <View style={{ alignItems: "center", paddingTop: 8 }}>
          <View style={{ width: 44, height: 5, borderRadius: 999, backgroundColor: t.textFaint }} />
        </View>
        {title ? (
          <Txt weight="display" size={16} style={{ paddingHorizontal: 18, paddingTop: 10 }} numberOfLines={1}>
            {title}
          </Txt>
        ) : null}
        <ScrollView contentContainerStyle={{ padding: 14, gap: 8 }} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      </View>
      </Enter>
    </Modal>
  );
}

/** Uma linha de ação dentro da Sheet. */
export function SheetItem({ icon, label, onPress, danger, right }) {
  const t = useTokens();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingHorizontal: 14,
        paddingVertical: 13,
        borderRadius: 14,
        borderWidth: 2.5,
        borderColor: t.ink,
        backgroundColor: pressed ? t.hover : t.surface2,
      })}
    >
      {icon ? <Icon name={icon} size={19} color={danger ? t.danger : t.text} /> : null}
      <Txt weight={800} color={danger ? t.danger : t.text} style={{ flex: 1 }}>
        {label}
      </Txt>
      {right}
    </Pressable>
  );
}
