@echo off
title Criar Atalho - Mercado Facil Offline
color 0B
echo ============================================
echo  Criar Atalho - Mercado Facil Modo Offline
echo ============================================
echo.

:: Caminhos
set "SCRIPT_DIR=%~dp0"
set "TARGET=%SCRIPT_DIR%start-offline.bat"
set "SHORTCUT_NAME=Mercado Facil Offline.lnk"
set "DESKTOP=%USERPROFILE%\Desktop"

:: Verificar se o start-offline.bat existe
if not exist "%TARGET%" (
    echo ERRO: start-offline.bat nao encontrado em:
    echo %TARGET%
    echo.
    pause
    exit /b 1
)

:: Criar atalho via VBScript
set "VBS_FILE=%TEMP%\create_shortcut.vbs"
(
    echo Set WshShell = WScript.CreateObject("WScript.Shell"^)
    echo Set Shortcut = WshShell.CreateShortcut("%DESKTOP%\%SHORTCUT_NAME%"^)
    echo Shortcut.TargetPath = "%TARGET%"
    echo Shortcut.WorkingDirectory = "%SCRIPT_DIR%"
    echo Shortcut.Description = "Mercado Facil - Modo Offline"
    echo Shortcut.IconLocation = "%SCRIPT_DIR%public\logo.png, 0"
    echo Shortcut.WindowStyle = 1
    echo Shortcut.Save
) > "%VBS_FILE%"

cscript //nologo "%VBS_FILE%"
if %ERRORLEVEL% equ 0 (
    echo Atalho criado com sucesso na Area de Trabalho!
    echo.
    echo "Mercado Facil Offline.lnk" - %DESKTOP%
) else (
    echo ERRO: Nao foi possivel criar o atalho.
)

:: Limpar arquivo temporario
del "%VBS_FILE%" >nul 2>&1

echo.
pause
