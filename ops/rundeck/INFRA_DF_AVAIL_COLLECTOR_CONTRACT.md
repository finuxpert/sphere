# Infrastructure collector: source-observed `df Avail` contract

**Scope:** SPHERE DEV reporting and future Rundeck Infrastructure observations.
No migration, backfill, SAP write, job activation, or PROD rollout is authorized by this document.

## Confirmed evidence, 6 Nov 2026

For Weekly 26 Oct–1 Nov 2026 WIB, `/infra/monthly-storage` returned
`source_rows=182369`. All four APP1 mapped filesystem categories were
`COLLECTED` but `availability_source=NOT_RETAINED` with `free_bytes=null`.
The last selected weekly infrastructure observation was
`2026-11-01T16:58:45+00:00`. These are **not** zero available bytes.

Historical positional collector lines use this contract:

```text
filesystem <device> <fstype> <size_kb> <used_kb> <used_pct> <mount>
```

The parser historically populated DB `avail_bytes` from `size_kb-used_kb`
for old positional lines. **That value is not source-observed `df Avail`**
and is deliberately excluded by `monthly_storage_evidence()`.

## Actual archived source contract confirmed on APP1

A read-only audit of
`/var/lib/sphere/infra-ingestion/archive/infra-rundeck-574765-AOPH1PAPPDC.log.gz`
found four relevant lines (columns are device, fs type, size_kb, used_kb,
used_pct, mount), with **no source `Avail` field**:

```text
filesystem /dev/mapper/os_vg-os_lv btrfs 83886080 63048892 76 /
filesystem /dev/mapper/SAPARCH-SAPARCH xfs 1649922052 1038484488 63 /SAP_ARCH
filesystem /dev/mapper/ArchiveINTF-ArchiveINTF xfs 752609284 413036372 55 /ArchiveINTF
filesystem /dev/mapper/intf_vg-intf_lv xfs 838742020 674006816 81 /INTF
```

The same archived output also includes duplicate Btrfs subvolume mounts, EFI,
other SAP mounts and NFS. A collector patch must preserve these existing
lines/categories, not switch to a four-mount-only collector.

### One-shot read-only preflight on the *SAP APP1 host*, not JAHSVR-SPHERE

```bash
LC_ALL=C df -PkT -- / /SAP_ARCH /ArchiveINTF /INTF |
awk '
  NR == 1 { next }
  NF != 7 || $3 !~ /^[0-9]+$/ || $4 !~ /^[0-9]+$/ ||
  $5 !~ /^[0-9]+$/ || $6 !~ /^[0-9]+%$/ {
    print "INVALID_DF_RECORD" > "/dev/stderr"
    bad = 1
    next
  }
  {
    pct=$6
    sub(/%$/, "", pct)
    printf "filesystem\\t%s\\t%s\\t%s\\t%s\\t%s\\t%s\\tavail_kb=%s\\n", \\
      $1,$2,$3,$4,pct,$7,$5
    n++
  }
  END { if (bad || n != 4) exit 2 }
'
```

This emits proposed records **only to stdout** and changes no job,
filesystem or database. The `df -PkT` output columns are
`Filesystem Type 1024-blocks Used Available Capacity Mounted on`.
The numeric `avail_kb` value therefore comes from the same `df`
observation (column 5) and is explicitly source-observed. Verify the
original job's exact command and full-mount output before editing it.

## Compatible extension for future Rundeck observations

Inspect the actual Rundeck Infrastructure Collector job definition and command
first. The job source is **not** in this SPHERE repository. Preserve its existing
host, mount, network, storage, timestamps, and section-marker contracts.

When the filesystem observation itself includes actual `df` 1K Available
blocks, append **one named field** to the **same filesystem record**:

```text
filesystem /dev/mapper/data_vg-intf xfs 104857600 33554432 68 /INTF avail_kb=69905000
```

The numeric example above is illustrative only: a real job must emit the actual
reported value, never a number calculated from `size_kb-used_kb`.

For GNU coreutils `df -PkT -- /INTF` on the target SAP/Linux node,
the data columns are filesystem, type, 1K-blocks, used, **available**,
use%, mounted-on. In a normal whitespace-delimited record the source
Available value is column 5; extraction must be confirmed against the actual
job's `df` flags and output. Prefer adding it to the existing single `df`
sample/parse, not running a second independent sampling command. Do not
extrapolate from `df -h`, estimated `total-used`, or a different filesystem.

The SPHERE parser supports `avail_kb=`, `available_kb=`,
`avail_bytes=`, and `available_bytes=` while preserving the V1 positional
format. These explicit fields are persisted in JSON `details`; backend
reporting verifies source provenance before emitting `free_bytes` and
`availability_source=EXPLICIT`. For legacy records it returns
`NOT_RETAINED`. No DB schema change is required.

## DEV rollout gates

1. Confirm current Rundeck job script and sample output; audit mount/device
   correspondence and column order on a non-production test job/node.
2. Review + approve the Rundeck job change separately. Changing the parser
   or UI alone **does not** modify the Rundeck job.
3. After a new read-only collector execution, check its archived raw log
   for `avail_kb=` on each mapped filesystem, and ensure the original V1
   envelope still parses.
4. Check `/infra/monthly-storage` for a period containing that fresh
   execution: each truly observed mount should yield
   `availability_source=EXPLICIT` and numeric `free_bytes`.
5. Keep earlier weeks/months `NOT_RETAINED` when no original source field
   exists. Never backfill from current `df` or legacy inferred `avail_bytes`.
6. Before any PROD promotion, check independent CI, rollback and existing
   polling schedules, including no accidental extra Rundeck execution.

If an explicit `df` availability field is missing, the browser and PDF show
**Not retained**, not **0 GB** or a derived capacity.
