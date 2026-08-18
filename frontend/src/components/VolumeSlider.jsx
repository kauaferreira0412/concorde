import { VolumeIcon } from "./icons.jsx";

/** Slider de volume 0-200% (o Discord/navegador so vai ate 100% - aqui passa disso via
    Web Audio, ver webAudioMix em VoiceCallContext.jsx). Reaproveitado pra voz individual
    (popover na sidebar) e pro audio da transmissão de tela (VoiceChannel.jsx). */
export default function VolumeSlider({ value, onChange, label }) {
  return (
    <div className="volume-slider-row" title={label}>
      <VolumeIcon size={13} className="voice-status-icon" />
      <input
        type="range"
        min={0}
        max={200}
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
