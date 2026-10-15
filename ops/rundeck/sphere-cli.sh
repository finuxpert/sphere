#!/usr/bin/env bash
# SPHERE CLI: DEV uses guarded full-stack QA + API/web deployment; PROD remains frontend-only.
set -Eeuo pipefail
[[ "$(id -u)" == 0 ]] || { echo "Run as root"; exit 2; }
# Promote the currently served DEV UI SHA, after explicit operator confirmation.
if [[ "${1:-}" == promote && "${2:-}" == dev-to-prod && "$#" -eq 2 ]]; then
  exec bash /root/rundeck-sphere-dev/ops/rundeck/promote-ui-prod-current-dev.sh
fi
[[ "${1:-}" == "deploy" ]] || { echo "Usage: sphere deploy dev | sphere deploy prod | sphere promote dev-to-prod"; exit 2; }
MODE="${2:-}"
case "$MODE" in
  dev) SOURCE=/root/rundeck-sphere-dev; BRANCH=rundeck-sphere-dev; WEB=/var/www/sphere-dev; URL=https://sphere.astraotoparts.co.id/dev/; BASE=/dev/ ;;
  prod) SOURCE=/root/rundeck-sphere-prod; BRANCH=rundeck-sphere-prod; WEB=/var/www/sphere.astraotoparts.co.id; URL=https://sphere.astraotoparts.co.id/; BASE=/ ;;
  *) echo "Usage: sphere deploy dev | sphere deploy prod"; exit 2 ;;
esac
# DEV must never return a misleading ALREADY_CURRENT from the web-only path.
# The guarded release verifies exact source SHA, QA, Python tests, backend and
# frontend cutover, DEV API contracts, and PROD invariants before success.
if [[ "$MODE" == dev ]]; then
  echo "DEV_RELEASE=FULL_STACK_GUARDED"
  exec bash "$SOURCE/ops/rundeck/release-dev-fast.sh"
fi
cd "$SOURCE"
[[ "$(git branch --show-current)" == "$BRANCH" ]] || { echo "BLOCKED: wrong branch"; exit 2; }
[[ -z "$(git status --porcelain)" ]] || { echo "BLOCKED: dirty worktree"; exit 2; }
git fetch --no-tags origin "$BRANCH"
git merge --ff-only "origin/$BRANCH"
SHA="$(git rev-parse HEAD)"
[[ "$SHA" == "$(git rev-parse "origin/$BRANCH")" ]] || exit 2
if [[ "$MODE" == prod ]]; then
  echo "PRODUCTION: frontend-only, source $SHA"
  echo "Backend, database and nginx will NOT change."
  read -r -p "Type exact 'DEPLOY PROD' to continue: " APPROVAL
  [[ "$APPROVAL" == "DEPLOY PROD" ]] || { echo "PROD=HOLD"; exit 2; }
fi
# Idempotency guard: once this SHA is the active verified web release,
# re-running the command is a successful no-op, not another Vite build.
# Existing but inactive release directories are never overwritten.
CURRENT="$WEB/current"
PREVIOUS="$(readlink -f "$CURRENT")"
[[ -f "$PREVIOUS/index.html" && "$PREVIOUS" == "$WEB/releases/"* ]] || {
  echo "BLOCKED: invalid current web release"
  exit 2
}
RELEASE="$WEB/releases/$SHA"
if [[ "$PREVIOUS" == "$RELEASE" ]]; then
  PUBLIC_HTML="$(mktemp)"
  trap 'rm -f "$PUBLIC_HTML"' EXIT
  curl --noproxy '*' -fsS --max-time 20 "$URL" -o "$PUBLIC_HTML"
  cmp -s "$RELEASE/index.html" "$PUBLIC_HTML" || {
    echo "BLOCKED: active release differs from public HTTPS"
    exit 2
  }
  echo "FINAL=PASS MODE=$MODE DEPLOY=ALREADY_CURRENT BUILD=SKIPPED SOURCE_SHA=$SHA QA=SKIPPED DB=UNCHANGED BACKEND=UNCHANGED"
  exit 0
fi
[[ ! -e "$RELEASE" && ! -L "$RELEASE" ]] || {
  echo "BLOCKED: inactive release already exists; refusing overwrite: $RELEASE"
  exit 2
}
if [[ "$MODE" == dev ]]; then
  npm run build:dev
else
  GITHUB_REF_NAME="$BRANCH" GITHUB_SHA="$SHA" npm run build
fi
[[ -f dist/index.html ]] || { echo "BUILD=FAIL: index missing"; exit 1; }
if [[ "$MODE" == dev ]]; then grep -q '/dev/assets/' dist/index.html; else ! grep -q '/dev/assets/' dist/index.html; fi
grep -Rqs "${SHA:0:7}" dist/assets || { echo "BUILD=FAIL: source SHA not in artifact"; exit 1; }
PROD_CURRENT="$(readlink -f /var/www/sphere.astraotoparts.co.id/current)"
PROD_HASH="$(sha256sum "$PROD_CURRENT/index.html" | cut -d' ' -f1)"
[[ -f "$PROD_CURRENT/index.html" ]] || exit 2
install -d -m 0755 "$RELEASE"
cp -a dist/. "$RELEASE/"
cmp -s dist/index.html "$RELEASE/index.html"
CUTOVER=0
rollback() {
 rc=$?
 trap - EXIT
 if ((rc != 0)); then
   if ((CUTOVER == 1)); then
     ln -s "$PREVIOUS" "$WEB/.rollback-$$"
     mv -Tf "$WEB/.rollback-$$" "$CURRENT"
     echo "ROLLBACK=PREVIOUS_RELEASE"
   fi
   echo "DEPLOY=FAIL code=$rc"
 fi
 rm -f "$WEB/.next-$$"
 exit "$rc"
}
trap rollback EXIT
ln -s "$RELEASE" "$WEB/.next-$$"
mv -Tf "$WEB/.next-$$" "$CURRENT"
CUTOVER=1
TMP="$(mktemp)"
curl --noproxy '*' -fsS --max-time 20 "$URL" -o "$TMP"
cmp -s "$RELEASE/index.html" "$TMP" || { echo "PUBLIC_HTML_MISMATCH"; exit 1; }
rm -f "$TMP"
[[ "$(readlink -f "$CURRENT")" == "$RELEASE" ]] || exit 1
if [[ "$MODE" == dev ]]; then
 [[ "$(readlink -f /var/www/sphere.astraotoparts.co.id/current)" == "$PROD_CURRENT" ]] || exit 1
 [[ "$(sha256sum "$PROD_CURRENT/index.html" | cut -d' ' -f1)" == "$PROD_HASH" ]] || exit 1
fi
trap - EXIT
echo "FINAL=PASS MODE=$MODE SOURCE_SHA=$SHA BUILD=PASS QA=SKIPPED DB=UNCHANGED BACKEND=UNCHANGED"
echo "ROLLBACK_PREVIOUS=$PREVIOUS"
