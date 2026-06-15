# =====================================================================
# 🧹 dedupe-ui.ps1 — Déduplique les composants UI partagés
# =====================================================================
# 📖 Met à jour les imports vers @qoe/ui et supprime les doublons.
# =====================================================================

$root = "d:\Files\DEV\Main\qoe.fi"

# === 1. apps/console/src/components/ui/TenantHeader.tsx ===
$consoleTh = Join-Path $root "apps\console\src\components\ui\TenantHeader.tsx"
if (Test-Path $consoleTh) {
    $c = Get-Content $consoleTh -Raw
    $c = $c -replace "import \{ SocialIcon \} from './SocialIcon';", "import { SocialIcon } from '@qoe/ui';"
    Set-Content $consoleTh $c -NoNewline
    Write-Host "FIXED: $consoleTh"
}

# === 2. apps/web — pages qui importent les composants depuis @/components/ui ===
$webFiles = @(
    "apps\web\src\app\tenant\[domain]\page.tsx"
    "apps\web\src\app\tenant\[domain]\article\[slug]\page.tsx"
)
foreach ($rel in $webFiles) {
    $path = Join-Path $root $rel
    if (Test-Path $path) {
        $c = Get-Content $path -Raw
        $c = $c -replace 'from "@/components/ui/SocialIcon"', 'from "@qoe/ui"'
        $c = $c -replace 'from "@/components/ui/TenantHeader"', 'from "@qoe/ui"'
        $c = $c -replace 'from "@/components/ui/SubscribeForm"', 'from "@qoe/ui"'
        Set-Content $path $c -NoNewline
        Write-Host "FIXED: $rel"
    }
}

# === 3. Supprimer les doublons ===
$duplicates = @(
    "apps\console\src\components\ui\SocialIcon.tsx"
    "apps\console\src\components\ui\TenantHeader.tsx"
    "apps\console\src\components\ui\SubscribeForm.tsx"
    "apps\web\src\components\ui\SocialIcon.tsx"
    "apps\web\src\components\ui\TenantHeader.tsx"
    "apps\web\src\components\ui\SubscribeForm.tsx"
)
foreach ($rel in $duplicates) {
    $path = Join-Path $root $rel
    if (Test-Path $path) {
        Remove-Item $path -Force
        Write-Host "DELETED: $rel"
    }
}

Write-Host ""
Write-Host "=== Verification ==="
Write-Host "Remaining in apps/console/src/components/ui:"
Get-ChildItem (Join-Path $root "apps\console\src\components\ui") -File -ErrorAction SilentlyContinue | Select-Object Name
Write-Host ""
Write-Host "Remaining in apps/web/src/components/ui:"
Get-ChildItem (Join-Path $root "apps\web\src\components\ui") -File -ErrorAction SilentlyContinue | Select-Object Name
Write-Host ""
Write-Host "Now in packages/ui/src/:"
Get-ChildItem (Join-Path $root "packages\ui\src") -File | Select-Object Name
