export function InterpretabilityToggle({ enabled, onChange, disabled }) {
  return (
    <div className="flex items-center justify-between gap-4 border border-paper-line bg-paper-raised/70 px-4 py-4">
      <div className="min-w-0">
        <p className="font-sans text-[11px] font-medium uppercase tracking-[0.18em] text-ink-mute">
          Model interpretability
        </p>
        <p className="mt-1 font-sans text-sm text-ink-soft">
          {enabled
            ? "Catch & Steer watches residual layers, then blocks forbidden Desk tool calls."
            : "Undefended Desk — plain generation; forbidden tools may fire."}
        </p>
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label="Model interpretability"
        disabled={disabled}
        onClick={() => onChange(!enabled)}
        className={`
          relative h-7 w-12 shrink-0 rounded-full transition-colors
          focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/25
          disabled:cursor-not-allowed disabled:opacity-40
          ${enabled ? "bg-signal" : "bg-ink/20"}
        `}
      >
        <span
          className={`
            absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-paper-raised
            shadow-sm transition-transform
            ${enabled ? "translate-x-5" : "translate-x-0"}
          `}
        />
      </button>
    </div>
  )
}
