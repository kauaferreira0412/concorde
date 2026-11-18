import { useEffect, useMemo, useRef, useState } from "react";
import api from "../api/client";
import { attachmentSummary } from "../utils/attachmentSummary";
import { FILTER_HINTS, parseSearch } from "../utils/searchFilters";
import Avatar from "./Avatar.jsx";

/**
 * Busca de mensagens com filtros (de:, tem:, antes:, depois:).
 * endpoint: rota de busca do canal/DM; people: quem pode aparecer no "de:".
 */
export default function MessageSearchPanel({ endpoint, people, meId, placeholder, onJump }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef(null);
  const parsed = useMemo(() => parseSearch(query, people, meId), [query, people, meId]);

  // Sugestão de pessoas enquanto digita "de:algo".
  const partialDe = /(^|\s)de:(\S*)$/i.exec(query);
  const personSuggestions = partialDe
    ? people
        .filter((p) => {
          const v = partialDe[2].toLowerCase();
          return !v || p.username?.toLowerCase().includes(v) || p.nickname?.toLowerCase().includes(v);
        })
        .slice(0, 6)
    : [];

  useEffect(() => {
    if (parsed.empty || parsed.errors.length) {
      setResults([]);
      setSearching(false);
      setError("");
      return undefined;
    }
    setSearching(true);
    setError("");
    const handle = setTimeout(() => {
      api
        .get(endpoint, { params: parsed.params })
        .then(({ data }) => setResults(data))
        .catch((err) => setError(err.response?.data?.error || "Não deu pra buscar agora"))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [endpoint, JSON.stringify(parsed.params), parsed.empty, parsed.errors.length]); // eslint-disable-line react-hooks/exhaustive-deps

  function insert(text) {
    setQuery((q) => (q && !q.endsWith(" ") ? q + " " : q) + text);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function pickPerson(p) {
    setQuery((q) => q.replace(/(^|\s)de:(\S*)$/i, `$1de:${p.username} `));
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  const showHints = !query.trim();

  return (
    <div className="chat-side-panel search-panel">
      <input
        ref={inputRef}
        autoFocus
        className="chat-side-panel-search"
        placeholder={placeholder}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Tab" && personSuggestions.length) {
            e.preventDefault();
            pickPerson(personSuggestions[0]);
          }
        }}
      />

      {parsed.chips.length > 0 && (
        <div className="search-chips">
          {parsed.chips.map((c) => (
            <span key={c.key} className="search-chip">
              {c.label}
            </span>
          ))}
        </div>
      )}

      {personSuggestions.length > 0 && (
        <div className="search-people">
          {personSuggestions.map((p) => (
            <button type="button" key={p.userId} className="search-person" onClick={() => pickPerson(p)}>
              <Avatar name={p.username} url={p.avatarUrl} className="voice-avatar small" />
              <span>{p.nickname || p.username}</span>
              {p.nickname && <small>@{p.username}</small>}
            </button>
          ))}
        </div>
      )}

      {showHints && (
        <div className="search-hints">
          <p className="chat-side-panel-title">Filtros</p>
          <div className="search-hint-list">
            {FILTER_HINTS.map((h) => (
              <button type="button" key={h.label} className="search-hint" onClick={() => insert(h.insert)}>
                <code>{h.label}</code>
                <span>{h.hint}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {parsed.errors.map((e) => (
        <p key={e} className="chat-side-panel-empty search-error">
          {e}
        </p>
      ))}
      {error && <p className="chat-side-panel-empty search-error">{error}</p>}

      {!showHints && !parsed.errors.length && (
        searching ? (
          <p className="chat-side-panel-empty">Buscando...</p>
        ) : !parsed.empty && results.length === 0 && !error ? (
          <p className="chat-side-panel-empty">Nada encontrado.</p>
        ) : (
          results.map((m) => (
            <button type="button" key={m.id} className="chat-side-panel-item" onClick={() => onJump(m.id)}>
              <strong>{m.authorUsername}</strong>
              <span>{attachmentSummary(m)}</span>
              <time>{new Date(m.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</time>
            </button>
          ))
        )
      )}
    </div>
  );
}
