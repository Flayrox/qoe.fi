# Fix imports dans apps/web/
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
    # Components
    @{ from = '@/components/ui/SocialIcon'; to = '@qoe/ui/SocialIcon' }
    @{ from = '@/components/ui/TenantHeader'; to = '@qoe/ui/TenantHeader' }
    @{ from = '@/components/ui/SubscribeForm'; to = '@qoe/ui/SubscribeForm' }
    @{ from = '@/components/ui/PaywallCut'; to = '@/components/ui/PaywallCut' }
    @{ from = '@/components/ui/ReaderActions'; to = '@/components/ui/ReaderActions' }
    @{ from = '@/components/ui/TextHighlighter'; to = '@/components/ui/TextHighlighter' }
    @{ from = '@/components/layout/NavbarPremium'; to = '@/components/layout/NavbarPremium' }
    @{ from = '@/components/layout/Footer'; to = '@/components/layout/Footer' }
    # Tolgee (legacy)
    @{ from = '@/tolgee'; to = '@qoe/i18n' }
    # Tolgee TolgeeNextProvider import
    @{ from = '@/components/ui/tooltip'; to = '@qoe/ui/tooltip' }
)

$files = Get-ChildItem -Path 'apps\web' -Recurse -Include *.ts,*.tsx |
    Where-Object { $_.FullName -notmatch 'node_modules|\.next|dist' }

$total = 0
foreach ($file in $files) {
    $content = Get-Content $file.FullName
    $joined = $content -join "`n"
    $original = $joined
    foreach ($r in $replacements) {
        $joined = $joined.Replace($r.from, $r.to)
    }
    if ($joined -ne $original) {
        Set-Content -Path $file.FullName -Value $joined
        $total++
        Write-Host "MODIFIED: $($file.FullName)"
    }
}
Write-Host ""
Write-Host "=== Total: $total ==="
