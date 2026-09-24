function polygonPoints(sides, radius) {
  const points = [];
  const step = (Math.PI * 2) / sides;
  const start = -Math.PI / 2;
  for (let i = 0; i < sides; i++) {
    const angle = start + step * i;
    points.push(`${(radius * Math.cos(angle)).toFixed(1)},${(radius * Math.sin(angle)).toFixed(1)}`);
  }
  return points.join(" ");
}

const DIE_SHAPE_SIDES = { 4: 3, 6: 4, 8: 8, 10: 10, 12: 12, 20: 6, 100: 10 };

function DieIcon({ sides, value, size = 40 }) {
  const shapeSides = DIE_SHAPE_SIDES[sides] || 6;
  const r = size / 2 - 2;
  return (
    <svg width={size} height={size} viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`} className="die-icon">
      <polygon points={polygonPoints(shapeSides, r)} className="die-icon-shape" />
      <text x="0" y="1" textAnchor="middle" dominantBaseline="middle" className="die-icon-value">
        {sides === 100 ? `${value}%` : value}
      </text>
    </svg>
  );
}

export default function DiceRollCard({ notation, sides, resultsCsv, total }) {
  const results = (resultsCsv || "")
    .split(",")
    .map((n) => Number(n))
    .filter((n) => !Number.isNaN(n));
  return (
    <div className="dice-roll-card">
      <div className="dice-roll-dice">
        {results.map((value, i) => (
          <DieIcon key={i} sides={sides} value={value} />
        ))}
      </div>
      <div className="dice-roll-summary">
        <span className="dice-roll-notation">🎲 {notation}</span>
        <span className="dice-roll-total">{total}</span>
      </div>
    </div>
  );
}
