import { VolumeIcon } from "./icons.jsx";

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
