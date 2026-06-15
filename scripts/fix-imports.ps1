# =====================================================================
# 🔧 fix-imports.ps1 — Remplace les imports @/lib/... en @qoe/...
# =====================================================================
# Usage : powershell -ExecutionPolicy Bypass -File scripts/fix-imports.ps1
# =====================================================================

$replacements = @(
    @{ from = '@/lib/db'; to = '@qoe/db/client' }
    @{ from = '@/lib/supabase/server'; to = '@qoe/supabase/server' }
    @{ from = '@/lib/supabase/client'; to = '@qoe/supabase/client' }
    @{ from = '@/lib/supabase/middleware'; to = '@qoe/supabase/middleware' }
    @{ from = '@/lib/utils'; to = '@qoe/utils' }
    @{ from = '@/lib/safe-action'; to = '@qoe/auth/safe-action' }
    @{ from = '@/lib/analytics'; to = '@qoe/analytics' }
    @{ from = '@/lib/cached-queries'; to = '@qoe/db/cached-queries' }
    @{ from = '@/lib/sanitize'; to = '@qoe/utils/sanitize' }
    @{ from = '@/lib/i18n'; to = '@qoe/i18n' }
    @{ from = '@/lib/ai'; to = '@qoe/utils/ai' }
    @{ from = '@/lib/animations/motion-profiles'; to = '@/lib/animations/motion-profiles' } # reste local
)

$files = Get-ChildItem -Path 'apps' -Recurse -Include *.ts,*.tsx |
    Where-Object { $_.FullName -notmatch 'node_modules|\.next|dist' }

$totalModified = 0

foreach ($file in $files) {
    $content = Get-Content $file.FullName -Raw
    if (-not $content) { continue }
    $original = $content
    foreach ($r in $replacements) {
        $content = $content.Replace($r.from, $r.to)
    }
    if ($content -ne $original) {
        Set-Content -Path $file.FullName -Value $content -NoNewline
        $totalModified++
        Write-Host "MODIFIED: $($file.FullName)" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Total files modified: $totalModified" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
