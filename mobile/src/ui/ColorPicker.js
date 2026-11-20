import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { useTokens } from "../theme/ThemeContext";
import { Btn, Field, SectionTitle, Txt } from "./kit";
import Sheet from "./Sheet";
import Slider from "./Slider";

const PALETTE = [
  "#FFFFFF", "#F4F1FF", "#FFFDF7", "#B4ACD6", "#6B6585", "#2A2550", "#15122B", "#000000",
  "#7C4DEB", "#8B6CFF", "#2EC4F1", "#3B82F6", "#6FE3CF", "#3DDC97", "#13806C", "#A3E635",
  "#FFC93D", "#F6A56E", "#FF7A45", "#E5484D", "#FF5C8A", "#E879F9", "#7A1F35", "#3B2A7A",
];

const HEX = /^#[0-9a-fA-F]{6}$/;

function hexToHsv(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h: Math.round(h), s: Math.round(max ? (d / max) * 100 : 0), v: Math.round(max * 100) };
}

function hsvToHex({ h, s, v }) {
  const S = s / 100;
  const V = v / 100;
  const c = V * S;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = V - c;
  let rgb;
  if (h < 60) rgb = [c, x, 0];
  else if (h < 120) rgb = [x, c, 0];
  else if (h < 180) rgb = [0, c, x];
  else if (h < 240) rgb = [0, x, c];
  else if (h < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return "#" + rgb.map((n) => Math.round((n + m) * 255).toString(16).padStart(2, "0")).join("").toUpperCase();
}

/**
 * Escolher uma cor (o celular não tem um seletor nativo): paleta pronta, matiz/saturação/brilho e código hex.
 * onPick(hex) ao confirmar; onClear (opcional) mostra o botão de voltar pro padrão.
 */
export default function ColorPicker({ visible, title, value, onPick, onClear, clearLabel = "Usar a do tema", onClose }) {
  const t = useTokens();
  const [hsv, setHsv] = useState(() => hexToHsv(HEX.test(value || "") ? value : "#7C4DEB"));
  const [hexText, setHexText] = useState(value || "#7C4DEB");

  useEffect(() => {
    if (!visible) return;
    const start = HEX.test(value || "") ? value.toUpperCase() : "#7C4DEB";
    setHsv(hexToHsv(start));
    setHexText(start);
  }, [visible, value]);

  const hex = hsvToHex(hsv);

  function setFromHex(next) {
    setHsv(hexToHsv(next));
    setHexText(next);
  }

  function changeHsv(patch) {
    const next = { ...hsv, ...patch };
    setHsv(next);
    setHexText(hsvToHex(next));
  }

  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      <View style={{ gap: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ width: 64, height: 64, borderRadius: 18, borderWidth: 2.5, borderColor: t.ink, backgroundColor: hex }} />
          <View style={{ flex: 1 }}>
            <Field
              value={hexText}
              onChangeText={(v) => {
                const clean = ("#" + v.replace(/[^0-9a-fA-F]/g, "")).slice(0, 7).toUpperCase();
                setHexText(clean);
                if (HEX.test(clean)) setHsv(hexToHsv(clean));
              }}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={7}
              placeholder="#RRGGBB"
            />
          </View>
        </View>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {PALETTE.map((c) => (
            <Pressable
              key={c}
              onPress={() => setFromHex(c)}
              accessibilityLabel={`Cor ${c}`}
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                borderWidth: hex === c ? 3.5 : 2,
                borderColor: hex === c ? t.accent : t.ink,
                backgroundColor: c,
              }}
            />
          ))}
        </View>

        <SectionTitle>Matiz · {hsv.h}°</SectionTitle>
        <View style={{ flexDirection: "row", height: 10, borderRadius: 5, overflow: "hidden", borderWidth: 1.5, borderColor: t.ink }}>
          {Array.from({ length: 24 }, (_, i) => (
            <View key={i} style={{ flex: 1, backgroundColor: hsvToHex({ h: i * 15, s: 90, v: 95 }) }} />
          ))}
        </View>
        <Slider value={hsv.h} min={0} max={359} step={1} onChange={(h) => changeHsv({ h })} />
        <SectionTitle>Saturação · {hsv.s}%</SectionTitle>
        <Slider value={hsv.s} min={0} max={100} step={1} onChange={(s) => changeHsv({ s })} />
        <SectionTitle>Brilho · {hsv.v}%</SectionTitle>
        <Slider value={hsv.v} min={0} max={100} step={1} onChange={(v) => changeHsv({ v })} />

        <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
          <Btn icon="check" label="Usar essa cor" onPress={() => onPick(hex)} style={{ flexGrow: 1 }} />
          {onClear ? <Btn variant="surface" label={clearLabel} onPress={onClear} /> : null}
        </View>
        <Txt weight={600} size={12} color={t.textFaint}>
          Toque numa cor pronta ou ajuste nos controles. Dá pra colar um código como #7C4DEB.
        </Txt>
      </View>
    </Sheet>
  );
}

export function Swatch({ color, size = 34, onPress, label }) {
  const t = useTokens();
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label}
      style={{
        width: size,
        height: size,
        borderRadius: 10,
        borderWidth: 2.5,
        borderColor: t.ink,
        backgroundColor: color || t.surface2,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {color ? null : (
        <Txt weight={900} color={t.textMuted}>
          +
        </Txt>
      )}
    </Pressable>
  );
}
