$WshShell = New-Object -ComObject WScript.Shell
$ShortcutPath = Join-Path ([Environment]::GetFolderPath("Desktop")) "Mercado Facil - ASSPEN.lnk"
$Shortcut = $WshShell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = "$PSScriptRoot\iniciar-sistema.bat"
$Shortcut.WorkingDirectory = "$PSScriptRoot"
$Shortcut.Description = "Sistema de Gestão de Vendas ASSPEN/MT"
# Tenta encontrar um ícone, se não houver usa o padrão do sistema
$IconPath = Join-Path $PSScriptRoot "public\favicon.ico"
if (Test-Path $IconPath) {
    $Shortcut.IconLocation = $IconPath
}
$Shortcut.Save()
Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "   ATALHO CRIADO NA AREA DE TRABALHO COM SUCESSO!   " -ForegroundColor Green
Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "Caminho: $ShortcutPath"
Write-Host "Target: $PSScriptRoot\iniciar-sistema.bat"
Write-Host ""
pause
