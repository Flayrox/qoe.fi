# Fix final des imports
$files = Get-ChildItem -LiteralPath 'D:\Files\DEV\Main\qoe.fi\apps\console' -Recurse -File -Include *.ts,*.tsx -ErrorAction SilentlyContinue
$total = 0
foreach ($file in $files) {
    try { $content = [System.IO.File]::ReadAllText($file.FullName) } catch { continue }
    $original = $content

    # Tolgee stubs (créer le fichier)
    $content = $content.Replace('"@/tolgee/server"', '"@qoe/i18n/server"')
    $content = $content.Replace('"@/tolgee/language"', '"@qoe/i18n"')
    $content = $content.Replace("'@/tolgee/server'", '"@qoe/i18n/server"')
    $content = $content.Replace("'@/tolgee/language'", '"@qoe/i18n"')

    # use-mobile
    $content = $content.Replace('"@/hooks/use-mobile"', '"../../hooks/use-mobile"')

    # cached-queries
    $content = $content.Replace('"@qoe/db/cached-queries"', '"../../lib/cached-queries"')

    # utils/ai
    $content = $content.Replace('"@qoe/utils/ai"', '"../../lib/ai"')

    # Tolgee fallback "use client" (n'est pas exporté)
    # On remplace par un simple useTranslate import
    $content = $content.Replace('"use client";\n\nimport { TolgeeNextProvider } from "@qoe/i18n/provider";', '"use client";')

    if ($content -ne $original) {
        [System.IO.File]::WriteAllText($file.FullName, $content)
        $total++
        Write-Host "MODIFIED: $($file.FullName)"
    }
}

# Fix aussi dans packages/auth
$authFile = 'D:\Files\DEV\Main\qoe.fi\packages\auth\src\current-user.ts'
if (Test-Path $authFile) {
    $content = [System.IO.File]::ReadAllText($authFile)
    $content = $content.Replace('"@qoe/supabase/server"', '"../supabase/src/server"')
    [System.IO.File]::WriteAllText($authFile, $content)
    Write-Host "MODIFIED: $authFile"
}

Write-Host ""
Write-Host "=== Total: $total ==="
