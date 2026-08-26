import { useRef, useState } from "react";

/**
 * Grava audio do microfone pra mandar como MENSAGEM DE VOZ no chat (ver DmChatWindow.jsx/
 * ChatWindow.jsx) - MediaRecorder puro, sem lib nova, "audio/webm" (suportado nativamente no
 * Chromium, que e' o motor tanto do Chrome quanto do Electron - unicos navegador/app oficialmente
 * suportados aqui). Ao parar, devolve um Blob pronto pra entrar no MESMO fluxo de upload de um
 * arquivo de audio escolhido manualmente - a gravacao vira so' mais um "arquivo" no fim das contas.
 */
export function useAudioRecorder() {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const timerRef = useRef(null);

  async function start() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;
    chunksRef.current = [];
    const recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.start();
    mediaRecorderRef.current = recorder;
    setRecording(true);
    setSeconds(0);
    timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
  }

  /** Para de gravar e devolve o Blob final (audio/webm) - null se nunca chegou a gravar nada. */
  function stop() {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === "inactive") {
        resolve(null);
        return;
      }
      recorder.onstop = () => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        clearInterval(timerRef.current);
        setRecording(false);
        resolve(new Blob(chunksRef.current, { type: "audio/webm" }));
      };
      recorder.stop();
    });
  }

  /** Desiste da gravacao atual - descarta o audio, nao devolve nada. */
  function cancel() {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.onstop = null;
      recorder.stop();
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    clearInterval(timerRef.current);
    setRecording(false);
    setSeconds(0);
    chunksRef.current = [];
  }

  return { recording, seconds, start, stop, cancel };
}
