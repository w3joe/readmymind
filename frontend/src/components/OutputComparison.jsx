export function OutputComparison({ outputs, detection }) {
  if (!outputs) return null

  const { original, steered } = outputs
  const threatDetected = detection?.threat_detected

  return (
    <div
      className={`
        grid gap-6 animate-fade-up
        ${threatDetected ? "md:grid-cols-2" : "grid-cols-1"}
      `}
    >
      <div>
        <p className="mb-2 font-sans text-[11px] font-medium uppercase tracking-[0.18em] text-ink-mute">
          {threatDetected ? "Without steering" : "Model output"}
        </p>
        <p className="border-t border-paper-line pt-3 font-sans text-[15px] leading-relaxed text-ink-soft whitespace-pre-wrap">
          {original}
        </p>
      </div>

      {threatDetected && steered && (
        <div>
          <p className="mb-2 font-sans text-[11px] font-medium uppercase tracking-[0.18em] text-signal">
            With steering
          </p>
          <p className="border-t border-signal/30 pt-3 font-sans text-[15px] leading-relaxed text-ink whitespace-pre-wrap">
            {steered}
          </p>
        </div>
      )}
    </div>
  )
}
