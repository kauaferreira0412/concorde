import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  BASE_THEMES,
  BUILTIN_PRESETS,
  applyAppearance,
  cleanColors,
  decodePreset,
  encodePreset,
  loadAppearanceState,
  normalizeHex,
  presetToAppearance,
  resolveColors,
  sameAppearance,
  saveAppearanceState,
} from "../theme/themes";

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [state, setState] = useState(loadAppearanceState);

  useEffect(() => {
    applyAppearance(state);
    saveAppearanceState(state);
  }, [state]);

  // Outras janelas (ex.: PiP de câmera) acompanham a troca de tema.
  useEffect(() => {
    function onStorage(e) {
      if (e.key === "concorde:appearance:v1") setState(loadAppearanceState());
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const presets = useMemo(() => [...BUILTIN_PRESETS, ...state.customPresets], [state.customPresets]);

  // Edições manuais "soltam" o preset ativo, a não ser que o resultado volte a bater com ele.
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

  const setBase = useCallback(
    (base) =>
      update((prev) => ({ ...prev, base, colors: {}, waves: BASE_THEMES[base].waves })),
    [update]
  );

  const setColor = useCallback(
    (key, value) =>
      update((prev) => {
        const hex = normalizeHex(value);
        if (!hex) return prev;
        return { ...prev, colors: cleanColors(prev.base, { ...prev.colors, [key]: hex }) };
      }),
    [update]
  );

  const resetColor = useCallback(
    (key) =>
      update((prev) => {
        const colors = { ...prev.colors };
        delete colors[key];
        return { ...prev, colors };
      }),
    [update]
  );

  const resetAll = useCallback(
    () => update((prev) => ({ ...prev, colors: {}, waves: BASE_THEMES[prev.base].waves })),
    [update]
  );

  const setWaves = useCallback((waves) => update((prev) => ({ ...prev, waves })), [update]);

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
      const preset = { id, name: name.trim().slice(0, 40) || "Meu tema", ...presetToAppearance(appearance) };
      return {
        ...prev,
        ...presetToAppearance(preset),
        customPresets: [...prev.customPresets, preset],
        activePresetId: id,
      };
    });
    return id;
  }, []);

  const overwritePreset = useCallback((id) => {
    setState((prev) => ({
      ...prev,
      customPresets: prev.customPresets.map((p) =>
        p.id === id ? { ...p, base: prev.base, colors: prev.colors, waves: prev.waves } : p
      ),
      activePresetId: id,
    }));
  }, []);

  const deletePreset = useCallback((id) => {
    setState((prev) => ({
      ...prev,
      customPresets: prev.customPresets.filter((p) => p.id !== id),
      activePresetId: prev.activePresetId === id ? null : prev.activePresetId,
    }));
  }, []);

  const exportCurrent = useCallback(
    (name) => encodePreset({ name, base: state.base, colors: state.colors, waves: state.waves }),
    [state.base, state.colors, state.waves]
  );

  const importPreset = useCallback((code) => {
    const imported = decodePreset(code);
    return savePreset(imported.name, imported);
  }, [savePreset]);

  const value = useMemo(
    () => ({
      base: state.base,
      colors: state.colors,
      waves: state.waves,
      resolved: resolveColors(state.base, state.colors),
      activePresetId: state.activePresetId,
      presets,
      setBase,
      setColor,
      resetColor,
      resetAll,
      setWaves,
      applyPreset,
      savePreset,
      overwritePreset,
      deletePreset,
      exportCurrent,
      importPreset,
    }),
    [state, presets, setBase, setColor, resetColor, resetAll, setWaves, applyPreset, savePreset, overwritePreset, deletePreset, exportCurrent, importPreset]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
