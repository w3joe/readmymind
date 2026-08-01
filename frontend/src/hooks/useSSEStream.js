import { useState, useCallback } from "react"

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || ""

export function useSSEStream() {
  const [layers, setLayers] = useState([])
  const [detection, setDetection] = useState(null)
  const [outputs, setOutputs] = useState(null)
  const [status, setStatus] = useState("idle") // idle | scanning | threat | safe | complete
  const [error, setError] = useState(null)
  const [alpha, setAlpha] = useState(55)

  const reset = useCallback(() => {
    setLayers([])
    setDetection(null)
    setOutputs(null)
    setStatus("idle")
    setError(null)
  }, [])

  const analyse = useCallback(async (prompt, alphaOverride) => {
    reset()
    setStatus("scanning")
    const strength = typeof alphaOverride === "number" ? alphaOverride : alpha

    try {
      const response = await fetch(`${BACKEND_URL}/analyse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, alpha: strength }),
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

          if (data.type === "layer") {
            setLayers((prev) => [...prev, data])
          }

          if (data.type === "detection") {
            setDetection(data)
            setStatus(data.threat_detected ? "threat" : "safe")
          }

          if (data.type === "outputs") {
            setOutputs(data)
            setStatus("complete")
          }

          if (data.type === "error") {
            setError(data.message || "Backend error")
          }
        }
      }
    } catch (err) {
      console.error("Stream error:", err)
      setError(err.message || "Stream failed")
      setStatus("idle")
    }
  }, [reset, alpha])

  return { layers, detection, outputs, status, error, alpha, setAlpha, analyse, reset }
}
