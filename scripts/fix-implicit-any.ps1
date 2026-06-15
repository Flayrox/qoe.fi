# =====================================================================
# 🔧 fix-implicit-any.ps1 — Ajoute : any aux params Prisma implicites
# =====================================================================
# Pour chaque fichier .tsx/.ts listé, on ajoute une annotation `: any`
# aux paramètres des callbacks Prisma qui sont implicitement any.
# =====================================================================

$root = "d:\Files\DEV\Main\qoe.fi"
$base = Join-Path $root "apps\console"

# Patterns à fixer (regex before => after)
$fixes = @{
    "src\app\(admin)\admin\config\page.tsx" = @(
        @{ Pattern = '\.map\(\(c\)'; Replace = '.map((c: any)' }
    )
    "src\app\(admin)\admin\frontend\page.tsx" = @(
        @{ Pattern = '\.map\(\(c\)'; Replace = '.map((c: any)' }
    )
    "src\app\(reader)\billing\page.tsx" = @(
        @{ Pattern = 'subscriptions\.map\(\(sub\)'; Replace = 'subscriptions.map((sub: any)' }
        @{ Pattern = 'walletTransactions\.map\(\(tx\)'; Replace = 'walletTransactions.map((tx: any)' }
    )
    "src\app\(reader)\highlights\page.tsx" = @(
        @{ Pattern = 'highlights\.map\(h =>'; Replace = 'highlights.map((h: any) =>' }
    )
    "src\app\(reader)\library\page.tsx" = @(
        @{ Pattern = 'bookmarks\.map\(\(b\)'; Replace = 'bookmarks.map((b: any)' }
    )
    "src\app\(reader)\onboarding\page.tsx" = @(
        @{ Pattern = 'configInterests\.value\.split\(",",\)\.map\(i =>'; Replace = 'configInterests.value.split(",").map((i: any) =>' }
        @{ Pattern = '\{ name, count \}\);'; Replace = '{ name, count }: any);' }
        @{ Pattern = '\.map\(\(name\)'; Replace = '.map((name: any)' }
    )
    "src\app\(reader)\settings\actions.ts" = @(
        @{ Pattern = '\.map\(\(f\)'; Replace = '.map((f: any)' }
        @{ Pattern = '\.map\(\(b\)'; Replace = '.map((b: any)' }
        @{ Pattern = '\.map\(\(h\)'; Replace = '.map((h: any)' }
        @{ Pattern = '\.map\(\(t\)'; Replace = '.map((t: any)' }
        @{ Pattern = '\.map\(\(p\)'; Replace = '.map((p: any)' }
        @{ Pattern = '\.map\(\(l\)'; Replace = '.map((l: any)' }
    )
    "src\app\(reader)\settings\page.tsx" = @(
        @{ Pattern = 'follows\.map\(\(f\)'; Replace = 'follows.map((f: any)' }
        @{ Pattern = 'subscribers\.map\(\(s\)'; Replace = 'subscribers.map((s: any)' }
        @{ Pattern = 'transactions\.map\(\(t\)'; Replace = 'transactions.map((t: any)' }
        @{ Pattern = 'bookmarks\.map\(\(b\)'; Replace = 'bookmarks.map((b: any)' }
    )
}

$count = 0
foreach ($relPath in $fixes.Keys) {
    $fullPath = Join-Path $base $relPath
    if (-not (Test-Path $fullPath)) {
        Write-Host "MISSING: $fullPath"
        continue
    }
    $content = Get-Content $fullPath -Raw
    $original = $content
    foreach ($fix in $fixes[$relPath]) {
        $content = $content -replace $fix.Pattern, $fix.Replace
    }
    if ($content -ne $original) {
        Set-Content $fullPath $content -NoNewline
        Write-Host "FIXED: $relPath"
        $count++
    } else {
        Write-Host "NO CHANGE: $relPath"
    }
}

Write-Host ""
Write-Host "=== $count files fixed ==="
