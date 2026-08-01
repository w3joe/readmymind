import { useState, useEffect, useRef } from "react"
import { Link } from "react-router-dom"
import { useSSEStream } from "./hooks/useSSEStream"
import { PromptInput } from "./components/PromptInput"
import { JSpaceScanner } from "./components/JSpaceScanner"
import { ThreatAlert } from "./components/ThreatAlert"
import { ToolCallStrip } from "./components/ToolCallStrip"

function formatMs(ms) {
  if (ms == null || Number.isNaN(ms)) return "—"
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${(ms / 1000).toFixed(2)} s`
}

export default function App() {
  const {
    layers,
    detection,
    outputs,
    status,
    error,
    alpha,
    setAlpha,
    interpretability,
    setInterpretability,
    analyse,
    reset,
  } = useSSEStream()

  // Multi-turn transcript. Each turn stores user + final assistant reply
  // (steered when defended, otherwise original) plus the undefended original.
  const [conversation, setConversation] = useState([])
  const [pendingUser, setPendingUser] = useState(null)
  const historyRef = useRef([])
  const threadRef = useRef(null)
  const committedKeyRef = useRef(null)

  // Stay busy while a turn is in flight (incl. brief window before transcript commit).
  const isRunning =
    Boolean(pendingUser) ||
    status === "scanning" ||
    status === "threat" ||
    status === "safe"
  const showSteer =
    interpretability && detection?.threat_detected && Boolean(outputs?.steered)

  const deskReply = showSteer ? outputs?.steered : outputs?.original
  const deskTools = showSteer
    ? outputs?.steered_tools || []
    : outputs?.original_tools || []

  // Drop a stuck pending turn if the stream errors out.
  useEffect(() => {
    if (error && pendingUser && status === "idle") {
      setPendingUser(null)
    }
  }, [error, pendingUser, status])

  // Append completed turn into conversation once outputs arrive.
  useEffect(() => {
    if (!outputs || !pendingUser || status !== "complete") return
    const commitKey = `${pendingUser}::${outputs.original}::${outputs.steered || ""}`
    if (committedKeyRef.current === commitKey) return
    committedKeyRef.current = commitKey

    const useSteered =
      interpretability &&
      detection?.threat_detected &&
      Boolean(outputs.steered)

    const assistantText = useSteered ? outputs.steered : outputs.original
    const assistantTools = useSteered
      ? outputs.steered_tools || []
      : outputs.original_tools || []

    const turn = {
      id: `${Date.now()}-${historyRef.current.length}`,
      user: pendingUser,
      assistant: assistantText || "",
      tools: assistantTools,
      original: outputs.original || "",
      originalTools: outputs.original_tools || [],
      defended: useSteered,
    }

    setConversation((prev) => {
      const next = [...prev, turn]
      historyRef.current = next.flatMap((t) => [
        { role: "user", content: t.user },
        { role: "assistant", content: t.assistant },
      ])
      return next
    })
    setPendingUser(null)
  }, [outputs, pendingUser, status, interpretability, detection])

  // Auto-scroll the response thread.
  useEffect(() => {
    const el = threadRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [conversation, pendingUser, deskReply, isRunning])

  function handleInterpretabilityChange(enabled) {
    setInterpretability(enabled)
    // Clear per-turn J-Lens / outputs pane only — keep the chat thread.
    reset()
  }

  function handleClearChat() {
    reset()
    setConversation([])
    setPendingUser(null)
    historyRef.current = []
    committedKeyRef.current = null
  }

  function handleSubmit(prompt) {
    setPendingUser(prompt)
    analyse(prompt, { history: historyRef.current })
  }

  const jlensTiming = detection?.jlens ?? outputs?.benchmark?.jlens
  const showLeftPane =
    interpretability &&
    (layers.length > 0 || isRunning || detection || outputs || pendingUser)
  const hasThread = conversation.length > 0 || pendingUser

  return (
    <div className="atmosphere relative flex h-[100dvh] flex-col overflow-hidden">
      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        <header className="shrink-0 border-b border-paper-line/80 px-5 py-4 sm:px-8">
          <div className="mx-auto max-w-6xl">
            <div className="mb-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
              <Link
                to="/benchmark"
                className="font-sans text-[12px] text-ink-mute underline-offset-4 hover:text-ink hover:underline"
              >
                Benchmark →
              </Link>
              <Link
                to="/benchmark/results"
                className="font-sans text-[12px] text-ink-mute underline-offset-4 hover:text-ink hover:underline"
              >
                Results →
              </Link>
            </div>
            <h1 className="brand font-display text-3xl leading-none tracking-tight text-ink sm:text-4xl">
              ReadMyMind
            </h1>
          </div>
        </header>

        {error && (
          <p className="shrink-0 border-b border-threat/30 bg-threat-soft px-5 py-2 font-sans text-sm text-threat sm:px-8">
            {error}
          </p>
        )}

        <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col gap-0 px-4 py-4 sm:px-6 lg:flex-row lg:gap-5">
          {/* Left: JLens observability + original response */}
          <aside className="flex min-h-0 w-full flex-col gap-4 overflow-y-auto lg:w-[42%] lg:shrink-0">
            {interpretability ? (
              <>
                <section>
                  <div className="mb-2 flex items-baseline justify-between gap-2">
                    <h2 className="font-sans text-[11px] font-medium uppercase tracking-[0.18em] text-ink-mute">
                      J-Lens observability
                    </h2>
                    {jlensTiming?.elapsed_ms != null && status === "complete" && (
                      <span className="font-mono text-[11px] tabular-nums text-ink-mute">
                        {formatMs(jlensTiming.elapsed_ms)}
                      </span>
                    )}
                  </div>
                  {showLeftPane ? (
                    <div className="space-y-3">
                      <JSpaceScanner
                        layers={layers}
                        status={status}
                        threatLayer={detection?.threat_layer}
                        jlensTiming={jlensTiming}
                      />
                      {detection && <ThreatAlert detection={detection} />}
                    </div>
                  ) : (
                    <p className="border border-dashed border-paper-line px-4 py-8 font-sans text-sm text-ink-mute">
                      Residual stream readout appears here after you send a message.
                    </p>
                  )}
                </section>

                <section>
                  <h2 className="mb-2 font-sans text-[11px] font-medium uppercase tracking-[0.18em] text-ink-mute">
                    Original response
                    {showSteer && (
                      <span className="ml-2 normal-case tracking-normal text-threat">
                        · undefended
                      </span>
                    )}
                  </h2>
                  <div className="border border-paper-line bg-paper-raised/60 px-4 py-4">
                    {isRunning && !outputs?.original && (
                      <p className="font-sans text-sm text-ink-mute animate-scan-pulse">
                        Generating undefended reply…
                      </p>
                    )}
                    {outputs?.original ? (
                      <>
                        <p className="font-sans text-[15px] leading-relaxed text-ink-soft whitespace-pre-wrap">
                          {outputs.original}
                        </p>
                        {(outputs.original_tools?.length > 0) && (
                          <ToolCallStrip
                            tools={outputs.original_tools}
                            label="Then action"
                          />
                        )}
                      </>
                    ) : (
                      !isRunning && (
                        <p className="font-sans text-sm text-ink-mute">
                          Undefended model output for the latest turn.
                        </p>
                      )
                    )}
                  </div>
                </section>
              </>
            ) : (
              <section className="flex min-h-0 flex-1 flex-col">
                <h2 className="mb-2 font-sans text-[11px] font-medium uppercase tracking-[0.18em] text-ink-mute">
                  Defense off
                </h2>
                <p className="border border-dashed border-paper-line px-4 py-8 font-sans text-sm leading-relaxed text-ink-mute">
                  Interpretability is off. J-Lens and the undefended
                  side-by-side stay hidden — the reply is on the right.
                </p>
              </section>
            )}
          </aside>

          {/* Right: actual multi-turn response thread */}
          <main className="mt-4 flex min-h-0 min-w-0 flex-1 flex-col lg:mt-0">
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <h2 className="font-sans text-[11px] font-medium uppercase tracking-[0.18em] text-ink-mute">
                Response
                {showSteer && (
                  <span className="ml-2 normal-case tracking-normal text-signal">
                    · defended
                  </span>
                )}
                {!interpretability && hasThread && (
                  <span className="ml-2 normal-case tracking-normal text-threat">
                    · undefended
                  </span>
                )}
              </h2>
              {conversation.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearChat}
                  disabled={isRunning}
                  className="font-sans text-[11px] text-ink-mute underline-offset-2 hover:text-ink hover:underline disabled:opacity-40"
                >
                  Clear chat
                </button>
              )}
            </div>

            <div
              ref={threadRef}
              className="min-h-0 flex-1 overflow-y-auto border border-paper-line bg-paper-raised/50"
            >
              {!hasThread && (
                <div className="flex h-full min-h-[12rem] items-center justify-center px-6 py-10">
                  <p className="max-w-sm text-center font-sans text-sm leading-relaxed text-ink-mute">
                    Send a message below. Follow-ups keep prior turns in context.
                  </p>
                </div>
              )}

              <div className="space-y-6 px-4 py-5 sm:px-5">
                {conversation.map((turn) => (
                  <div key={turn.id} className="space-y-3 animate-fade-up">
                    <div>
                      <p className="mb-1 font-sans text-[10px] font-medium uppercase tracking-[0.16em] text-ink-mute">
                        You
                      </p>
                      <p className="font-sans text-[14px] leading-relaxed text-ink whitespace-pre-wrap">
                        {turn.user}
                      </p>
                    </div>
                    <div className="border-l-2 border-paper-line pl-3 sm:pl-4">
                      <p className="mb-1 font-sans text-[10px] font-medium uppercase tracking-[0.16em] text-ink-mute">
                        Assistant
                        {turn.defended && (
                          <span className="ml-1.5 normal-case tracking-normal text-signal">
                            · steered
                          </span>
                        )}
                      </p>
                      <p className="font-sans text-[15px] leading-relaxed text-ink whitespace-pre-wrap">
                        {turn.assistant}
                      </p>
                      {(turn.tools?.length > 0 || turn.defended) && (
                        <ToolCallStrip
                          tools={turn.tools || []}
                          blocked={turn.defended && !(turn.tools?.length > 0)}
                          label="Then action"
                        />
                      )}
                    </div>
                  </div>
                ))}

                {pendingUser && (
                  <div className="space-y-3 animate-fade-up">
                    <div>
                      <p className="mb-1 font-sans text-[10px] font-medium uppercase tracking-[0.16em] text-ink-mute">
                        You
                      </p>
                      <p className="font-sans text-[14px] leading-relaxed text-ink whitespace-pre-wrap">
                        {pendingUser}
                      </p>
                    </div>
                    <div className="border-l-2 border-signal/40 pl-3 sm:pl-4">
                      <p className="mb-1 font-sans text-[10px] font-medium uppercase tracking-[0.16em] text-ink-mute">
                        Assistant
                        {showSteer && (
                          <span className="ml-1.5 normal-case tracking-normal text-signal">
                            · steered
                          </span>
                        )}
                      </p>
                      {deskReply ? (
                        <>
                          <p className="font-sans text-[15px] leading-relaxed text-ink whitespace-pre-wrap">
                            {deskReply}
                          </p>
                          {(deskTools.length > 0 || showSteer) && outputs && (
                            <ToolCallStrip
                              tools={deskTools}
                              blocked={showSteer && !deskTools.length}
                              label="Then action"
                            />
                          )}
                        </>
                      ) : (
                        <p className="font-sans text-sm text-ink-mute animate-scan-pulse">
                          {interpretability
                            ? "Scanning residual stream…"
                            : "Generating…"}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </main>
        </div>

        {/* Chat bar pinned to the bottom */}
        <div className="shrink-0">
          <PromptInput
            onSubmit={handleSubmit}
            disabled={isRunning}
            interpretability={interpretability}
            onInterpretabilityChange={handleInterpretabilityChange}
            alpha={alpha}
            onAlphaChange={setAlpha}
          />
        </div>
      </div>
    </div>
  )
}
