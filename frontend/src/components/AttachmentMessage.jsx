import { DownloadIcon, FileIcon } from "./icons.jsx";
import { formatFileSize } from "../utils/fileSize";

/**
 * Renderiza o anexo GENERICO de uma mensagem (video/audio/documento/qualquer arquivo - ver
 * fileUrl/fileName/fileType em Message.java/DirectMessage.java) - separado do fluxo de imagem
 * (m.imageUrl continua exatamente como estava, com preview+lightbox, ver ChatWindow.jsx). Video
 * e audio tocam INLINE (elemento nativo do navegador, com controles); qualquer outro tipo vira
 * um cartao com icone+nome+tamanho+link de abrir. Usado tanto no chat de servidor quanto no
 * privado (mesmo card nos dois, "mesmas caracteristicas" pedido pelo usuario).
 */
export default function AttachmentMessage({ url, name, type, size }) {
  if (!url) return null;
  const kind = (type || "").split("/")[0];

  if (kind === "video") {
    return (
      <video controls preload="metadata" className="chat-video">
        <source src={url} type={type} />
      </video>
    );
  }

  if (kind === "audio") {
    return (
      <div className="chat-audio-card">
        <audio controls preload="metadata" className="chat-audio" src={url} />
        <span className="chat-audio-name">{name}</span>
      </div>
    );
  }

  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="chat-file-card">
      <span className="chat-file-card-icon">
        <FileIcon size={20} />
      </span>
      <span className="chat-file-card-info">
        <strong>{name || "arquivo"}</strong>
        {size ? <span>{formatFileSize(size)}</span> : null}
      </span>
      <DownloadIcon size={16} className="chat-file-card-download" />
    </a>
  );
}
