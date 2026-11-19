import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  BASE_THEMES,
  BUILTIN_PRESETS,
  buildTokens,
  cleanColors,
  decodePreset,
  defaultAppearanceState,
  encodePreset,
  normalizeHex,
  presetToAppearance,
  sameAppearance,
  sanitizeAppearanceState,
} from "./themes";

const STORAGE_KEY = "concorde:appearance:v1";
const ThemeContext = createContext(null);

/** Mesmo modelo do site: tema base + cores sobrescritas + ondas, com presets e códigos compartilháveis. */
export function ThemeProvider({ children }) {
  const [state, setState] = useState(defaultAppearanceState);
  const [loaded, setLoaded] = useState(false);
  const firstSave = useRef(true);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => raw && setState(sanitizeAppearanceState(JSON.parse(raw))))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    if (!loaded) return;
    if (firstSave.current) {
      firstSave.current = false;
      return;
    }
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {});
  }, [state, loaded]);

  const presets = useMemo(() => [...BUILTIN_PRESETS, ...state.customPresets], [state.customPresets]);

  const update = useCallback(
    (fn) =>
      setState((prev) => {
        const next = fn(prev);
        const match = [...BUILTIN_PRESETS, ...next.customPresets].find((p) => sameAppearance(presetToAppearance(p), next));
        return { ...next, activePresetId: match ? match.id : null };
      }),
    []
  );

  const setBase = useCallback((base) => update((prev) => ({ ...prev, base, colors: {}, waves: BASE_THEMES[base].waves })), [update]);
  const setWaves = useCallback((waves) => update((prev) => ({ ...prev, waves })), [update]);
  const setColor = useCallback(
    (key, value) =>
      update((prev) => {
        const hex = normalizeHex(value);
        if (!hex) return prev;
        return { ...prev, colors: cleanColors(prev.base, { ...prev.colors, [key]: hex }) };
      }),
    [update]
  );

  const applyPreset = useCallback(
    (id) =>
      setState((prev) => {
        const preset = [...BUILTIN_PRESETS, ...prev.customPresets].find((p) => p.id === id);
        if (!preset) return prev;
        return { ...prev, ...presetToAppearance(preset), activePresetId: preset.id };
      }),
    []
  );

  const savePreset = useCallback((name, source) => {
    const id = `custom:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    setState((prev) => {
      const appearance = source || { base: prev.base, colors: prev.colors, waves: prev.waves };
      const preset = { id, name: (name || "").trim().slice(0, 40) || "Meu tema", ...presetToAppearance(appearance) };
      return { ...prev, ...presetToAppearance(preset), customPresets: [...prev.customPresets, preset], activePresetId: id };
    });
    return id;
  }, []);

  /** Aplica um tema vindo de fora (galeria/código) sem duplicar preset igual. */
  const applyAppearanceAsPreset = useCallback(
    (name, appearance) => {
      const clean = presetToAppearance(appearance);
      const existing = state.customPresets.find((p) => p.name === name && sameAppearance(presetToAppearance(p), clean));
      if (existing) applyPreset(existing.id);
      else savePreset(name, clean);
    },
    [state.customPresets, applyPreset, savePreset]
  );

  const deletePreset = useCallback(
    (id) =>
      setState((prev) => ({
        ...prev,
        customPresets: prev.customPresets.filter((p) => p.id !== id),
        activePresetId: prev.activePresetId === id ? null : prev.activePresetId,
      })),
    []
  );

  const exportCurrent = useCallback(
    (name) => encodePreset({ name, base: state.base, colors: state.colors, waves: state.waves }),
    [state.base, state.colors, state.waves]
  );

  const importPreset = useCallback((code) => {
    const imported = decodePreset(code);
    applyAppearanceAsPreset(imported.name, imported);
    return imported.name;
  }, [applyAppearanceAsPreset]);

  const t = useMemo(() => buildTokens(state.base, state.colors, state.waves), [state.base, state.colors, state.waves]);

  const value = useMemo(
    () => ({
      t,
      loaded,
      base: state.base,
      colors: state.colors,
      waves: state.waves,
      activePresetId: state.activePresetId,
      presets,
      setBase,
      setWaves,
      setColor,
      applyPreset,
      savePreset,
      deletePreset,
      exportCurrent,
      importPreset,
      applyAppearanceAsPreset,
    }),
    [t, loaded, state, presets, setBase, setWaves, setColor, applyPreset, savePreset, deletePreset, exportCurrent, importPreset, applyAppearanceAsPreset]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}

/** Atalho: só os tokens de cor. */
export function useTokens() {
  return useContext(ThemeContext).t;
}
