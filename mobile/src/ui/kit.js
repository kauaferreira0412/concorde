import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Image } from "expo-image";
import Svg, { Defs, Path, Pattern, Rect } from "react-native-svg";
import { useTokens } from "../theme/ThemeContext";
import { toneFor } from "../theme/themes";
import Icon from "./icons";

// Mesmas fontes do site: Bungee nos títulos, Nunito no resto.
export const FONT = {
  display: "Bungee_400Regular",
  600: "Nunito_600SemiBold",
  700: "Nunito_700Bold",
  800: "Nunito_800ExtraBold",
  900: "Nunito_900Black",
};

/** Texto com a fonte do app. weight: 600 | 700 | 800 | 900 | "display" */
export function Txt({ weight = 600, color, size = 15, style, children, ...rest }) {
  const t = useTokens();
  return (
    <Text
      {...rest}
      style={[{ fontFamily: weight === "display" ? FONT.display : FONT[weight] || FONT[600], color: color || t.text, fontSize: size }, style]}
    >
      {children}
    </Text>
  );
}

/**
 * "Adesivo": contorno grosso da cor de tinta + sombra sólida deslocada (o --pop-* do site).
 * A sombra é um View atrás (funciona igual no iOS e no Android).
 */
export function Sticker({ children, style, bg, radius = 18, shadow = 3, shadowColor, border = 2.5, pressed = false, innerStyle }) {
  const t = useTokens();
  const s = pressed ? Math.max(0, shadow - 2) : shadow;
  return (
    <View style={[{ marginRight: shadow, marginBottom: shadow }, style]}>
      {shadow > 0 && (
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { top: s, left: s, right: -s, bottom: -s, borderRadius: radius, backgroundColor: shadowColor || t.ink }]}
        />
      )}
      <View
        style={[
          { borderRadius: radius, borderWidth: border, borderColor: t.ink, backgroundColor: bg || t.surface, overflow: "hidden" },
          pressed && { transform: [{ translateX: shadow - s }, { translateY: shadow - s }] },
          innerStyle,
        ]}
      >
        {children}
      </View>
    </View>
  );
}

/** Botão no estilo do site. variant: accent | surface | danger | mint | ghost */
export function Btn({ label, icon, onPress, variant = "accent", disabled, small, style, block }) {
  const t = useTokens();
  const [pressed, setPressed] = useState(false);
  const bg = { accent: t.accent, surface: t.surface, danger: t.danger, mint: t.mint, ghost: "transparent" }[variant];
  const fg = { accent: t.onAccent, surface: t.text, danger: "#FFFFFF", mint: t.onPop, ghost: t.accentText }[variant];
  const content = (
    <View style={[styles.btnInner, small && styles.btnInnerSmall]}>
      {icon ? <Icon name={icon} size={small ? 15 : 18} color={fg} /> : null}
      {label ? (
        <Txt weight={900} size={small ? 13 : 15} color={fg}>
          {label}
        </Txt>
      ) : null}
    </View>
  );
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={[{ opacity: disabled ? 0.5 : 1 }, block && { alignSelf: "stretch" }, style]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {variant === "ghost" ? content : (
        <Sticker bg={bg} radius={small ? 12 : 14} shadow={small ? 2 : 3} pressed={pressed}>
          {content}
        </Sticker>
      )}
    </Pressable>
  );
}

/** Botão quadrado só com ícone (barra da call, cabeçalhos). active pinta no tom pedido. */
export function IconBtn({ icon, onPress, size = 48, tone = "surface", label, iconSize }) {
  const t = useTokens();
  const [pressed, setPressed] = useState(false);
  const bg = { surface: t.surface, surface2: t.surface2, accent: t.accent, danger: t.danger, mint: t.mint, off: t.danger }[tone];
  const fg = { surface: t.text, surface2: t.text, accent: t.onAccent, danger: "#FFFFFF", mint: t.onPop, off: "#FFFFFF" }[tone];
  return (
    <Pressable onPress={onPress} onPressIn={() => setPressed(true)} onPressOut={() => setPressed(false)} accessibilityRole="button" accessibilityLabel={label}>
      <Sticker bg={bg} radius={Math.round(size * 0.32)} shadow={3} pressed={pressed} innerStyle={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
        <Icon name={icon} size={iconSize || Math.round(size * 0.46)} color={fg} />
      </Sticker>
    </Pressable>
  );
}

/** Avatar com o mesmo tom (roxo/menta/laranja) que o site sorteia pelo nome. */
export function Avatar({ name, url, size = 44, radius, ring, still }) {
  const t = useTokens();
  const tone = t["tone" + toneFor(name).toUpperCase()];
  const r = radius ?? Math.round(size * 0.32);
  return (
    <View style={[{ borderRadius: r + 4, padding: ring ? 3 : 0, borderWidth: ring ? 3 : 0, borderColor: ring || "transparent" }]}>
      {url ? (
        <Image cachePolicy="memory-disk" transition={120} recyclingKey={url} autoplay={!still} source={{ uri: url }} style={{ width: size, height: size, borderRadius: r, borderWidth: 2, borderColor: t.ink, backgroundColor: tone.bg, opacity: still ? 0.75 : 1 }} />
      ) : (
        <View style={{ width: size, height: size, borderRadius: r, borderWidth: 2, borderColor: t.ink, backgroundColor: tone.bg, alignItems: "center", justifyContent: "center" }}>
          <Txt weight={900} size={Math.round(size * 0.32)} color={tone.fg}>
            {(name || "?").slice(0, 2).toUpperCase()}
          </Txt>
        </View>
      )}
    </View>
  );
}

/** Campo de texto no estilo do site. */
export function Field({ style, inputStyle, ...rest }) {
  const t = useTokens();
  const [focus, setFocus] = useState(false);
  return (
    <View style={[{ borderWidth: 2.5, borderColor: focus ? t.accent : t.ink, borderRadius: 14, backgroundColor: t.surface2 }, style]}>
      <TextInput
        placeholderTextColor={t.textFaint}
        onFocus={(e) => {
          setFocus(true);
          rest.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocus(false);
          rest.onBlur?.(e);
        }}
        {...rest}
        style={[{ color: t.text, fontFamily: FONT[700], fontSize: 16, paddingHorizontal: 14, paddingVertical: 12 }, inputStyle]}
      />
    </View>
  );
}

/** Título de seção em caixa alta (CANAIS, CONECTADOS...). */
export function SectionTitle({ children, style, color }) {
  const t = useTokens();
  return (
    <Txt weight={900} size={12} color={color || t.textMuted} style={[{ letterSpacing: 0.8, textTransform: "uppercase" }, style]}>
      {children}
    </Txt>
  );
}

const WAVE = "M0 30 Q60 0 120 30 T240 30 M0 90 Q60 60 120 90 T240 90";

/** Fundo do app: cor do tema + ondas (quando o tema tem). */
export function Screen({ children, style, padded }) {
  const t = useTokens();
  // o SVG não se redesenha sozinho ao girar a tela: mede o espaço e recria no tamanho novo
  const [size, setSize] = useState(null);
  return (
    <View
      style={[{ flex: 1, backgroundColor: t.bg }, padded && { padding: 12 }, style]}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        const w = Math.ceil(width);
        const h = Math.ceil(height);
        setSize((prev) => (prev && prev.w === w && prev.h === h ? prev : { w, h }));
      }}
    >
      {t.waves && size ? (
        <Svg key={`${size.w}x${size.h}`} width={size.w} height={size.h} style={StyleSheet.absoluteFill} pointerEvents="none">
          <Defs>
            <Pattern id="waves" patternUnits="userSpaceOnUse" width="240" height="120">
              <Path d={WAVE} fill="none" stroke={t.wave} strokeWidth={16} strokeLinecap="round" />
            </Pattern>
          </Defs>
          <Rect width={size.w} height={size.h} fill="url(#waves)" />
        </Svg>
      ) : null}
      {children}
    </View>
  );
}

/** Pílula pequena (AO VIVO, CONECTADO...). */
export function Tag({ label, bg, color, style }) {
  const t = useTokens();
  return (
    <View style={[{ backgroundColor: bg || t.danger, borderRadius: 999, borderWidth: 2, borderColor: t.ink, paddingHorizontal: 7, paddingVertical: 1 }, style]}>
      <Txt weight={900} size={10} color={color || "#FFFFFF"} style={{ letterSpacing: 0.5 }}>
        {label}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  btnInner: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 18, paddingVertical: 12 },
  btnInnerSmall: { paddingHorizontal: 12, paddingVertical: 7, gap: 6 },
});
