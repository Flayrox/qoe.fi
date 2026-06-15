# Fix final ultra
$total = 0

# Fix 1: supabase/src/server (chemin relatif)
$authFile = 'D:\Files\DEV\Main\qoe.fi\packages\auth\src\current-user.ts'
$content = [System.IO.File]::ReadAllText($authFile)
$content = $content.Replace('"../supabase/src/server"', '"../../packages/supabase/src/server"')
[System.IO.File]::WriteAllText($authFile, $content)
Write-Host "FIXED auth"
$total++

# Fix 2: setLanguage n'existe pas dans @qoe/i18n, on l'enlève (placeholder)
$files = Get-ChildItem -LiteralPath 'D:\Files\DEV\Main\qoe.fi\apps\console' -Recurse -File -Include *.ts,*.tsx -ErrorAction SilentlyContinue
foreach ($file in $files) {
    try { $content = [System.IO.File]::ReadAllText($file.FullName) } catch { continue }
    $original = $content
    # Supprimer les imports setLanguage (n'existe pas)
    $content = $content.Replace('import { setLanguage } from "@qoe/i18n";' + "`n", '')
    $content = $content.Replace('import { setLanguage } from "@qoe/i18n"', '')
    $content = $content.Replace('setLanguage, ', '')
    $content = $content.Replace('const setLanguage = ', 'const _setLanguage = ')
    if ($content -ne $original) {
        [System.IO.File]::WriteAllText($file.FullName, $content)
        $total++
        Write-Host "FIXED: $($file.Name)"
    }
}

Write-Host ""
Write-Host "=== Total: $total ==="
