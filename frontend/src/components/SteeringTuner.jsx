export function SteeringTuner({ alpha, onChange, disabled }) {
  return (
    <div className="border border-paper-line bg-paper-raised/70 px-4 py-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <div>
          <p className="font-sans text-[11px] font-medium uppercase tracking-[0.18em] text-ink-mute">
            Steering strength
          </p>
          <p className="mt-1 font-sans text-sm text-ink-soft">
            Alpha scales how hard we push mid/late residuals toward refusal.
          </p>
        </div>
        <p className="shrink-0 font-mono text-lg tabular-nums text-ink">
          {alpha.toFixed(0)}
        </p>
      </div>

      <input
        type="range"
        min={0}
        max={80}
        step={1}
        value={alpha}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="
          w-full cursor-pointer accent-ink
          disabled:cursor-not-allowed disabled:opacity-40
        "
      />

      <div className="mt-2 flex justify-between font-sans text-[11px] text-ink-mute">
        <span>0 · off</span>
        <span>25 · mild</span>
        <span>50 · strong</span>
        <span>80 · max</span>
      </div>
    </div>
  )
}
