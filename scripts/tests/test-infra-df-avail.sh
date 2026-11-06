#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
FORMAT="$ROOT/ops/rundeck/format-df-filesystems-v1.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
cat > "$TMP/valid" <<'DF'
Filesystem Type 1024-blocks Used Available Capacity Mounted on
/dev/mapper/os_vg-os_lv btrfs 83886080 63048892 20837188 76% /
/dev/mapper/os_vg-os_lv btrfs 83886080 63048892 20837188 76% /.snapshots
/dev/mapper/SAPARCH-SAPARCH xfs 1649922052 1038484488 612945320 63% /SAP_ARCH
/dev/mapper/ArchiveINTF-ArchiveINTF xfs 752609284 413036372 339572912 55% /ArchiveINTF
/dev/mapper/intf_vg-intf_lv xfs 838742020 674006816 164735204 81% /INTF
10.14.55.95:/INTF/ nfs 112139264 79837184 32302080 72% /INTF_AOQ
DF
bash "$FORMAT" < "$TMP/valid" > "$TMP/output"
[ "$(wc -l < "$TMP/output")" -eq 6 ]
grep -Fq $'filesystem\t/dev/mapper/os_vg-os_lv\tbtrfs\t83886080\t63048892\t76\t/\tavail_kb=20837188' "$TMP/output"
grep -Fq $'filesystem\t/dev/mapper/SAPARCH-SAPARCH\txfs\t1649922052\t1038484488\t63\t/SAP_ARCH\tavail_kb=612945320' "$TMP/output"
grep -Fq $'filesystem\t10.14.55.95:/INTF/\tnfs\t112139264\t79837184\t72\t/INTF_AOQ\tavail_kb=32302080' "$TMP/output"
# No guessing: the 'Available' column can differ from Size - Used.
cat > "$TMP/reserved" <<'DF'
Filesystem Type 1024-blocks Used Available Capacity Mounted on
/dev/reserved xfs 1000 600 350 64% /reserved
DF
bash "$FORMAT" < "$TMP/reserved" > "$TMP/reserved.out"
grep -Fq $'avail_kb=350' "$TMP/reserved.out"
! grep -Fq $'avail_kb=400' "$TMP/reserved.out"
# A malformed later row must not cause a partial section to appear.
cat >> "$TMP/valid" <<'DF'
invalid row bogus
DF
if bash "$FORMAT" < "$TMP/valid" > "$TMP/error.out" 2> "$TMP/error.err"; then
  echo 'FAIL=INVALID_ROW_ACCEPTED' >&2; exit 1
fi
[ ! -s "$TMP/error.out" ]
grep -Fq 'SPHERE_FS_FORMAT_ERROR=INVALID_DF_ROW_LINE_' "$TMP/error.err"
if printf 'unexpected header\n' | bash "$FORMAT" > "$TMP/badheader.out" 2>/dev/null; then
  echo 'FAIL=INVALID_HEADER_ACCEPTED' >&2; exit 1
fi
[ ! -s "$TMP/badheader.out" ]
echo 'PASS=FS_V1_DF_AVAIL_FORMATTER FULL_MOUNT_PARITY=TRUE SOURCE_AVAIL=TRUE FAIL_CLOSED=TRUE'
