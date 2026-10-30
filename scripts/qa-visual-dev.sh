#!/usr/bin/env bash
# SPHERE DEV browser smoke + layout checks using an installed Chrome/Chromium.
# No Playwright or internet dependency; this is NOT the full Playwright suite.
set -Eeuo pipefail
cd "$(dirname "$0")/.."

BRANCH="$(git branch --show-current)"
if [[ "$BRANCH" != "rundeck-sphere-dev" ]]; then
  echo "VISUAL_QA=BLOCKED expected rundeck-sphere-dev; found $BRANCH" >&2
  exit 2
fi
if [[ ! -s dist/index.html ]]; then
  echo "VISUAL_QA=BLOCKED dist/index.html missing. Run: npm run qa" >&2
  exit 2
fi

CHROME=""
for cmd in google-chrome google-chrome-stable chromium chromium-browser; do
  if command -v "$cmd" >/dev/null 2>&1; then
    CHROME="$cmd"
    break
  fi
done
if [[ -z "$CHROME" ]]; then
  echo "VISUAL_QA=BLOCKED Chrome/Chromium not installed on this host." >&2
  echo "Run the repository's GitHub Actions browser QA, or install Chromium via your approved offline packages." >&2
  echo "A successful Vite build alone is not a browser-layout PASS." >&2
  exit 2
fi

echo "VISUAL_MODE=CHROMIUM_SMOKE_AND_LAYOUT BROWSER=$CHROME"
echo "VISUAL_SCOPE=DEV_ONLY PLAYWRIGHT_FULL_SUITE=NOT_RUN"
bash scripts/qa-browser-boot.sh
node scripts/qa-evaluation-layout.mjs
echo "VISUAL_SMOKE=PASS"
echo "PLAYWRIGHT_FULL_SUITE=NOT_RUN (optional: npm run qa:visual:playwright when @playwright/test and its browsers are installed)"
