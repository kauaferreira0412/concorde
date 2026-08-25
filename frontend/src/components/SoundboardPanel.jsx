import { useEffect, useRef, useState } from "react";
import api from "../api/client";
import { useAlert } from "../context/AlertContext.jsx";
import { subscribeToSoundboard } from "../ws/chatSocket";
import { MusicNoteIcon, PlusIcon, TrashIcon, XIcon } from "./icons.jsx";

const ACCEPTED_TYPES = "audio/mpeg,audio/mp3,audio/wav,audio/ogg,audio/webm,audio/mp4,audio/aac";

/**
 * Banco de sons PESSOAL de cada usuario (ver SoundboardController/SoundboardClip no backend) -
 * ninguem mais ve quais sons voce upou nem a lista deles, so' voce. Clicar num som toca ele
 * PRA TODO MUNDO que estiver nessa call agora (o bot de musica publica esse audio no LiveKit,
 * ver music-bot/src/soundboard.js) - diferente do VoiceMod (que so' usa atalho de teclado), aqui
 * e' clique + escolha na hora mesmo (pedido explicito do usuario). O nome do som vem direto do
 * nome do arquivo (sem extensao) - arrastar/soltar ou clicar ja envia na hora, sem formulario.
 *
 * A lista tambem chega ao vivo via WebSocket (ver subscribeToSoundboard/SoundboardService.
 * broadcastList no backend) - sem isso, subir um som no navegador nao aparecia no app desktop
 * (nem vice-versa) ate' fechar e abrir o painel de novo (reportado pelo usuario).
 */
export default function SoundboardPanel({ channelId, stompClient, stompConnected }) {
  const { showAlert } = useAlert();
  const [clips, setClips] = useState(null); // null = carregando
  const [playingId, setPlayingId] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
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
      setClips((prev) => [data, ...(prev || [])]);
      setShowUpload(false);
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
      <p className="voice-hint soundboard-hint">
        Seu banco de sons é particular - só você vê o que tem aqui. Clicar num som toca ele pra todo mundo na call.
      </p>

      {showUpload && (
        <div
          className={"soundboard-dropzone" + (dragActive ? " drag-active" : "") + (uploading ? " uploading" : "")}
          onClick={() => !uploading && fileInputRef.current?.click()}
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          title="Arraste um áudio ou clique aqui (até 3MB)"
        >
          <input type="file" accept={ACCEPTED_TYPES} ref={fileInputRef} onChange={handleFileChosen} hidden />
          <PlusIcon size={15} />
          <span>{uploading ? "Enviando..." : "Arraste ou clique"}</span>
          <button
            type="button"
            className="icon-btn soundboard-dropzone-close"
            onClick={(e) => {
              e.stopPropagation();
              setShowUpload(false);
            }}
            title="Cancelar"
          >
            <XIcon size={11} />
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
                <span className="soundboard-clip-icon">
                  <MusicNoteIcon size={12} />
                </span>
                <span className="soundboard-clip-name">{clip.name}</span>
              </button>
              <button type="button" className="soundboard-clip-remove" onClick={() => remove(clip)} title="Apagar som">
                <TrashIcon size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
