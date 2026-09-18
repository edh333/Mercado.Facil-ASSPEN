@echo off
setlocal EnableExtensions
chcp 65001 >nul
title Deploy Mercado Facil PDV Producao

rem ==============================================================
rem  DEPLOY MERCADO FACIL PDV - PRODUCAO
rem  Projeto: mercado-facil-mt
rem  URL: https://mercado-facil-mt.web.app
rem
rem  USO INTERATIVO:
rem      deploy.bat                  (roda manual, com pause)
rem
rem  USO NAO-INTERATIVO (CI/automacao/servidor):
rem      deploy.bat --non-interactive
rem      deploy.bat -n
rem      deploy.bat --non-interactive --token=SEU_TOKEN
rem
rem  Exit code: 0 = sucesso | 1 = alguma etapa falhou
rem ==============================================================

set "NONINTERACTIVE=0"
set "FIREBASE_TOKEN="

rem ==============================================================
rem  PROCESSAR ARGUMENTOS
rem ==============================================================
:parse_args
if "%~1"=="" goto :args_done
if /i "%~1"=="--non-interactive" set "NONINTERACTIVE=1" & shift & goto :parse_args
if /i "%~1"=="-n"                set "NONINTERACTIVE=1" & shift & goto :parse_args
set "ARGV=%~1"
if /i "%ARGV:~0,8%"=="--token=" (
    set "FIREBASE_TOKEN=%ARGV:~8%"
    shift
    goto :parse_args
)
echo ERRO: argumento desconhecido "%~1". Uso: --non-interactive ou --token=SEU_TOKEN
exit /b 1
:args_done

rem ==============================================================
rem  BANNER
rem ==============================================================
echo.
echo ============================================================
echo  DEPLOY MERCADO FACIL PDV - Producao
echo  Projeto: mercado-facil-mt
echo  URL: https://mercado-facil-mt.web.app
echo  Modo:  NONINTERACTIVE=%NONINTERACTIVE%  ^(1 script / 0 interativo^)
echo ============================================================
echo.

rem ==============================================================
rem  [1/5] LINT
rem ============================================================
set "STEP=1/5 Lint"
echo [1/5] Lint (TypeScript)...
call npm run lint
if errorlevel 1 goto :fim
echo OK
echo.

rem ==============================================================
rem  [2/5] TESTES WEB
rem ============================================================
set "STEP=2/5 Testes web"
echo [2/5] Testes (Web)...
call npm test
if errorlevel 1 goto :fim
echo OK
echo.

rem ==============================================================
rem  [3/5] TESTES FUNCTIONS
rem ==============================================================
set "STEP=3/5 Testes functions"
echo [3/5] Testes (Functions)...
call npm --prefix functions test
if errorlevel 1 goto :fim
echo OK
echo.

rem ==============================================================
rem  [4/5] BUILD
rem ==============================================================
set "STEP=4/5 Build producao"
echo [4/5] Build de producao...
call npm run build
if errorlevel 1 goto :fim
echo OK
echo.

rem ==============================================================
rem  [5/5] DEPLOY FIREBASE
rem ==============================================================
set "STEP=5/5 Deploy functions"
echo [5/5] Deploy Firebase...
echo.
set "FB_EXTRA="
if "%NONINTERACTIVE%"=="1" set "FB_EXTRA=--non-interactive"
set "TOKEN_EXTRA="
if "%NONINTERACTIVE%"=="1" if defined FIREBASE_TOKEN set "TOKEN_EXTRA=--token %FIREBASE_TOKEN%"

echo Deployando Functions...
firebase deploy --only functions %FB_EXTRA% %TOKEN_EXTRA%
if errorlevel 1 goto :fim
echo OK
echo.

echo Deployando Firestore, Storage e Hosting...
firebase deploy --only "firestore:main,storage:main,hosting" %FB_EXTRA% %TOKEN_EXTRA%
if errorlevel 1 goto :fim
echo OK
echo.

echo ============================================================
echo  DEPLOY CONCLUIDO COM SUCESSO!
echo  Producao: https://mercado-facil-mt.web.app
echo  Console:  https://console.firebase.google.com/project/mercado-facil-mt
echo ============================================================
echo.
if not "%NONINTERACTIVE%"=="1" pause
exit /b 0

:fim
echo.
echo ERRO: a etapa "%STEP%" falhou. Deploy abortado.
echo.
if not "%NONINTERACTIVE%"=="1" pause
exit /b 1
