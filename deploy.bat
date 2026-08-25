@echo off
setlocal EnableExtensions
title Mercado Facil - Deploy

cd /d "%~dp0"

echo ============================================================
echo   MERCADO FACIL - DEPLOY PROFISSIONAL
echo ============================================================
echo.

where node >nul 2>&1
if errorlevel 1 (
    echo [ERRO] Node.js nao encontrado no PATH.
    goto :fail
)

where firebase >nul 2>&1
if errorlevel 1 (
    echo [ERRO] Firebase CLI nao encontrada. Instale com: npm install -g firebase-tools
    goto :fail
)

echo [1/5] Verificando dependencias...
if not exist "node_modules\" (
    echo        Instalando pacotes (npm install^)...
    call npm install || goto :fail
)

echo [2/5] Checagem de tipos (tsc^)...
call npm run lint || goto :fail

echo [3/5] Testes...
call npm test || goto :fail

echo [4/5] Build de producao...
call npm run build || goto :fail

echo [5/5] Publicando no Firebase (hosting + firestore + storage + functions^)...
call firebase deploy --only hosting,firestore,storage,functions || goto :fail

echo.
echo ============================================================
echo   DEPLOY CONCLUIDO COM SUCESSO!
echo ============================================================
goto :end

:fail
echo.
echo ============================================================
echo   DEPLOY INTERROMPIDO - corrija o erro acima e rode novamente
echo ============================================================

:end
echo.
pause
