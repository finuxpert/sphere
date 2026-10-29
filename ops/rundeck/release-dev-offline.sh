#!/usr/bin/env bash
# SPHERE DEV - no GitHub/network dependency: deploy a QA-gated local release.
# Invoked from a pre-verified GitHub Actions artifact delivered over internal SSH.
set -Eeuo pipefail
umask 077
SOURCE=/root/rundeck-sphere-dev
ARCHIVE="${1:-}"
LOG=/tmp/sphere-dev-offline-last.log
STAGE=INIT
SCRATCH=''
DIST_STAGED=0

failure() {
  local rc="$1"
  echo "FINAL=FAIL STAGE=$STAGE SHA=$(git -C "$SOURCE" rev-parse --short HEAD 2>/dev/null || echo unknown) EXIT=$rc"
  if [[ -f "$LOG" ]]; then
    grep -E 'BLOCKED|FAIL |ERROR|error:|DEPLOY FAILED' "$LOG" | tail -n 18 || true
  fi
  echo "LOG=$LOG"
}
cleanup() {
  if [[ "$DIST_STAGED" == 1 ]]; then
    rm -rf -- "$SOURCE/dist"
  fi
  [[ -z "$SCRATCH" ]] || rm -rf -- "$SCRATCH"
}
trap 'rc=$?; trap - EXIT; cleanup; if (( rc != 0 )); then failure "$rc"; fi' EXIT
[[ $# == 1 && -f "$ARCHIVE" ]] || { echo "Usage: release-dev-offline.sh /var/tmp/sphere-dev-<sha>.tar.gz"; exit 2; }
[[ "${SPHERE_DEV_MIGRATION_DECISION:-}" == skip ]] || { echo "DEPLOY BLOCKED: explicit SPHERE_DEV_MIGRATION_DECISION=skip required"; exit 42; }
test "$(id -u)" -eq 0
cd "$SOURCE"
test "$(git branch --show-current)" = rundeck-sphere-dev
test -z "$(git status --porcelain)"

SCRATCH="$(mktemp -d /var/tmp/sphere-dev-offline.XXXXXXXX)"
# Refuse absolute paths, parent traversal, symlinks and device files from archives.
python3 - "$ARCHIVE" <<'PY'
import sys,tarfile
with tarfile.open(sys.argv[1], 'r:gz') as archive:
    entries=archive.getmembers()
    if len(entries)>5000:
        raise SystemExit('BLOCKED: too many package entries')
    for member in entries:
        path=member.name
        components=path.split('/')
        if path.startswith('/') or '..' in components or not (member.isfile() or member.isdir()):
            raise SystemExit('BLOCKED: unsafe package entry: ' + path)
PY
tar -xzf "$ARCHIVE" -C "$SCRATCH" --no-same-owner
STAGE=VERIFY
(
  cd "$SCRATCH"
  sha256sum -c SHA256SUMS > /dev/null
)
SHA="$(cat "$SCRATCH/source.sha")"
[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || { echo "BLOCKED: invalid source SHA"; exit 42; }
git bundle verify "$SCRATCH/source.bundle" > "$LOG" 2>&1
test -s "$SCRATCH/web-dist.tar.gz"
test -d "$SCRATCH/wheels"
find "$SCRATCH/wheels" -type f -name '*.whl' -print -quit | grep -q .
echo "ARTIFACT=VERIFIED SHA=${SHA:0:8}"

STAGE=SOURCE
# Fetches only from a local bundle. No github.com URL, DNS or external transport.
git fetch --no-tags "$SCRATCH/source.bundle" \
  refs/heads/rundeck-sphere-dev:refs/remotes/sphere-offline/rundeck-sphere-dev >> "$LOG" 2>&1
test "$(git rev-parse refs/remotes/sphere-offline/rundeck-sphere-dev)" = "$SHA"
git merge-base --is-ancestor HEAD "$SHA" || { echo "BLOCKED: offline source is not fast-forward"; exit 42; }
ACTIVE="$(basename "$(readlink -f /opt/sphere-rundeck-dev/current 2>/dev/null || true)")"
if [[ -s /etc/sphere/rundeck-dev.env ]] &&
   grep -Eq '^SPHERE_RUN_DEV_MIGRATIONS=true\r?$' /etc/sphere/rundeck-dev.env; then
  git cat-file -e "$ACTIVE^{commit}" || { echo "BLOCKED: active DEV release SHA unknown"; exit 42; }
  git diff --quiet "$ACTIVE" "$SHA" -- backend/db/migrations || {
    echo "BLOCKED: migration file changes require separate backup and approval"
    exit 42
  }
  export SPHERE_DEV_MIGRATION_APPROVED_SHA="$SHA"
fi
git merge --ff-only "$SHA" >> "$LOG" 2>&1
test "$(git rev-parse HEAD)" = "$SHA"
test -z "$(git status --porcelain)"
echo "SOURCE=PASS SHA=${SHA:0:8}"

STAGE=ARTIFACT
# Built on CI using exact Git commit. The deployment script validates both
# SPA assets and version+SHA again before activating the release.
DIST_STAGED=1
rm -rf -- "$SOURCE/dist"
install -d -m 0755 "$SOURCE/dist"
tar -xzf "$SCRATCH/web-dist.tar.gz" -C "$SOURCE/dist" --no-same-owner
test -s "$SOURCE/dist/index.html"
grep -q '/dev/assets/' "$SOURCE/dist/index.html"
SHORT_SHA="${SHA:0:7}"
APP_VERSION="$(sed -n "s/^export const APP_VERSION = '\([^']*\)'.*/\1/p" "$SOURCE/src/app/version.js" | head -n 1)"
test -n "$APP_VERSION"
grep -Rqs "$APP_VERSION" "$SOURCE/dist/assets"
grep -Rqs "$SHORT_SHA" "$SOURCE/dist/assets"
echo "BUILD=CI_VERIFIED SHA=${SHA:0:8}"

STAGE=DEPLOY
export SPHERE_OFFLINE_WHEELHOUSE="$SCRATCH/wheels"
export UV_NO_INDEX=1
export PIP_NO_INDEX=1
# Reuse the existing rollback, smoke-test, Nginx and PROD-integrity guards.
SPHERE_DEV_MIGRATION_DECISION=skip bash "$SOURCE/ops/rundeck/deploy-dev.sh" >> "$LOG" 2>&1
echo "DEPLOY=PASS DB_MIGRATION=SKIPPED"
echo "PROD=UNCHANGED_BY_RELEASE_GUARDS"
echo "CLEANUP=ON_EXIT"
echo "FINAL=PASS DEV_SHA=${SHA:0:8} SOURCE=OFFLINE"
