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
