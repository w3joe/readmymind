export function ToolCallStrip({ tools, blocked = false }) {
  if (blocked) {
    return (
      <p className="mt-3 font-sans text-[12px] text-signal">
        Blocked — no tool call
      </p>
    )
  }

  if (!tools?.length) return null

  return (
    <ul className="mt-3 flex flex-wrap gap-2">
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

        return (
          <li
            key={`${tool.name}-${i}`}
            className={`border px-2.5 py-1.5 font-mono text-[11px] leading-snug ${tone}`}
          >
            <span className="font-medium">{tool.name}</span>
            {args ? <span className="opacity-80">({args})</span> : null}
            <span className="ml-1.5 uppercase tracking-wider opacity-70">
              {risk === "blocked_policy" ? "forbidden" : risk}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
