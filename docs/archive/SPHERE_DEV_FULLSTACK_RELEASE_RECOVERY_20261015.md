# DEV full-stack release recovery — 15 October 2026

> **Historical incident record.** Do not use the recovery command below as the current DEV release procedure. Follow [Rundeck Development](../operations/rundeck-development.md) for the active guarded release and migration decision.

## Evidence and root cause

- Public DEV web pointed to `81976044c4f287b9152e70a15b0decef5caf2ed0`.
- DEV API pointed to `f302cba65e4c80bc4238e3e1443471c4519fca8e`.
- Network `network_rx` returned HTTP 422 with pattern `^(cpu|ram|load|iowait|swap|wp)$`. Custom `range=custom` returned 422; `/history/window` returned 404.
- The installed `sphere deploy dev` used the web-only CLI no-op when the web SHA was already current. It did **not** prove the DEV API was running the matching source SHA.
- `/tmp/sphere-dev-release-last.log` showed a prior QA failure in `rundeck-current-workload-coverage.test.mjs`: a static assertion for old copy `Search ${rows.length} observations`, whereas the current component labels search `Search ${rows.length} loaded jobs and programs`.

## Code repair

- Route the **source** `sphere-cli.sh` DEV command to the guarded full-stack release. Production CLI behavior remains frontend-only and approval-gated.
- Align the stale search-copy regression assertion with the actual accessible label. Keep the per-APP request, collection identity, total count and pagination safeguards intact.
- Require local and public Network RX/TX smoke AND local and public exact Custom CPU/RAM/Network and `/history/window` smoke before DEV release success. No-op release checks must verify these API contracts too.
- Add dispatch/contract regression tests to the mandatory frontend QA.

## Server execution

If the installed `sphere` entry point is still an older copy, **do not rely on it** for the first recovery. Refresh source and run the guarded script directly:

```bash
cd /root/rundeck-sphere-dev
test "$(git branch --show-current)" = rundeck-sphere-dev
test -z "$(git status --porcelain)"
git fetch origin rundeck-sphere-dev
git merge --ff-only origin/rundeck-sphere-dev
bash ops/rundeck/release-dev-fast.sh
```

The script runs Node QA/build, Python tests, guarded release, backend service restart, local/public API smoke and PROD invariants. It must print `FINAL=PASS` to count as successful.

After success, verify both DEV symlinks point to the exact HEAD and run smoke:

```bash
readlink -f /opt/sphere-rundeck-dev/current
readlink -f /var/www/sphere-dev/current
bash ops/rundeck/smoke-network-trends-dev.sh
bash ops/rundeck/smoke-custom-window-dev.sh
```

For future convenience, inspect `type -a sphere` and update the installed CLI entrypoint deliberately only after confirming its real path and the source content. Editing the GitHub script does not automatically replace an installed copy.

If a release fails, capture the `FINAL=FAIL STAGE` line and `tail -n 120 /tmp/sphere-dev-release-last.log`. Do not bypass QA or force a backend symlink; restore or retain the previous DEV release as the guarded script prescribes. Do not deploy PROD.
