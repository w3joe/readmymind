import { useState, useCallback, useEffect } from "react"
import {
  deleteBenchmarkRun,
  downloadBenchmarkRun,
  listBenchmarkRuns,
  loadBenchmarkRun,
  saveBenchmarkRun,
} from "../lib/benchmarkStore"

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || ""

export function useBenchmarkStream() {
  const [status, setStatus] = useState("idle") // idle | running | complete | error
  const [progress, setProgress] = useState({ index: 0, n: 0 })
  const [results, setResults] = useState([])
  const [scorecard, setScorecard] = useState(null)
  const [error, setError] = useState(null)
  const [alpha, setAlpha] = useState(55)
  const [limit, setLimit] = useState(5)
  const [categories, setCategories] = useState([])
  const [savedRuns, setSavedRuns] = useState([])
  const [activeRunId, setActiveRunId] = useState(null)

  const refreshSaved = useCallback(() => {
    setSavedRuns(listBenchmarkRuns())
  }, [])

  useEffect(() => {
    refreshSaved()
  }, [refreshSaved])

  const reset = useCallback(() => {
    setStatus("idle")
    setProgress({ index: 0, n: 0 })
    setResults([])
    setScorecard(null)
    setError(null)
    setActiveRunId(null)
  }, [])

  const persistRun = useCallback(
    (payload) => {
      const entry = saveBenchmarkRun(payload)
      refreshSaved()
      if (entry) setActiveRunId(entry.id)
      return entry
    },
    [refreshSaved]
  )

  const run = useCallback(async () => {
    reset()
    setStatus("running")

    const body = {
      alpha,
      limit: limit > 0 ? limit : null,
    }
    if (categories.length > 0) body.categories = categories

    const collected = []

    try {
      const response = await fetch(`${BACKEND_URL}/api/benchmark`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      let finalScorecard = null

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() || ""

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue
          const raw = line.slice(6).trim()
          if (!raw) continue

          let data
          try {
            data = JSON.parse(raw)
          } catch {
            continue
          }

          if (data.type === "suite_start") {
            setProgress({ index: 0, n: data.n || 0 })
          }
          if (data.type === "case_start") {
            setProgress((p) => ({ ...p, index: (data.index ?? 0) + 1 }))
          }
          if (data.type === "case_result") {
            collected.push(data.result)
            setResults([...collected])
          }
          if (data.type === "suite_done") {
            finalScorecard = data.scorecard
            const finalResults = Array.isArray(data.results) && data.results.length
              ? data.results
              : collected
            setResults(finalResults)
            setScorecard(finalScorecard)
            setStatus("complete")
            persistRun({
              alpha,
              limit: limit > 0 ? limit : null,
              categories: categories.length ? categories : null,
              scorecard: finalScorecard,
              results: finalResults,
              n: finalResults.length,
              source: "ui",
            })
          }
          if (data.type === "error") {
            setError(data.message || "Benchmark error")
            setStatus("error")
          }
        }
      }

      setStatus((s) => (s === "running" ? "complete" : s))
    } catch (err) {
      console.error("Benchmark stream error:", err)
      setError(err.message || "Stream failed")
      setStatus("error")
    }
  }, [reset, alpha, limit, categories, persistRun])

  const loadSaved = useCallback((id) => {
    const runData = loadBenchmarkRun(id)
    if (!runData) return
    setActiveRunId(runData.id)
    setScorecard(runData.scorecard || null)
    setResults(runData.results || [])
    setProgress({ index: runData.n || runData.results?.length || 0, n: runData.n || runData.results?.length || 0 })
    setStatus("complete")
    setError(null)
    if (typeof runData.alpha === "number") setAlpha(runData.alpha)
    if (runData.limit != null) setLimit(runData.limit || 0)
    if (Array.isArray(runData.categories)) setCategories(runData.categories)
  }, [])

  const removeSaved = useCallback(
    (id) => {
      deleteBenchmarkRun(id)
      refreshSaved()
      if (activeRunId === id) reset()
    },
    [activeRunId, refreshSaved, reset]
  )

  const downloadActive = useCallback(() => {
    const runData =
      (activeRunId && loadBenchmarkRun(activeRunId)) ||
      (scorecard
        ? {
            id: `benchmark_${new Date().toISOString().replace(/[:.]/g, "-")}`,
            alpha,
            limit,
            categories,
            scorecard,
            results,
            n: results.length,
            source: "ui",
            savedAt: new Date().toISOString(),
          }
        : null)
    if (!runData) return
    downloadBenchmarkRun(runData)
  }, [activeRunId, scorecard, alpha, limit, categories, results])

  return {
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
    reset,
    savedRuns,
    activeRunId,
    loadSaved,
    removeSaved,
    downloadActive,
  }
}
