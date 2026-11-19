import { useEffect, useRef } from "react";
import { AccessibilityInfo, Animated } from "react-native";

let reduceMotion = false;
AccessibilityInfo.isReduceMotionEnabled?.()
  .then((v) => {
    reduceMotion = !!v;
  })
  .catch(() => {});
AccessibilityInfo.addEventListener?.("reduceMotionChanged", (v) => {
  reduceMotion = !!v;
});

/**
 * Entrada animada no estilo do site (molinha):
 * kind "rise" = sobe e aparece (msg-in), "pop" = cresce de leve (pop-in), "fade" = só aparece.
 */
export function Enter({ children, kind = "rise", delay = 0, style, distance = 12 }) {
  const progress = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;

  useEffect(() => {
    if (reduceMotion) return;
    const anim = Animated.spring(progress, {
      toValue: 1,
      delay,
      useNativeDriver: true,
      damping: 14,
      stiffness: 180,
      mass: 0.8,
    });
    anim.start();
    return () => anim.stop();
  }, [progress, delay]);

  const transform =
    kind === "pop"
      ? [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }]
      : kind === "rise"
        ? [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] }) }]
        : [];
  const opacity = progress.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, 1, 1] });

  return <Animated.View style={[style, { opacity, transform }]}>{children}</Animated.View>;
}

/** Atraso escalonado pra listas (os primeiros itens entram em sequência, o resto junto). */
export function stagger(index, step = 35, max = 8) {
  return Math.min(index, max) * step;
}
