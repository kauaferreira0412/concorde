import { useEffect, useRef, useState } from "react";
import api from "../api/client";
import { useAlert } from "../context/AlertContext.jsx";
import { PlusIcon, TrashIcon, VolumeIcon, XIcon } from "./icons.jsx";

/**
 * Banco de sons PESSOAL de cada usuario (ver SoundboardController/SoundboardClip no backend) -
 * ninguem mais ve quais sons voce upou nem a lista deles, so' voce. Clicar num som toca ele
 * PRA TODO MUNDO que estiver nessa call agora (o bot de musica publica esse audio no LiveKit,
 * ver music-bot/src/soundboard.js) - diferente do VoiceMod (que so' usa atalho de teclado), aqui
 * e' clique + escolha na hora mesmo (pedido explicito do usuario).
 */
export default function SoundboardPanel({ channelId }) {
  const { showAlert } = useAlert();
  const [clips, setClips] = useState(null); // null = carregando
  const [playingId, setPlayingId] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [newName, setNewName] = useState("");
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

  function pickFile() {
    fileInputRef.current?.click();
  }

  async function handleFileChosen(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("name", newName.trim() || file.name.replace(/\.[^/.]+$/, ""));
      const { data } = await api.post("/api/soundboard", formData);
      setClips((prev) => [data, ...(prev || [])]);
      setNewName("");
      setShowUpload(false);
    } catch (err) {
      showAlert(err.response?.data?.error || "Não foi possível enviar esse áudio");
    } finally {
      setUploading(false);
    }
  }

  async function remove(clip) {
    try {
      await api.delete(`/api/soundboard/${clip.id}`);
      setClips((prev) => (prev || []).filter((c) => c.id !== clip.id));
    } catch (err) {
      showAlert(err.response?.data?.error || "Não foi possível apagar esse som");
    }
  }

  return (
    <section className="voice-section">
      <div className="voice-section-header">
        <p className="voice-section-title">SOUNDBOARD</p>
        <div className="voice-section-header-actions">
          <button
            type="button"
            className={"icon-btn" + (showUpload ? " icon-btn-active" : "")}
            onClick={() => setShowUpload((prev) => !prev)}
            title="Adicionar som ao seu banco"
          >
            <PlusIcon size={15} />
          </button>
        </div>
      </div>
      <p className="voice-hint">
        Seu banco de sons é particular - só você vê o que tem aqui. Clicar num som toca ele pra todo mundo na call.
      </p>

      {showUpload && (
        <div className="soundboard-upload">
          <input
            type="file"
            accept="audio/mpeg,audio/mp3,audio/wav,audio/ogg,audio/webm,audio/mp4,audio/aac"
            ref={fileInputRef}
            onChange={handleFileChosen}
            hidden
          />
          <input
            placeholder="Nome do som (opcional)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            maxLength={60}
          />
          <button type="button" onClick={pickFile} disabled={uploading}>
            {uploading ? "Enviando..." : "Escolher áudio"}
          </button>
          <button type="button" className="icon-btn" onClick={() => setShowUpload(false)} title="Cancelar">
            <XIcon size={14} />
          </button>
        </div>
      )}

      {clips === null ? (
        <p className="voice-hint">Carregando seus sons...</p>
      ) : clips.length === 0 ? (
        <p className="voice-hint">Você ainda não tem nenhum som. Clique em + pra adicionar o primeiro.</p>
      ) : (
        <div className="soundboard-grid">
          {clips.map((clip) => (
            <div key={clip.id} className={"soundboard-clip" + (playingId === clip.id ? " playing" : "")}>
              <button type="button" className="soundboard-clip-play" onClick={() => play(clip)} title={`Tocar "${clip.name}" na call`}>
                <VolumeIcon size={15} />
                <span>{clip.name}</span>
              </button>
              <button type="button" className="icon-btn icon-btn-danger" onClick={() => remove(clip)} title="Apagar som">
                <TrashIcon size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
