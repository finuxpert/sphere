# SPHERE DEV offline deploy from a Windows PowerShell laptop / internal host.
# Prerequisites: gh (authenticated), OpenSSH client, access to server over LAN/VPN.
param(
  [Parameter(Mandatory = $true)][string]$Server
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$repo = 'finuxpert/sphere'
$workflow = 'sphere-dev-ui-qa.yml'
$shaPattern = '^[0-9a-f]{40}$'
if ($Server -notmatch '^[a-zA-Z0-9_.@:-]+$') { throw 'Unsafe SSH server value' }
foreach ($tool in @('gh','ssh','scp')) {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
    throw "Missing $tool. Install and configure it on this laptop."
  }
}
& gh auth status 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Run gh auth login on the laptop first' }
$runsJson = & gh run list --repo $repo --workflow $workflow --branch rundeck-sphere-dev --limit 1 --json databaseId,headSha,status,conclusion
if ($LASTEXITCODE -ne 0) { throw 'Unable to read GitHub Actions run' }
$runs = @($runsJson | ConvertFrom-Json)
if ($runs.Count -ne 1 -or $runs[0].status -ne 'completed' -or $runs[0].conclusion -ne 'success') {
  throw 'Latest DEV CI run is not successful. Refusing older or unverified artifacts.'
}
$sha = [string]$runs[0].headSha
if ($sha -notmatch $shaPattern) { throw 'Unexpected Git SHA in Actions response' }
$runId = [string]$runs[0].databaseId
$artifactName = "sphere-dev-$sha"
$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("sphere-dev-" + [guid]::NewGuid().ToString('N'))
$remote = "/var/tmp/sphere-dev-$sha.tar.gz"
$uploaded = $false
New-Item -ItemType Directory -Path $tmp -Force | Out-Null
try {
  Write-Host "Downloading QA-verified artifact from CI $runId ($($sha.Substring(0,8)))"
  & gh run download $runId --repo $repo --name $artifactName --dir $tmp
  if ($LASTEXITCODE -ne 0) { throw 'GitHub artifact download failed' }
  $bundle = Join-Path $tmp "sphere-dev-$sha.tar.gz"
  $checksumFile = "$bundle.sha256"
  if (-not (Test-Path -LiteralPath $bundle) -or -not (Test-Path -LiteralPath $checksumFile)) {
    throw 'Missing release bundle or checksum from GitHub Actions'
  }
  $expected = ((Get-Content -LiteralPath $checksumFile -Raw).Trim() -split '\s+')[0].ToLowerInvariant()
  $actual = (Get-FileHash -LiteralPath $bundle -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($expected -notmatch '^[0-9a-f]{64}$' -or $expected -ne $actual) {
    throw 'SHA256 mismatch. Artifact rejected before transfer.'
  }
  Write-Host 'SHA256=PASS. Transferring via internal SSH (no GitHub access on JAHSVR-SPHERE).'
  & scp -o ConnectTimeout=10 $bundle "${Server}:$remote"
  if ($LASTEXITCODE -ne 0) { throw 'SCP failed' }
  $uploaded = $true
  # All interpolated shell arguments are SHA256/SHA-validated hex or fixed paths.
  $remoteCommand = "set -Eeuo pipefail; trap `"rm -f -- $remote`" EXIT; printf `"$expected  $remote\n`" | sha256sum -c -; tar -xOzf $remote ./release-dev-offline.sh | SPHERE_DEV_MIGRATION_DECISION=skip bash -s -- $remote"
  & ssh -o ConnectTimeout=10 $Server "bash -lc '$remoteCommand'"
  if ($LASTEXITCODE -ne 0) { throw 'Remote DEV deployment failed; inspect /tmp/sphere-dev-offline-last.log' }
  Write-Host "OFFLINE_DEPLOY=PASS SHA=$($sha.Substring(0,8)) PROD=UNCHANGED"
} finally {
  # Best effort even when activation fails. Remote also traps its own cleanup.
  if ($uploaded) { & ssh -o ConnectTimeout=5 $Server "rm -f -- $remote" 2>$null | Out-Null }
  Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
}
