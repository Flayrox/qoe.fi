# =====================================================================
# 🧹 dedupe-prisma.ps1 v2 — Déduplique le schema Prisma
# =====================================================================
$root = "d:\Files\DEV\Main\qoe.fi"
$oldPrisma = Join-Path $root "prisma"
$newPrisma = Join-Path $root "packages\db\prisma"
$oldMigrations = Join-Path $oldPrisma "migrations"
$newMigrations = Join-Path $newPrisma "migrations"
$oldSeed = Join-Path $oldPrisma "seed.ts"
$newSeed = Join-Path $newPrisma "seed.ts"

# === 1. Déplacer les migrations ===
if (Test-Path $oldMigrations) {
    if (-not (Test-Path $newPrisma)) {
        New-Item -ItemType Directory -Path $newPrisma -Force | Out-Null
    }
    if (-not (Test-Path $newMigrations)) {
        New-Item -ItemType Directory -Path $newMigrations -Force | Out-Null
    }
    Copy-Item -Path "$oldMigrations\*" -Destination $newMigrations -Recurse -Force
    Write-Host "COPIED migrations to packages/db/prisma/migrations"
}

# === 2. Déplacer le seed ===
if (Test-Path $oldSeed) {
    Copy-Item -Path $oldSeed -Destination $newSeed -Force
    Write-Host "COPIED seed.ts to packages/db/prisma/seed.ts"
}

# === 3. Supprimer les doublons racine ===
if (Test-Path (Join-Path $oldPrisma "schema.prisma")) {
    Remove-Item (Join-Path $oldPrisma "schema.prisma") -Force
    Write-Host "DELETED: prisma/schema.prisma"
}
if (Test-Path $oldMigrations) {
    Remove-Item $oldMigrations -Recurse -Force
    Write-Host "DELETED: prisma/migrations"
}
if (Test-Path $oldSeed) {
    Remove-Item $oldSeed -Force
    Write-Host "DELETED: prisma/seed.ts"
}

# === 4. Vérification ===
Write-Host ""
Write-Host "=== Old prisma/ ==="
if (Test-Path $oldPrisma) {
    Get-ChildItem $oldPrisma -Force | Select-Object Name
} else {
    Write-Host "(removed)"
}
Write-Host ""
Write-Host "=== New packages/db/prisma/ ==="
if (Test-Path $newPrisma) {
    Get-ChildItem $newPrisma -Recurse -File | Select-Object FullName
}
