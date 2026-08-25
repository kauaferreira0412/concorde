import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Room, RoomEvent, Track } from "livekit-client";
import api from "../../api/client";

export function useCameraPipContainer() {
  const { channelId } = useParams();
  const [searchParams] = useSearchParams();
  const [cameraTracks, setCameraTracks] = useState([]);
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

  return { cameraTracks, error };
}
