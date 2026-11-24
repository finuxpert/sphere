#!/usr/bin/env bash
# SPHERE GitHub repository hygiene.
# Audit by default. Explicit manifests required for deletion.
set -Eeuo pipefail
umask 077

usage() {
    cat <<'EOF'
Usage:
  github-hygiene.sh --audit [--output-dir DIR]
  github-hygiene.sh --apply-branches --approved-manifest FILE
  github-hygiene.sh --apply-actions --approved-manifest FILE

Options:
  --output-dir DIR
  --max-delete N
  --help

No application deployment or runtime changes.
EOF
}

MODE="--audit"
APPROVED=""
MAX_DELETE=""
OUT="$HOME/sphere-hygiene-$(date +%Y%m%d-%H%M%S)"

if [[ $# -gt 0 ]]; then
    MODE="$1"
    shift
fi

case "$MODE" in
    --audit|--apply-branches|--apply-actions) ;;
    --help|-h) usage; exit 0 ;;
    *) usage >&2; exit 2 ;;
esac

while [[ $# -gt 0 ]]; do
    case "$1" in
        --approved-manifest)
            [[ $# -ge 2 ]] || exit 2
            APPROVED="$2"
            shift 2
            ;;
        --output-dir)
            [[ $# -ge 2 ]] || exit 2
            OUT="$2"
            shift 2
            ;;
        --max-delete)
            [[ $# -ge 2 ]] || exit 2
            MAX_DELETE="$2"
            shift 2
            ;;
        *)
            echo "BLOCKED: Unknown option $1" >&2
            exit 2
            ;;
    esac
done

if [[ "$MODE" != "--audit" ]]; then
    if [[ -z "$APPROVED" || ! -f "$APPROVED" ]]; then
        echo "BLOCKED: approved manifest required" >&2
        exit 2
    fi

    APPROVED="$(realpath "$APPROVED")"
fi

if [[ -n "$MAX_DELETE" ]]; then
    [[ "$MAX_DELETE" =~ ^[1-9][0-9]*$ ]] || exit 2

    case "$MODE" in
        --apply-branches)
            [[ "$MAX_DELETE" -le 20 ]] || exit 2
            ;;
        *)
            [[ "$MAX_DELETE" -le 150 ]] || exit 2
            ;;
    esac
fi

OUT="$(realpath -m "$OUT")"

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

if [[ "$(git rev-parse --abbrev-ref HEAD)" != \
"rundeck-sphere-dev" ]]; then
    echo "BLOCKED: use clean rundeck-sphere-dev checkout" >&2
    exit 2
fi

if [[ -n "$(git status --porcelain)" ]]; then
    echo "BLOCKED: working tree is not clean" >&2
    exit 2
fi

command -v gh >/dev/null
command -v python3 >/dev/null

gh auth status

[[ "$(gh repo view finuxpert/sphere \
    --json nameWithOwner --jq .nameWithOwner)" \
    == "finuxpert/sphere" ]]

mkdir -p "$OUT"

echo "REPOSITORY=finuxpert/sphere"
echo "MODE=$MODE"
echo "OUTPUT_DIR=$OUT"

case "$MODE" in
    --audit)
        BRANCH_LIMIT=20
        ACTION_LIMIT="${MAX_DELETE:-150}"

        python3 ops/rundeck/cleanup-merged-github-branches.py \
            --max-delete "$BRANCH_LIMIT" \
            --manifest "$OUT/branches-audit.json"

        python3 ops/rundeck/cleanup-github-actions-runs.py \
            --max-delete "$ACTION_LIMIT" \
            --manifest "$OUT/actions-audit.json"
        ;;

    --apply-branches)
        python3 ops/rundeck/cleanup-merged-github-branches.py \
            --apply \
            --approved-manifest "$APPROVED" \
            --max-delete "${MAX_DELETE:-20}" \
            --manifest "$OUT/branches-execution.json"
        ;;

    --apply-actions)
        python3 ops/rundeck/cleanup-github-actions-runs.py \
            --apply \
            --approved-manifest "$APPROVED" \
            --max-delete "${MAX_DELETE:-150}" \
            --backup-dir "$OUT/actions-logs" \
            --manifest "$OUT/actions-execution.json"
        ;;
esac

echo "HYGIENE_MODE=$MODE"
echo "COMPLETED=YES"
echo "DEPLOYMENT=NONE"
echo "DATABASE_CHANGES=NONE"
