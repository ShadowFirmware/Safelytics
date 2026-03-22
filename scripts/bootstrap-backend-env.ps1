# Crea backend/.env desde .env.example y rellena secretos vacíos (JWT + KEY_ENCRYPTION).
# Edita DATABASE_URL, MXNE_ISSUER, etc. con tus valores reales.
$ErrorActionPreference = "Stop"
$backend = Join-Path $PSScriptRoot "..\backend" | Resolve-Path
$example = Join-Path $backend ".env.example"
$target = Join-Path $backend ".env"

if (-not (Test-Path $example)) {
    Write-Error "No existe $example"
}

if (-not (Test-Path $target)) {
    Copy-Item $example $target
    Write-Host "Creado $target" -ForegroundColor Green
} else {
    Write-Host "Ya existe $target (no se sobrescribe)" -ForegroundColor Yellow
}

$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$keyBytes = New-Object byte[] 32
$rng.GetBytes($keyBytes)
$hex = -join ($keyBytes | ForEach-Object { "{0:x2}" -f $_ })

$jwtBytes = New-Object byte[] 32
$rng.GetBytes($jwtBytes)
$jwtB64 = [Convert]::ToBase64String($jwtBytes)

$out = foreach ($line in (Get-Content $target -Encoding UTF8)) {
    if ($line -match '^JWT_SECRET=\s*$') {
        "JWT_SECRET=$jwtB64"
    } elseif ($line -match '^KEY_ENCRYPTION_SECRET=\s*$') {
        "KEY_ENCRYPTION_SECRET=$hex"
    } else {
        $line
    }
}

Set-Content -Path $target -Value $out -Encoding UTF8
Write-Host "Listo. Revisa DATABASE_URL y MXNE_ISSUER en $target" -ForegroundColor Green
