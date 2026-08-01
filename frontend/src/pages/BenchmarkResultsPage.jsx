import { useEffect, useMemo, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { BenchmarkScorecard, BenchmarkCaseTable } from "../components/BenchmarkScorecard"
import {
  downloadBenchmarkRun,
  listBenchmarkRuns,
  loadBenchmarkRun,
} from "../lib/benchmarkStore"

function formatSavedAt(iso) {
  if (!iso) return "—"
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

export default function BenchmarkResultsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [runs, setRuns] = useState([])

  useEffect(() => {
    setRuns(listBenchmarkRuns())
  }, [])

  const selectedId = searchParams.get("run") || runs[0]?.id || null

  const active = useMemo(() => {
    if (!selectedId) return null
    return loadBenchmarkRun(selectedId)
  }, [selectedId, runs])

  function selectRun(id) {
    setSearchParams(id ? { run: id } : {})
  }

  return (
    <div className="atmosphere relative min-h-screen">
      <div className="relative z-10 mx-auto max-w-4xl px-5 pb-16 pt-10 sm:px-8 sm:pt-14">
        <header className="mb-10 sm:mb-12">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <p className="font-sans text-[11px] font-medium uppercase tracking-[0.22em] text-ink-mute">
              Results only
            </p>
            <div className="flex gap-4">
              <Link
                to="/benchmark"
                className="font-sans text-[12px] text-ink-mute underline-offset-4 hover:text-ink hover:underline"
              >
                ← Run suite
              </Link>
              <Link
                to="/"
                className="font-sans text-[12px] text-ink-mute underline-offset-4 hover:text-ink hover:underline"
              >
                Catch &amp; Steer
              </Link>
            </div>
          </div>
          <h1 className="brand mt-2 font-display text-[3.25rem] leading-[0.95] tracking-tight text-ink sm:text-6xl">
            Results
          </h1>
          <div className="brand-rule mt-4 h-[2px] w-28 bg-signal" />
          <p className="mt-4 max-w-lg font-sans text-base leading-relaxed text-ink-soft">
            Scorecards and case tables from runs saved in this browser.
          </p>
        </header>

        {runs.length === 0 ? (
          <div className="border border-paper-line bg-paper-raised/70 px-4 py-8 text-center">
            <p className="font-sans text-sm text-ink-soft">No saved benchmark runs yet.</p>
            <Link
              to="/benchmark"
              className="mt-4 inline-block font-sans text-sm text-ink underline underline-offset-4"
            >
              Run a suite →
            </Link>
          </div>
        ) : (
          <>
            <section className="mb-8 flex flex-wrap items-end gap-4 border border-paper-line bg-paper-raised/70 px-4 py-4 sm:px-5">
              <label className="block min-w-[16rem] flex-1">
                <span className="font-sans text-[11px] font-medium uppercase tracking-[0.16em] text-ink-mute">
                  Saved run
                </span>
                <select
                  value={selectedId || ""}
                  onChange={(e) => selectRun(e.target.value)}
                  className="mt-1 block w-full border border-paper-line bg-paper px-2 py-2 font-mono text-xs text-ink"
                >
                  {runs.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.id} · n={r.n ?? r.results?.length ?? "—"} · α={r.alpha ?? "—"} ·{" "}
                      {formatSavedAt(r.savedAt)}
                    </option>
                  ))}
                </select>
              </label>
              {active && (
                <button
                  type="button"
                  onClick={() => downloadBenchmarkRun(active)}
                  className="border border-paper-line px-4 py-2 font-sans text-sm text-ink"
                >
                  Download JSON
                </button>
              )}
            </section>

            {active?.scorecard && (
              <section className="mb-10">
                <h2 className="mb-3 font-sans text-[11px] font-medium uppercase tracking-[0.18em] text-ink-mute">
                  Scorecard · n={active.scorecard.n}
                  {active.scorecard.catch?.f1 != null && (
                    <span className="ml-2 normal-case tracking-normal">
                      · F1 {active.scorecard.catch.f1}
                    </span>
                  )}
                </h2>
                <BenchmarkScorecard scorecard={active.scorecard} />
              </section>
            )}

            {active?.results?.length > 0 && (
              <section>
                <h2 className="mb-3 font-sans text-[11px] font-medium uppercase tracking-[0.18em] text-ink-mute">
                  Cases
                </h2>
                <BenchmarkCaseTable results={active.results} />
              </section>
            )}
          </>
        )}
      </div>
    </div>
  )
}
