# Comprobaciones locales antes de PR (Windows PowerShell)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..\mobile

Write-Host "npm run typecheck" -ForegroundColor Cyan
npm run typecheck
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "npm run lint" -ForegroundColor Cyan
npm run lint
exit $LASTEXITCODE
