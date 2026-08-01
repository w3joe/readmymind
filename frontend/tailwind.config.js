export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "#1a2233",
          soft: "#3d4a5c",
          mute: "#6b7a8f",
        },
        paper: {
          DEFAULT: "#eef2f6",
          raised: "#f7f9fb",
          line: "#d5dde8",
        },
        signal: {
          DEFAULT: "#0f766e",
          soft: "#ccfbf1",
          mid: "#14b8a6",
        },
        threat: {
          DEFAULT: "#c2410c",
          soft: "#ffedd5",
          mid: "#ea580c",
        },
        warn: {
          DEFAULT: "#b45309",
          soft: "#fef3c7",
        },
      },
      fontFamily: {
        display: ['"Instrument Serif"', "Georgia", "serif"],
        sans: ['"Outfit"', "system-ui", "sans-serif"],
        mono: ['"IBM Plex Mono"', "ui-monospace", "monospace"],
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "bar-grow": {
          from: { transform: "scaleX(0)" },
          to: { transform: "scaleX(1)" },
        },
        "scan-pulse": {
          "0%, 100%": { opacity: "0.4" },
          "50%": { opacity: "1" },
        },
        "draw-rule": {
          from: { transform: "scaleX(0)" },
          to: { transform: "scaleX(1)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.35s ease-out forwards",
        "bar-grow": "bar-grow 0.55s cubic-bezier(0.22, 1, 0.36, 1) forwards",
        "scan-pulse": "scan-pulse 1.4s ease-in-out infinite",
        "draw-rule": "draw-rule 0.6s ease-out forwards",
      },
    },
  },
  plugins: [],
}
