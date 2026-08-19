import { useAuth } from "../context/AuthContext.jsx";

export default function ServerSidebar({ servers, selectedServerId, onSelect, onCreateServer }) {
  const { isAdmin } = useAuth();
  return (
    <div className="server-sidebar">
      {servers.map((s) => (
        <button
          key={s.id}
          className={"server-icon" + (s.id === selectedServerId ? " active" : "")}
          title={s.name}
          onClick={() => onSelect(s.id)}
        >
          {s.iconUrl ? <img src={s.iconUrl} alt="" className="server-icon-img" /> : s.name.slice(0, 2).toUpperCase()}
        </button>
      ))}
      {/* Criar servidor e' exclusivo do administrador */}
      {isAdmin && (
        <button className="server-icon add" title="Criar servidor" onClick={onCreateServer}>
          +
        </button>
      )}
    </div>
  );
}
