import { useRef, useState } from "react";
import { PanResponder, View } from "react-native";
import { useTokens } from "../theme/ThemeContext";

/** Controle deslizante simples (sem dependência nativa), no estilo adesivo. */
export default function Slider({ value, min = 0, max = 200, step = 5, onChange, onDone }) {
  const t = useTokens();
  const [width, setWidth] = useState(1);
  const widthRef = useRef(1);
  const startRef = useRef(0);
  const valueRef = useRef(value);
  valueRef.current = value;

  const toValue = (x) => {
    const ratio = Math.max(0, Math.min(1, x / widthRef.current));
    return Math.round((min + ratio * (max - min)) / step) * step;
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        startRef.current = e.nativeEvent.locationX;
        onChange(toValue(startRef.current));
      },
      onPanResponderMove: (_e, g) => onChange(toValue(startRef.current + g.dx)),
      onPanResponderRelease: () => onDone?.(valueRef.current),
    })
  ).current;

  const ratio = (value - min) / (max - min);
  return (
    <View
      {...pan.panHandlers}
      onLayout={(e) => {
        widthRef.current = Math.max(1, e.nativeEvent.layout.width);
        setWidth(widthRef.current);
      }}
      style={{ height: 34, justifyContent: "center" }}
      accessibilityRole="adjustable"
      accessibilityValue={{ min, max, now: value }}
    >
      <View style={{ height: 12, borderRadius: 999, borderWidth: 2, borderColor: t.ink, backgroundColor: t.surface2, overflow: "hidden" }}>
        <View style={{ width: `${ratio * 100}%`, height: "100%", backgroundColor: t.accent }} />
      </View>
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: Math.max(0, Math.min(width - 24, ratio * width - 12)),
          width: 24,
          height: 24,
          borderRadius: 8,
          borderWidth: 2.5,
          borderColor: t.ink,
          backgroundColor: t.surface,
        }}
      />
    </View>
  );
}
