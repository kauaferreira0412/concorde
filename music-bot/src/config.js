export const PORT = process.env.PORT || 4001;
export const LIVEKIT_WS_URL = process.env.LIVEKIT_WS_URL;
export const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
export const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;
export const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8080";

export const SAMPLE_RATE = 48000;
export const CHANNELS = 1;
export const IDLE_DISCONNECT_MS = 60_000;
export const MAX_QUEUE = 50;
export const PACE_AHEAD_MS = 300;
export const SOUNDBOARD_MAX_DURATION_SEC = 15;

export const COOKIES_PATH = "/app/data/cookies.txt";
export const POT_PROVIDER_URL = process.env.POT_PROVIDER_URL || "http://pot-provider:4416";

if (!LIVEKIT_WS_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
  console.error("Faltam variáveis de ambiente: LIVEKIT_WS_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET");
  process.exit(1);
}
