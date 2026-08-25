import { DownloadIcon, EyeIcon, EyeOffIcon, LockIcon, ScreenShareIcon, UserIcon } from "../../components/icons.jsx";
import { useLoginContainer } from "./Container.jsx";
import "./style.css";

const isElectronDesktop = typeof window !== "undefined" && !!window.concordeDesktop;

export default function LoginPage() {
  const {
    usernameOrEmail,
    setUsernameOrEmail,
    password,
    setPassword,
    showPassword,
    setShowPassword,
    rememberMe,
    setRememberMe,
    error,
    submitting,
    handleSubmit,
  } = useLoginContainer();

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={handleSubmit}>
        <div className="auth-logo">
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

        <label className="auth-remember">
          <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
          Lembrar acesso
        </label>

        {error && <p className="auth-error">{error}</p>}

        <button type="submit" disabled={submitting}>
          {submitting ? "Entrando..." : "Entrar"}
        </button>
      </form>

      {!isElectronDesktop && (
        <div className="auth-download-card">
          <div className="auth-download-icon">
            <ScreenShareIcon size={22} />
          </div>
          <h2>Prefere usar o app desktop?</h2>
          <p>
            Instale o Concorde no Windows: notificações mesmo com a janela fechada, atalho no
            menu iniciar e compartilhamento de tela nativo, com áudio de janelas e programas.
          </p>
          <a className="auth-download-btn" href="/downloads/Concorde-Setup.zip" download>
            <DownloadIcon size={16} />
            Baixar para Windows
          </a>
          <p className="admin-hint" style={{ margin: "6px 0 0" }}>
            Baixa um .zip - extraia e rode o instalador de dentro. Como ainda não temos um
            certificado de assinatura de código, o Windows pode avisar que não reconhece o
            programa (comum em apps pequenos como este) - escolha "Executar assim mesmo".
          </p>
        </div>
      )}
    </div>
  );
}
