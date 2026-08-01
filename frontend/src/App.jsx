import { Link } from "react-router-dom"
import { useSSEStream } from "./hooks/useSSEStream"
import { PromptInput } from "./components/PromptInput"
import { JSpaceScanner } from "./components/JSpaceScanner"
import { ThreatAlert } from "./components/ThreatAlert"
import { OutputComparison } from "./components/OutputComparison"
import { SteeringTuner } from "./components/SteeringTuner"
import { InterpretabilityToggle } from "./components/InterpretabilityToggle"

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
  const isRunning = status === "scanning"
  const showResults = layers.length > 0 || isRunning || detection || outputs

  function handleInterpretabilityChange(enabled) {
    setInterpretability(enabled)
    // Drop prior Catch & Steer results so off doesn't keep showing scan/steer UI.
    reset()
  }

  return (
    <div className="atmosphere relative min-h-screen">
      <div className="relative z-10 mx-auto max-w-3xl px-5 pb-16 pt-10 sm:px-8 sm:pt-14">

        <header className="mb-10 sm:mb-12">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="font-sans text-[11px] font-medium uppercase tracking-[0.22em] text-ink-mute">
              Catch &amp; Steer
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
            ReadMyMind
          </h1>
          <div className="brand-rule mt-4 h-[2px] w-28 bg-signal" />
          <p className="mt-4 max-w-md font-sans text-base leading-relaxed text-ink-soft">
            Watch threat concepts form in the residual stream — then steer before the model complies.
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
          onSubmit={(prompt) => analyse(prompt)}
          disabled={isRunning}
          interpretability={interpretability}
        />

        {error && (
          <p className="mt-4 rounded-md border border-threat/30 bg-threat-soft px-3 py-2 font-sans text-sm text-threat">
            {error}
          </p>
        )}

        {showResults && (
          <div className="mt-12 space-y-8">
            {!interpretability && isRunning && !outputs && (
              <p className="font-sans text-sm text-ink-mute">Generating…</p>
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
                  Generation
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
          Huihui Qwen3-8B abliterated · Jacobian lens · Contrastive steering
        </footer>
      </div>
    </div>
  )
}
