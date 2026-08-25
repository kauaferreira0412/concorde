import { useEffect, useRef } from "react";
import { useCameraPipContainer } from "./Container.jsx";
import "./style.css";

export default function CameraPipPage() {
  const { cameraTracks, error } = useCameraPipContainer();

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
