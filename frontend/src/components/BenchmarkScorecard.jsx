function pct(x) {
  if (x == null || Number.isNaN(x)) return "—"
  return `${(x * 100).toFixed(1)}%`
}

function ms(x) {
  if (x == null || Number.isNaN(x)) return "—"
  if (x < 1000) return `${Math.round(x)} ms`
  return `${(x / 1000).toFixed(2)} s`
}

export function BenchmarkScorecard({ scorecard }) {
  if (!scorecard) return null
  const catchM = scorecard.catch || {}
  const steer = scorecard.steer || {}
  const cost = scorecard.cost || {}

  const cards = [
    { label: "Catch F1", value: catchM.f1 != null ? catchM.f1.toFixed(3) : "—" },
    { label: "Precision", value: catchM.precision != null ? catchM.precision.toFixed(3) : "—" },
    { label: "Recall", value: catchM.recall != null ? catchM.recall.toFixed(3) : "—" },
    { label: "FP rate", value: pct(catchM.false_positive_rate) },
    { label: "Unsteered ASR", value: pct(steer.unsteered_asr) },
    { label: "Steered ASR", value: pct(steer.steered_asr) },
    { label: "ASR drop", value: pct(steer.asr_drop) },
    { label: "Steer refusal", value: pct(steer.steered_refusal_rate) },
    { label: "Mean observe", value: ms(cost.mean_observe_ms) },
    { label: "Mean unsteered", value: ms(cost.mean_unsteered_ms) },
    { label: "Mean steered", value: ms(cost.mean_steered_ms) },
    { label: "Observe / gen", value: cost.observe_vs_unsteered_pct != null ? `${cost.observe_vs_unsteered_pct}%` : "—" },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
      {cards.map((c) => (
        <div key={c.label} className="border border-paper-line bg-paper-raised/70 px-3 py-3">
          <p className="font-sans text-[10px] font-medium uppercase tracking-[0.16em] text-ink-mute">
            {c.label}
          </p>
          <p className="mt-1 font-mono text-lg tabular-nums text-ink">{c.value}</p>
        </div>
      ))}
    </div>
  )
}

export function BenchmarkCaseTable({ results }) {
  if (!results?.length) return null

  return (
    <div className="overflow-x-auto border border-paper-line">
      <table className="w-full min-w-[640px] border-collapse text-left font-mono text-[11px]">
        <thead className="bg-paper-raised text-ink-mute">
          <tr>
            <th className="px-2 py-2 font-sans text-[10px] font-medium uppercase tracking-wider">ID</th>
            <th className="px-2 py-2 font-sans text-[10px] font-medium uppercase tracking-wider">Cat</th>
            <th className="px-2 py-2 font-sans text-[10px] font-medium uppercase tracking-wider">Exp</th>
            <th className="px-2 py-2 font-sans text-[10px] font-medium uppercase tracking-wider">Det</th>
            <th className="px-2 py-2 font-sans text-[10px] font-medium uppercase tracking-wider">Refuse</th>
            <th className="px-2 py-2 font-sans text-[10px] font-medium uppercase tracking-wider">Observe</th>
            <th className="px-2 py-2 font-sans text-[10px] font-medium uppercase tracking-wider">Preview</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r) => {
            const refused = r.steered?.refusal?.refused
            const preview = r.steered?.text_preview || r.unsteered?.text_preview || r.error || ""
            return (
              <tr key={r.id || preview.slice(0, 12)} className="border-t border-paper-line align-top">
                <td className="px-2 py-2 text-ink">{r.id}</td>
                <td className="px-2 py-2 text-ink-mute">{r.category}</td>
                <td className="px-2 py-2">{r.expected_threat ? "threat" : "safe"}</td>
                <td className={`px-2 py-2 ${r.threat_detected ? "text-threat" : "text-signal"}`}>
                  {r.error ? "err" : r.threat_detected ? "yes" : "no"}
                </td>
                <td className="px-2 py-2">
                  {r.steered == null ? "—" : refused ? "yes" : "no"}
                </td>
                <td className="px-2 py-2 tabular-nums">{ms(r.cost?.observe_ms)}</td>
                <td className="max-w-[240px] truncate px-2 py-2 text-ink-soft" title={preview}>
                  {preview}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
