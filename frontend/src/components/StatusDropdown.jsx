import { useEffect, useRef, useState } from "react";
import { ChevronDownIcon } from "./icons.jsx";

export const STATUS_OPTIONS = [
  { value: "ONLINE", label: "Online", hint: "Aparece disponível pros outros", dotClass: "online" },
  { value: "AWAY", label: "Ausente", hint: "Aparece com um ícone de ausente", dotClass: "away" },
  { value: "DND", label: "Não perturbe", hint: "Silencia notificações pra você (em breve)", dotClass: "dnd" },
  {
    value: "INVISIBLE",
    label: "Invisível",
    hint: "Aparece offline pra todo mundo, mas continua usando o app normalmente",
    dotClass: "offline",
  },
];

export default function StatusDropdown({ value, onChange, disabled }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const current = STATUS_OPTIONS.find((o) => o.value === value) || STATUS_OPTIONS[0];

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    function handleEscape(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  function pick(optValue) {
    setOpen(false);
    if (optValue !== value) onChange(optValue);
  }

  return (
    <div className="status-dropdown" ref={rootRef}>
      <button
        type="button"
        className="status-dropdown-trigger"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={"status-dot " + current.dotClass} />
        <span className="status-dropdown-trigger-label">{current.label}</span>
        <ChevronDownIcon size={15} className={"status-dropdown-chevron" + (open ? " open" : "")} />
      </button>

      {open && (
        <div className="status-dropdown-menu" role="listbox">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="option"
              aria-selected={opt.value === value}
              className={"status-option" + (opt.value === value ? " active" : "")}
              onClick={() => pick(opt.value)}
            >
              <span className={"status-dot " + opt.dotClass} />
              <span>
                <strong>{opt.label}</strong>
                <small>{opt.hint}</small>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
