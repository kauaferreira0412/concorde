import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // O site normal precisa de "/" (caminho absoluto) pra funcionar com rotas tipo
  // /servers/1/channels/5 - o Caddy serve index.html pra qualquer rota (SPA fallback, ver
  // Caddyfile) e so' caminho absoluto acha os arquivos certos dali. Ja' o app desktop
  // (Electron) abre a pagina via file://, sem rota nenhuma - la' caminho absoluto tentaria
  // ler direto da raiz do disco (tela em branco). So' o build do desktop (ver
  // scripts/package-desktop.mjs) passa VITE_DESKTOP_BUILD=true pra usar caminho relativo.
  base: process.env.VITE_DESKTOP_BUILD === "true" ? "./" : "/",
  server: {
    port: 5173,
    // "true" faz o Vite escutar em 0.0.0.0 (todas as interfaces de rede), nao so
    // localhost - necessario pra alguem de fora (rede local, VPN, ngrok) conseguir abrir.
    host: true,
    // Sem isso o Vite recusa requisicoes vindas de um host diferente de "localhost"
    // (ex: um dominio do ngrok) com "Blocked request. This host is not allowed".
    allowedHosts: true,
    // Repassa chamadas de API e WebSocket pro backend (Spring Boot em :8080) por baixo
    // dos panos. Assim o frontend so' precisa de UM endereco publico (o do proprio Vite) -
    // essencial pro ngrok gratuito, que so' da' UM dominio por conta; e localmente evita
    // precisar declarar IP/porta do backend em lugar nenhum (funciona sozinho sempre).
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
      "/ws": {
        target: "http://localhost:8080",
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
