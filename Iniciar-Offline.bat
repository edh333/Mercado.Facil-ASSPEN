@echo off
rem ================================================================
rem  Mercado Fácil - Iniciar OFFLINE (sem instalar nada)
rem  Abre o sistema a partir da pasta local (dist). Funciona com ou
rem  sem internet:
rem    - COM internet  -> conecta no Firebase, tudo normal + sincroniza
rem    - SEM internet  -> abre pela pasta, usa cache local e a fila de
rem                       vendas offline; sincroniza sozinho ao voltar.
rem
rem  Pode copiar a pasta inteira para um pendrive e rodar de lá.
rem ================================================================
chcp 65001 >nul
title Mercado Fácil - OFFLINE

if not exist "%~dp0dist\index.html" (
    echo.
    echo   [ERRO] A pasta "dist" nao foi encontrada ao lado deste arquivo.
    echo   Gere antes (precisa Node):  npm run build
    echo   ou copie a pasta "dist" junto.
    echo.
    pause
    exit /b 1
)

echo.
echo   Iniciando Mercado Fácil no modo local/offline...
echo   (uma janela fica aberta servindo o sistema - feche-a para sair)
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0servidor-offline.ps1"