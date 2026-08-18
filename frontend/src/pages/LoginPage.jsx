import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { DownloadIcon, EyeIcon, EyeOffIcon, LockIcon, UserIcon } from "../components/icons.jsx";

// window.concordeDesktop so' existe dentro do app Electron (ver electron/preload.cjs) - o
// link de download so' faz sentido no navegador, quem ja esta no app desktop nao precisa
// baixar de novo. Instalador gerado por "npm run package:desktop" (ver scripts/package-desktop.mjs).
const isElectronDesktop = typeof window !== "undefined" && !!window.concordeDesktop;

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [usernameOrEmail, setUsernameOrEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(usernameOrEmail, password);
      navigate("/servers");
    } catch (err) {
      setError(err.response?.data?.error || "Falha ao entrar");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={handleSubmit}>
        <div className="auth-logo">
          {/* import.meta.env.BASE_URL em vez de "/icon-192.png" direto - no site continua
              "/" (mesmo caminho de sempre), mas no app desktop (Electron, file://) o Vite
              troca pra "./" (ver vite.config.js) - caminho absoluto puro nao acha o arquivo
              ali dentro do pacote. */}
          <img src={`${import.meta.env.BASE_URL}icon-192.png`} alt="" />
        </div>
        <div className="auth-heading">
          <h1>Concorde</h1>
          <p className="auth-subtitle">Entre com sua conta para continuar</p>
        </div>

        <label className="auth-field">
          <UserIcon size={16} className="auth-field-icon" />
          <input
            placeholder="Usuário ou email"
            autoComplete="username"
            value={usernameOrEmail}
            onChange={(e) => setUsernameOrEmail(e.target.value)}
          />
        </label>

        <label className="auth-field">
          <LockIcon size={16} className="auth-field-icon" />
          <input
            placeholder="Senha"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            type="button"
            className="auth-field-toggle"
            onClick={() => setShowPassword((v) => !v)}
            title={showPassword ? "Esconder senha" : "Mostrar senha"}
            tabIndex={-1}
          >
            {showPassword ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
          </button>
        </label>

        {error && <p className="auth-error">{error}</p>}

        <button type="submit" disabled={submitting}>
          {submitting ? "Entrando..." : "Entrar"}
        </button>

        <p className="auth-note">Não há cadastro público — peça acesso ao administrador.</p>
      </form>

      {!isElectronDesktop && (
        <a className="auth-download" href="/downloads/Concorde-Setup.exe" download>
          <DownloadIcon size={15} />
          Baixar app para Windows
        </a>
      )}
    </div>
  );
}
