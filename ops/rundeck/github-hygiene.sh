#!/usr/bin/env bash
# SPHERE GitHub remote hygiene: inventory only unless --apply is provided.
# No live DEV/PROD, git worktree, DB, Nginx or Rundeck mutation.
set -Eeuo pipefail

usage() {
  echo "Usage: bash ops/rundeck/github-hygiene.sh [--audit|--apply] [--max-delete=N]" >&2
  exit 2
}

MODE="--audit"
if [[ $# -ge 1 ]]; then MODE="$1"; fi
[[ "$MODE" == "--audit" || "$MODE" == "--apply" ]] || usage
MAX_DELETE=150
if [[ $# -gt 1 ]]; then
  [[ "$2" =~ ^--max-delete=[0-9]+$ ]] || usage
  MAX_DELETE="$(printf '%s' "$2" | cut -d= -f2)"
fi
[[ "$MAX_DELETE" -ge 1 ]] || usage

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

if [[ "$(git branch --show-current)" != "rundeck-sphere-dev" ]]; then
  echo "BLOCKED: check out rundeck-sphere-dev, do not use PROD checkout." >&2
  exit 2
fi
if [[ -n "$(git status --porcelain)" ]]; then
  echo "BLOCKED: working tree is not clean." >&2
  exit 2
fi
if ! command -v gh >/dev/null 2>&1; then
  echo "BLOCKED: gh not installed. On trusted Ubuntu admin host: apt-get update && apt-get install -y gh" >&2
  exit 2
fi
if ! gh auth status; then
  echo "BLOCKED: authenticate with gh auth login --hostname github.com --git-protocol https --web" >&2
  exit 2
fi
if [[ "$(gh repo view finuxpert/sphere --json nameWithOwner --jq .nameWithOwner)" != "finuxpert/sphere" ]]; then
  echo "BLOCKED: GitHub repository identity check failed." >&2
  exit 2
fi

echo "REPOSITORY=finuxpert/sphere MODE=$MODE"
if [[ "$MODE" == "--apply" ]]; then
  python3 ops/rundeck/cleanup-merged-github-branches.py --apply
  python3 ops/rundeck/cleanup-github-actions-runs.py --apply --max-delete "$MAX_DELETE"
else
  python3 ops/rundeck/cleanup-merged-github-branches.py
  python3 ops/rundeck/cleanup-github-actions-runs.py --max-delete "$MAX_DELETE"
fi
echo "HYGIENE_MODE=$MODE COMPLETED=YES (see per-tool output)"
