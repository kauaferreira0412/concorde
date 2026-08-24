import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Room, RoomEvent, Track } from "livekit-client";
import api from "../api/client";

/**
 * Pagina MINIMA (so' isso, nada de sidebar/chat/resto do app) que roda dentro da janela
 * SEPARADA das cameras no app desktop (ver electron/main.cjs, aberta via
 * window.concordeDesktop.openCameraPip). Existe porque Document Picture-in-Picture (a API que
 * faria isso no navegador comum, ver CameraPipWindow.jsx) NAO funciona dentro do Electron -
 * falta a "casca" de navegador de verdade (gerenciador de janelas) que essa API depende, o
 * pedido nunca resolve nem rejeita, so' fica pendurado pra sempre (reportado - so' no app
 * desktop, no navegador funciona).
 *
 * Uma janela do Electron e' um PROCESSO separado - nao enxerga os tracks de video que a janela
 * PRINCIPAL ja tem em maos (nao da pra "mover" um MediaStreamTrack entre processos). Essa
 * pagina entra na MESMA sala do LiveKit por conta propria, so' pra ASSISTIR (token com
 * "hidden: true" e canPublish false, ver LiveKitService.generateCameraViewerToken/
 * VoiceController.getCameraViewerToken no backend) - "hidden" faz o LiveKit nem avisar os
 * OUTROS participantes que essa conexao existe, entao ninguem mais na call ve um
 * "participante fantasma" a mais.
 *
 * Autenticacao: essa janela e' um processo NOVO, sem acesso ao sessionStorage da janela
 * principal - o token do APP (JWT de login, diferente do token do LiveKit) vem pela propria
 * URL (ver main.cjs) e e' gravado no sessionStorage LOCAL dessa janela assim que ela abre,
 * pra api/client.js (que sempre le de sessionStorage/localStorage) funcionar sem mudar nada.
 */
export default function CameraPipPage() {
  const { channelId } = useParams();
  const [searchParams] = useSearchParams();
  const [cameraTracks, setCameraTracks] = useState([]); // [{identity, name, track}]
  const [error, setError] = useState("");
  const roomRef = useRef(null);

  useEffect(() => {
    const appToken = searchParams.get("token");
    if (!appToken || !channelId) {
      setError("Faltou informação pra abrir essa janela.");
      return;
    }
    sessionStorage.setItem("token", appToken);

    let cancelled = false;
    const room = new Room({ adaptiveStream: true, dynacast: true });
    roomRef.current = room;

    function sync() {
      const tracks = [];
      room.remoteParticipants.forEach((participant) => {
        const pub = participant.getTrackPublication(Track.Source.Camera);
        if (pub?.track) {
          tracks.push({ identity: participant.identity, name: participant.name || participant.identity, track: pub.track });
        }
      });
      setCameraTracks(tracks);
    }
    room.on(RoomEvent.TrackSubscribed, sync);
    room.on(RoomEvent.TrackUnsubscribed, sync);
    room.on(RoomEvent.TrackMuted, sync);
    room.on(RoomEvent.TrackUnmuted, sync);
    room.on(RoomEvent.ParticipantDisconnected, sync);
    room.on(RoomEvent.ParticipantConnected, sync);

    (async () => {
      try {
        const { data } = await api.post(`/api/channels/${channelId}/voice-token/viewer`);
        if (cancelled) return;
        await room.connect(data.wsUrl, data.token);
        sync();
      } catch (err) {
        if (!cancelled) setError("Não foi possível conectar: " + (err.response?.data?.error || err.message));
      }
    })();

    return () => {
      cancelled = true;
      room.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  return (
    <div className="camera-pip-page">
      {error ? (
        <p className="camera-pip-page-error">{error}</p>
      ) : cameraTracks.length === 0 ? (
        <p className="camera-pip-page-empty">Nenhuma câmera ligada no momento.</p>
      ) : (
        <div className="camera-pip-grid">
          {cameraTracks.map((c) => (
            <ViewerCameraTile key={c.identity} track={c.track} name={c.name} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Tile simples - so' anexa o track e mostra o nome, sem os botoes extras (tela cheia etc) que
 *  o CameraTile de dentro da call de verdade tem (ver VoiceChannel.jsx). */
function ViewerCameraTile({ track, name }) {
  const videoRef = useRef(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !track) return;
    track.attach(el);
    return () => track.detach(el);
  }, [track]);

  return (
    <div className="camera-tile camera-tile-xl">
      <video ref={videoRef} autoPlay playsInline />
      <span className="camera-tile-name">{name}</span>
    </div>
  );
}
