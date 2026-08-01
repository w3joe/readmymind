import { useEffect, useMemo, useRef, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { BenchmarkScorecard, BenchmarkCaseTable } from "../components/BenchmarkScorecard"
import {
  downloadBenchmarkRun,
  importBenchmarkFile,
  importDiskLatest,
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
  const [statusMsg, setStatusMsg] = useState(null)
  const fileRef = useRef(null)

  async function refresh(preferId) {
    const disk = await importDiskLatest()
    const list = listBenchmarkRuns()
    setRuns(list)
    if (preferId) {
      setSearchParams({ run: preferId })
    } else if (disk && !searchParams.get("run")) {
      setSearchParams({ run: disk.id })
    }
    return list
  }

  useEffect(() => {
    refresh().then((list) => {
      if (list.length === 0) {
        setStatusMsg("No runs in this browser yet. CLI results load from disk when available.")
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selectedId = searchParams.get("run") || runs[0]?.id || null

  const active = useMemo(() => {
    if (!selectedId) return null
    return loadBenchmarkRun(selectedId)
  }, [selectedId, runs])

  function selectRun(id) {
    setSearchParams(id ? { run: id } : {})
  }

  async function onImportFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const entry = await importBenchmarkFile(file)
      setRuns(listBenchmarkRuns())
      setSearchParams({ run: entry.id })
      setStatusMsg(`Imported ${entry.id}`)
    } catch (err) {
      setStatusMsg(err.message || "Import failed")
    } finally {
      e.target.value = ""
    }
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
            Scorecards from browser-saved runs and CLI disk output
            (<span className="font-mono text-[13px]"> /benchmark_results/latest.json</span>).
          </p>
        </header>

        <section className="mb-8 flex flex-wrap items-end gap-3 border border-paper-line bg-paper-raised/70 px-4 py-4 sm:px-5">
          {runs.length > 0 && (
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
                    {r.source ? ` · ${r.source}` : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            type="button"
            onClick={() => refresh().then(() => setStatusMsg("Refreshed from disk / localStorage"))}
            className="border border-paper-line px-4 py-2 font-sans text-sm text-ink"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="border border-paper-line px-4 py-2 font-sans text-sm text-ink"
          >
            Import JSON
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={onImportFile}
          />
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

        {statusMsg && (
          <p className="mb-4 font-sans text-[12px] text-ink-mute">{statusMsg}</p>
        )}

        {runs.length === 0 ? (
          <div className="border border-paper-line bg-paper-raised/70 px-4 py-8 text-center">
            <p className="font-sans text-sm text-ink-soft">No benchmark runs available.</p>
            <p className="mt-2 font-sans text-[12px] text-ink-mute">
              Run from the suite page, or import a JSON from{" "}
              <span className="font-mono">backend/assets/benchmark_results/</span>.
            </p>
            <Link
              to="/benchmark"
              className="mt-4 inline-block font-sans text-sm text-ink underline underline-offset-4"
            >
              Run a suite →
            </Link>
          </div>
        ) : (
          <>
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
