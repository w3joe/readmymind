import { Link } from "react-router-dom"
import { useBenchmarkStream } from "../hooks/useBenchmarkStream"
import { BenchmarkScorecard, BenchmarkCaseTable } from "../components/BenchmarkScorecard"

const CATEGORY_OPTIONS = [
  { id: "jailbreak", label: "Jailbreak" },
  { id: "prompt_injection", label: "Prompt injection" },
  { id: "safe", label: "Safe" },
]

function formatSavedAt(iso) {
  if (!iso) return "—"
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

export default function BenchmarkPage() {
  const {
    status,
    progress,
    results,
    scorecard,
    error,
    alpha,
    setAlpha,
    limit,
    setLimit,
    categories,
    setCategories,
    run,
    savedRuns,
    activeRunId,
    loadSaved,
    removeSaved,
    downloadActive,
  } = useBenchmarkStream()

  const running = status === "running"

  function toggleCategory(id) {
    setCategories((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    )
  }

  return (
    <div className="atmosphere relative min-h-screen">
      <div className="relative z-10 mx-auto max-w-4xl px-5 pb-16 pt-10 sm:px-8 sm:pt-14">
        <header className="mb-10 sm:mb-12">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="font-sans text-[11px] font-medium uppercase tracking-[0.22em] text-ink-mute">
              Catch · Steer · Cost
            </p>
            <Link
              to="/"
              className="font-sans text-[12px] text-ink-mute underline-offset-4 hover:text-ink hover:underline"
            >
              ← Catch &amp; Steer
            </Link>
          </div>
          <h1 className="brand mt-2 font-display text-[3.25rem] leading-[0.95] tracking-tight text-ink sm:text-6xl">
            Benchmark
          </h1>
          <div className="brand-rule mt-4 h-[2px] w-28 bg-signal" />
          <p className="mt-4 max-w-lg font-sans text-base leading-relaxed text-ink-soft">
            Run the curated suite against the live Modal stack. Completed runs are
            saved in this browser and can be downloaded as JSON.
          </p>
        </header>

        <section className="mb-8 space-y-5 border border-paper-line bg-paper-raised/70 px-4 py-5 sm:px-5">
          <div className="flex flex-wrap items-end gap-6">
            <label className="block">
              <span className="font-sans text-[11px] font-medium uppercase tracking-[0.16em] text-ink-mute">
                Alpha
              </span>
              <input
                type="number"
                min={0}
                max={80}
                value={alpha}
                disabled={running}
                onChange={(e) => setAlpha(Number(e.target.value))}
                className="mt-1 block w-24 border border-paper-line bg-paper px-2 py-1.5 font-mono text-sm text-ink"
              />
            </label>
            <label className="block">
              <span className="font-sans text-[11px] font-medium uppercase tracking-[0.16em] text-ink-mute">
                Limit (0 = all)
              </span>
              <input
                type="number"
                min={0}
                max={50}
                value={limit}
                disabled={running}
                onChange={(e) => setLimit(Number(e.target.value))}
                className="mt-1 block w-24 border border-paper-line bg-paper px-2 py-1.5 font-mono text-sm text-ink"
              />
            </label>
            <button
              type="button"
              disabled={running}
              onClick={run}
              className="border border-ink bg-ink px-4 py-2 font-sans text-sm font-medium text-paper disabled:cursor-not-allowed disabled:opacity-40"
            >
              {running ? "Running…" : "Run suite"}
            </button>
            {scorecard && (
              <button
                type="button"
                disabled={running}
                onClick={downloadActive}
                className="border border-paper-line px-4 py-2 font-sans text-sm text-ink disabled:opacity-40"
              >
                Download JSON
              </button>
            )}
          </div>

          <div>
            <p className="mb-2 font-sans text-[11px] font-medium uppercase tracking-[0.16em] text-ink-mute">
              Categories
            </p>
            <div className="flex flex-wrap gap-2">
              {CATEGORY_OPTIONS.map((opt) => {
                const selected = categories.includes(opt.id)
                return (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={running}
                    onClick={() => toggleCategory(opt.id)}
                    className={`
                      border px-2.5 py-1 font-sans text-xs
                      ${selected
                        ? "border-ink bg-ink text-paper"
                        : categories.length === 0
                          ? "border-paper-line text-ink-soft"
                          : "border-paper-line text-ink-mute opacity-60"
                      }
                    `}
                  >
                    {opt.label}
                  </button>
                )
              })}
              <span className="self-center font-sans text-[11px] text-ink-mute">
                {categories.length === 0 ? "All categories" : `${categories.length} selected`}
              </span>
            </div>
          </div>

          {(running || progress.n > 0) && (
            <p className="font-mono text-[12px] tabular-nums text-ink-mute">
              Progress {progress.index} / {progress.n || "…"}
              {activeRunId && !running && (
                <span className="ml-2 opacity-70">· saved {activeRunId}</span>
              )}
            </p>
          )}
        </section>

        {savedRuns.length > 0 && (
          <section className="mb-10">
            <h2 className="mb-3 font-sans text-[11px] font-medium uppercase tracking-[0.18em] text-ink-mute">
              Saved locally
            </h2>
            <ul className="divide-y divide-paper-line border border-paper-line">
              {savedRuns.map((runItem) => (
                <li
                  key={runItem.id}
                  className={`
                    flex flex-wrap items-center justify-between gap-3 px-3 py-2.5
                    ${activeRunId === runItem.id ? "bg-paper-raised" : ""}
                  `}
                >
                  <div className="min-w-0">
                    <p className="font-mono text-[12px] text-ink truncate">{runItem.id}</p>
                    <p className="font-sans text-[11px] text-ink-mute">
                      {formatSavedAt(runItem.savedAt)}
                      {" · "}
                      n={runItem.n ?? runItem.results?.length ?? "—"}
                      {" · "}
                      α={runItem.alpha ?? "—"}
                      {runItem.scorecard?.catch?.f1 != null && (
                        <> · F1={runItem.scorecard.catch.f1}</>
                      )}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={running}
                      onClick={() => loadSaved(runItem.id)}
                      className="border border-paper-line px-2.5 py-1 font-sans text-xs text-ink"
                    >
                      Load
                    </button>
                    <button
                      type="button"
                      disabled={running}
                      onClick={() => removeSaved(runItem.id)}
                      className="border border-paper-line px-2.5 py-1 font-sans text-xs text-threat"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-2 font-sans text-[11px] text-ink-mute">
              Stored in browser localStorage (up to 30 runs). CLI writes files under{" "}
              <span className="font-mono">backend/assets/benchmark_results/</span>.
            </p>
          </section>
        )}

        {error && (
          <p className="mb-6 rounded-md border border-threat/30 bg-threat-soft px-3 py-2 font-sans text-sm text-threat">
            {error}
          </p>
        )}

        {scorecard && (
          <section className="mb-10">
            <h2 className="mb-3 font-sans text-[11px] font-medium uppercase tracking-[0.18em] text-ink-mute">
              Scorecard · n={scorecard.n}
            </h2>
            <BenchmarkScorecard scorecard={scorecard} />
          </section>
        )}

        {results.length > 0 && (
          <section>
            <h2 className="mb-3 font-sans text-[11px] font-medium uppercase tracking-[0.18em] text-ink-mute">
              Cases
            </h2>
            <BenchmarkCaseTable results={results} />
          </section>
        )}
      </div>
    </div>
  )
}
