import { useState } from "react"
import { Link } from "react-router-dom"
import { useSSEStream } from "./hooks/useSSEStream"
import { PromptInput } from "./components/PromptInput"
import { JSpaceScanner } from "./components/JSpaceScanner"
import { ThreatAlert } from "./components/ThreatAlert"
import { OutputComparison } from "./components/OutputComparison"
import { SteeringTuner } from "./components/SteeringTuner"
import { InterpretabilityToggle } from "./components/InterpretabilityToggle"
import { ToolCallStrip } from "./components/ToolCallStrip"

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
  const [lastTicket, setLastTicket] = useState(null)
  const isRunning = status === "scanning"
  const showResults = layers.length > 0 || isRunning || detection || outputs
  const showSteer =
    interpretability && detection?.threat_detected && Boolean(outputs?.steered)

  function handleInterpretabilityChange(enabled) {
    setInterpretability(enabled)
    reset()
    setLastTicket(null)
  }

  function handleSubmit(prompt) {
    setLastTicket(prompt)
    analyse(prompt)
  }

  const deskReply = showSteer ? outputs?.steered : outputs?.original
  const deskTools = showSteer
    ? outputs?.steered_tools || []
    : outputs?.original_tools || []

  return (
    <div className="atmosphere relative min-h-screen">
      <div className="relative z-10 mx-auto max-w-3xl px-5 pb-16 pt-10 sm:px-8 sm:pt-14">

        <header className="mb-10 sm:mb-12">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="font-sans text-[11px] font-medium uppercase tracking-[0.22em] text-ink-mute">
              ReadMyMind · Catch &amp; Steer
            </p>
            <div className="flex gap-4">
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
          </div>
          <h1 className="brand mt-2 font-display text-[3.25rem] leading-[0.95] tracking-tight text-ink sm:text-6xl">
            Northwind Desk
          </h1>
          <div className="brand-rule mt-4 h-[2px] w-28 bg-signal" />
          <p className="mt-4 max-w-lg font-sans text-base leading-relaxed text-ink-soft">
            A mock support agent with tools. Toggle defense to watch jailbreaks
            and ticket injections get caught in the residual stream — then steered
            before a forbidden call lands.
          </p>
        </header>

        <div className="mb-6 space-y-3">
          <InterpretabilityToggle
            enabled={interpretability}
            onChange={handleInterpretabilityChange}
            disabled={isRunning}
          />
          {interpretability && (
            <SteeringTuner alpha={alpha} onChange={setAlpha} disabled={isRunning} />
          )}
        </div>

        <PromptInput
          onSubmit={handleSubmit}
          disabled={isRunning}
          interpretability={interpretability}
        />

        {error && (
          <p className="mt-4 rounded-md border border-threat/30 bg-threat-soft px-3 py-2 font-sans text-sm text-threat">
            {error}
          </p>
        )}

        {(lastTicket || showResults) && (
          <div className="mt-12 space-y-8">
            {(lastTicket || isRunning || outputs) && (
              <section>
                <h2 className="mb-3 font-sans text-[11px] font-medium uppercase tracking-[0.18em] text-ink-mute">
                  Desk console
                </h2>
                <div className="space-y-4 border border-paper-line bg-paper-raised/60 px-4 py-4">
                  {lastTicket && (
                    <div>
                      <p className="mb-1.5 font-sans text-[11px] font-medium uppercase tracking-[0.16em] text-ink-mute">
                        Ticket
                      </p>
                      <p className="font-sans text-[15px] leading-relaxed text-ink whitespace-pre-wrap">
                        {lastTicket}
                      </p>
                    </div>
                  )}

                  {(isRunning || deskReply) && (
                    <div className="border-t border-paper-line pt-4">
                      <p className="mb-1.5 font-sans text-[11px] font-medium uppercase tracking-[0.16em] text-ink-mute">
                        Desk
                        {showSteer && (
                          <span className="ml-2 normal-case tracking-normal text-signal">
                            · defended
                          </span>
                        )}
                        {!interpretability && outputs && (
                          <span className="ml-2 normal-case tracking-normal text-threat">
                            · undefended
                          </span>
                        )}
                      </p>
                      {isRunning && !deskReply && (
                        <p className="font-sans text-sm text-ink-mute animate-scan-pulse">
                          {interpretability ? "Scanning residual stream…" : "Generating…"}
                        </p>
                      )}
                      {deskReply && (
                        <>
                          <p className="font-sans text-[15px] leading-relaxed text-ink-soft whitespace-pre-wrap">
                            {deskReply}
                          </p>
                          <ToolCallStrip
                            tools={deskTools}
                            blocked={showSteer && !deskTools.length}
                          />
                        </>
                      )}
                    </div>
                  )}
                </div>
              </section>
            )}

            {interpretability && (layers.length > 0 || isRunning) && (
              <section>
                <h2 className="mb-3 font-sans text-[11px] font-medium uppercase tracking-[0.18em] text-ink-mute">
                  Layer readout
                </h2>
                <JSpaceScanner
                  layers={layers}
                  status={status}
                  threatLayer={detection?.threat_layer}
                  jlensTiming={detection?.jlens ?? outputs?.benchmark?.jlens}
                />
              </section>
            )}

            {interpretability && detection && <ThreatAlert detection={detection} />}

            {outputs && (
              <section>
                <h2 className="mb-3 font-sans text-[11px] font-medium uppercase tracking-[0.18em] text-ink-mute">
                  Side-by-side
                  {interpretability && detection?.threat_detected && (
                    <span className="ml-2 normal-case tracking-normal text-ink-mute">
                      · steered at α={outputs.alpha ?? alpha}
                    </span>
                  )}
                </h2>
                <OutputComparison
                  outputs={outputs}
                  detection={interpretability ? detection : null}
                  interpretability={interpretability && outputs.interpretability !== false}
                />
              </section>
            )}
          </div>
        )}

        <footer className="mt-16 border-t border-paper-line pt-5 font-sans text-[11px] leading-relaxed text-ink-mute">
          Northwind Desk mock agent · Huihui Qwen3-8B abliterated · Jacobian lens · Catch &amp; Steer
        </footer>
      </div>
    </div>
  )
}
