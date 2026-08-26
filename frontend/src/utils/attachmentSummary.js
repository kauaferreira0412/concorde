/** Texto curto pra representar uma mensagem que e' so' anexo (sem legenda) - usado em resposta/
 *  fixados/busca (ChatWindow.jsx, DmChatWindow.jsx) e nas notificacoes (useUnreadMessages.js,
 *  DmNotificationsContext.jsx). Cobre imagem (fluxo antigo, imageUrl) e o anexo GENERICO novo
 *  (video/audio/documento/qualquer arquivo, inclusive mensagem de voz gravada - ver
 *  AttachmentMessage.jsx). */
export function attachmentSummary(m) {
  if (!m) return "";
  if (m.content) return m.content;
  if (m.imageUrl) return "🖼️ Imagem";
  if (m.fileUrl) {
    const kind = (m.fileType || "").split("/")[0];
    if (kind === "video") return "🎥 Vídeo";
    if (kind === "audio") return "🎵 Áudio";
    return "📎 " + (m.fileName || "Arquivo");
  }
  return "";
}
