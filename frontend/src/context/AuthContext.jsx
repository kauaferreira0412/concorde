import { createContext, useContext, useEffect, useRef, useState } from "react";
import api from "../api/client";

const AuthContext = createContext(null);

function isTokenExpired(token) {
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload.exp === "number" && payload.exp * 1000 <= Date.now();
  } catch {
    return true;
  }
}

function clearStoredSession() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  sessionStorage.removeItem("token");
  sessionStorage.removeItem("user");
}

function readStoredToken() {
  const stored = localStorage.getItem("token") || sessionStorage.getItem("token");
  if (stored && isTokenExpired(stored)) {
    clearStoredSession();
    return null;
  }
  return stored;
}

export function AuthProvider({ children }) {
  const initialToken = useRef(undefined);
  if (initialToken.current === undefined) initialToken.current = readStoredToken();
  const rememberRef = useRef(localStorage.getItem("token") !== null);
  const [token, setToken] = useState(initialToken.current);
  const [user, setUser] = useState(() => {
    if (!initialToken.current) return null;
    const raw = localStorage.getItem("user") || sessionStorage.getItem("user");
    return raw ? JSON.parse(raw) : null;
  });

  useEffect(() => {
    const storage = rememberRef.current ? localStorage : sessionStorage;
    const other = rememberRef.current ? sessionStorage : localStorage;
    if (token) storage.setItem("token", token);
    else storage.removeItem("token");
    other.removeItem("token");
  }, [token]);

  useEffect(() => {
    const storage = rememberRef.current ? localStorage : sessionStorage;
    const other = rememberRef.current ? sessionStorage : localStorage;
    if (user) storage.setItem("user", JSON.stringify(user));
    else storage.removeItem("user");
    other.removeItem("user");
  }, [user]);

  async function login(usernameOrEmail, password, remember = false) {
    const { data } = await api.post("/api/auth/login", { usernameOrEmail, password, rememberMe: remember });
    rememberRef.current = remember;
    const storage = remember ? localStorage : sessionStorage;
    const other = remember ? sessionStorage : localStorage;
    storage.setItem("token", data.token);
    storage.setItem("user", JSON.stringify(data.user));
    other.removeItem("token");
    other.removeItem("user");
    setToken(data.token);
    setUser(data.user);
  }

  function logout() {
    setToken(null);
    setUser(null);
    clearStoredSession();
  }

  useEffect(() => {
    function handleExpired() {
      setToken(null);
      setUser(null);
      clearStoredSession();
    }
    window.addEventListener("auth:expired", handleExpired);
    return () => window.removeEventListener("auth:expired", handleExpired);
  }, []);

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
