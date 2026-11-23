import { useCallback, useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import api from "../../api/client";
import { AlertTriangleIcon, LockIcon, TerminalIcon, XIcon } from "../../components/icons.jsx";

const WS_BASE =
  import.meta.env.VITE_WS_URL ||
  `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/ws`;
const TERMINAL_WS_URL = `${WS_BASE.replace(/\/$/, "")}/terminal`;

function readToken() {
  return localStorage.getItem("token") || sessionStorage.getItem("token") || "";
}

/** Cores do xterm a partir dos tokens do tema (o terminal fica escuro nos dois temas, como todo terminal). */
function terminalTheme() {
  const css = getComputedStyle(document.documentElement);
  const v = (name, fallback) => css.getPropertyValue(name).trim() || fallback;
  return {
    background: v("--c-ink", "#000000") === "#000000" ? "#0d0b1a" : v("--c-ink", "#1A1423"),
    foreground: "#F4F1FF",
    cursor: v("--c-accent", "#7C4DEB"),
    cursorAccent: "#0d0b1a",
    selectionBackground: "rgba(124, 77, 235, 0.45)",
    black: "#1a1726",
    brightBlack: "#5b5577",
    red: "#ff6b7a",
    brightRed: "#ff8a96",
    green: v("--c-mint", "#6FE3CF"),
    brightGreen: "#9cf0e0",
    yellow: v("--c-orange", "#F6A56E"),
    brightYellow: "#ffc898",
    blue: "#8ab4ff",
    brightBlue: "#b0ccff",
    magenta: "#c79bff",
    brightMagenta: "#ddc2ff",
    cyan: "#6fd6e3",
    brightCyan: "#9fe8f0",
    white: "#e6e2f5",
    brightWhite: "#ffffff",
  };
}

export default function TerminalSection() {
  const [status, setStatus] = useState(null);
  const [statusError, setStatusError] = useState("");
  const [showSetup, setShowSetup] = useState(false);

  // conexão: idle -> connecting -> connected -> ended
  const [phase, setPhase] = useState("idle");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [endMessage, setEndMessage] = useState("");
  const [target, setTarget] = useState("");

  const containerRef = useRef(null);
  const termRef = useRef(null);
  const fitRef = useRef(null);
  const wsRef = useRef(null);
  const pendingPasswordRef = useRef("");
  const phaseRef = useRef("idle");
  phaseRef.current = phase;
  // cada clique em "Abrir terminal" cria uma sessao nova (xterm + WebSocket)
  const [sessionId, setSessionId] = useState(0);

  useEffect(() => {
    api
      .get("/api/admin/terminal/status")
      .then(({ data }) => setStatus(data))
      .catch((err) => setStatusError(err.response?.data?.error || "Não foi possível carregar o terminal."));
  }, []);

  const teardown = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    termRef.current?.dispose();
    termRef.current = null;
    fitRef.current = null;
  }, []);

  useEffect(() => teardown, [teardown]);

  // abre o xterm + WebSocket quando a fase vira "connecting" (o container já está na tela)
  useEffect(() => {
    if (!sessionId || !containerRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: getComputedStyle(document.documentElement).getPropertyValue("--font-mono").trim() || "monospace",
      theme: terminalTheme(),
      scrollback: 5000,
      allowProposedApi: false,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;
    term.writeln("\x1b[2mConectando na VPS...\x1b[0m");

    const ws = new WebSocket(TERMINAL_WS_URL);
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;
    const send = (payload) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
    };

    ws.onopen = () => {
      send({ type: "auth", token: readToken(), password: pendingPasswordRef.current, cols: term.cols, rows: term.rows });
      pendingPasswordRef.current = "";
    };
    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        term.write(new Uint8Array(event.data));
        return;
      }
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      if (msg.type === "ready") {
        setTarget(msg.target || "");
        setPhase("connected");
        term.clear();
        term.focus();
      } else if (msg.type === "error") {
        teardown();
        setError(msg.message || "Não foi possível abrir o terminal.");
        setPhase("idle");
      } else if (msg.type === "closed") {
        setEndMessage(msg.message || "Sessão encerrada.");
      }
    };
    ws.onclose = () => {
      if (phaseRef.current === "connecting") {
        teardown();
        setError((prev) => prev || "Não foi possível conectar ao terminal. Tente de novo.");
        setPhase("idle");
      } else {
        setPhase("ended");
      }
    };

    const dataSub = term.onData((data) => send({ type: "input", data }));
    const resizeSub = term.onResize(({ cols, rows }) => send({ type: "resize", cols, rows }));
    const observer = new ResizeObserver(() => {
      try {
        fit.fit();
      } catch {
        // container escondido
      }
    });
    observer.observe(containerRef.current);
    const ping = setInterval(() => send({ type: "ping" }), 25000);

    return () => {
      dataSub.dispose();
      resizeSub.dispose();
      observer.disconnect();
      clearInterval(ping);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  function handleOpen(e) {
    e.preventDefault();
    if (!password) return;
    teardown();
    setError("");
    setEndMessage("");
    pendingPasswordRef.current = password;
    setPassword("");
    setPhase("connecting");
    setSessionId((id) => id + 1);
  }

  function handleDisconnect() {
    teardown();
    setPhase("idle");
    setEndMessage("");
  }

  if (statusError) {
    return (
      <section className="admin-card">
        <p className="auth-error">{statusError}</p>
      </section>
    );
  }
  if (!status) {
    return (
      <section className="admin-card">
        <p className="admin-hint">Carregando...</p>
      </section>
    );
  }

  const sessionVisible = phase === "connecting" || phase === "connected" || phase === "ended";

  return (
    <>
      {(!status.configured || showSetup) && !sessionVisible && (
        <TerminalSetup
          status={status}
          onCancel={status.configured ? () => setShowSetup(false) : null}
          onDone={(data) => {
            setStatus(data);
            setShowSetup(false);
          }}
        />
      )}

      {status.configured && !showSetup && !sessionVisible && (
        <form className="admin-card terminal-unlock" onSubmit={handleOpen}>
          <div className="terminal-unlock-head">
            <span className="terminal-unlock-icon" aria-hidden="true">
              <TerminalIcon size={20} />
            </span>
            <div>
              <h2>Abrir terminal</h2>
              <p className="admin-hint">
                {status.sshUser}@{status.sshHost} · configurado em{" "}
                {status.configuredAt ? new Date(status.configuredAt).toLocaleString("pt-BR") : "?"}
              </p>
            </div>
          </div>

          <label className="admin-field">
            <span>Senha da VPS</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="A mesma senha usada na configuração"
              autoFocus
              required
            />
          </label>
          {error && <p className="auth-error">{error}</p>}
          {endMessage && !error && <p className="admin-hint">{endMessage}</p>}

          <p className="admin-hint admin-hint-small">
            Identidade do servidor: <code>{status.hostKeyFingerprint}</code>. A senha é pedida toda vez e nunca fica
            salva - ela só destrava a chave SSH do Concorde.
          </p>

          <div className="admin-form-actions terminal-unlock-actions">
            <button type="button" className="link-btn" onClick={() => setShowSetup(true)}>
              Reconfigurar
            </button>
            <button type="submit" className="admin-primary-btn">
              <LockIcon size={15} /> Abrir terminal
            </button>
          </div>
        </form>
      )}

      {sessionVisible && (
        <section className="admin-card admin-card-flush terminal-card">
          <div className="terminal-toolbar">
            <span className={`terminal-status terminal-status-${phase}`} aria-hidden="true" />
            <strong>{phase === "connected" ? target : phase === "connecting" ? "Conectando..." : "Desconectado"}</strong>
            {phase === "ended" && endMessage && <span className="terminal-toolbar-note">{endMessage}</span>}
            <span className="terminal-toolbar-spacer" />
            <button type="button" className="icon-btn" title="Fechar terminal" aria-label="Fechar terminal" onClick={handleDisconnect}>
              <XIcon size={16} />
            </button>
          </div>
          <div className="terminal-screen" ref={containerRef} />
        </section>
      )}
    </>
  );
}

function TerminalSetup({ status, onCancel, onDone }) {
  const [sshUser, setSshUser] = useState(status.sshUser || "root");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const { data } = await api.post("/api/admin/terminal/setup", { sshUser, password });
      setPassword("");
      onDone(data);
    } catch (err) {
      setError(err.response?.data?.error || "Não foi possível configurar o terminal.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="admin-card" onSubmit={handleSubmit}>
      <div className="admin-card-head">
        <h2>{status.configured ? "Reconfigurar terminal" : "Configurar terminal da VPS"}</h2>
      </div>

      <div className="terminal-warning">
        <AlertTriangleIcon size={18} />
        <p>
          Esse terminal tem <strong>acesso total à VPS</strong>. Quem abrir pode apagar o servidor, o banco e tudo mais.
          Só contas com a flag <code>terminal_access</code> no banco conseguem usar.
        </p>
      </div>

      <p className="admin-hint">
        Digite a senha do usuário SSH da VPS. O Concorde entra uma vez com ela, instala uma chave SSH própria
        (<code>concorde-admin-terminal</code>) no <code>authorized_keys</code> e guarda essa chave criptografada com a sua
        senha. A senha não fica salva - você vai digitá-la de novo toda vez que abrir o terminal.
      </p>

      <div className="admin-form-grid terminal-setup-grid">
        <label className="admin-field">
          <span>Usuário SSH</span>
          <input value={sshUser} onChange={(e) => setSshUser(e.target.value)} required maxLength={32} />
        </label>
        <label className="admin-field">
          <span>Senha da VPS</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoFocus
          />
        </label>
      </div>

      {error && <p className="auth-error">{error}</p>}

      <div className="admin-form-actions">
        {onCancel && (
          <button type="button" onClick={onCancel}>
            Cancelar
          </button>
        )}
        <button type="submit" className="admin-primary-btn" disabled={saving || !password}>
          {saving ? "Configurando..." : status.configured ? "Reconfigurar" : "Configurar terminal"}
        </button>
      </div>
    </form>
  );
}
