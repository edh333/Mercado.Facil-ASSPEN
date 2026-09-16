@echo off
chcp 65001 >nul
title Deploy Mercado Facil PDV

echo ============================================================
echo  DEPLOY MERCADO FACIL PDV - Producao
echo  Projeto: mercado-facil-mt
echo  URL: https://mercado-facil-mt.web.app
echo ============================================================
echo.

REM 1. Validacao local
echo [1/5] Lint (TypeScript)...
npm run lint
if errorlevel 1 (
    echo.
    echo ERRO: Lint falhou. Corrija os erros acima antes de deployar.
    pause
    exit /b 1
)
echo OK
echo.

echo [2/5] Testes (Web)...
npm test
if errorlevel 1 (
    echo.
    echo ERRO: Testes web falharam.
    pause
    exit /b 1
)
echo OK
echo.

echo [3/5] Testes (Functions)...
npm --prefix functions test
if errorlevel 1 (
    echo.
    echo ERRO: Testes functions falharam.
    pause
    exit /b 1
)
echo OK
echo.

echo [4/5] Build de producao...
npm run build
if errorlevel 1 (
    echo.
    echo ERRO: Build falhou.
    pause
    exit /b 1
)
echo OK
echo.

REM 4. Deploy Firebase
echo [5/5] Deploy Firebase (Functions + Firestore + Storage + Hosting)...
echo.
echo Deployando Functions...
firebase deploy --only functions
if errorlevel 1 (
    echo.
    echo ERRO: Deploy Functions falhou.
    pause
    exit /b 1
)
echo OK
echo.

echo Deployando Firestore, Storage e Hosting...
firebase deploy --only "firestore,storage:main,hosting"
if errorlevel 1 (
    echo.
    echo ERRO: Deploy Firestore/Storage/Hosting falhou.
    pause
    exit /b 1
)
echo OK
echo.

echo ============================================================
echo  DEPLOY CONCLUIDO COM SUCESSO!
echo  Producao: https://mercado-facil-mt.web.app
echo  Console:  https://console.firebase.google.com/project/mercado-facil-mt
echo ============================================================
echo.
pause