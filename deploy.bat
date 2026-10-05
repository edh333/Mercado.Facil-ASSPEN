@echo off
REM ============================================================
REM  Mercado Facil - Deploy Producao
REM  Launcher minimo. Toda a logica esta em deploy.ps1.
REM  Uso: deploy.bat  [-SkipConfirmation] [-SkipWait] [-SkipDeploy]
REM ============================================================
setlocal
title Mercado Facil - Deploy Producao

where powershell >nul 2>&1
if errorlevel 1 (
    echo.
    echo [ERRO] PowerShell nao encontrado no PATH.
    echo.
    pause
    exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy.ps1" %*
set "RC=%ERRORLEVEL%"

if not "%RC%"=="0" (
    echo.
    echo [deploy.bat] deploy.ps1 terminou com codigo %RC%.
)

endlocal & exit /b %RC%