#!/usr/bin/env bash
set -euo pipefail

# Smoke-test the built SPHERE application with a real headless browser.
# The test checks mounting, not backend availability or metric correctness.
HOST="127.0.0.1"
PORT="4173"
URL="http://${HOST}:${PORT}/dev/#/tool/logs"
OUT="$(mktemp)"
LOG="$(mktemp)"
cleanup() {
  if [[ -n "${SERVER_PID:-}" ]]; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
    wait "$SERVER_PID" >/dev/null 2>&1 || true
  fi
  rm -f "$OUT" "$LOG"
}
trap cleanup EXIT

CHROME=""
for executable in google-chrome google-chrome-stable chromium chromium-browser; do
  if command -v "$executable" >/dev/null 2>&1; then
    CHROME="$(command -v "$executable")"
    break
  fi
done
if [[ -z "$CHROME" ]]; then
  echo "FAIL: no installed Chrome/Chromium for browser smoke test"
  exit 1
fi

npm run preview -- --host "$HOST" --port "$PORT" --strictPort >"$LOG" 2>&1 &
SERVER_PID=$!
ready=0
for _ in $(seq 1 40); do
  if curl --fail --silent --output /dev/null "$URL"; then
    ready=1
    break
  fi
  sleep 0.5
done
if [[ "$ready" != 1 ]]; then
  echo "FAIL: Vite preview not available at $URL"
  cat "$LOG"
  exit 1
fi

# Chromium can hang on runner DBus/session initialization even when Vite is healthy.
# Isolate each browser attempt, retry startup once, but never waive DOM assertions.
BROWSER_OK=0
for attempt in 1 2; do
  PROFILE="$(mktemp -d)"
  : >"$OUT"
  if DBUS_SESSION_BUS_ADDRESS="" timeout -k 5 45 "$CHROME" --headless --no-sandbox \
    --disable-gpu --disable-dev-shm-usage --disable-background-networking \
    --disable-extensions --no-first-run --no-default-browser-check \
    --user-data-dir="$PROFILE" --virtual-time-budget=15000 \
    --dump-dom "$URL" >"$OUT" 2>>"$LOG"; then
    BROWSER_OK=1
    rm -rf "$PROFILE"
    break
  fi
  echo "Chromium attempt $attempt failed; retrying with an isolated profile"
  rm -rf "$PROFILE"
done
if [[ "$BROWSER_OK" != 1 ]]; then
  echo "FAIL: browser startup failed after two attempts"
  tail -35 "$LOG"
  exit 1
fi

# SPA content must exist in the rendered DOM, not merely in the page title
# or metadata. In a render-time ReferenceError, the root remains empty.
if ! grep -Eq '>(SAP Operations|APP Fleet|Performance Trends|SAP Performance)</[^>]+>' "$OUT"; then
  echo "FAIL: SPHERE did not mount its monitoring UI (potential blank page)"
  grep -E 'ReferenceError|TypeError|SyntaxError|Error:' "$LOG" | tail -15 || true
  echo "Rendered root excerpt:"
  sed -n '/<div id="root"/,+4p' "$OUT" | cut -c1-300 | head -8
  exit 1
fi

echo "PASS: browser rendered SPHERE monitoring UI"
