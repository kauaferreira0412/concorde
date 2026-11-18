import { useState } from "react";
import { isGifUrl, toggleFavorite, useGifFavorites } from "../utils/gifFavorites";
import { StarIcon } from "./GifPicker.jsx";

/** Imagem de mensagem; se for GIF, ganha a estrela pra salvar nos favoritos (igual ao Discord). */
export default function ChatImage({ url, onOpen }) {
  const favorites = useGifFavorites();
  const [error, setError] = useState("");
  const gif = isGifUrl(url);
  const favorited = gif && (favorites || []).some((f) => f.url === url);

  async function star(e) {
    e.stopPropagation();
    setError("");
    try {
      await toggleFavorite({ url, previewUrl: url });
    } catch (err) {
      setError(err.response?.data?.error || "Não deu pra salvar");
    }
  }

  return (
    <div className={"chat-image-wrap" + (gif ? " is-gif" : "")}>
      <button type="button" className="chat-image-btn" onClick={onOpen}>
        <img src={url} alt={gif ? "GIF" : "Imagem enviada no chat"} className="chat-image" loading="lazy" />
      </button>
      {gif && (
        <button
          type="button"
          className={"chat-image-star" + (favorited ? " on" : "")}
          onClick={star}
          title={favorited ? "Tirar dos favoritos" : "Salvar nos GIFs favoritos"}
          aria-label={favorited ? "Tirar dos favoritos" : "Salvar nos GIFs favoritos"}
        >
          <StarIcon filled={favorited} />
        </button>
      )}
      {error && <span className="chat-image-error">{error}</span>}
    </div>
  );
}
