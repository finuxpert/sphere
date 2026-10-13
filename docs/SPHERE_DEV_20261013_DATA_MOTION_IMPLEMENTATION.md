# SPHERE DEV — Data integrity and restrained motion (13 October 2026)

Scope: GitHub branch `rundeck-sphere-dev` only. This commit does **not** deploy the server, migrate a database, or change production.

## Changes
- Per-APP trend samples now insert an explicit `null` gap whenever the APP has a missing retained bucket. Never interpolate or create a zero. The global collection gap band still denotes population-level missing collection time, not an SAP outage.
- Collection gap labels carry dates at both ends, including same-day gaps.
- Workload Health uses full-backend-population summary counts from a verified `FULL_EVALUATED_POPULATION` API response. The UI shows an accessible proportion bar; the Review tab remains the route to individual evaluated workloads. Eliminates the 400 + 1 dot pagination without changing classification or SM37 semantics.
- Adds limited CSS hover motion, with print and reduced-motion opt-out; telemetry values never pulse or count up.

## Required DEV checks (on JAHSVR-SPHERE)
1. Verify working branch `rundeck-sphere-dev` and clean worktree before fetching.
2. Run `npm run qa:trend-focus`, `npm run qa:unified-cockpit`, `npm run qa:cockpit`, `npm run qa`, then `npm run qa:visual`.
3. Compare sample counts and dates for CPU/RAM/Load by APP against the exact saved collection API/DB. Verify missing buckets and 1D workload counts.
4. Use the project's guarded DEV deploy command only after passing QA. Keep PROD unchanged. Record SOURCE_SHA / ARTIFACT_SHA and rollback evidence.

## Not covered by this commit
Direct verification against DEV runtime API/DB, filesystem device/mount identity, 190-observation source coverage, Android visual tests, and full 44-item redesign. These must not be recorded as PASS until run on the server.
