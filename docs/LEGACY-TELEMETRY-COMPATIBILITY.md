# Legacy Telemetry Compatibility

This document records historical telemetry markers that remain supported only for parser compatibility.

They are not current SPHERE product naming.

## Why this document exists

Older WP-SCOUT/Daily Check logs may contain enhanced Linux telemetry using historical `RCA-EXT` markers.

The active LOG parser can still consume these fields when present. Existing retained evidence must remain readable even though new product/documentation naming uses SPHERE terminology.

Do not rename a historical on-wire marker if doing so would break already-retained evidence or an already-deployed collector protocol. New user-facing files, features, and documentation should use SPHERE naming.

## Historical enhanced block

Legacy evidence may contain data such as:

- host CPU I/O Wait
- Linux PSI signals
- process PSS/private/shared memory
- WCHAN
- process I/O counters
- major faults
- process state

Missing or permission-denied values remain unavailable. They must not be synthesized as zero.

## Current collector compatibility script

The repository retains:

`ops/wp-scout-sphere-telemetry-v13.sh`

The filename/script exists for compatibility with the deployed evidence format. Do not treat the historical version number or `RCA-EXT` protocol marker as the current SPHERE product version.

## Interpretation rules

Enhanced telemetry may support deterministic classifications such as I/O contention, memory pressure/blocking, CPU saturation, resource consumer, memory consumer, I/O consumer, blocked workload, mixed evidence, or error activity.

These classifications are investigation signals.

They do not by themselves prove root cause.

## Correlation boundary

Enhanced process/host evidence is correlated to the relevant SAP workload snapshot only when host/time mapping is valid.

The parser must preserve:

- host attribution checks
- timestamp/context checks
- missing-data semantics
- source provenance
- backward compatibility with legacy logs

When attribution is invalid or incomplete, the UI must withhold or qualify the affected metric rather than silently assigning it to another host/workload.

## Error evidence

Historical telemetry can include SAP error/short-dump related signals and deterministic error categories.

Error presence alone does not prove that the error caused the performance issue.

## New development rule

For new collector/protocol work:

- prefer SPHERE terminology
- prefer semantic filenames
- document the protocol independently of a UI release number
- preserve backward compatibility only where active retained evidence requires it
- never replace missing evidence with fabricated values
