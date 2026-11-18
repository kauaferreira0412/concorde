import { useEffect, useRef, useState } from "react";
import api from "../api/client";
import { useAuth } from "../context/AuthContext.jsx";
import { CheckIcon, PencilIcon, PlusIcon, XIcon } from "./icons.jsx";

/** Status personalizado editável direto no próprio perfil: clica, escreve, Enter salva, Esc cancela. */
export default function CustomStatusEditor({ value, onSaved }) {
  const { updateUser } = useAuth();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    if (!editing) setText(value || "");
  }, [value, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  async function save(next) {
    setSaving(true);
    setError("");
    try {
      const { data } = await api.put("/api/users/me/custom-status", { text: next.trim() });
      const saved = data.customStatus || null;
      updateUser({ customStatus: saved });
      onSaved?.(saved);
      setEditing(false);
    } catch (err) {
      setError(err.response?.data?.error || "Não deu pra salvar agora");
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        className={"custom-status-edit" + (value ? "" : " empty")}
        onClick={() => setEditing(true)}
        title="Editar status personalizado"
      >
        {value ? (
          <>
            <span className="custom-status-edit-text">{value}</span>
            <PencilIcon size={13} />
          </>
        ) : (
          <>
            <PlusIcon size={13} /> Definir status
          </>
        )}
      </button>
    );
  }

  return (
    <div className="custom-status-form">
      <div className="custom-status-form-row">
        <input
          ref={inputRef}
          value={text}
          maxLength={80}
          placeholder="ex.: 🎲 mestrando às 21h"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save(text);
            if (e.key === "Escape") {
              e.stopPropagation();
              setEditing(false);
            }
          }}
          disabled={saving}
          aria-label="Status personalizado"
        />
        <button type="button" className="icon-btn icon-btn-active" onClick={() => save(text)} disabled={saving} title="Salvar">
          <CheckIcon size={16} />
        </button>
        <button type="button" className="icon-btn" onClick={() => setEditing(false)} disabled={saving} title="Cancelar">
          <XIcon size={16} />
        </button>
      </div>
      <div className="custom-status-form-foot">
        <span>{text.length}/80 · Enter salva</span>
        {value && (
          <button type="button" className="link-btn" onClick={() => save("")} disabled={saving}>
            Limpar status
          </button>
        )}
      </div>
      {error && <p className="auth-error">{error}</p>}
    </div>
  );
}
