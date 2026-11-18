/**
 * Estado vazio no estilo adesivo: ícone num "selo" inclinado, título em Bungee, dica e ação opcional.
 * tone: "accent" | "mint" | "orange" — cor do selo. size: "lg" (painel principal) | "sm" (listas laterais).
 */
export default function EmptyState({ icon, title, hint, tone = "mint", size = "lg", children }) {
  return (
    <div className={`empty-state empty-state-${size}`}>
      <div className={`empty-state-badge tone-${tone}`} aria-hidden="true">
        <span className="empty-state-badge-back" />
        <span className="empty-state-badge-front">{icon}</span>
      </div>
      {title && <p className="empty-state-title">{title}</p>}
      {hint && <p className="empty-state-hint">{hint}</p>}
      {children && <div className="empty-state-actions">{children}</div>}
    </div>
  );
}
