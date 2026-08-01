import { useState, useRef, useEffect } from "react"
import { DEMO_PROMPTS } from "../constants/demoprompts"

export function PromptInput({
  onSubmit,
  disabled,
  interpretability = true,
  onInterpretabilityChange,
  alpha = 55,
  onAlphaChange,
}) {
  const [value, setValue] = useState("")
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  const harmful = DEMO_PROMPTS.filter((d) => d.expectedThreat)
  const safe = DEMO_PROMPTS.filter((d) => !d.expectedThreat)

  useEffect(() => {
    if (!menuOpen) return
    function onPointerDown(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false)
      }
    }
    function onKey(e) {
      if (e.key === "Escape") setMenuOpen(false)
    }
    document.addEventListener("pointerdown", onPointerDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [menuOpen])

  const handleSubmit = () => {
    if (!value.trim() || disabled) return
    const prompt = value.trim()
    setValue("")
    onSubmit(prompt)
  }

  const handleExample = (prompt) => {
    setMenuOpen(false)
    setValue("")
    onSubmit(prompt)
  }

  return (
    <div className="border-t border-paper-line bg-paper-raised/95 px-4 py-3 backdrop-blur-md sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-2.5">
        {/* Compact controls — bottom-left of chat bar */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex items-center gap-2">
            <span className="font-sans text-[10px] font-medium uppercase tracking-[0.14em] text-ink-mute">
              Interpretability
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={interpretability}
              aria-label="Model interpretability"
              disabled={disabled}
              title={
                interpretability
                  ? "Interpretability on — watching residual layers"
                  : "Interpretability off — plain generation"
              }
              onClick={() => onInterpretabilityChange?.(!interpretability)}
              className={`
                relative h-5 w-9 shrink-0 rounded-full transition-colors
                focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/25
                disabled:cursor-not-allowed disabled:opacity-40
                ${interpretability ? "bg-signal" : "bg-ink/20"}
              `}
            >
              <span
                className={`
                  absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-paper-raised
                  shadow-sm transition-transform
                  ${interpretability ? "translate-x-4" : "translate-x-0"}
                `}
              />
            </button>
          </div>

          {interpretability && (
            <div className="flex min-w-0 flex-1 items-center gap-2 sm:max-w-[14rem] sm:flex-none">
              <span className="shrink-0 font-sans text-[10px] font-medium uppercase tracking-[0.14em] text-ink-mute">
                Steer
              </span>
              <input
                type="range"
                min={0}
                max={80}
                step={1}
                value={alpha}
                disabled={disabled}
                aria-label="Steering strength"
                title={`Steering strength α=${alpha.toFixed(0)}`}
                onChange={(e) => onAlphaChange?.(Number(e.target.value))}
                className="
                  h-1 w-full min-w-[5rem] cursor-pointer accent-ink
                  disabled:cursor-not-allowed disabled:opacity-40
                "
              />
              <span className="w-5 shrink-0 text-right font-mono text-[11px] tabular-nums text-ink">
                {alpha.toFixed(0)}
              </span>
            </div>
          )}

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              disabled={disabled}
              aria-expanded={menuOpen}
              aria-haspopup="listbox"
              onClick={() => setMenuOpen((o) => !o)}
              className="
                flex items-center gap-2 border border-paper-line bg-paper px-2.5 py-1.5
                font-sans text-[12px] text-ink-soft transition-colors
                hover:border-ink/25 hover:text-ink
                disabled:cursor-not-allowed disabled:opacity-40
              "
            >
              Tickets
              <span className="text-ink-mute" aria-hidden>
                {menuOpen ? "▴" : "▾"}
              </span>
            </button>

            {menuOpen && (
              <div
                role="listbox"
                className="
                  absolute bottom-full left-0 z-30 mb-2 max-h-72 w-72 overflow-y-auto
                  border border-paper-line bg-paper-raised shadow-lg
                "
              >
                <p className="sticky top-0 border-b border-paper-line bg-paper-raised px-3 py-2 font-sans text-[10px] font-medium uppercase tracking-[0.16em] text-threat">
                  Attack tickets
                </p>
                {harmful.map((d) => (
                  <button
                    key={d.label}
                    type="button"
                    role="option"
                    title={d.prompt}
                    disabled={disabled}
                    onClick={() => handleExample(d.prompt)}
                    className="
                      block w-full border-b border-paper-line/60 px-3 py-2.5 text-left
                      font-sans text-sm text-threat transition-colors
                      hover:bg-threat-soft/50
                      disabled:opacity-40
                    "
                  >
                    {d.label}
                  </button>
                ))}
                <p className="sticky top-0 border-b border-paper-line bg-paper-raised px-3 py-2 font-sans text-[10px] font-medium uppercase tracking-[0.16em] text-signal">
                  Benign tickets
                </p>
                {safe.map((d) => (
                  <button
                    key={d.label}
                    type="button"
                    role="option"
                    title={d.prompt}
                    disabled={disabled}
                    onClick={() => handleExample(d.prompt)}
                    className="
                      block w-full border-b border-paper-line/60 px-3 py-2.5 text-left
                      font-sans text-sm text-signal transition-colors
                      hover:bg-signal-soft/50
                      disabled:opacity-40
                    "
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-end gap-2.5">
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Message ReadMyMind…"
            disabled={disabled}
            rows={1}
            className="
              max-h-32 min-h-[2.75rem] flex-1 resize-none border border-paper-line bg-paper
              px-4 py-2.5 font-sans text-[15px] leading-relaxed text-ink
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
              h-11 shrink-0 bg-ink px-6 font-sans text-sm font-medium text-paper-raised
              transition-opacity hover:opacity-90
              disabled:cursor-not-allowed disabled:opacity-35
            "
          >
            {disabled
              ? interpretability
                ? "Defending…"
                : "Thinking…"
              : "Send"}
          </button>
        </div>
      </div>
    </div>
  )
}
