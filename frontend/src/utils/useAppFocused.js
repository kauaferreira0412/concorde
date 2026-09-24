import { useEffect, useState } from "react";

export function useAppFocused() {
  const [focused, setFocused] = useState(() => document.hasFocus() && document.visibilityState === "visible");

  useEffect(() => {
    function update() {
      setFocused(document.hasFocus() && document.visibilityState === "visible");
    }
    window.addEventListener("focus", update);
    window.addEventListener("blur", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.removeEventListener("focus", update);
      window.removeEventListener("blur", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);

  return focused;
}
