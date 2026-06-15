# Fix imports dans apps/web/ - v3 (ne liste que les fichiers)
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
    @{ from = '@/components/ui/SocialIcon'; to = '@qoe/ui/SocialIcon' }
    @{ from = '@/components/ui/TenantHeader'; to = '@qoe/ui/TenantHeader' }
    @{ from = '@/components/ui/SubscribeForm'; to = '@qoe/ui/SubscribeForm' }
    @{ from = '@/components/ui/PaywallCut'; to = '@qoe/ui/PaywallCut' }
    @{ from = '@/components/ui/ReaderActions'; to = '@qoe/ui/ReaderActions' }
    @{ from = '@/components/ui/TextHighlighter'; to = '@qoe/ui/TextHighlighter' }
    @{ from = '@/components/layout/NavbarPremium'; to = '@/components/layout/NavbarPremium' }  # reste local
    @{ from = '@/components/layout/Footer'; to = '@/components/layout/Footer' }
    @{ from = '@/tolgee'; to = '@qoe/i18n' }
)

# Utilise -File (PowerShell 5+) qui ne matche QUE les fichiers
$files = Get-ChildItem -LiteralPath 'D:\Files\DEV\Main\qoe.fi\apps\web' -Recurse -File -Include *.ts,*.tsx -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -notmatch 'node_modules|\.next|dist' }

$total = 0
foreach ($file in $files) {
    try {
        $content = [System.IO.File]::ReadAllText($file.FullName)
    } catch {
        continue
    }
    $original = $content
    foreach ($r in $replacements) {
        $content = $content.Replace($r.from, $r.to)
    }
    if ($content -ne $original) {
        [System.IO.File]::WriteAllText($file.FullName, $content)
        $total++
        Write-Host "MODIFIED: $($file.FullName)"
    }
}
Write-Host ""
Write-Host "=== Total: $total ==="
