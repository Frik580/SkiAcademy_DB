# Call from a local finish-feature.ps1 before git status:
# & (Join-Path $repoRoot "scripts/finish-feature-preflight.ps1") -Check:$SkipCommit
param([switch]$Check)

$ErrorActionPreference = "Stop"
$mode = if ($Check) { "--check" } else { "--write" }
& node (Join-Path $PSScriptRoot "syncTestManifest.mjs") $mode --require-trackable
if ($LASTEXITCODE -ne 0) {
    throw "Canonical test inventory preflight failed (exit $LASTEXITCODE)."
}
