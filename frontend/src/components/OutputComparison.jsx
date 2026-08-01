function formatMs(ms) {
  if (ms == null || Number.isNaN(ms)) return "—"
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${(ms / 1000).toFixed(2)} s`
}

function MetricsRow({ metrics, accent = false }) {
  if (!metrics) return null
  const items = [
    { label: "time", value: formatMs(metrics.elapsed_ms) },
    {
      label: "tokens",
      value: `${metrics.completion_tokens ?? "—"} out · ${metrics.prompt_tokens ?? "—"} in`,
    },
    {
      label: "throughput",
      value:
        metrics.tokens_per_sec != null
          ? `${metrics.tokens_per_sec.toFixed?.(1) ?? metrics.tokens_per_sec} tok/s`
          : "—",
    },
  ]

  return (
    <dl
      className={`
        mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t pt-2
        font-mono text-[11px] tabular-nums
        ${accent ? "border-signal/30 text-ink" : "border-paper-line text-ink-mute"}
      `}
    >
      {items.map((item) => (
        <div key={item.label} className="flex gap-1.5">
          <dt className="uppercase tracking-wider opacity-70">{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}

export function OutputComparison({ outputs, detection }) {
  if (!outputs) return null

  const { original, steered, benchmark } = outputs
  const threatDetected = detection?.threat_detected
  const unsteeredMetrics = benchmark?.unsteered
  const steeredMetrics = benchmark?.steered

  return (
    <div className="space-y-4 animate-fade-up">
      {threatDetected && benchmark?.delta_ms != null && (
        <p className="font-mono text-[11px] tabular-nums text-ink-mute">
          Steering overhead{" "}
          <span className="text-ink">
            {benchmark.delta_ms >= 0 ? "+" : "−"}
            {formatMs(Math.abs(benchmark.delta_ms))}
          </span>
          {benchmark.overhead_pct != null && (
            <span>
              {" "}
              ({benchmark.overhead_pct >= 0 ? "+" : ""}
              {benchmark.overhead_pct}% vs unsteered)
            </span>
          )}
        </p>
      )}

      <div
        className={`
          grid gap-6
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
          <MetricsRow metrics={unsteeredMetrics} />
        </div>

        {threatDetected && steered && (
          <div>
            <p className="mb-2 font-sans text-[11px] font-medium uppercase tracking-[0.18em] text-signal">
              With steering
            </p>
            <p className="border-t border-signal/30 pt-3 font-sans text-[15px] leading-relaxed text-ink whitespace-pre-wrap">
              {steered}
            </p>
            <MetricsRow metrics={steeredMetrics} accent />
          </div>
        )}
      </div>
    </div>
  )
}
