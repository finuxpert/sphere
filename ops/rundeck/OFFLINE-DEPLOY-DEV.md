# SPHERE DEV: offline artifact deployment

The production branch and its deployment remain unchanged.

## Laptop (Windows PowerShell)

Install GitHub CLI and OpenSSH, then authenticate once using `gh auth login`.
Ensure SSH access to JAHSVR-SPHERE over corporate LAN or VPN.

When the **latest** `SPHERE DEV UI QA` run is green:

```powershell
powershell -ExecutionPolicy Bypass -File .\ops\rundeck\push-dev-offline.ps1 -Server root@10.14.90.79
```

This command downloads the exact QA-built release from GitHub Actions to a
temporary laptop directory, validates the SHA256 hash, SCPs it over internal
SSH, invokes the remote deployer, and removes local and remote staging.
The server itself never calls GitHub, npm or PyPI.

## Server contract

The runner checks the source SHA against a local Git bundle, refuses stale or
non-fast-forward sources, checks the DEV migration guard, verifies the prebuilt
`dist` identity, and delegates to the existing rollback-capable
`deploy-dev.sh`. Python requirements that change install exclusively from the
packaged wheelhouse. The Nginx PROD routing and hashes are revalidated by the
existing deployment script.

The active DEV release and the last configured number of releases stay for
rollback; disposable tarballs, unpacked staging and prebuilt source `dist`
are removed after the attempt. The most recent diagnostic log remains at
`/tmp/sphere-dev-offline-last.log`.

Do not execute `release-dev-fast.sh` on an offline host: it still uses
`git fetch origin`. CI must be green for the current DEV SHA; older successful
artifacts must not silently replace a failed latest run.

## First-time setup

A laptop or approved internal deployment machine needs access to GitHub and
SSH into the internal server. OpenSSH permissions and host key verification
must be configured normally. No inbound public internet port is required.
The GitHub Actions runner builds Linux x86_64 Python 3.12 dependency wheels.
If server Python/platform is incompatible, dependency installation fails
closed and should be resolved with a matching runner/runner platform.

Security: GitHub Actions archive integrity uses SHA256 checksums for accidental
corruption; it is not a standalone digital signature. Download it only from
the authenticated, successful repository workflow and use restricted SSH access.
