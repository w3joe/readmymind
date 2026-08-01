const STORAGE_KEY = "readmymind.benchmark.runs"
const MAX_RUNS = 30

function safeParse(raw) {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function listBenchmarkRuns() {
  if (typeof localStorage === "undefined") return []
  const data = safeParse(localStorage.getItem(STORAGE_KEY))
  if (!Array.isArray(data)) return []
  return data.sort((a, b) => (b.savedAt || "").localeCompare(a.savedAt || ""))
}

export function saveBenchmarkRun(run) {
  if (typeof localStorage === "undefined") return null
  const id =
    run.id ||
    `run_${new Date().toISOString().replace(/[:.]/g, "-")}`
  const entry = {
    ...run,
    id,
    savedAt: run.savedAt || new Date().toISOString(),
  }
  const prev = listBenchmarkRuns().filter((r) => r.id !== id)
  const next = [entry, ...prev].slice(0, MAX_RUNS)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  return entry
}

export function loadBenchmarkRun(id) {
  return listBenchmarkRuns().find((r) => r.id === id) || null
}

export function deleteBenchmarkRun(id) {
  if (typeof localStorage === "undefined") return
  const next = listBenchmarkRuns().filter((r) => r.id !== id)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
}

export function downloadBenchmarkRun(run, filename) {
  const blob = new Blob([JSON.stringify(run, null, 2) + "\n"], {
    type: "application/json",
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download =
    filename ||
    `${run.id || "benchmark-run"}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
