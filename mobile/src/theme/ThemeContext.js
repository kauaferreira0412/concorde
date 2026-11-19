import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  BASE_THEMES,
  BUILTIN_PRESETS,
  cleanColors,
  defaultAppearanceState,
  loadAppearanceState,
  normalizeHex,
  presetToAppearance,
  resolveColors,
  sameAppearance,
  saveAppearanceState,
} from "./themes";

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [state, setState] = useState(defaultAppearanceState);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    loadAppearanceState(AsyncStorage).then((loaded) => {
      setState(loaded);
      setReady(true);
    });
  }, []);

  useEffect(() => {
    if (ready) saveAppearanceState(AsyncStorage, state);
  }, [state, ready]);

  const presets = useMemo(() => [...BUILTIN_PRESETS, ...state.customPresets], [state.customPresets]);

  const update = useCallback(
    (fn) =>
      setState((prev) => {
        const next = fn(prev);
        const all = [...BUILTIN_PRESETS, ...next.customPresets];
        const match = all.find((p) => sameAppearance(presetToAppearance(p), next));
        return { ...next, activePresetId: match ? match.id : null };
      }),
    []
  );

  const setBase = useCallback((base) => update((prev) => ({ ...prev, base, colors: {} })), [update]);

  const setColor = useCallback(
    (key, value) =>
      update((prev) => {
        const hex = normalizeHex(value);
        if (!hex) return prev;
        return { ...prev, colors: cleanColors(prev.base, { ...prev.colors, [key]: hex }) };
      }),
    [update]
  );

  const resetAll = useCallback(() => update((prev) => ({ ...prev, colors: {} })), [update]);

  const applyPreset = useCallback(
    (id) =>
      setState((prev) => {
        const preset = [...BUILTIN_PRESETS, ...prev.customPresets].find((p) => p.id === id);
        if (!preset) return prev;
        return { ...prev, ...presetToAppearance(preset), activePresetId: preset.id };
      }),
    []
  );

  const savePreset = useCallback((name) => {
    const id = `custom:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    setState((prev) => {
      const preset = { id, name: name.trim().slice(0, 40) || "Meu tema", base: prev.base, colors: prev.colors };
      return { ...prev, customPresets: [...prev.customPresets, preset], activePresetId: id };
    });
    return id;
  }, []);

  const deletePreset = useCallback((id) => {
    setState((prev) => ({
      ...prev,
      customPresets: prev.customPresets.filter((p) => p.id !== id),
      activePresetId: prev.activePresetId === id ? null : prev.activePresetId,
    }));
  }, []);

  const resolved = useMemo(() => resolveColors(state.base, state.colors), [state.base, state.colors]);

  const value = useMemo(
    () => ({
      base: state.base,
      colors: state.colors,
      resolved,
      activePresetId: state.activePresetId,
      presets,
      ready,
      setBase,
      setColor,
      resetAll,
      applyPreset,
      savePreset,
      deletePreset,
    }),
    [state, resolved, presets, ready, setBase, setColor, resetAll, applyPreset, savePreset, deletePreset]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Cores resolvidas do tema atual (sempre tem todas as chaves, mesmo sem customização). */
export function useAppTheme() {
  const ctx = useContext(ThemeContext);
  return ctx?.resolved || BASE_THEMES.dark.colors;
}

/** Controles de customização de tema (presets, trocar base, editar cor, etc). */
export function useThemeSettings() {
  return useContext(ThemeContext);
}
