export function ThreatAlert({ detection }) {
  if (!detection) return null

  const { threat_detected, threat_layer } = detection

  if (!threat_detected) {
    return (
      <div className="flex items-baseline gap-3 border-l-2 border-signal pl-4 py-1 animate-fade-up">
        <p className="font-sans text-sm text-ink-soft">
          <span className="font-medium text-signal">No threat detected.</span>
          {" "}Generating normally.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1 border-l-2 border-threat pl-4 py-1 animate-fade-up sm:flex-row sm:items-baseline sm:gap-3">
      <p className="font-sans text-sm font-medium text-threat">
        Threat at layer {threat_layer}
      </p>
      <p className="font-sans text-sm text-ink-mute">
        Applying steering vector at that depth
      </p>
    </div>
  )
}
