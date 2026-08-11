@echo off
title Mercado Facil - Modo Offline
color 0A
echo ============================================
echo    Mercado Facil - Servidor Local Offline
echo ============================================
echo.
echo Iniciando servidor offline...
echo.

:: Verificar se a pasta dist existe
if not exist "dist" (
    echo ERRO: Pasta 'dist' nao encontrada.
    echo Execute 'npm run build' primeiro.
    echo.
    pause
    exit /b 1
)

:: Verificar se o npx esta disponivel
where npx >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo ERRO: Node.js nao encontrado. Instale Node.js primeiro.
    echo.
    pause
    exit /b 1
)

:: Iniciar servidor
echo Servidor rodando em: http://localhost:3000
echo Pressione CTRL+C para parar.
echo.
start http://localhost:3000
npx serve -s dist -l 3000

pause
