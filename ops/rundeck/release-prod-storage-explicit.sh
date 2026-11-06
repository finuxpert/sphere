#!/usr/bin/env bash
# Storage-only PROD API compatibility cutover. No migrations, UI or collectors.
# Rollback restores BOTH active backend symlink and previous environment file.
set -Eeuo pipefail
umask 027
HEAD_SHA="$1"
BASE_SHA=da08de4218ef1463b1ec6f3226d732139d96050b
REPO=/root/rundeck-sphere-prod
API=/opt/sphere-rundeck-prod
CURRENT="$API/current"
ENV=/etc/sphere/rundeck-prod.env
SERVICE=sphere-rundeck-prod-api.service
PY="$API/venv/bin/python"
die() { echo "BLOCKED=$1" >&2; exit 2; }

[[ "$(id -u)" == 0 ]] || die ROOT_REQUIRED
[[ "$(hostname -s)" == JAHSVR-SPHERE ]] || die WRONG_HOST
[[ "$HEAD_SHA" =~ ^[0-9a-f]{40}$ ]] || die INVALID_HEAD_SHA
exec 9>/run/lock/sphere-prod-api-compat.lock
flock -n 9 || die CONCURRENT_RELEASE
cd "$REPO"
[[ "$(git branch --show-current)" == rundeck-sphere-prod ]] || die WRONG_BRANCH
[[ -z "$(git status --porcelain)" ]] || die DIRTY_CHECKOUT
[[ "$(git rev-parse HEAD)" == "$BASE_SHA" ]] || die BASE_CHANGED
[[ "$(git rev-parse FETCH_HEAD)" == "$HEAD_SHA" ]] || die UNPINNED_HEAD
git merge-base --is-ancestor "$BASE_SHA" "$HEAD_SHA" || die UNRELATED_SOURCE
while IFS= read -r path; do
  case "$path" in
    backend/rundeck_prod_monthly_storage.py|backend/tests/test_prod_storage_df_avail_contract.py|.github/workflows/sphere-prod-compat-qa.yml|ops/rundeck/release-prod-storage-explicit.sh) ;;
    *) die "UNEXPECTED_CHANGE:$path" ;;
  esac
done < <(git diff --name-only "$BASE_SHA" "$HEAD_SHA")
PREVIOUS="$(readlink -f "$CURRENT")"
[[ "$PREVIOUS" == "$API/releases/compat-da08de4218ef" && -d "$PREVIOUS" ]] || die ACTIVE_RELEASE_CHANGED
cmp -s <(git show "$BASE_SHA:backend/rundeck_prod_monthly_storage.py") "$PREVIOUS/backend/rundeck_prod_monthly_storage.py" || die ACTIVE_SOURCE_DRIFT
[[ "$(stat -c '%a %U:%G' "$ENV")" == "640 root:sphere" ]] || die ENV_PERMISSIONS_CHANGED
[[ -x "$PY" ]] || die MISSING_VENV
! grep -q '^SPHERE_MONTHLY_STORAGE_MOUNTS=' "$ENV" || die MAPPING_ALREADY_CONFIGURED
systemctl is-active --quiet "$SERVICE" || die SERVICE_NOT_ACTIVE
curl --noproxy '*' -fsS --max-time 10 http://127.0.0.1:8092/health >/dev/null || die BASELINE_HEALTH_FAILED
DEV_API="$(readlink -f /opt/sphere-rundeck-dev/current)"
DEV_UI="$(readlink -f /var/www/sphere-dev/current)"
PROD_UI="$(readlink -f /var/www/sphere.astraotoparts.co.id/current)"
PROD_WEB_HASH="$(sha256sum "$PROD_UI/index.html" | awk '{print $1}')"
SHORT="$(printf %.12s "$HEAD_SHA")"
RELEASE="$API/releases/compat-storage-$SHORT"
[[ ! -e "$RELEASE" ]] || die RELEASE_ALREADY_EXISTS
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
ENV_BACKUP="$ENV.before-storage-$STAMP"
STAGE=''
ENV_STAGE=''
MUTATED=0
rollback() {
  rc=$?
  trap - EXIT
  set +e
  if [[ "$rc" != 0 && "$MUTATED" == 1 ]]; then
    echo ROLLBACK=START
    cp -a "$ENV_BACKUP" "$ENV.rollback-$$"
    mv -f "$ENV.rollback-$$" "$ENV"
    ln -s "$PREVIOUS" "$API/.rollback-$$"
    mv -Tf "$API/.rollback-$$" "$CURRENT"
    systemctl restart "$SERVICE"
    ready=0
    for i in $(seq 1 30); do
      if systemctl is-active --quiet "$SERVICE" &&
         curl --noproxy '*' -fsS --max-time 3 http://127.0.0.1:8092/health >/dev/null 2>&1; then ready=1; break; fi
      sleep 1
    done
    [[ "$ready" == 1 ]] && echo ROLLBACK=PASS || echo ROLLBACK=FAILED_CHECK_SERVICE
  fi
  [[ -z "$STAGE" || ! -d "$STAGE" ]] || rm -rf -- "$STAGE"
  [[ -z "$ENV_STAGE" || ! -e "$ENV_STAGE" ]] || rm -f -- "$ENV_STAGE"
  rm -f "$API/.next-$$" "$API/.rollback-$$"
  exit "$rc"
}
trap rollback EXIT

echo '=== 1. BUILD MINIMAL IMMUTABLE RELEASE ==='
STAGE="$(mktemp -d "$API/releases/.compat-storage-XXXXXXXX")"
cp -a "$PREVIOUS/." "$STAGE/"
git show "$HEAD_SHA:backend/rundeck_prod_monthly_storage.py" > "$STAGE/backend/rundeck_prod_monthly_storage.py"
git show "$HEAD_SHA:backend/tests/test_prod_storage_df_avail_contract.py" > "$STAGE/backend/tests/test_prod_storage_df_avail_contract.py"
chmod 755 "$STAGE"
cmp -s <(git show "$HEAD_SHA:backend/rundeck_prod_monthly_storage.py") "$STAGE/backend/rundeck_prod_monthly_storage.py" || die PATCH_MISMATCH

echo '=== 2. PRE-CUTOVER TESTS ==='
(
  cd "$STAGE"
  PYTHONDONTWRITEBYTECODE=1 "$PY" -m unittest -q \
    backend.tests.test_prod_storage_df_avail_contract \
    backend.tests.test_rundeck_prod_compat_api \
    backend.tests.test_rundeck_infra
)
echo PRE_CUTOVER_QA=PASS

echo '=== 3. BACKUP AND STAGE ENV MAPPING ==='
cp -a "$ENV" "$ENV_BACKUP"
ENV_STAGE="$(mktemp /etc/sphere/.rundeck-prod-env-XXXXXXXX)"
cp -a "$ENV" "$ENV_STAGE"
printf '\n%s\n' \
  'SPHERE_MONTHLY_STORAGE_MOUNTS='"'"'{"File System OS":{"host":"AOPH1PAPPDC","mount":"/"},"FS SAP Archive":{"host":"AOPH1PAPPDC","mount":"/SAP_ARCH"},"Archive INTF":{"host":"AOPH1PAPPDC","mount":"/ArchiveINTF"},"INTF":{"host":"AOPH1PAPPDC","mount":"/INTF"}}'"'" \
  >> "$ENV_STAGE"
[[ "$(stat -c '%a %U:%G' "$ENV_STAGE")" == "640 root:sphere" ]] || die ENV_STAGE_PERMISSIONS
[[ "$(grep -c '^SPHERE_MONTHLY_STORAGE_MOUNTS=' "$ENV_STAGE")" == 1 ]] || die MAPPING_DUPLICATED

echo '=== 4. ACTIVATE API ONLY ==='
mv -T "$STAGE" "$RELEASE"
STAGE=''
MUTATED=1
mv -f "$ENV_STAGE" "$ENV"
ENV_STAGE=''
ln -s "$RELEASE" "$API/.next-$$"
mv -Tf "$API/.next-$$" "$CURRENT"
systemctl restart "$SERVICE"
ready=0
for i in $(seq 1 40); do
  if systemctl is-active --quiet "$SERVICE" &&
     curl --noproxy '*' -fsS --max-time 3 http://127.0.0.1:8092/health >/dev/null 2>&1; then ready=1; break; fi
  sleep 1
done
[[ "$ready" == 1 ]] || die API_NOT_READY

echo '=== 5. SOURCE-PROVENANCE CONTRACT SMOKE ==='
"$PY" - <<'PY'
from urllib.request import urlopen
import json
base='http://127.0.0.1:8092'
mounts={'File System OS':'/','FS SAP Archive':'/SAP_ARCH','Archive INTF':'/ArchiveINTF','INTF':'/INTF'}
for qs,expected in (
    ('month=2026-11&week_start=2026-11-02','EXPLICIT'),
    ('month=2026-10&week_start=2026-10-26','NOT_RETAINED')):
    with urlopen(base+'/infra/monthly-storage?'+qs, timeout=120) as response:
        assert response.status==200
        d=json.load(response)
    assert d['configured_categories']==4
    assert d['source_rows']>0
    items={r['category']:r for r in d['items']}
    assert set(items)==set(mounts)
    for category,mount in mounts.items():
        r=items[category]
        assert r['status']=='COLLECTED',(category,r)
        assert (r['host'],r['mount_point'])==('AOPH1PAPPDC',mount)
        assert r['availability_source']==expected,(category,r)
        free=r['free_bytes']
        if expected=='EXPLICIT':
            assert isinstance(free,(int,float)) and 0<=free<=r['total_bytes'],(category,free)
        else:
            assert free is None,(category,free)
    print('PERIOD='+qs,'SOURCE='+expected,'RESULT=PASS')
for endpoint in ('/health','/collections/latest','/availability/latest'):
    with urlopen(base+endpoint, timeout=20) as response:
        assert response.status==200
print('PROD_STORAGE_CONTRACT=PASS')
PY
[[ "$(readlink -f "$CURRENT")" == "$RELEASE" ]] || die API_LINK_DRIFT
[[ "$(readlink -f /opt/sphere-rundeck-dev/current)" == "$DEV_API" ]] || die DEV_API_CHANGED
[[ "$(readlink -f /var/www/sphere-dev/current)" == "$DEV_UI" ]] || die DEV_UI_CHANGED
[[ "$(readlink -f /var/www/sphere.astraotoparts.co.id/current)" == "$PROD_UI" ]] || die PROD_UI_CHANGED
[[ "$(sha256sum "$PROD_UI/index.html" | awk '{print $1}')" == "$PROD_WEB_HASH" ]] || die PROD_UI_HASH_CHANGED
echo "FINAL=PASS PROD_STORAGE_EXPLICIT=TRUE PROD_SOURCE_SHA=$HEAD_SHA"
echo "BACKEND_RELEASE=$RELEASE"
echo "PROD_ENV_BACKUP=$ENV_BACKUP"
echo "ROLLBACK_BACKEND=$PREVIOUS"
echo "PROD_UI=UNCHANGED DEV=UNCHANGED DB_MIGRATION=NONE COLLECTORS=UNCHANGED"
