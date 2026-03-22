# Instala el enlazador MSVC que Rust usa en Windows (no escribes C++; es dependencia del toolchain).
# Uso:
#   .\install-windows-rust-deps.ps1              → solo comprueba y muestra instrucciones
#   .\install-windows-rust-deps.ps1 -Install     → ejecuta winget (consola como administrador)
param(
    [switch]$Install
)

$ErrorActionPreference = "Stop"

function Test-LinkerAvailable {
    $link = Get-Command "link.exe" -ErrorAction SilentlyContinue
    if ($link) {
        Write-Host "OK: link.exe en $($link.Source)" -ForegroundColor Green
        return $true
    }
    return $false
}

if (Test-LinkerAvailable) {
    Write-Host "Ya puedes compilar Rust con la toolchain msvc (cargo build / cargo run)." -ForegroundColor Green
    exit 0
}

Write-Host "No se encontró link.exe (Visual C++ Build Tools)." -ForegroundColor Yellow
Write-Host "`nInstala con winget (recomendado, PowerShell como Administrador):" -ForegroundColor Cyan
Write-Host @'
  winget install --id Microsoft.VisualStudio.2022.BuildTools --override `
    "--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended" `
    --accept-source-agreements --accept-package-agreements
'@
Write-Host "`nO descarga manual: https://visualstudio.microsoft.com/visual-cpp-build-tools/`n" -ForegroundColor Cyan

if (-not $Install) {
    Write-Host "Para intentar la instalación automática: .\install-windows-rust-deps.ps1 -Install" -ForegroundColor Green
    exit 1
}

try {
    winget install --id Microsoft.VisualStudio.2022.BuildTools --override `
        "--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended" `
        --accept-source-agreements --accept-package-agreements
} catch {
    Write-Host "winget falló: $_" -ForegroundColor Red
    exit 1
}

Write-Host "`nCierra y vuelve a abrir la terminal, luego: cd backend; cargo build" -ForegroundColor Green
