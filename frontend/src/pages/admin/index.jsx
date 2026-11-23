import { Link, Navigate } from "react-router-dom";
import Avatar from "../../components/Avatar.jsx";
import EditUserModal from "../../components/EditUserModal.jsx";
import ConfirmModal from "../../components/ConfirmModal.jsx";
import {
  BarChartIcon,
  ChevronLeftIcon,
  LockIcon,
  MusicNoteIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  ShieldIcon,
  TrashIcon,
  UserIcon,
  UsersIcon,
  TerminalIcon,
  XIcon,
} from "../../components/icons.jsx";
import { useAdminContainer } from "./Container.jsx";
import TerminalSection from "./TerminalSection.jsx";
import "./style.css";

const NAV = [
  { id: "visao-geral", label: "Visão geral", icon: BarChartIcon },
  { id: "usuarios", label: "Usuários", icon: UsersIcon },
  { id: "acesso", label: "Acesso a servidores", icon: LockIcon },
  { id: "bots", label: "Bots", icon: MusicNoteIcon },
  { id: "terminal", label: "Terminal da VPS", icon: TerminalIcon, requiresTerminal: true },
];

const SECTION_META = {
  "visao-geral": { title: "Visão geral", subtitle: "Resumo da instância e atalhos para as tarefas mais comuns." },
  usuarios: { title: "Usuários", subtitle: "Não existe cadastro público: toda conta é criada aqui." },
  acesso: { title: "Acesso a servidores", subtitle: "Coloque um usuário dentro de um servidor que você criou." },
  bots: { title: "Bots", subtitle: "Aparência dos bots que entram nas calls de qualquer servidor." },
  terminal: { title: "Terminal da VPS", subtitle: "Acesso total ao servidor pelo navegador. Use com cuidado." },
};

export default function AdminPage() {
  const c = useAdminContainer();

  if (c.panelPending) {
    return <div className="admin-screen" />;
  }

  if (!c.isAdmin) {
    return <Navigate to="/servers" replace />;
  }

  const meta = SECTION_META[c.tab];

  return (
    <div className="admin-screen">
      <header className="admin-header">
        <div className="admin-header-title">
          <span className="admin-header-badge" aria-hidden="true">
            <ShieldIcon size={20} />
          </span>
          <div>
            <strong>Painel do administrador</strong>
            <span className="admin-header-sub">Concorde</span>
          </div>
        </div>
        <Link to="/servers" className="admin-back-btn">
          <ChevronLeftIcon size={16} />
          <span>Voltar para o chat</span>
        </Link>
      </header>

      <div className="admin-layout">
        <nav className="admin-nav" aria-label="Seções do painel">
          {NAV.filter((item) => !item.requiresTerminal || c.hasTerminal).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={`admin-nav-item${c.tab === id ? " active" : ""}`}
              aria-current={c.tab === id ? "page" : undefined}
              onClick={() => c.goToTab(id)}
            >
              <Icon size={17} />
              <span>{label}</span>
              {id === "usuarios" && !c.usersLoading && <span className="admin-nav-count">{c.users.length}</span>}
            </button>
          ))}

          {c.currentUser && (
            <div className="admin-nav-me">
              <Avatar name={c.currentUser.username} url={c.currentUser.avatarUrl} className="voice-avatar small" />
              <div>
                <span className="admin-nav-me-name">{c.currentUser.username}</span>
                <span className="admin-nav-me-role">Administrador</span>
              </div>
            </div>
          )}
        </nav>

        <main className="admin-main">
          <div className="admin-section-head">
            <div>
              <h1>{meta.title}</h1>
              <p>{meta.subtitle}</p>
            </div>
            {c.tab === "usuarios" && !c.showCreate && (
              <button type="button" className="admin-primary-btn" onClick={c.openCreate}>
                <PlusIcon size={16} />
                Novo usuário
              </button>
            )}
          </div>

          {c.tab === "visao-geral" && <OverviewSection c={c} />}
          {c.tab === "usuarios" && <UsersSection c={c} />}
          {c.tab === "acesso" && <AccessSection c={c} />}
          {c.tab === "bots" && <BotsSection c={c} />}
          {c.tab === "terminal" && c.hasTerminal && <TerminalSection />}
        </main>
      </div>

      {c.editingUser && (
        <EditUserModal user={c.editingUser} onClose={() => c.setEditingUser(null)} onSaved={c.handleUserSaved} />
      )}

      {c.deletingUser && (
        <ConfirmModal
          title="Excluir usuário"
          message={`Tem certeza que quer excluir "${c.deletingUser.username}"? A conta e o acesso dela aos servidores serão removidos - não dá pra desfazer.`}
          confirmLabel="Excluir"
          danger
          onClose={() => c.setDeletingUser(null)}
          onConfirm={c.handleConfirmDelete}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function StatTile({ label, value, detail, tone, icon: Icon, loading }) {
  return (
    <div className={`admin-stat admin-stat-${tone}`}>
      <span className="admin-stat-icon" aria-hidden="true">
        <Icon size={18} />
      </span>
      <span className="admin-stat-label">{label}</span>
      <span className="admin-stat-value">{loading ? "–" : value}</span>
      {detail && <span className="admin-stat-detail">{loading ? " " : detail}</span>}
    </div>
  );
}

function RoleBadge({ role, panel }) {
  if (role !== "ADMIN") return <span className="admin-badge">Usuário</span>;
  return (
    <span className="admin-badges">
      <span className="admin-badge admin-badge-admin">
        <ShieldIcon size={12} />
        Administrador
      </span>
      {panel && (
        <span className="admin-badge admin-badge-panel" title="Acesso ao painel liberado direto no banco">
          <LockIcon size={12} />
          Painel
        </span>
      )}
    </span>
  );
}

function OverviewSection({ c }) {
  const { stats } = c;
  return (
    <>
      <div className="admin-stats">
        <StatTile
          label="Usuários"
          value={stats.totalUsers}
          detail={`${stats.regularUsers} comuns`}
          tone="a"
          icon={UsersIcon}
          loading={c.usersLoading}
        />
        <StatTile
          label="Administradores"
          value={stats.admins}
          detail={`${stats.panelAdmins} com acesso a este painel`}
          tone="b"
          icon={ShieldIcon}
          loading={c.usersLoading}
        />
        <StatTile
          label="Servidores"
          value={stats.servers}
          detail={stats.rpgServers ? `${stats.rpgServers} de RPG` : "nenhum de RPG"}
          tone="c"
          icon={BarChartIcon}
          loading={c.serversLoading}
        />
      </div>

      <div className="admin-overview-grid">
        <section className="admin-card">
          <h2>Ações rápidas</h2>
          <div className="admin-quick-actions">
            <button type="button" className="admin-quick-action" onClick={c.openCreate}>
              <span className="admin-quick-icon tone-a">
                <PlusIcon size={18} />
              </span>
              <span>
                <strong>Criar usuário</strong>
                <small>Nova conta com senha inicial</small>
              </span>
            </button>
            <button type="button" className="admin-quick-action" onClick={() => c.goToTab("acesso")}>
              <span className="admin-quick-icon tone-b">
                <LockIcon size={18} />
              </span>
              <span>
                <strong>Liberar acesso</strong>
                <small>Adicionar alguém a um servidor</small>
              </span>
            </button>
            <button type="button" className="admin-quick-action" onClick={() => c.goToTab("bots")}>
              <span className="admin-quick-icon tone-c">
                <MusicNoteIcon size={18} />
              </span>
              <span>
                <strong>Aparência dos bots</strong>
                <small>Fotos do Melodion e do Batera</small>
              </span>
            </button>
          </div>
        </section>

        <section className="admin-card">
          <div className="admin-card-head">
            <h2>Contas mais recentes</h2>
            <button type="button" className="link-btn" onClick={() => c.goToTab("usuarios")}>
              Ver todos
            </button>
          </div>
          {c.usersLoading ? (
            <p className="admin-hint">Carregando...</p>
          ) : c.recentUsers.length === 0 ? (
            <p className="admin-hint">Nenhuma conta ainda.</p>
          ) : (
            <ul className="admin-recent-list">
              {c.recentUsers.map((u) => (
                <li key={u.id}>
                  <Avatar name={u.username} url={u.avatarUrl} className="voice-avatar small" />
                  <div className="admin-user-cell-text">
                    <span className="admin-user-name">{u.username}</span>
                    <span className="admin-user-sub">{u.email}</span>
                  </div>
                  <RoleBadge role={u.role} panel={u.adminPanel} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

function CreateUserPanel({ c }) {
  return (
    <form className="admin-card admin-create-card" onSubmit={c.handleCreateUser}>
      <div className="admin-card-head">
        <h2>Novo usuário</h2>
        <button
          type="button"
          className="icon-btn"
          title="Fechar"
          aria-label="Fechar formulário"
          onClick={() => c.setShowCreate(false)}
        >
          <XIcon size={16} />
        </button>
      </div>

      <div className="admin-form-grid">
        <label className="admin-field">
          <span>Usuário</span>
          <input
            placeholder="3 a 32 caracteres"
            value={c.newUsername}
            onChange={(e) => c.setNewUsername(e.target.value)}
            required
            minLength={3}
            maxLength={32}
            autoFocus
          />
        </label>
        <label className="admin-field">
          <span>Email</span>
          <input
            placeholder="nome@exemplo.com"
            type="email"
            value={c.newEmail}
            onChange={(e) => c.setNewEmail(e.target.value)}
            required
          />
        </label>
        <label className="admin-field">
          <span>Senha inicial</span>
          <input
            placeholder="Mínimo 6 caracteres"
            required
            minLength={6}
            type="password"
            autoComplete="new-password"
            value={c.newPassword}
            onChange={(e) => c.setNewPassword(e.target.value)}
          />
        </label>
      </div>

      {c.createError && <p className="auth-error">{c.createError}</p>}
      {c.createOk && (
        <div className="admin-success admin-success-row">
          <span>Usuário "{c.createOk.username}" criado.</span>
          <button type="button" className="link-btn" onClick={() => c.startGrantFor(c.createOk)}>
            Liberar acesso a um servidor
          </button>
        </div>
      )}

      <div className="admin-form-actions">
        <button type="button" onClick={() => c.setShowCreate(false)}>
          Cancelar
        </button>
        <button type="submit" className="admin-primary-btn" disabled={c.creating}>
          {c.creating ? "Criando..." : "Criar usuário"}
        </button>
      </div>
    </form>
  );
}

function UsersSection({ c }) {
  const filters = [
    { id: "ALL", label: "Todos" },
    { id: "ADMIN", label: "Administradores" },
    { id: "USER", label: "Usuários" },
  ];

  return (
    <>
      {c.showCreate && <CreateUserPanel c={c} />}

      <section className="admin-card admin-card-flush">
        <div className="admin-toolbar">
          <label className="admin-search">
            <SearchIcon size={16} />
            <input
              type="search"
              placeholder="Buscar por nome, apelido ou email"
              value={c.userQuery}
              onChange={(e) => c.setUserQuery(e.target.value)}
              aria-label="Buscar usuários"
            />
          </label>
          <div className="admin-segmented" role="group" aria-label="Filtrar por cargo">
            {filters.map((f) => (
              <button
                key={f.id}
                type="button"
                className={c.roleFilter === f.id ? "active" : ""}
                aria-pressed={c.roleFilter === f.id}
                onClick={() => c.setRoleFilter(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {c.deleteError && <p className="auth-error admin-inline-error">{c.deleteError}</p>}

        {c.usersLoading ? (
          <p className="admin-hint admin-table-empty">Carregando usuários...</p>
        ) : c.filteredUsers.length === 0 ? (
          <div className="admin-table-empty">
            <UserIcon size={22} />
            <p>{c.users.length === 0 ? "Nenhuma conta criada ainda." : "Nenhum usuário encontrado com esse filtro."}</p>
          </div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Usuário</th>
                <th>Email</th>
                <th>Cargo</th>
                <th className="admin-th-actions">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {c.filteredUsers.map((u) => {
                const isMe = u.id === c.currentUser?.id;
                // contas com acesso ao painel só mudam direto no banco (ou o próprio dono edita a sua)
                const lockedPanel = u.adminPanel && !isMe;
                return (
                  <tr key={u.id}>
                    <td data-label="Usuário">
                      <div className="admin-user-cell">
                        <Avatar name={u.username} url={u.avatarUrl} className="voice-avatar small" />
                        <div className="admin-user-cell-text">
                          <span className="admin-user-name">
                            {u.username}
                            {isMe && <span className="admin-you">você</span>}
                          </span>
                          {u.nickname && u.nickname !== u.username && (
                            <span className="admin-user-sub">{u.nickname}</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td data-label="Email" className="admin-td-email">
                      {u.email}
                    </td>
                    <td data-label="Cargo">
                      <RoleBadge role={u.role} panel={u.adminPanel} />
                    </td>
                    <td className="admin-table-actions">
                      {u.role !== "ADMIN" && (
                        <button
                          type="button"
                          className="icon-btn"
                          title="Liberar acesso a um servidor"
                          aria-label={`Liberar acesso para ${u.username}`}
                          onClick={() => c.startGrantFor(u)}
                        >
                          <LockIcon size={15} />
                        </button>
                      )}
                      <button
                        type="button"
                        className="icon-btn"
                        title={lockedPanel ? "Contas com acesso ao painel só podem ser alteradas pelo dono" : "Editar usuário"}
                        aria-label={`Editar ${u.username}`}
                        disabled={lockedPanel}
                        onClick={() => c.setEditingUser(u)}
                      >
                        <PencilIcon size={15} />
                      </button>
                      <button
                        type="button"
                        className="icon-btn icon-btn-danger"
                        title={
                          isMe
                            ? "Você não pode excluir sua própria conta"
                            : u.adminPanel
                              ? "Contas com acesso ao painel não podem ser excluídas por aqui"
                              : "Excluir usuário"
                        }
                        aria-label={`Excluir ${u.username}`}
                        disabled={isMe || u.adminPanel}
                        onClick={() => {
                          c.setDeleteError("");
                          c.setDeletingUser(u);
                        }}
                      >
                        <TrashIcon size={15} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {!c.usersLoading && c.users.length > 0 && (
          <p className="admin-table-footer">
            Mostrando {c.filteredUsers.length} de {c.users.length} {c.users.length === 1 ? "conta" : "contas"}
          </p>
        )}
      </section>
    </>
  );
}

function AccessSection({ c }) {
  const selectedUser = c.users.find((u) => String(u.id) === c.grantUserId);
  const selectedServer = c.servers.find((s) => String(s.id) === c.grantServerId);

  return (
    <div className="admin-access-grid">
      <form className="admin-card" onSubmit={c.handleGrantAccess}>
        <h2>Liberar acesso</h2>
        <p className="admin-hint">Administradores já enxergam tudo, então só contas comuns aparecem na lista.</p>

        <label className="admin-field">
          <span>Usuário</span>
          <select
            value={c.grantUserId}
            onChange={(e) => {
              c.setGrantUserId(e.target.value);
              c.setGrantResult(null);
            }}
            required
          >
            <option value="">Selecione o usuário...</option>
            {c.grantableUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.username} ({u.email})
              </option>
            ))}
          </select>
        </label>

        <label className="admin-field">
          <span>Servidor</span>
          <select
            value={c.grantServerId}
            onChange={(e) => {
              c.setGrantServerId(e.target.value);
              c.setGrantResult(null);
            }}
            required
          >
            <option value="">Selecione o servidor...</option>
            {c.servers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        {selectedUser && selectedServer && (
          <div className="admin-grant-preview">
            <Avatar name={selectedUser.username} url={selectedUser.avatarUrl} className="voice-avatar small" />
            <span>
              <strong>{selectedUser.username}</strong> vai entrar em <strong>{selectedServer.name}</strong>
            </span>
          </div>
        )}

        {c.grantResult && (
          <p className={c.grantResult.ok ? "admin-success" : "auth-error"}>{c.grantResult.message}</p>
        )}

        <div className="admin-form-actions">
          <button type="submit" className="admin-primary-btn" disabled={c.granting || !c.grantUserId || !c.grantServerId}>
            {c.granting ? "Liberando..." : "Liberar acesso"}
          </button>
        </div>
      </form>

      <section className="admin-card">
        <div className="admin-card-head">
          <h2>Seus servidores</h2>
          {!c.serversLoading && <span className="admin-nav-count">{c.servers.length}</span>}
        </div>
        {c.serversLoading ? (
          <p className="admin-hint">Carregando...</p>
        ) : c.servers.length === 0 ? (
          <p className="admin-hint">Você ainda não criou nenhum servidor.</p>
        ) : (
          <ul className="admin-server-list">
            {c.servers.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  className={`admin-server-item${String(s.id) === c.grantServerId ? " active" : ""}`}
                  onClick={() => {
                    c.setGrantServerId(String(s.id));
                    c.setGrantResult(null);
                  }}
                >
                  <Avatar name={s.name} url={s.iconUrl} className="voice-avatar small" />
                  <span className="admin-user-cell-text">
                    <span className="admin-user-name">{s.name}</span>
                    {s.description && <span className="admin-user-sub">{s.description}</span>}
                  </span>
                  {s.type === "RPG" && <span className="admin-badge">RPG</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function BotCard({ name, role, bot }) {
  return (
    <section className="admin-card admin-bot-card">
      <Avatar name={name} url={bot.url} className="avatar-picker-preview" />
      <div className="admin-bot-info">
        <h2>{name}</h2>
        <p className="admin-hint">{role}</p>
        <input
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          ref={bot.inputRef}
          onChange={bot.handleChange}
          hidden
        />
        <button type="button" onClick={() => bot.inputRef.current?.click()} disabled={bot.uploading}>
          {bot.uploading ? "Enviando..." : "Trocar foto"}
        </button>
        <p className="admin-hint admin-hint-small">PNG, JPG, GIF ou WEBP, até 8MB.</p>
        {bot.error && <p className="auth-error">{bot.error}</p>}
      </div>
    </section>
  );
}

function BotsSection({ c }) {
  return (
    <div className="admin-bots-grid">
      <BotCard name="Melodion" role="Bot de música" bot={c.musicBot} />
      <BotCard name="Batera" role="Bot do soundboard" bot={c.soundboardBot} />
    </div>
  );
}
