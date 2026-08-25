import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { COOKIES_PATH, POT_PROVIDER_URL } from "./config.js";

export const YTDLP_EXTRA_ARGS = [
  "--extractor-args",
  `youtubepot-bgutilhttp:base_url=${POT_PROVIDER_URL}`,
  ...(existsSync(COOKIES_PATH) ? ["--cookies", COOKIES_PATH] : []),
];

console.log(`PO Token provider: ${POT_PROVIDER_URL}`);
console.log(existsSync(COOKIES_PATH) ? "cookies.txt encontrado." : "Sem cookies.txt (opcional).");

export function resolveQuery(query) {
  return /^https?:\/\//i.test(query) ? query : `ytsearch1:${query}`;
}

export function fetchMetadata(channelId, query) {
  return new Promise((resolve) => {
    const child = spawn("yt-dlp", [
      "--no-playlist",
      ...YTDLP_EXTRA_ARGS,
      "--print",
      "%(title)s",
      "--print",
      "%(duration)s",
      "--skip-download",
      query,
    ]);

    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => (err += d.toString()));

    child.on("error", (e) => {
      console.error(`[${channelId}] yt-dlp não iniciou (metadados):`, e.message);
      resolve({ title: query, durationSec: null });
    });

    child.on("close", (code) => {
      if (code !== 0 && err.trim()) {
        console.error(`[${channelId}] yt-dlp (metadados, código ${code}):`, err.trim());
      }
      const [titleLine, durationLine] = out.trim().split("\n");
      const durationSec = Number(durationLine);
      resolve({
        title: titleLine?.trim() || query,
        durationSec: Number.isFinite(durationSec) && durationSec > 0 ? Math.round(durationSec) : null,
      });
    });
  });
}

export function spawnAudioStream(query) {
  return spawn("yt-dlp", ["--no-playlist", ...YTDLP_EXTRA_ARGS, "-f", "bestaudio", "-o", "-", "--quiet", query]);
}
