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
