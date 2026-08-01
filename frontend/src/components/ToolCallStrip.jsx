export function ToolCallStrip({ tools, blocked = false, label = "Action" }) {
  if (blocked) {
    return (
      <div className="mt-3">
        <p className="mb-1.5 font-sans text-[11px] font-medium uppercase tracking-[0.16em] text-signal">
          {label}
        </p>
        <p className="font-sans text-[12px] text-signal">
          Blocked — no tool call
        </p>
      </div>
    )
  }

  if (!tools?.length) return null

  return (
    <div className="mt-3">
      <p className="mb-1.5 font-sans text-[11px] font-medium uppercase tracking-[0.16em] text-ink-mute">
        {label}
      </p>
      <ul className="flex flex-col gap-2">
        {tools.map((tool, i) => {
          const risk = tool.risk || "elevated"
          const tone =
            risk === "safe"
              ? "border-signal/40 bg-signal-soft/50 text-signal"
              : risk === "blocked_policy"
                ? "border-threat/50 bg-threat-soft text-threat"
                : "border-warn/50 bg-warn-soft text-warn"

          const args =
            tool.args && Object.keys(tool.args).length
              ? Object.entries(tool.args)
                  .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
                  .join(", ")
              : ""

          const result = tool.result
          let resultLabel = null
          let resultBody = null
          if (result) {
            if (result.ok === false) {
              resultLabel = result.error || "error"
              resultBody = result.message || JSON.stringify(result)
            } else if (result.order) {
              resultLabel = "supabase"
              resultBody = JSON.stringify(result.order)
            } else if (result.refund) {
              resultLabel = "supabase"
              resultBody = JSON.stringify(result.refund)
            } else if (result.status === "link_queued") {
              resultLabel = "supabase"
              resultBody = `reset queued for ${result.email}`
            } else if (result.found === false) {
              resultLabel = "supabase"
              resultBody = `order ${result.order_id} not found`
            } else {
              resultLabel = "result"
              resultBody = JSON.stringify(result)
            }
          }

          return (
            <li key={`${tool.name}-${i}`} className="min-w-0">
              <div
                className={`inline-block border px-2.5 py-1.5 font-mono text-[11px] leading-snug ${tone}`}
              >
                <span className="font-medium">{tool.name}</span>
                {args ? <span className="opacity-80">({args})</span> : null}
                <span className="ml-1.5 uppercase tracking-wider opacity-70">
                  {risk === "blocked_policy" ? "forbidden" : risk}
                </span>
              </div>
              {resultBody ? (
                <pre className="mt-1.5 max-h-28 overflow-auto border border-rule bg-paper-2/80 px-2.5 py-2 font-mono text-[10px] leading-relaxed text-ink-mute whitespace-pre-wrap break-all">
                  <span className="uppercase tracking-wider text-ink-faint">
                    {resultLabel}
                  </span>
                  {"\n"}
                  {resultBody}
                </pre>
              ) : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
