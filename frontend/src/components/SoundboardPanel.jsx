import { useEffect, useRef, useState } from "react";
import api from "../api/client";
import { useAlert } from "../context/AlertContext.jsx";
import { useVoiceCall } from "../context/VoiceCallContext.jsx";
import VolumeSlider from "./VolumeSlider.jsx";
import { subscribeToSoundboard } from "../ws/chatSocket";
import { MusicNoteIcon, PencilIcon, PlusIcon, TrashIcon } from "./icons.jsx";

// o bot corta cada som em 15s
const MAX_CLIP_MS = 15000;

function StopIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="2.5" fill="currentColor" />
    </svg>
  );
}

const ACCEPTED_TYPES = "audio/mpeg,audio/mp3,audio/wav,audio/ogg,audio/webm,audio/mp4,audio/aac";

export default function SoundboardPanel({ channelId, stompClient, stompConnected }) {
  const { showAlert } = useAlert();
  const { soundboardVolume, setSoundboardVolume } = useVoiceCall();
  const [clips, setClips] = useState(null);
  // sons que você tocou e ainda devem estar tocando (id -> fim previsto)
  const [playing, setPlaying] = useState({});
  const playTimers = useRef({});
  const durations = useRef({});
  const [renaming, setRenaming] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const dragCounter = useRef(0);
  const fileInputRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get("/api/soundboard")
      .then(({ data }) => {
        if (!cancelled) setClips(data);
      })
      .catch(() => {
        if (!cancelled) setClips([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!stompClient || !stompConnected) return;
    const sub = subscribeToSoundboard(stompClient, (list) => setClips(list));
    return () => sub.unsubscribe();
  }, [stompClient, stompConnected]);

  useEffect(() => {
    const timers = playTimers.current;
    return () => Object.values(timers).forEach(clearTimeout);
  }, []);

  /** Duração do som (lida do próprio arquivo, guardada pra próxima vez). */
  function clipDuration(clip) {
    if (durations.current[clip.id]) return Promise.resolve(durations.current[clip.id]);
    return new Promise((resolve) => {
      const audio = new Audio();
      audio.preload = "metadata";
      const done = (ms) => {
        durations.current[clip.id] = ms;
        resolve(ms);
      };
      audio.onloadedmetadata = () => done(Number.isFinite(audio.duration) ? Math.min(audio.duration * 1000, MAX_CLIP_MS) : MAX_CLIP_MS);
      audio.onerror = () => done(MAX_CLIP_MS);
      setTimeout(() => done(MAX_CLIP_MS), 2500);
      audio.src = clip.fileUrl;
    });
  }

  function markPlaying(clipId, ms) {
    clearTimeout(playTimers.current[clipId]);
    setPlaying((p) => ({ ...p, [clipId]: true }));
    playTimers.current[clipId] = setTimeout(() => {
      setPlaying((p) => {
        const next = { ...p };
        delete next[clipId];
        return next;
      });
    }, ms + 600);
  }

  async function play(clip) {
    if (playing[clip.id]) return stop();
    try {
      await api.post(`/api/channels/${channelId}/soundboard/play/${clip.id}`);
      markPlaying(clip.id, await clipDuration(clip));
    } catch (err) {
      showAlert(err.response?.data?.error || "Não foi possível tocar esse som");
    }
  }

  /** Para os sons que você tocou (os dos outros continuam). */
  async function stop() {
    Object.values(playTimers.current).forEach(clearTimeout);
    playTimers.current = {};
    setPlaying({});
    try {
      await api.post(`/api/channels/${channelId}/soundboard/stop`);
    } catch (err) {
      showAlert(err.response?.data?.error || "Não foi possível parar o som");
    }
  }

  function startRename(clip) {
    setRenaming(clip.id);
    setRenameValue(clip.name);
  }

  async function saveRename(clip) {
    const name = renameValue.trim();
    setRenaming(null);
    if (!name || name === clip.name) return;
    setClips((prev) => (prev || []).map((c) => (c.id === clip.id ? { ...c, name } : c)));
    try {
      const { data } = await api.put(`/api/soundboard/${clip.id}`, { name });
      setClips((prev) => (prev || []).map((c) => (c.id === clip.id ? data : c)));
    } catch (err) {
      setClips((prev) => (prev || []).map((c) => (c.id === clip.id ? clip : c)));
      showAlert(err.response?.data?.error || "Não foi possível renomear esse som");
    }
  }

  async function uploadFile(file) {
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("name", file.name.replace(/\.[^/.]+$/, ""));
      const { data } = await api.post("/api/soundboard", formData);
      setClips((prev) => {
        const list = prev || [];
        return list.some((c) => c.id === data.id) ? list : [data, ...list];
      });
    } catch (err) {
      showAlert(err.response?.data?.error || "Não foi possível enviar esse áudio");
    } finally {
      setUploading(false);
    }
  }

  function handleFileChosen(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    uploadFile(file);
  }

  function handleDragEnter(e) {
    e.preventDefault();
    dragCounter.current += 1;
    setDragActive(true);
  }

  function handleDragOver(e) {
    e.preventDefault();
  }

  function handleDragLeave(e) {
    e.preventDefault();
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setDragActive(false);
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    dragCounter.current = 0;
    setDragActive(false);
    uploadFile(e.dataTransfer.files?.[0]);
  }

  async function remove(clip) {
    try {
      await api.delete(`/api/soundboard/${clip.id}`);
      setClips((prev) => (prev || []).filter((c) => c.id !== clip.id));
    } catch (err) {
      showAlert(err.response?.data?.error || "Não foi possível apagar esse som");
    }
  }

  const list = clips || [];
  const anyPlaying = Object.keys(playing).length > 0;

  return (
    <section
      className={"voice-section soundboard" + (dragActive ? " drag-active" : "")}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input type="file" accept={ACCEPTED_TYPES} ref={fileInputRef} onChange={handleFileChosen} hidden />
      <div className="voice-section-header soundboard-header">
        <div className="soundboard-title">
          <p className="voice-section-title">SOUNDBOARD</p>
          {list.length > 0 && <span className="soundboard-count">{list.length}</span>}
          {anyPlaying && (
            <button type="button" className="btn-accent-sm soundboard-stop" onClick={stop} title="Parar os sons que você tocou">
              <StopIcon size={12} /> Parar
            </button>
          )}
        </div>
        <div className="soundboard-volume" title="Volume dos sons do soundboard só pra você (não muda pros outros)">
          <span className="soundboard-volume-label">Volume dos sons</span>
          <VolumeSlider
            value={soundboardVolume}
            onChange={setSoundboardVolume}
            max={200}
            label="Volume dos sons do soundboard (só pra você)"
          />
        </div>
      </div>
      <p className="soundboard-sub">
        Clique num som pra tocar pra todo mundo na call (clique de novo pra parar) · só você vê seus sons
      </p>

      {clips === null ? (
        <div className="soundboard-grid">
          {[0, 1, 2].map((i) => (
            <div key={i} className="soundboard-tile skeleton" aria-hidden="true" />
          ))}
        </div>
      ) : (
        <div className="soundboard-grid">
          {list.map((clip) => (
            <div key={clip.id} className={"soundboard-tile" + (playing[clip.id] ? " playing" : "")}>
              {renaming === clip.id ? (
                <form
                  className="soundboard-rename"
                  onSubmit={(e) => {
                    e.preventDefault();
                    saveRename(clip);
                  }}
                >
                  <input
                    autoFocus
                    value={renameValue}
                    maxLength={60}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => saveRename(clip)}
                    onKeyDown={(e) => e.key === "Escape" && setRenaming(null)}
                    aria-label="Novo nome do som"
                  />
                </form>
              ) : (
                <button
                  type="button"
                  className="soundboard-tile-play"
                  onClick={() => play(clip)}
                  onDoubleClick={(e) => {
                    e.preventDefault();
                    startRename(clip);
                  }}
                  title={playing[clip.id] ? `Parar "${clip.name}"` : `Tocar "${clip.name}" na call`}
                >
                  <span className="soundboard-tile-icon" aria-hidden="true">
                    {playing[clip.id] ? <StopIcon size={14} /> : <MusicNoteIcon size={16} />}
                  </span>
                  <span className="soundboard-tile-name">{clip.name}</span>
                </button>
              )}
              <button
                type="button"
                className="soundboard-tile-rename"
                onClick={() => startRename(clip)}
                title={`Renomear "${clip.name}"`}
                aria-label={`Renomear ${clip.name}`}
              >
                <PencilIcon size={12} />
              </button>
              <button
                type="button"
                className="soundboard-tile-remove"
                onClick={() => remove(clip)}
                title={`Apagar "${clip.name}"`}
                aria-label={`Apagar ${clip.name}`}
              >
                <TrashIcon size={12} />
              </button>
            </div>
          ))}
          <button
            type="button"
            className={"soundboard-tile soundboard-add" + (uploading ? " uploading" : "")}
            onClick={() => !uploading && fileInputRef.current?.click()}
            disabled={uploading}
            title="Adicionar um som (MP3, WAV, OGG... até 3MB). Também dá pra arrastar o arquivo aqui."
          >
            <span className="soundboard-tile-icon" aria-hidden="true">
              <PlusIcon size={16} />
            </span>
            <span className="soundboard-tile-name">
              {uploading ? "Enviando..." : list.length ? "Adicionar" : "Adicionar o primeiro som"}
            </span>
          </button>
        </div>
      )}

      {dragActive && <div className="soundboard-drop-hint">Solte o áudio pra adicionar</div>}
    </section>
  );
}
