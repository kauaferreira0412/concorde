import { useEffect, useState } from "react";
import api from "../api/client";

let favorites = null;
let loading = null;
const listeners = new Set();

function emit() {
  listeners.forEach((fn) => fn(favorites));
}

export function loadFavorites(force = false) {
  if (loading && !force) return loading;
  loading = api
    .get("/api/gifs/favorites")
    .then(({ data }) => {
      favorites = data;
      emit();
      return data;
    })
    .catch(() => {
      favorites = favorites || [];
      emit();
      return favorites;
    });
  return loading;
}

export function useGifFavorites() {
  const [list, setList] = useState(favorites);
  useEffect(() => {
    listeners.add(setList);
    if (favorites === null) loadFavorites();
    else setList(favorites);
    return () => listeners.delete(setList);
  }, []);
  return list;
}

export function findFavorite(url) {
  return (favorites || []).find((f) => f.url === url) || null;
}

/** Liga/desliga o favorito de um GIF. gif: { url, previewUrl?, width?, height? } */
export async function toggleFavorite(gif) {
  const existing = findFavorite(gif.url);
  if (existing) {
    favorites = favorites.filter((f) => f.id !== existing.id);
    emit();
    try {
      await api.delete(`/api/gifs/favorites/${existing.id}`);
    } catch {
      favorites = [existing, ...favorites];
      emit();
    }
    return false;
  }
  const temp = { id: `tmp-${Date.now()}`, url: gif.url, previewUrl: gif.previewUrl || gif.url, width: gif.width, height: gif.height };
  favorites = [temp, ...(favorites || [])];
  emit();
  try {
    const { data } = await api.post("/api/gifs/favorites", {
      url: gif.url,
      previewUrl: gif.previewUrl || gif.url,
      width: gif.width ?? null,
      height: gif.height ?? null,
    });
    favorites = favorites.map((f) => (f.id === temp.id ? data : f));
    emit();
    return true;
  } catch (err) {
    favorites = favorites.filter((f) => f.id !== temp.id);
    emit();
    throw err;
  }
}

/** Imagem de mensagem que pode ser favoritada como GIF. */
export function isGifUrl(url) {
  if (!url || !url.startsWith("https://")) return false;
  return /\.gif(\?|#|$)/i.test(url) || /(^https:\/\/([a-z0-9-]+\.)*giphy\.com\/)/i.test(url) || /tenor\.com\//i.test(url);
}
