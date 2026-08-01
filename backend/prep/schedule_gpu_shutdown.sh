#!/usr/bin/env bash
# After 8 hours, turn off Modal min_containers so the L4 stops billing.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
APP="$ROOT/../app.py"
LOG="$ROOT/gpu-keepwarm-shutdown.log"
HOURS="${1:-8}"
SECS=$((HOURS * 3600))

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Sleeping ${HOURS}h before reverting min_containers…" | tee -a "$LOG"
sleep "$SECS"

python3 - <<'PY' "$APP"
from pathlib import Path
import sys
path = Path(sys.argv[1])
text = path.read_text()
old = """# min_containers=1 keeps an L4 warm (billed while idle). Revert to 0 after demos.
@app.function(
    gpu=\"L4\",
    image=image,
    volumes={\"/models\": volume},
    min_containers=1,
    scaledown_window=3600,
    timeout=60 * 60,
    memory=32768,
)"""
new = """@app.function(
    gpu=\"L4\",
    image=image,
    volumes={\"/models\": volume},
    scaledown_window=300,
    timeout=60 * 60,
    memory=32768,
)"""
if old not in text:
    raise SystemExit("Could not find min_containers=1 block to revert — edit app.py manually")
path.write_text(text.replace(old, new, 1))
print("Reverted min_containers in", path)
PY

cd "$ROOT/.."
modal deploy app.py
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] GPU keep-warm reverted (min_containers off)." | tee -a "$LOG"
