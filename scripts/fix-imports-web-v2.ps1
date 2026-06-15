# Fix imports dans apps/web/ - avec support des [brackets]
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
    @{ from = '@/components/layout/NavbarPremium'; to = '@qoe/ui/NavbarPremium' }
    @{ from = '@/components/layout/Footer'; to = '@qoe/ui/Footer' }
    @{ from = '@/tolgee'; to = '@qoe/i18n' }
    @{ from = '@/components/ui/tooltip'; to = '@qoe/ui/tooltip' }
    @{ from = '@/components/sections/'; to = '@qoe/ui/sections/' }
)

# Utilise Get-ChildItem -LiteralPath pour supporter les [brackets]
$files = Get-ChildItem -LiteralPath 'D:\Files\DEV\Main\qoe.fi\apps\web' -Recurse -Include *.ts,*.tsx -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -notmatch 'node_modules|\.next|dist' }

$total = 0
foreach ($file in $files) {
    $content = Get-Content -LiteralPath $file.FullName -Raw
    if (-not $content) { continue }
    $original = $content
    foreach ($r in $replacements) {
        $content = $content.Replace($r.from, $r.to)
    }
    if ($content -ne $original) {
        Set-Content -LiteralPath $file.FullName -Value $content -NoNewline
        $total++
        Write-Host "MODIFIED: $($file.FullName)"
    }
}
Write-Host ""
Write-Host "=== Total: $total ==="
