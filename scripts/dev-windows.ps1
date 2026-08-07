# =====================================================================
# 🚀 dev-windows.ps1 — Démarrage local Windows pour qoe.fi
# =====================================================================
# Lance les services nécessaires pour que qoe.test réponde localement :
# - PostgreSQL + Redis via Docker Compose
# - Caddy avec Caddyfile.dev
# - pnpm dev pour les apps Next.js + API
# =====================================================================

$ErrorActionPreference = "Stop"

$env:NEXT_PUBLIC_DEV_TENANT_SUFFIX = "lvh.me"

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Start-CaddyLocal {
    Write-Host "Démarrage de Caddy local..."
    caddy start --config Caddyfile.dev | Out-Null
}

function Start-CaddyDocker {
    Write-Host "Démarrage de Caddy via Docker..."

    $containerName = "qoefi-dev-caddy"
    $tempCaddyfile = Join-Path $env:TEMP "Caddyfile.dev.qoefi.tmp"
    $caddyfileContent = Get-Content (Join-Path $root "Caddyfile.dev") -Raw
    $caddyfileContent = $caddyfileContent -replace 'reverse_proxy localhost:', 'reverse_proxy host.docker.internal:'
    Set-Content -Path $tempCaddyfile -Value $caddyfileContent -NoNewline

    $existing = docker ps -a --filter "name=^/$containerName$" --format "{{.Names}}"
    if ($existing) {
        docker rm -f $containerName | Out-Null
    }

    docker run -d `
        --name $containerName `
        -p 80:80 `
        -p 443:443 `
        -v "${tempCaddyfile}:/etc/caddy/Caddyfile:ro" `
        caddy:2-alpine | Out-Null
}

if (Get-Command caddy -ErrorAction SilentlyContinue) {
    Start-CaddyLocal
} elseif (Get-Command docker -ErrorAction SilentlyContinue) {
    Start-CaddyDocker
} else {
    throw "Ni Caddy ni Docker ne sont disponibles. Installe l'un des deux, puis relance: pnpm dev:win"
}

Write-Host "[1/3] Démarrage de Postgres + Redis + Meilisearch..."
docker compose -f docker-compose.dev.yml up -d db redis meilisearch

Write-Host "[2/3] Proxy local prêt..."

Write-Host "[3/3] Démarrage de pnpm dev..."
pnpm dev