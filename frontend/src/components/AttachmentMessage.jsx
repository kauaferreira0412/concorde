import { DownloadIcon, FileIcon } from "./icons.jsx";
import { formatFileSize } from "../utils/fileSize";
import AudioPlayer from "./AudioPlayer.jsx";

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
      <AudioPlayer src={url} name={name} />
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
