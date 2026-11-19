import { useState } from "react";
import api from "../api/client";
import { useAuth } from "../context/AuthContext.jsx";
import { ChevronDownIcon, MusicNoteIcon, PlusIcon, TrashIcon } from "./icons.jsx";

export const MAX_ABOUT_BLOCKS = 8;

function LinkIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5" />
      <path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5" />
    </svg>
  );
}

function GamepadIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 8h12a4 4 0 0 1 4 4v1.5a3.5 3.5 0 0 1-6.3 2.1L14.5 14h-5l-1.2 1.6A3.5 3.5 0 0 1 2 13.5V12a4 4 0 0 1 4-4z" />
      <path d="M7 11v3M5.5 12.5h3" />
      <circle cx="16" cy="11.5" r="0.8" fill="currentColor" />
      <circle cx="18" cy="13.5" r="0.8" fill="currentColor" />
    </svg>
  );
}

export const BLOCK_TYPES = {
  link: { label: "Link", group: "Links", Icon: LinkIcon, titlePh: "Nome (ex.: Meu canal)", subPh: "", urlPh: "https://..." },
  game: { label: "Jogo", group: "Jogos favoritos", Icon: GamepadIcon, titlePh: "Jogo (ex.: Baldur's Gate 3)", subPh: "Detalhe (ex.: main bardo, 300h)", urlPh: "Link (opcional)" },
  music: { label: "Música", group: "Música do momento", Icon: MusicNoteIcon, titlePh: "Música", subPh: "Artista", urlPh: "Link (opcional, ex.: Spotify)" },
};
const ORDER = ["music", "game", "link"];

function safeUrl(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** Mostra os blocos agrupados por tipo (música, jogos, links). `compact` = painel lateral da DM. */
export function AboutBlocksView({ blocks, compact = false, SectionTag = "div" }) {
  if (!Array.isArray(blocks) || blocks.length === 0) return null;
  return ORDER.filter((type) => blocks.some((b) => b.type === type)).map((type) => {
    const meta = BLOCK_TYPES[type];
    const items = blocks.filter((b) => b.type === type);
    return (
      <SectionTag key={type} className={compact ? "dm-profile-card" : "profile-section"}>
        <p className={compact ? "dm-profile-card-title" : "profile-section-title"}>
          {compact ? meta.group.toUpperCase() : meta.group}
        </p>
        <div className={"about-blocks about-blocks-" + type}>
          {items.map((b, i) => {
            const href = safeUrl(b.url);
            const inner = (
              <>
                <span className="about-block-icon">
                  <meta.Icon size={16} />
                </span>
                <span className="about-block-text">
                  <strong>{b.title}</strong>
                  {(b.subtitle || (type === "link" && href)) && <span>{b.subtitle || hostOf(href)}</span>}
                </span>
              </>
            );
            return href ? (
              <a key={i} className="about-block" href={href} target="_blank" rel="noopener noreferrer nofollow" title={href}>
                {inner}
              </a>
            ) : (
              <div key={i} className="about-block">
                {inner}
              </div>
            );
          })}
        </div>
      </SectionTag>
    );
  });
}

const sameBlocks = (a, b) => JSON.stringify(a || []) === JSON.stringify(b || []);
const emptyBlock = (type) => ({ type, title: "", subtitle: "", url: "" });

/** Editor dos blocos nas Configurações (salva separado do resto). */
export function AboutBlocksEditor() {
  const { user, updateUser } = useAuth();
  const saved = user?.aboutBlocks || [];
  const [blocks, setBlocks] = useState(() => saved.map((b) => ({ ...emptyBlock(b.type), ...b, subtitle: b.subtitle || "", url: b.url || "" })));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState(false);

  const normalized = blocks.map((b) => ({
    type: b.type,
    title: b.title.trim(),
    subtitle: b.subtitle?.trim() || null,
    url: b.url?.trim() || null,
  }));
  const dirty = !sameBlocks(
    normalized,
    saved.map((b) => ({ type: b.type, title: b.title, subtitle: b.subtitle || null, url: b.url || null }))
  );

  function patch(i, change) {
    setBlocks((prev) => prev.map((b, j) => (j === i ? { ...b, ...change } : b)));
  }
  function move(i, dir) {
    setBlocks((prev) => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  async function save() {
    setError("");
    const missing = normalized.findIndex((b) => !b.title || (b.type === "link" && !b.url));
    if (missing >= 0) {
      setError(`O bloco ${missing + 1} precisa de ${normalized[missing].title ? "um link" : "um título"}.`);
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.put("/api/users/me/about-blocks", { blocks: normalized });
      const next = data.aboutBlocks || [];
      updateUser({ aboutBlocks: next });
      setBlocks(next.map((b) => ({ ...emptyBlock(b.type), ...b, subtitle: b.subtitle || "", url: b.url || "" })));
      setOk(true);
    } catch (err) {
      setError(err.response?.data?.error || "Não deu pra salvar os blocos agora");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="settings-field">
      <label className="settings-label">Blocos do perfil</label>
      <p className="admin-hint" style={{ margin: 0 }}>
        Música do momento, jogos favoritos e links - aparecem no seu perfil embaixo do "Sobre mim".
      </p>
      {blocks.length > 0 && (
        <div className="about-editor-list">
          {blocks.map((b, i) => {
            const meta = BLOCK_TYPES[b.type];
            return (
              <div key={i} className="about-editor-row">
                <div className="about-editor-head">
                  <span className="about-block-icon">
                    <meta.Icon size={15} />
                  </span>
                  <select value={b.type} onChange={(e) => patch(i, { type: e.target.value })} aria-label="Tipo do bloco">
                    {Object.entries(BLOCK_TYPES).map(([k, t]) => (
                      <option key={k} value={k}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  <span className="about-editor-spacer" />
                  <button type="button" className="icon-btn" onClick={() => move(i, -1)} disabled={i === 0} title="Subir">
                    <ChevronDownIcon size={15} className="about-chev-up" />
                  </button>
                  <button type="button" className="icon-btn" onClick={() => move(i, 1)} disabled={i === blocks.length - 1} title="Descer">
                    <ChevronDownIcon size={15} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => setBlocks((prev) => prev.filter((_, j) => j !== i))}
                    title="Remover bloco"
                  >
                    <TrashIcon size={15} />
                  </button>
                </div>
                <div className="about-editor-fields">
                  <input value={b.title} onChange={(e) => patch(i, { title: e.target.value })} placeholder={meta.titlePh} maxLength={60} />
                  {b.type !== "link" && (
                    <input value={b.subtitle} onChange={(e) => patch(i, { subtitle: e.target.value })} placeholder={meta.subPh} maxLength={80} />
                  )}
                  <input
                    value={b.url}
                    onChange={(e) => patch(i, { url: e.target.value })}
                    placeholder={meta.urlPh}
                    maxLength={300}
                    inputMode="url"
                    spellCheck={false}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div className="about-editor-actions">
        {blocks.length < MAX_ABOUT_BLOCKS &&
          ORDER.map((type) => {
            const meta = BLOCK_TYPES[type];
            return (
              <button key={type} type="button" className="appearance-btn" onClick={() => setBlocks((prev) => [...prev, emptyBlock(type)])}>
                <PlusIcon size={14} /> {meta.label}
              </button>
            );
          })}
        <span className="about-editor-spacer" />
        <button type="button" className="appearance-btn primary" onClick={save} disabled={!dirty || saving}>
          {saving ? "Salvando..." : "Salvar blocos"}
        </button>
      </div>
      {ok && !dirty && (
        <p className="admin-hint" style={{ margin: 0, color: "var(--success)" }}>
          Blocos salvos.
        </p>
      )}
      {error && <p className="auth-error">{error}</p>}
    </div>
  );
}
