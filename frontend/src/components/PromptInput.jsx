import { useState } from "react"
import { DEMO_PROMPTS } from "../constants/demoprompts"

export function PromptInput({ onSubmit, disabled, interpretability = true }) {
  const [value, setValue] = useState("")

  const harmful = DEMO_PROMPTS.filter((d) => d.expectedThreat)
  const safe = DEMO_PROMPTS.filter((d) => !d.expectedThreat)

  const handleSubmit = () => {
    if (!value.trim() || disabled) return
    onSubmit(value.trim())
  }

  const handleExample = (prompt) => {
    setValue(prompt)
    onSubmit(prompt)
  }

  return (
    <div className="space-y-5">
      <div className="space-y-4">
        <div>
          <p className="mb-2.5 font-sans text-[11px] font-medium uppercase tracking-[0.18em] text-threat">
            Attack tickets · {interpretability ? "defense on" : "undefended"}
          </p>
          <div className="flex flex-wrap gap-2">
            {harmful.map((d) => (
              <button
                key={d.label}
                type="button"
                title={d.prompt}
                onClick={() => handleExample(d.prompt)}
                disabled={disabled}
                className="
                  border border-threat/50 bg-threat-soft/60 px-3 py-1.5
                  font-sans text-sm text-threat transition-colors
                  hover:bg-threat-soft
                  disabled:cursor-not-allowed disabled:opacity-40
                "
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2.5 font-sans text-[11px] font-medium uppercase tracking-[0.18em] text-signal">
            Benign tickets · {interpretability ? "defense on" : "undefended"}
          </p>
          <div className="flex flex-wrap gap-2">
            {safe.map((d) => (
              <button
                key={d.label}
                type="button"
                title={d.prompt}
                onClick={() => handleExample(d.prompt)}
                disabled={disabled}
                className="
                  border border-signal/50 bg-signal-soft/60 px-3 py-1.5
                  font-sans text-sm text-signal transition-colors
                  hover:bg-signal-soft
                  disabled:cursor-not-allowed disabled:opacity-40
                "
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Paste a support ticket or customer message…"
          disabled={disabled}
          rows={3}
          className="
            min-h-[5.5rem] flex-1 resize-none border border-paper-line bg-paper-raised
            px-4 py-3 font-sans text-[15px] leading-relaxed text-ink
            placeholder:text-ink-mute/60
            focus:border-ink/30 focus:outline-none
            disabled:opacity-40
          "
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              handleSubmit()
            }
          }}
        />
        <button
          type="button"
          onClick={handleSubmit}
          disabled={disabled || !value.trim()}
          className="
            h-12 shrink-0 bg-ink px-7 font-sans text-sm font-medium text-paper-raised
            transition-opacity hover:opacity-90
            disabled:cursor-not-allowed disabled:opacity-35
          "
        >
          {disabled
            ? interpretability
              ? "Defending…"
              : "Desk thinking…"
            : "Send to Desk"}
        </button>
      </div>

      <p className="font-sans text-xs text-ink-mute">
        {interpretability
          ? "ReadMyMind watches residual layers, then steers Northwind Desk before a forbidden tool call lands."
          : "Defense off — Desk runs undefended (abliterated). Forbidden tool calls may appear as chips."}
      </p>
    </div>
  )
}
