import MessageText from "./MessageText.jsx";
import { MegaphoneIcon } from "./icons.jsx";
import { formatChangelogVersion, useChangelog } from "../context/ChangelogContext.jsx";

/** Marcador que o backend coloca na mensagem automática do canal Atualizações. */
export const CHANGELOG_MARKER_RE = /\[\[changelog:([A-Za-z0-9._-]{1,40})\]\]/;

/** Mensagem de nova versão: resumo + botão que reabre o modal de novidades. */
export default function ChangelogCard({ content, ...textProps }) {
  const changelog = useChangelog();
  const version = CHANGELOG_MARKER_RE.exec(content)?.[1];
  const text = content.replace(CHANGELOG_MARKER_RE, "").trim();
  const loading = changelog?.loadingVersion === version;

  return (
    <div className="changelog-card">
      <MessageText content={text} {...textProps} />
      {version && changelog && (
        <button
          type="button"
          className="changelog-card-btn"
          onClick={() => changelog.openChangelog(version)}
          disabled={loading}
        >
          <MegaphoneIcon size={15} />
          {loading ? "Abrindo..." : `Ver novidades de ${formatChangelogVersion(version)}`}
        </button>
      )}
    </div>
  );
}
