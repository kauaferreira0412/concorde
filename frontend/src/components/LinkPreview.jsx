import { useEffect, useState } from "react";
import api from "../api/client";
import { isGifUrl } from "../utils/gifFavorites";

const URL_RE = /https?:\/\/[^\s<>()"']+[^\s<>()"'.,;:!?]/gi;
const cache = new Map();

/** Primeiro link "previewável" de um texto (ignora GIFs, que já aparecem como imagem). */
export function firstPreviewableUrl(text) {
  if (!text) return null;
  const matches = text.match(URL_RE) || [];
  return matches.find((u) => !isGifUrl(u)) || null;
}

function loadPreview(url) {
  if (!cache.has(url)) {
    cache.set(
      url,
      api
        .get("/api/link-preview", { params: { url } })
        .then(({ data }) => data)
        .catch(() => null)
    );
  }
  return cache.get(url);
}

function youtubeId(url) {
  const m = url.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{6,})/i);
  return m ? m[1] : null;
}

function youtubeStart(url) {
  const m = url.match(/[?&#]t=(\d+)/);
  return m ? Number(m[1]) : 0;
}

/** Vídeo do YouTube: card com miniatura; clicar no play toca o vídeo ali mesmo, sem sair do chat. */
function YouTubeCard({ url, id, data }) {
  const [playing, setPlaying] = useState(false);
  const start = youtubeStart(url);
  const title = data?.title || "Vídeo do YouTube";
  return (
    <div className="link-preview video yt">
      <a className="link-preview-text" href={url} target="_blank" rel="noopener noreferrer" title={url}>
        <span className="link-preview-site">
          <span className="link-preview-icon yt" aria-hidden="true">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" />
            </svg>
          </span>
          YouTube{data?.description ? ` · ${data.description}` : ""}
        </span>
        <strong className="link-preview-title">{title}</strong>
      </a>
      <span className="link-preview-media">
        {playing ? (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0${start ? `&start=${start}` : ""}`}
            title={title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        ) : (
          <button type="button" className="link-preview-yt-thumb" onClick={() => setPlaying(true)} title="Tocar aqui">
            <img src={data?.image || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`} alt="" loading="lazy" />
            <span className="link-preview-play" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" />
              </svg>
            </span>
          </button>
        )}
      </span>
    </div>
  );
}

/** Card de prévia (título, site, descrição e imagem) do primeiro link da mensagem. */
export default function LinkPreview({ text }) {
  const url = firstPreviewableUrl(text);
  const [data, setData] = useState(null);

  useEffect(() => {
    let alive = true;
    setData(null);
    if (!url) return undefined;
    loadPreview(url).then((d) => alive && setData(d));
    return () => {
      alive = false;
    };
  }, [url]);

  if (!url) return null;
  const ytId = youtubeId(url);
  if (ytId) return <YouTubeCard url={url} id={ytId} data={data} />;
  if (!data || !data.title) return null;

  const isVideo = false;
  const host = (() => {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return data.siteName;
    }
  })();

  return (
    <a
      className={"link-preview" + (isVideo && data.image ? " video" : "")}
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={url}
    >
      <span className="link-preview-text">
        <span className="link-preview-site">
          <span className="link-preview-icon" aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
              <path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
            </svg>
          </span>
          {data.siteName || host}
        </span>
        <strong className="link-preview-title">{data.title}</strong>
        {data.description && <span className="link-preview-desc">{data.description}</span>}
      </span>
      {data.image && (
        <span className="link-preview-media">
          <img src={data.image} alt="" loading="lazy" onError={(e) => (e.currentTarget.parentElement.style.display = "none")} />
          {isVideo && (
            <span className="link-preview-play" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" />
              </svg>
            </span>
          )}
        </span>
      )}
    </a>
  );
}
