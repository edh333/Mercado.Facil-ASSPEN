$WshShell = New-Object -ComObject WScript.Shell
$DesktopPath = [System.IO.Path]::Combine($env:USERPROFILE, "Desktop")
$Shortcut = $WshShell.CreateShortcut("$DesktopPath\Mercado Facil ASSPEN.lnk")
$Shortcut.TargetPath = "$PWD\iniciar-sistema.bat"
$Shortcut.WorkingDirectory = "$PWD"
$Shortcut.IconLocation = "$PWD\public\logo.png"
$Shortcut.Save()
Write-Host "Atalho criado com sucesso na Area de Trabalho!" -ForegroundColor Green
