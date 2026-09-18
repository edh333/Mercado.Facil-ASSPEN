@echo off
setlocal EnableExtensions
rem ================================================================
rem  Mercado Fácil - Iniciar OFFLINE (sem instalar nada)
rem  Abre o sistema a partir da pasta local (dist). Funciona com ou
rem  sem internet:
rem    - COM internet  -> conecta no Firebase, tudo normal + sincroniza
rem    - SEM internet  -> abre pela pasta, usa cache local e a fila de
rem                       vendas offline; sincroniza sozinho ao voltar.
rem
rem  PRIMEIRA VEZ NESTE COMPUTADOR: precisa de INTERNET para entrar
rem  com o login do administrador e baixar produtos/clientes (fica no
rem  cache do navegador). Depois disso, pode vender sem internet.
rem
rem  Pode copiar esta pasta inteira para um pendrive e rodar de lá.
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
echo   ==================================================
echo     MERCADO FACIL - MODO OFFLINE / PORTATIL
echo   ==================================================
echo.
echo   O sistema vai abrir no navegador (login do painel admin).
echo.
echo   COMO FUNCIONA:
echo     [1] PRIMEIRA VEZ neste computador:
echo         precisa de INTERNET - entre com o login do administrador
echo         e espere os produtos/clientes carregarem (ficam salvos
echo         automaticamente no cache do navegador).
echo     [2] SEM INTERNET:
echo         abra por este arquivo e use normalmente. As vendas ficam
echo         numa fila local (amarela/pendente no painel).
echo     [3] INTERNET VOLTOU:
echo         o sistema sincroniza SOZINHO as vendas offline e atualiza
echo         produtos e saldos. Pode deixar aberto ou reabrir depois.
echo.
echo   Nao feche esta janela enquanto estiver usando o sistema.
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0servidor-offline.ps1"