# =====================================================================
# 🧹 cleanup-fantoms.ps1 — Supprime les re-exports fantômes
# =====================================================================
# 📖 Supprime tous les fichiers dans apps/console/src/ qui sont des
#    re-exports vers src/app/... (legacy supprimé).
# =====================================================================

$base = "d:\Files\DEV\Main\qoe.fi\apps\console\src"
$count = 0

# Fichiers fantômes identifiés
$fantoms = @(
    # components/admin
    "$base\components\admin\CommandPalette.tsx"
    "$base\components\admin\AdminSidebar.tsx"
    # components/feed
    "$base\components\feed\MicroPostComposer.tsx"
    "$base\components\feed\HomeWidgets.tsx"
    "$base\components\feed\FeedTabsHeader.tsx"
    "$base\components\feed\FeedSidebarWidgets.tsx"
    "$base\components\feed\FeedDashboard.tsx"
    "$base\components\feed\ExpandedPostView.tsx"
    "$base\components\feed\actions.ts"
    # app/(creator)/dashboard
    "$base\app\(creator)\dashboard\settings\SettingsForm.tsx"
    "$base\app\(creator)\dashboard\settings\actions.ts"
    "$base\app\(creator)\dashboard\audience\data-table.tsx"
    "$base\app\(creator)\dashboard\articles\[id]\EditorWrapper.tsx"
    "$base\app\(creator)\dashboard\articles\new\new-article-client.tsx"
    "$base\app\(creator)\dashboard\articles\[id]\edit-article-client.tsx"
    "$base\app\(creator)\dashboard\audience\columns.tsx"
    "$base\app\(creator)\dashboard\articles\actions.ts"
    "$base\app\(creator)\dashboard\audience\ClientActions.tsx"
    "$base\app\(creator)\dashboard\audience\actions\block.ts"
    "$base\app\(creator)\dashboard\analytics\AnalyticsDashboard.tsx"
    # app/(reader)/onboarding (lib/ai manquant)
    "$base\app\(reader)\onboarding\OnboardingFlow.tsx"
    # app/(admin)/admin/users/[id]
    "$base\app\(admin)\admin\users\[id]\page.tsx"
)

foreach ($f in $fantoms) {
    if (Test-Path $f) {
        Remove-Item $f -Force -ErrorAction SilentlyContinue
        Write-Host "DELETED: $f"
        $count++
    }
}

# Vérifier les composants (s'ils ne sont importés par personne, supprimer le dossier vide)
$dirs = @(
    "$base\components\admin"
    "$base\components\feed"
)
foreach ($d in $dirs) {
    $files = Get-ChildItem $d -File -ErrorAction SilentlyContinue
    if ($files.Count -eq 0) {
        # On garde, peut servir plus tard
        Write-Host "EMPTY (kept): $d"
    } else {
        Write-Host "HAS FILES: $d"
    }
}

Write-Host ""
Write-Host "=== Cleanup done. $count files deleted. ==="
