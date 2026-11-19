import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import api from "../api/client";
import { useTheme } from "../context/ThemeContext.jsx";
import { presetToAppearance, resolveColors, sameAppearance } from "../theme/themes";
import { applyRemoteWallpaper, getWallpaperFile, useUiPrefs } from "../utils/uiPrefs";
import Avatar from "./Avatar.jsx";
import ConfirmModal from "./ConfirmModal.jsx";
import ImageCropModal from "./ImageCropModal.jsx";
import { CheckIcon, ImageIcon, PlusIcon, SearchIcon, TrashIcon, UsersIcon, XIcon } from "./icons.jsx";

const MAX_UPLOAD = 8 * 1024 * 1024;

/** Prévia desenhada com as cores (quando o tema não tem capa). */
function ColorPreview({ base, colors, waves, wallpaperUrl }) {
  const c = resolveColors(base, colors);
  return (
    <span
      className={"theme-card-preview" + (waves ? " waves" : "")}
      style={{
        "--th-bg": c.bg,
        "--th-surface": c.surface,
        "--th-ink": c.ink,
        "--th-accent": c.accent,
        "--th-mint": c.mint,
        "--th-orange": c.orange,
        "--th-text": c.text,
        "--th-wave": c.wave,
        ...(wallpaperUrl ? { backgroundImage: `url("${wallpaperUrl}")` } : null),
      }}
      aria-hidden="true"
    >
      <span className="theme-card-preview-side">
        <i />
        <i className="active" />
        <i />
      </span>
      <span className="theme-card-preview-main">
        <b style={{ background: c.orange }} />
        <b style={{ background: c.mint }} />
        <em />
      </span>
    </span>
  );
}

function asFile(blobOrFile, name) {
  if (blobOrFile instanceof File) return blobOrFile;
  return new File([blobOrFile], name, { type: blobOrFile.type || "image/jpeg" });
}

/** Formulário de publicar o tema atual (cores + capa + imagem de fundo opcional). */
function PublishThemeModal({ onClose, onPublished }) {
  const theme = useTheme();
  const prefs = useUiPrefs();
  const activePreset = theme.presets.find((p) => p.id === theme.activePresetId);
  const [name, setName] = useState(activePreset && !activePreset.builtin ? activePreset.name : "");
  const [description, setDescription] = useState("");
  const [cover, setCover] = useState(null);
  const [coverPreview, setCoverPreview] = useState(null);
  const [cropFile, setCropFile] = useState(null);
  const [includeWallpaper, setIncludeWallpaper] = useState(!!prefs.wallpaperUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const coverRef = useRef(null);

  useEffect(() => () => coverPreview && URL.revokeObjectURL(coverPreview), [coverPreview]);

  function pickCover(e) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) setCropFile(f);
  }

  async function submit(e) {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    setError("");
    let created = null;
    try {
      let wallpaper = null;
      if (includeWallpaper && prefs.wallpaperUrl) {
        wallpaper = await getWallpaperFile();
        if (wallpaper && wallpaper.size > MAX_UPLOAD) {
          throw new Error("A imagem de fundo passa de 8MB - escolha uma menor ou publique sem ela.");
        }
      }
      if (cover && cover.size > MAX_UPLOAD) throw new Error("A capa passa de 8MB.");

      const form = new FormData();
      form.append(
        "data",
        JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          base: theme.base,
          colors: theme.colors,
          waves: theme.waves,
          wallpaperMode: prefs.wallpaperMode === "app" ? "app" : "chat",
          wallpaperDim: prefs.wallpaperDim,
          wallpaperBlur: prefs.wallpaperBlur,
          glassPanels: prefs.glassPanels,
        })
      );
      if (cover) form.append("cover", cover);
      const { data } = await api.post("/api/themes", form);
      created = data;
      if (wallpaper) {
        const wf = new FormData();
        wf.append("file", wallpaper);
        const res = await api.post(`/api/themes/${data.id}/wallpaper`, wf);
        created = res.data;
      }
      onPublished(created);
    } catch (err) {
      // se a imagem de fundo falhou, não deixa um tema pela metade na galeria
      if (created) api.delete(`/api/themes/${created.id}`).catch(() => {});
      setError(err.response?.data?.error || err.message || "Não deu pra publicar agora");
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div className="modal-backdrop theme-publish-backdrop" onClick={busy ? undefined : onClose}>
      <form className="modal theme-publish-modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="theme-publish-head">
          <h2>Publicar tema</h2>
          <button type="button" className="icon-btn" onClick={onClose} disabled={busy} title="Fechar">
            <XIcon size={18} />
          </button>
        </div>
        <p className="admin-hint" style={{ margin: 0 }}>
          Publica as cores que você está usando agora. Qualquer pessoa do Concorde vai poder ver e aplicar.
        </p>

        <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" ref={coverRef} onChange={pickCover} hidden />
        <button type="button" className="theme-publish-cover" onClick={() => coverRef.current?.click()} disabled={busy}>
          {coverPreview ? (
            <img src={coverPreview} alt="Capa do tema" />
          ) : (
            <ColorPreview
              base={theme.base}
              colors={theme.colors}
              waves={theme.waves}
              wallpaperUrl={includeWallpaper ? prefs.wallpaperUrl : null}
            />
          )}
          <span className="theme-publish-cover-hint">
            <ImageIcon size={16} /> {coverPreview ? "Trocar capa" : "Adicionar capa (opcional)"}
          </span>
        </button>
        {coverPreview && (
          <button
            type="button"
            className="link-btn"
            onClick={() => {
              setCover(null);
              setCoverPreview(null);
            }}
          >
            Tirar capa
          </button>
        )}

        <div className="settings-field">
          <label className="settings-label">Nome</label>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="ex.: Roxo da madrugada" autoFocus />
        </div>
        <div className="settings-field">
          <label className="settings-label">Descrição (opcional)</label>
          <input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={140} placeholder="ex.: escuro, confortável pra noite" />
        </div>
        <label className={"settings-checkbox-row" + (prefs.wallpaperUrl ? "" : " disabled")}>
          <input
            type="checkbox"
            checked={includeWallpaper && !!prefs.wallpaperUrl}
            disabled={!prefs.wallpaperUrl}
            onChange={(e) => setIncludeWallpaper(e.target.checked)}
          />
          {prefs.wallpaperUrl
            ? `Incluir minha imagem de fundo (${prefs.wallpaperMode === "app" ? "fundo do app" : "só no chat"})`
            : "Sem imagem de fundo pra incluir (dá pra escolher uma em Imagem de fundo)"}
        </label>
        {error && <p className="auth-error">{error}</p>}
        <div className="theme-publish-actions">
          <button type="button" className="link-btn" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button type="submit" className="appearance-btn primary" disabled={!name.trim() || busy}>
            {busy ? "Publicando..." : "Publicar"}
          </button>
        </div>

        {cropFile && (
          <ImageCropModal
            file={cropFile}
            aspect={16 / 9}
            outputWidth={960}
            shape="banner"
            title="Recortar capa do tema"
            onCancel={() => setCropFile(null)}
            onConfirm={(f) => {
              const file = asFile(f, "capa.jpg");
              setCropFile(null);
              setCover(file);
              setCoverPreview(URL.createObjectURL(file));
            }}
          />
        )}
      </form>
    </div>,
    document.body
  );
}

/** Galeria da comunidade: lista os temas publicados, aplica e publica o seu. */
export default function ThemeGallery() {
  const theme = useTheme();
  const [sort, setSort] = useState("popular");
  const [query, setQuery] = useState("");
  const [themes, setThemes] = useState(null);
  const [error, setError] = useState("");
  const [publishOpen, setPublishOpen] = useState(false);
  const [appliedId, setAppliedId] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const { data } = await api.get("/api/themes", { params: { sort, q: query.trim() || undefined } });
      setThemes(data);
    } catch (err) {
      setThemes([]);
      setError(err.response?.status === 404 ? "A galeria ainda não está no servidor - ele precisa ser atualizado." : err.response?.data?.error || "Não deu pra carregar a galeria agora");
    }
  }, [sort, query]);

  useEffect(() => {
    const t = setTimeout(load, query ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, query]);

  async function apply(t) {
    const appearance = presetToAppearance({ base: t.base, colors: t.colors, waves: t.waves });
    // já tem esse preset salvo? só aplica; senão salva como preset seu (fica mesmo se apagarem da galeria)
    const existing = theme.presets.find((p) => !p.builtin && p.name === t.name && sameAppearance(presetToAppearance(p), appearance));
    if (existing) theme.applyPreset(existing.id);
    else theme.savePreset(t.name, appearance);
    if (t.wallpaperUrl) {
      await applyRemoteWallpaper(t.wallpaperUrl, {
        mode: t.wallpaperMode,
        dim: t.wallpaperDim,
        blur: t.wallpaperBlur,
        glass: t.glassPanels,
      });
    }
    setAppliedId(t.id);
    setMessage(`"${t.name}" aplicado${t.wallpaperUrl ? " com a imagem de fundo" : ""} e salvo nos seus presets.`);
    api.post(`/api/themes/${t.id}/use`).catch(() => {});
    setThemes((prev) => prev?.map((x) => (x.id === t.id ? { ...x, uses: x.uses + 1 } : x)));
  }

  async function confirmDelete() {
    const t = toDelete;
    setToDelete(null);
    try {
      await api.delete(`/api/themes/${t.id}`);
      setThemes((prev) => prev?.filter((x) => x.id !== t.id));
    } catch (err) {
      setError(err.response?.data?.error || "Não deu pra apagar");
    }
  }

  return (
    <>
      <div className="theme-gallery-head">
        <p className="settings-section-title">Galeria da comunidade</p>
        <button type="button" className="appearance-btn primary" onClick={() => setPublishOpen(true)}>
          <PlusIcon size={15} /> Publicar meu tema
        </button>
      </div>
      <p className="admin-hint" style={{ margin: 0 }}>
        Temas que o pessoal publicou. Aplicar salva o tema nos seus presets, e a imagem de fundo vem junto quando tiver.
      </p>
      <div className="theme-gallery-tools">
        <div className="theme-gallery-sort" role="tablist">
          {[
            { id: "popular", label: "Populares" },
            { id: "recent", label: "Recentes" },
          ].map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={sort === s.id}
              className={"wallpaper-mode-btn" + (sort === s.id ? " active" : "")}
              onClick={() => setSort(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>
        <label className="theme-gallery-search">
          <SearchIcon size={15} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar tema ou autor" aria-label="Buscar tema" />
        </label>
      </div>

      {message && <p className="appearance-message ok">{message}</p>}
      {error && <p className="auth-error">{error}</p>}

      {themes === null ? (
        <p className="admin-hint">Carregando...</p>
      ) : themes.length === 0 ? (
        <p className="admin-hint">{query ? "Nenhum tema com esse nome." : "Ninguém publicou um tema ainda - seja o primeiro!"}</p>
      ) : (
        <div className="theme-gallery-grid">
          {themes.map((t) => (
            <article key={t.id} className={"theme-card" + (appliedId === t.id ? " applied" : "")}>
              <div className="theme-card-cover">
                {t.coverUrl ? (
                  <img src={t.coverUrl} alt="" loading="lazy" />
                ) : (
                  <ColorPreview base={t.base} colors={t.colors} waves={t.waves} wallpaperUrl={t.wallpaperUrl} />
                )}
                <span className="theme-card-tags">
                  <span>{t.base === "light" ? "claro" : "escuro"}</span>
                  {t.wallpaperUrl && (
                    <span title="Vem com imagem de fundo">
                      <ImageIcon size={11} /> fundo
                    </span>
                  )}
                </span>
                {t.canDelete && (
                  <button type="button" className="theme-card-delete" onClick={() => setToDelete(t)} title="Apagar da galeria">
                    <TrashIcon size={14} />
                  </button>
                )}
              </div>
              <div className="theme-card-body">
                <strong className="theme-card-name" title={t.name}>
                  {t.name}
                </strong>
                {t.description && <span className="theme-card-desc">{t.description}</span>}
                <span className="theme-card-meta">
                  <Avatar name={t.authorUsername} url={t.authorAvatarUrl} className="theme-card-avatar" />
                  <span className="theme-card-author">{t.authorUsername}</span>
                  <span className="theme-card-uses" title="Quantas vezes foi aplicado">
                    <UsersIcon size={12} /> {t.uses}
                  </span>
                </span>
                <button type="button" className="appearance-btn theme-card-apply" onClick={() => apply(t)}>
                  {appliedId === t.id ? (
                    <>
                      <CheckIcon size={14} /> Aplicado
                    </>
                  ) : (
                    "Aplicar"
                  )}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {publishOpen && (
        <PublishThemeModal
          onClose={() => setPublishOpen(false)}
          onPublished={(t) => {
            setPublishOpen(false);
            setMessage(`"${t.name}" publicado na galeria.`);
            setSort("recent");
            setThemes((prev) => [t, ...(prev || []).filter((x) => x.id !== t.id)]);
          }}
        />
      )}
      {toDelete && (
        <ConfirmModal
          title="Apagar tema da galeria"
          message={`"${toDelete.name}" some da galeria pra todo mundo (quem já aplicou continua com ele nos presets).`}
          confirmLabel="Apagar"
          danger
          onClose={() => setToDelete(null)}
          onConfirm={confirmDelete}
        />
      )}
    </>
  );
}
