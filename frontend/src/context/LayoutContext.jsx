import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ChevronLeftIcon, UsersIcon, XIcon } from "../components/icons.jsx";

/** Larguras em que o layout muda (iguais às media queries do CSS). */
export const MOBILE_QUERY = "(max-width: 760px)";
export const DRAWER_QUERY = "(max-width: 1100px)";

export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

const LayoutContext = createContext({ isMobile: false, drawerMode: false });

/**
 * Estado de layout de uma página (servidores ou DMs):
 * - no celular só um painel aparece por vez: "nav" (trilho + lista) ou "main" (chat/call);
 * - em tablet e celular a lista de membros vira uma gaveta que abre por cima.
 */
export function usePageLayout({ hasMembers = false } = {}) {
  const isMobile = useMediaQuery(MOBILE_QUERY);
  const drawerMode = useMediaQuery(DRAWER_QUERY);
  const [pane, setPane] = useState("nav");
  const [membersOpen, setMembersOpen] = useState(false);

  useEffect(() => {
    if (!drawerMode) setMembersOpen(false);
  }, [drawerMode]);

  useEffect(() => {
    if (!membersOpen) return undefined;
    const onKey = (e) => e.key === "Escape" && setMembersOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [membersOpen]);

  const showMain = useCallback(() => setPane("main"), []);
  const showNav = useCallback(() => {
    setMembersOpen(false);
    setPane("nav");
  }, []);
  const toggleMembers = useCallback(() => setMembersOpen((v) => !v), []);
  const closeMembers = useCallback(() => setMembersOpen(false), []);

  const value = useMemo(
    () => ({
      isMobile,
      drawerMode,
      pane,
      membersOpen,
      onBack: showNav,
      onToggleMembers: hasMembers ? toggleMembers : null,
      closeMembers,
    }),
    [isMobile, drawerMode, pane, membersOpen, showNav, hasMembers, toggleMembers, closeMembers]
  );

  const shellProps = {
    "data-pane": pane,
    className: "app-shell" + (membersOpen ? " members-open" : ""),
  };

  return { value, shellProps, showMain, showNav, isMobile };
}

export function LayoutProvider({ value, children }) {
  return <LayoutContext.Provider value={value}>{children}</LayoutContext.Provider>;
}

export function useLayout() {
  return useContext(LayoutContext);
}

/** Botão "voltar" do cabeçalho — só aparece no celular (CSS). */
export function MobileBackButton() {
  const { onBack } = useLayout();
  if (!onBack) return null;
  return (
    <button type="button" className="icon-btn icon-btn-boxed layout-back-btn" onClick={onBack} title="Voltar" aria-label="Voltar">
      <ChevronLeftIcon size={20} />
    </button>
  );
}

/** Botão que abre a gaveta de membros — só aparece em tablet/celular (CSS). */
export function MembersToggleButton() {
  const { onToggleMembers, membersOpen } = useLayout();
  if (!onToggleMembers) return null;
  return (
    <button
      type="button"
      className={"icon-btn icon-btn-boxed layout-members-btn" + (membersOpen ? " icon-btn-active" : "")}
      onClick={onToggleMembers}
      title="Membros"
      aria-label="Membros"
      aria-expanded={membersOpen}
    >
      <UsersIcon size={18} />
    </button>
  );
}

/** Fundo escuro atrás da gaveta de membros. */
export function DrawerBackdrop() {
  const { membersOpen, closeMembers } = useLayout();
  if (!membersOpen) return null;
  return <div className="drawer-backdrop" onClick={closeMembers} aria-hidden="true" />;
}

export function DrawerCloseButton() {
  const { drawerMode, closeMembers } = useLayout();
  if (!drawerMode) return null;
  return (
    <button type="button" className="icon-btn" onClick={closeMembers} title="Fechar" aria-label="Fechar membros">
      <XIcon size={18} />
    </button>
  );
}
