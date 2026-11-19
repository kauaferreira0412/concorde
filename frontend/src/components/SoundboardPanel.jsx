import { useEffect, useRef, useState } from "react";
import api from "../api/client";
import { useAlert } from "../context/AlertContext.jsx";
import { useVoiceCall } from "../context/VoiceCallContext.jsx";
import VolumeSlider from "./VolumeSlider.jsx";
import { subscribeToSoundboard } from "../ws/chatSocket";
import { MusicNoteIcon, PlusIcon, TrashIcon } from "./icons.jsx";

const ACCEPTED_TYPES = "audio/mpeg,audio/mp3,audio/wav,audio/ogg,audio/webm,audio/mp4,audio/aac";

export default function SoundboardPanel({ channelId, stompClient, stompConnected }) {
  const { showAlert } = useAlert();
  const { soundboardVolume, setSoundboardVolume } = useVoiceCall();
  const [clips, setClips] = useState(null);
  const [playingId, setPlayingId] = useState(null);
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

  async function play(clip) {
    setPlayingId(clip.id);
    try {
      await api.post(`/api/channels/${channelId}/soundboard/play/${clip.id}`);
    } catch (err) {
      showAlert(err.response?.data?.error || "Não foi possível tocar esse som");
    } finally {
      setTimeout(() => setPlayingId(null), 400);
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
      <p className="soundboard-sub">Clique num som pra tocar pra todo mundo na call · só você vê seus sons</p>

      {clips === null ? (
        <div className="soundboard-grid">
          {[0, 1, 2].map((i) => (
            <div key={i} className="soundboard-tile skeleton" aria-hidden="true" />
          ))}
        </div>
      ) : (
        <div className="soundboard-grid">
          {list.map((clip) => (
            <div key={clip.id} className={"soundboard-tile" + (playingId === clip.id ? " playing" : "")}>
              <button
                type="button"
                className="soundboard-tile-play"
                onClick={() => play(clip)}
                title={`Tocar "${clip.name}" na call`}
              >
                <span className="soundboard-tile-icon" aria-hidden="true">
                  <MusicNoteIcon size={16} />
                </span>
                <span className="soundboard-tile-name">{clip.name}</span>
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
