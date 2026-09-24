import { useEffect } from "react";

export default function DesktopTitleBar() {
  useEffect(() => {
    document.documentElement.setAttribute("data-desktop-titlebar", "true");
    return () => document.documentElement.removeAttribute("data-desktop-titlebar");
  }, []);

  useEffect(() => {
    function handleKeyDown(e) {
      if (!e.ctrlKey) return;
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        window.concordeDesktop.zoomIn();
      } else if (e.key === "-") {
        e.preventDefault();
        window.concordeDesktop.zoomOut();
      } else if (e.key === "0") {
        e.preventDefault();
        window.concordeDesktop.zoomReset();
      }
    }
    function handleWheel(e) {
      if (!e.ctrlKey) return;
      e.preventDefault();
      if (e.deltaY < 0) window.concordeDesktop.zoomIn();
      else if (e.deltaY > 0) window.concordeDesktop.zoomOut();
    }
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("wheel", handleWheel);
    };
  }, []);

  return (
    <div className="desktop-titlebar">
      <img src="/favicon-32.png" alt="" className="desktop-titlebar-icon" />
      <span className="desktop-titlebar-title">Concorde</span>
    </div>
  );
}
