import { VolumeIcon } from "./icons.jsx";

/** Slider de volume 0-300% por padrao (o Discord/navegador so vai ate 100% - aqui passa disso
    via Web Audio, ver webAudioMix em VoiceCallContext.jsx). Reaproveitado pra voz individual
    (popover na sidebar), pro audio da transmissão de tela (VoiceChannel.jsx), e pro volume do
    proprio microfone/volume mestre em Configuracoes (SettingsModal.jsx - "max" menor la' pro
    microfone, 200 em vez de 300). */
export default function VolumeSlider({ value, onChange, label, max = 300 }) {
  return (
    <div className="volume-slider-row" title={label}>
      <VolumeIcon size={13} className="voice-status-icon" />
      <input
        type="range"
        min={0}
        max={max}
        step={5}
        value={value}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onChange(Number(e.target.value))}
        className={"volume-slider" + (value > 100 ? " boosted" : "")}
      />
      <span className="volume-slider-value">{value}%</span>
    </div>
  );
}
