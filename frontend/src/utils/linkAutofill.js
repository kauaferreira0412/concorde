/**
 * Preenche um bloco do "Sobre mim" a partir da prévia do link (Spotify, YouTube, Steam, qualquer site).
 * Devolve { title, subtitle, image } com o que deu pra descobrir.
 */
const TYPE_WORDS = /^(song|música|musica|single|album|álbum|ep|playlist|artist|artista|podcast|episode|episódio|\d{4})$/i;

function clean(s) {
  return (s || "").replace(/\s+/g, " ").trim();
}

function fromSpotify(p) {
  let title = clean(p.title).replace(/\s*\|\s*Spotify\s*$/i, "");
  let artist = null;
  // "Música - song and lyrics by Artista" / "Música - música e letra de Artista"
  const by = title.match(/^(.*?)\s+-\s+(?:song, lyrics, and music video by|song and lyrics by|song by|música e letra de|single by|album by|álbum de)\s+(.+)$/i);
  if (by) {
    title = by[1];
    artist = by[2];
  }
  if (!artist && p.description) {
    // "Listen to X on Spotify. Song · Artista · 1989." ou "Artista · Álbum · Song · 1989"
    const desc = clean(p.description)
      .replace(/^.*?on Spotify\.\s*/i, "")
      .replace(/^.*?no Spotify\.\s*/i, "")
      .replace(/\.$/, "");
    artist =
      desc
        .split("·")
        .map((x) => x.trim())
        .find((x) => x && !TYPE_WORDS.test(x)) || null;
  }
  return { title, subtitle: artist };
}

function fromYoutube(p) {
  const channel =
    clean(p.description)
      .replace(/\s*-\s*Topic$/i, "")
      .replace(/VEVO$/i, "")
      .trim() || null;
  let title = clean(p.title);
  let artist = channel;
  const dash = title.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if (dash) {
    artist = dash[1];
    title = dash[2];
  }
  title = title
    .replace(/\s*[([](official|oficial|lyric|lyrics|audio|áudio|video|vídeo|clipe|visualizer|hd|4k)[^)\]]*[)\]]\s*/gi, " ")
    .trim();
  return { title, subtitle: artist };
}

function fromSteam(p) {
  const title = clean(p.title)
    .replace(/^(save|economize)\s+\d+%\s+(on|em)\s+/i, "")
    .replace(/\s+(on|no)\s+Steam$/i, "");
  return { title, subtitle: null };
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function looksLikeUrl(value) {
  return /^(https?:\/\/)?[\w-]+(\.[\w-]+)+\/\S+/i.test((value || "").trim());
}

export function normalizeUrl(value) {
  const url = (value || "").trim();
  return /^https?:\/\//i.test(url) ? url : "https://" + url;
}

export function blockFromPreview(preview, type) {
  if (!preview) return null;
  const host = hostOf(preview.url);
  let out;
  if (host.endsWith("spotify.com")) out = fromSpotify(preview);
  else if (host === "youtu.be" || host.endsWith("youtube.com"))
    out = type === "music" ? fromYoutube(preview) : { title: clean(preview.title), subtitle: null };
  else if (host.endsWith("steampowered.com")) out = fromSteam(preview);
  else out = { title: clean(preview.title) || clean(preview.siteName), subtitle: type === "link" ? null : clean(preview.siteName) || null };
  const image = /^https:\/\//i.test(preview.image || "") ? preview.image : null;
  return {
    title: (out.title || "").slice(0, 60),
    subtitle: (out.subtitle || "").slice(0, 80),
    image,
  };
}
