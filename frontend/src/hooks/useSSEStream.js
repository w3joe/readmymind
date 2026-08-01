import { useState, useCallback, useRef } from "react"

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || ""

export function useSSEStream() {
  const [layers, setLayers] = useState([])
  const [detection, setDetection] = useState(null)
  const [outputs, setOutputs] = useState(null)
  const [status, setStatus] = useState("idle") // idle | scanning | threat | safe | complete
  const [error, setError] = useState(null)
  const [alpha, setAlpha] = useState(55)
  const [interpretability, setInterpretabilityState] = useState(true)
  const interpretabilityRef = useRef(true)
  const alphaRef = useRef(55)

  const setInterpretability = useCallback((next) => {
    const value = typeof next === "function" ? next(interpretabilityRef.current) : next
    interpretabilityRef.current = value
    setInterpretabilityState(value)
  }, [])

  const setAlphaSafe = useCallback((next) => {
    const value = typeof next === "function" ? next(alphaRef.current) : next
    alphaRef.current = value
    setAlpha(value)
  }, [])

  const reset = useCallback(() => {
    setLayers([])
    setDetection(null)
    setOutputs(null)
    setStatus("idle")
    setError(null)
  }, [])

  const analyse = useCallback(async (prompt, options = {}) => {
    reset()
    setStatus("scanning")
    const strength =
      typeof options.alpha === "number" ? options.alpha : alphaRef.current
    // Always read the live toggle — don't trust a possibly-stale closure.
    const useInterpretability =
      typeof options.interpretability === "boolean"
        ? options.interpretability
        : interpretabilityRef.current

    try {
      const response = await fetch(`${BACKEND_URL}/analyse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          alpha: strength,
          interpretability: useInterpretability,
        }),
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

          // Ignore Catch & Steer events if this request disabled interpretability.
          if (!useInterpretability && (data.type === "layer" || data.type === "detection")) {
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
            if (!useInterpretability) {
              setOutputs({
                ...data,
                steered: null,
                threat_layer: null,
                interpretability: false,
                benchmark: {
                  ...(data.benchmark || {}),
                  interpretability: false,
                  steered: undefined,
                  jlens: { elapsed_ms: 0 },
                },
              })
            } else {
              setOutputs(data)
            }
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
  }, [reset])

  return {
    layers,
    detection,
    outputs,
    status,
    error,
    alpha,
    setAlpha: setAlphaSafe,
    interpretability,
    setInterpretability,
    analyse,
    reset,
  }
}
