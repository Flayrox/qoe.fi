# Fix les ré-exports cassés dans apps/console

$files = Get-ChildItem -LiteralPath 'D:\Files\DEV\Main\qoe.fi\apps\console' -Recurse -File -Include *.ts,*.tsx -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -notmatch 'node_modules|\.next|dist' }

$total = 0
foreach ($file in $files) {
    try {
        $content = [System.IO.File]::ReadAllText($file.FullName)
    } catch { continue }
    $original = $content

    # CSS global
    $content = $content.Replace('"../../../src/app/globals.css"', '"./globals.css"')

    # trackEvent n'existe pas dans @qoe/analytics, on remplace par trackServerEvent
    $content = $content.Replace('trackEvent', 'trackServerEvent')

    # use-mobile doit rester local
    $content = $content.Replace('"@/hooks/use-mobile"', '"@/hooks/use-mobile"')  # garde

    # @/components/ui/* (sidebar, button, etc.) restent locaux
    # Pas de changement

    if ($content -ne $original) {
        [System.IO.File]::WriteAllText($file.FullName, $content)
        $total++
        Write-Host "MODIFIED: $($file.FullName)"
    }
}
Write-Host ""
Write-Host "=== Total: $total ==="
