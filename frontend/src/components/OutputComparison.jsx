import { ToolCallStrip } from "./ToolCallStrip"

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
          ? `${Number(metrics.tokens_per_sec).toFixed(1)} tok/s`
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

export function OutputComparison({ outputs, detection, interpretability = true }) {
  if (!outputs) return null

  const {
    original,
    steered,
    benchmark,
    original_tools: originalTools = [],
    steered_tools: steeredTools = [],
    agent = true,
  } = outputs
  const showSteer = interpretability && detection?.threat_detected && Boolean(steered)
  const unsteeredMetrics = benchmark?.unsteered
  const steeredMetrics = benchmark?.steered
  const jlens = interpretability ? benchmark?.jlens : null

  const undefendedLabel = agent
    ? showSteer
      ? "Without defense"
      : "Desk reply"
    : showSteer
      ? "Without steering"
      : "Model output"

  const defendedLabel = agent ? "With Catch & Steer" : "With steering"

  return (
    <div className="space-y-4 animate-fade-up">
      {interpretability && (
        <div className="space-y-1 font-mono text-[11px] tabular-nums text-ink-mute">
          {jlens?.elapsed_ms != null && (
            <p>
              J-Lens observe{" "}
              <span className="text-ink">{formatMs(jlens.elapsed_ms)}</span>
              {jlens.lens_ms != null && (
                <span>
                  {" "}
                  (lens {formatMs(jlens.lens_ms)}
                  {jlens.decode_ms != null
                    ? ` · decode ${formatMs(jlens.decode_ms)}`
                    : ""}
                  )
                </span>
              )}
              {benchmark.jlens_overhead_pct_vs_gen != null && (
                <span>
                  {" "}
                  · {benchmark.jlens_overhead_pct_vs_gen}% of generation time
                </span>
              )}
            </p>
          )}
          {showSteer && benchmark?.delta_ms != null && (
            <p>
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
          {benchmark?.pipeline_ms != null && (
            <p>
              Pipeline total{" "}
              <span className="text-ink">{formatMs(benchmark.pipeline_ms)}</span>
              {" "}
              {interpretability ? "(observe + generate)" : "(generate)"}
            </p>
          )}
        </div>
      )}

      {!interpretability && benchmark?.unsteered && (
        <div className="space-y-1 font-mono text-[11px] tabular-nums text-ink-mute">
          <p>
            Generation{" "}
            <span className="text-ink">{formatMs(benchmark.unsteered.elapsed_ms)}</span>
          </p>
        </div>
      )}

      <div
        className={`
          grid gap-6
          ${showSteer ? "md:grid-cols-2" : "grid-cols-1"}
        `}
      >
        <div>
          <p className="mb-2 font-sans text-[11px] font-medium uppercase tracking-[0.18em] text-ink-mute">
            {undefendedLabel}
          </p>
          <p className="border-t border-paper-line pt-3 font-sans text-[15px] leading-relaxed text-ink-soft whitespace-pre-wrap">
            {original}
          </p>
          {agent && (
            <ToolCallStrip tools={originalTools} />
          )}
          <MetricsRow metrics={unsteeredMetrics} />
        </div>

        {showSteer && (
          <div>
            <p className="mb-2 font-sans text-[11px] font-medium uppercase tracking-[0.18em] text-signal">
              {defendedLabel}
            </p>
            <p className="border-t border-signal/30 pt-3 font-sans text-[15px] leading-relaxed text-ink whitespace-pre-wrap">
              {steered}
            </p>
            {agent && (
              <ToolCallStrip
                tools={steeredTools}
                blocked={!steeredTools?.length}
              />
            )}
            <MetricsRow metrics={steeredMetrics} accent />
          </div>
        )}
      </div>
    </div>
  )
}
