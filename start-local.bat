@echo off
title MERCADO FACIL - Iniciar Localmente

echo.
echo ===================================================
echo   MERCADO FACIL - MODO LOCAL
echo   Execute sem internet
echo ===================================================
echo.

:: Verificar Node.js
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERRO] Node.js nao instalado!
    echo.
    echo Para rodar localmente, instale o Node.js:
    echo   https://nodejs.org/
    pause
    exit /b 1
)

echo [1] Iniciando servidor local...
echo.
echo   Acesse: http://localhost:5177
echo   Para parar: Ctrl+C
echo.

:: Iniciar Vite em modo local
npx vite --host

echo.
echo Servidor encerrado.
pause