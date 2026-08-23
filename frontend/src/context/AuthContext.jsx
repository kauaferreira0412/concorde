import { createContext, useContext, useEffect, useRef, useState } from "react";
import api from "../api/client";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // Por padrao fica em sessionStorage (nao localStorage) de proposito: localStorage e'
  // compartilhado entre TODAS as abas/janelas do mesmo navegador (mesmo perfil), entao logar
  // com uma conta numa aba trocava o token de qualquer outra aba aberta na hora - inclusive no
  // meio de uma call de voz ja conectada, fazendo duas pessoas conectarem com a MESMA
  // identidade no LiveKit (a call so mostrava 1 participante). sessionStorage isola cada aba
  // de verdade - abrir uma aba nova pede login de novo.
  //
  // "Lembrar acesso" (ver LoginPage.jsx, pedido explicito do usuario pra nao precisar logar
  // toda vez) e' a excecao INTENCIONAL a essa regra - quem MARCA a caixinha esta escolhendo
  // aceitar essa troca (persistir entre reaberturas do app/navegador, mesmo risco de
  // compartilhar entre abas que localStorage sempre teve); quem nao marca continua 100% no
  // comportamento de sempre. rememberRef guarda ONDE o login atual foi salvo, pros efeitos
  // abaixo saberem em qual storage escrever as proximas atualizacoes (ex: trocar de foto).
  const rememberRef = useRef(localStorage.getItem("token") !== null);
  const [token, setToken] = useState(() => localStorage.getItem("token") || sessionStorage.getItem("token"));
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem("user") || sessionStorage.getItem("user");
    return raw ? JSON.parse(raw) : null;
  });

  useEffect(() => {
    const storage = rememberRef.current ? localStorage : sessionStorage;
    const other = rememberRef.current ? sessionStorage : localStorage;
    if (token) storage.setItem("token", token);
    else storage.removeItem("token");
    other.removeItem("token"); // nunca deixa uma copia velha esquecida no OUTRO storage
  }, [token]);

  useEffect(() => {
    const storage = rememberRef.current ? localStorage : sessionStorage;
    const other = rememberRef.current ? sessionStorage : localStorage;
    if (user) storage.setItem("user", JSON.stringify(user));
    else storage.removeItem("user");
    other.removeItem("user");
  }, [user]);

  /** "remember" = a caixinha "Lembrar acesso" do login (ver LoginPage.jsx) - decide se o
   *  token sobrevive a fechar a aba/reabrir o app (localStorage) ou so' dura essa sessao
   *  (sessionStorage, padrao de sempre). NAO afeta a tela de "Atualizacao necessaria" do app
   *  desktop (UpdateRequiredGate.jsx) - ela fica FORA/ANTES desse provider inteiro no
   *  App.jsx, roda sempre primeiro e bloqueia tudo (inclusive um login lembrado) enquanto o
   *  instalado nao for o mais recente. */
  async function login(usernameOrEmail, password, remember = false) {
    const { data } = await api.post("/api/auth/login", { usernameOrEmail, password });
    rememberRef.current = remember;
    setToken(data.token);
    setUser(data.user);
  }

  function logout() {
    setToken(null);
    setUser(null);
    // Limpa os DOIS storages direto (nao so' via useEffect) - sair da conta precisa apagar o
    // acesso "lembrado" tambem, nao so' o da sessao atual.
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    sessionStorage.removeItem("token");
    sessionStorage.removeItem("user");
  }

  /** Usado apos trocar a foto de perfil (ver SettingsModal), pra refletir na UI toda sem precisar relogar. */
  function updateUser(patch) {
    setUser((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  const isAdmin = user?.role === "ADMIN";

  return (
    <AuthContext.Provider value={{ token, user, login, logout, updateUser, isAuthenticated: !!token, isAdmin }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
