import { useEffect, useRef, useState } from "react";
import api from "../api/client";
import { toggleFavorite, useGifFavorites } from "../utils/gifFavorites";
import { SearchIcon, XIcon } from "./icons.jsx";

const PAGE = 30;

function StarIcon({ filled }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" aria-hidden="true">
      <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />
    </svg>
  );
}

let statusCache = null;

export default function GifPicker({ onPick, onClose }) {
  const favorites = useGifFavorites();
  const [searchEnabled, setSearchEnabled] = useState(statusCache);
  const [tab, setTab] = useState("favorites");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [nextOffset, setNextOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const requestRef = useRef(0);

  useEffect(() => {
    if (statusCache !== null) return;
    api
      .get("/api/gifs/status")
      .then(({ data }) => {
        statusCache = !!data.searchEnabled;
        setSearchEnabled(statusCache);
      })
      .catch(() => setSearchEnabled(false));
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
    function onDown(e) {
      if (rootRef.current && !rootRef.current.contains(e.target) && !e.target.closest?.(".chat-gif-btn")) onClose();
    }
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  useEffect(() => {
    if (tab !== "search" || !searchEnabled) return undefined;
    const id = ++requestRef.current;
    setLoading(true);
    setError("");
    const handle = setTimeout(() => {
      const url = query.trim() ? "/api/gifs/search" : "/api/gifs/trending";
      api
        .get(url, { params: { q: query.trim(), offset: 0, limit: PAGE } })
        .then(({ data }) => {
          if (id !== requestRef.current) return;
          setResults(data.results);
          setNextOffset(data.nextOffset);
          setHasMore(data.hasMore);
        })
        .catch((err) => id === requestRef.current && setError(err.response?.data?.error || "Não deu pra buscar GIFs agora"))
        .finally(() => id === requestRef.current && setLoading(false));
    }, query.trim() ? 350 : 0);
    return () => clearTimeout(handle);
  }, [query, tab, searchEnabled]);

  function loadMore() {
    if (loading || !hasMore) return;
    const id = requestRef.current;
    setLoading(true);
    const url = query.trim() ? "/api/gifs/search" : "/api/gifs/trending";
    api
      .get(url, { params: { q: query.trim(), offset: nextOffset, limit: PAGE } })
      .then(({ data }) => {
        if (id !== requestRef.current) return;
        setResults((prev) => [...prev, ...data.results.filter((r) => !prev.some((p) => p.id === r.id))]);
        setNextOffset(data.nextOffset);
        setHasMore(data.hasMore);
      })
      .catch(() => {})
      .finally(() => id === requestRef.current && setLoading(false));
  }

  function onScroll(e) {
    const el = e.currentTarget;
    if (tab === "search" && el.scrollTop + el.clientHeight > el.scrollHeight - 200) loadMore();
  }

  function handleQuery(value) {
    setQuery(value);
    if (value.trim() && tab !== "search") setTab("search");
  }

  const favUrls = new Set((favorites || []).map((f) => f.url));
  const items =
    tab === "favorites"
      ? (favorites || [])
          .filter((f) => !query.trim() || f.url.toLowerCase().includes(query.trim().toLowerCase()))
          .map((f) => ({ id: `fav-${f.id}`, url: f.url, previewUrl: f.previewUrl || f.url, width: f.width, height: f.height }))
      : results;

  async function star(e, gif) {
    e.stopPropagation();
    try {
      await toggleFavorite(gif);
    } catch (err) {
      setError(err.response?.data?.error || "Não deu pra salvar esse favorito");
    }
  }

  return (
    <div className="gif-picker" ref={rootRef} role="dialog" aria-label="Escolher GIF">
      <div className="gif-picker-head">
        <div className="gif-picker-tabs">
          <button type="button" className={"gif-tab" + (tab === "favorites" ? " active" : "")} onClick={() => setTab("favorites")}>
            <StarIcon filled /> Favoritos
          </button>
          {searchEnabled && (
            <button type="button" className={"gif-tab" + (tab === "search" ? " active" : "")} onClick={() => setTab("search")}>
              {query.trim() ? "Busca" : "Em alta"}
            </button>
          )}
        </div>
        <button type="button" className="icon-btn" onClick={onClose} title="Fechar">
          <XIcon size={16} />
        </button>
      </div>
      <label className="gif-picker-search">
        <SearchIcon size={15} />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => handleQuery(e.target.value)}
          placeholder={searchEnabled ? "Buscar GIFs" : "Filtrar favoritos"}
          aria-label="Buscar GIFs"
        />
      </label>

      <div className="gif-picker-body" onScroll={onScroll}>
        {error && <p className="gif-picker-msg error">{error}</p>}
        {tab === "favorites" && favorites === null && <p className="gif-picker-msg">Carregando favoritos…</p>}
        {tab === "favorites" && favorites !== null && items.length === 0 && (
          <div className="gif-picker-empty">
            <span className="gif-picker-empty-star">
              <StarIcon />
            </span>
            <strong>{query.trim() ? "Nenhum favorito com isso" : "Sem GIFs favoritos ainda"}</strong>
            <span>
              Passa o mouse num GIF {searchEnabled ? "da busca ou " : ""}do chat e clica na estrela pra guardar aqui.
            </span>
            {searchEnabled && !query.trim() && (
              <button type="button" className="gif-tab active" onClick={() => setTab("search")}>
                Ver GIFs em alta
              </button>
            )}
          </div>
        )}
        {tab === "search" && !loading && !error && results.length === 0 && (
          <p className="gif-picker-msg">Nenhum GIF encontrado.</p>
        )}

        <div className="gif-grid">
          {items.map((g) => (
            <button
              key={g.id}
              type="button"
              className="gif-tile"
              style={g.width && g.height ? { aspectRatio: `${g.width} / ${g.height}` } : undefined}
              onClick={() => onPick(g)}
              title="Enviar esse GIF"
            >
              <img src={g.previewUrl || g.url} alt="" loading="lazy" />
              <span
                role="button"
                tabIndex={0}
                className={"gif-star" + (favUrls.has(g.url) ? " on" : "")}
                onClick={(e) => star(e, g)}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && star(e, g)}
                title={favUrls.has(g.url) ? "Tirar dos favoritos" : "Salvar nos favoritos"}
              >
                <StarIcon filled={favUrls.has(g.url)} />
              </span>
            </button>
          ))}
        </div>
        {tab === "search" && loading && <p className="gif-picker-msg">Carregando…</p>}
      </div>
      {tab === "search" && <p className="gif-picker-credit">GIFs via GIPHY</p>}
    </div>
  );
}

export { StarIcon };
