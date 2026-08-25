import express from "express";
import { dispose } from "@livekit/rtc-node";
import { LIVEKIT_WS_URL, PORT } from "./src/config.js";
import { router } from "./src/routes.js";
import { disconnectSession, sessions } from "./src/session.js";

const app = express();
app.use(express.json());
app.use(router);

app.listen(PORT, () => console.log(`Music bot ouvindo na porta ${PORT} (LiveKit: ${LIVEKIT_WS_URL})`));

async function shutdown() {
  for (const channelId of [...sessions.keys()]) {
    await disconnectSession(channelId);
  }
  await dispose();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("uncaughtException", (err) => console.error("Erro não tratado (bot continua no ar):", err));
process.on("unhandledRejection", (err) => console.error("Promise rejeitada sem catch (bot continua no ar):", err));
