# Comprobaciones locales antes de PR (Windows PowerShell)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..\backend

Write-Host "cargo fmt --check" -ForegroundColor Cyan
cargo fmt --check
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "cargo clippy" -ForegroundColor Cyan
cargo clippy -- -D warnings
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "cargo check" -ForegroundColor Cyan
cargo check
exit $LASTEXITCODE
