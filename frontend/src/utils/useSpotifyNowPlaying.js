import { useEffect, useState } from "react";
import api from "../api/client";

/**
 * "Tocando agora" no Spotify de uma LISTA de usuarios de uma vez (ver Configurações > Conexões
 * pra conectar, e SpotifyController.nowPlayingBatch no backend) - usado na lista de membros
 * (MemberList.jsx) e no perfil (ProfileModal.jsx). Devolve um objeto { userId: NowPlaying } -
 * so' entram nele quem estiver CONECTADO e TOCANDO algo agora mesmo (quem nao conectou a conta,
 * ou conectou mas esta' com o Spotify pausado/fechado, simplesmente nao aparece).
 *
 * Poll simples a cada 15s (mesmo padrao ja' usado em outros lugares do app pra presenca/lista
 * de membros) - o backend ja' tem seu proprio cache curto (ver SpotifyService), entao varias
 * pessoas com a lista de membros aberta ao mesmo tempo nao multiplicam chamada nenhuma pro
 * Spotify de verdade.
 */
export function useSpotifyNowPlaying(userIds) {
  const key = [...new Set((userIds || []).filter((id) => id != null))].sort((a, b) => a - b).join(",");
  const [nowPlaying, setNowPlaying] = useState({});

  useEffect(() => {
    if (!key) {
      setNowPlaying({});
      return;
    }
    let cancelled = false;
    function poll() {
      api
        .post("/api/spotify/now-playing/batch", { userIds: key.split(",").map(Number) })
        .then(({ data }) => {
          if (!cancelled) setNowPlaying(data || {});
        })
        .catch(() => {
          /* Spotify fora do ar/erro pontual - mantem o ultimo estado conhecido em vez de
             piscar tudo pra vazio a cada falha isolada. */
        });
    }
    poll();
    const interval = setInterval(poll, 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [key]);

  return nowPlaying;
}
