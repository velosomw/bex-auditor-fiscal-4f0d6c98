/**
 * KanitzThermometer — Réplica visual do Termômetro de Insolvência de Kanitz (1980).
 * Escala vertical de +7 (solvente) a −7 (insolvente), com 3 faixas:
 *   • +7 ... 1  → SOLVENTE  (verde)
 *   •  0 ... −3 → PENUMBRA  (cinza/amarelo)
 *   • −4 ... −7 → INSOLVENTE (vermelho)
 *
 * Fonte: Kanitz, Stephen. "Como prever Falências", pág. 54, 1980. Editora Atlas.
 */
interface KanitzThermometerProps {
  fi: number;
  label?: string;
  height?: number;
}

export function KanitzThermometer({ fi, label, height = 320 }: KanitzThermometerProps) {
  // Clamp FI to [-7, 7] for plotting; show real value in label
  const clamped = Math.max(-7, Math.min(7, fi));
  // Geometric mapping: y goes from 0 (top = +7) to 1 (bottom = -7)
  const yFor = (v: number) => ((7 - v) / 14) * 100;
  const needleY = yFor(clamped);

  // Band ranges in % of column height
  const bands = [
    { top: yFor(7), bottom: yFor(0), color: "hsl(140, 65%, 45%)", label: "SOLVENTE" },   // 7..0 green
    { top: yFor(0), bottom: yFor(-3), color: "hsl(0, 0%, 78%)", label: "PENUMBRA" },     // 0..-3 gray
    { top: yFor(-3), bottom: yFor(-7), color: "hsl(0, 75%, 52%)", label: "INSOLVENTE" }, // -3..-7 red
  ];

  const ticks = [7, 6, 5, 4, 3, 2, 1, 0, -1, -2, -3, -4, -5, -6, -7];

  return (
    <div className="flex flex-col items-center gap-2 select-none" style={{ width: 220 }}>
      <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
        Termômetro de Insolvência de Kanitz
      </p>
      <div className="flex items-stretch gap-3" style={{ height }}>
        {/* Column */}
        <div className="relative" style={{ width: 56 }}>
          <div className="absolute inset-0 rounded-md overflow-hidden border-2 border-foreground/80 shadow-md">
            {bands.map((b, i) => (
              <div
                key={i}
                className="absolute left-0 right-0"
                style={{ top: `${b.top}%`, height: `${b.bottom - b.top}%`, background: b.color }}
              />
            ))}
            {/* Tick numbers inside column */}
            {ticks.map((t) => (
              <div
                key={t}
                className="absolute left-0 right-0 text-center text-[10px] font-bold text-black/85"
                style={{ top: `calc(${yFor(t)}% - 7px)`, lineHeight: "14px" }}
              >
                {t > 0 ? t : t === 0 ? "0" : t}
              </div>
            ))}
          </div>
          {/* Needle indicator */}
          <div
            className="absolute -left-3 flex items-center"
            style={{ top: `calc(${needleY}% - 10px)` }}
            title={`FI atual: ${fi.toFixed(2)}`}
          >
            <div
              className="w-0 h-0"
              style={{
                borderTop: "10px solid transparent",
                borderBottom: "10px solid transparent",
                borderLeft: "14px solid hsl(220, 90%, 25%)",
                filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.4))",
              }}
            />
          </div>
        </div>
        {/* Labels right */}
        <div className="relative flex-1" style={{ minWidth: 90 }}>
          {bands.map((b, i) => (
            <div
              key={i}
              className="absolute left-0 flex items-center"
              style={{
                top: `${b.top}%`,
                height: `${b.bottom - b.top}%`,
              }}
            >
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-sm" style={{ background: b.color }} />
                <span
                  className="text-[10.5px] font-bold tracking-wide"
                  style={{ color: b.color === "hsl(0, 0%, 78%)" ? "hsl(0,0%,40%)" : b.color }}
                >
                  {b.label}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="text-center mt-1">
        <p className="text-[10px] text-muted-foreground">FI atual</p>
        <p
          className="text-xl font-mono font-bold"
          style={{
            color:
              fi > 0
                ? "hsl(140, 65%, 38%)"
                : fi >= -3
                ? "hsl(40, 90%, 40%)"
                : "hsl(0, 75%, 50%)",
          }}
        >
          {fi.toFixed(2)}
        </p>
        {label && <p className="text-[10px] text-muted-foreground">{label}</p>}
      </div>
      <p className="text-[9px] italic text-muted-foreground text-center px-2">
        Fonte: Kanitz, S. <em>Como prever Falências</em>, p. 54, 1980. Ed. Atlas.
      </p>
    </div>
  );
}
