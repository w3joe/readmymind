function scoreTone(score) {
  if (score > 0.7) return {
    chip: "bg-threat-soft text-threat",
    bar: "bg-threat-mid",
  }
  if (score > 0.4) return {
    chip: "bg-warn-soft text-warn",
    bar: "bg-warn",
  }
  return {
    chip: "bg-paper text-ink-soft",
    bar: "bg-signal-mid",
  }
}

export function JSpaceScanner({ layers, status, threatLayer }) {
  const isScanning = status === "scanning"
  const hasThreat = layers.some((l) => l.threat_score > 0.55)

  return (
    <div className="border border-paper-line bg-paper-raised/80 px-4 py-5 backdrop-blur-sm sm:px-5">
      <div className="mb-5 flex items-center gap-3">
        <span
          className={`
            h-2 w-2 shrink-0
            ${isScanning
              ? "bg-ink animate-scan-pulse"
              : hasThreat
                ? "bg-threat"
                : "bg-signal"
            }
          `}
        />
        <span className="font-sans text-sm text-ink-soft">
          {isScanning
            ? "Reading residual stream…"
            : hasThreat
              ? "Threat concepts present"
              : "Clean readout"}
        </span>
      </div>

      <div className="space-y-3">
        {layers.map((layer, i) => {
          const tone = scoreTone(layer.threat_score)
          const isPeak = threatLayer != null && layer.layer === threatLayer
          return (
            <div
              key={`${layer.layer}-${i}`}
              className={`
                layer-row grid grid-cols-[4.5rem_1fr_5rem] items-start gap-3 sm:grid-cols-[5rem_1fr_6rem]
                ${isPeak ? "-mx-2 border-l-2 border-threat bg-threat-soft/40 px-2 py-1.5 sm:-mx-3 sm:px-3" : ""}
              `}
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <span className={`pt-0.5 font-mono text-xs ${isPeak ? "font-medium text-threat" : "text-ink-mute"}`}>
                L{layer.layer}
                {isPeak ? " ◀" : ""}
              </span>

              <div className="flex flex-wrap gap-1.5">
                {layer.concepts.slice(0, 6).map((concept, j) => (
                  <span
                    key={j}
                    className={`px-1.5 py-0.5 font-mono text-[11px] sm:text-xs ${tone.chip}`}
                  >
                    {concept}
                  </span>
                ))}
              </div>

              <div className="flex items-center gap-2 pt-1.5">
                <div className="h-1 flex-1 overflow-hidden bg-paper-line">
                  <div
                    className={`score-fill h-full ${tone.bar}`}
                    style={{
                      width: `${Math.max(layer.threat_score * 100, 3)}%`,
                      animationDelay: `${i * 40 + 80}ms`,
                    }}
                  />
                </div>
                <span className="w-7 text-right font-mono text-[10px] tabular-nums text-ink-mute">
                  {layer.threat_score.toFixed(1)}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {isScanning && layers.length === 0 && (
        <p className="font-sans text-sm text-ink-mute animate-scan-pulse">
          Initialising scan…
        </p>
      )}
    </div>
  )
}
