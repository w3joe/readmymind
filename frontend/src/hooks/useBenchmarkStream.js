import { useState, useCallback } from "react"

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

  const reset = useCallback(() => {
    setStatus("idle")
    setProgress({ index: 0, n: 0 })
    setResults([])
    setScorecard(null)
    setError(null)
  }, [])

  const run = useCallback(async () => {
    reset()
    setStatus("running")

    const body = {
      alpha,
      limit: limit > 0 ? limit : null,
    }
    if (categories.length > 0) body.categories = categories

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
            setResults((prev) => [...prev, data.result])
          }
          if (data.type === "suite_done") {
            setScorecard(data.scorecard)
            setStatus("complete")
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
  }, [reset, alpha, limit, categories])

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
  }
}
