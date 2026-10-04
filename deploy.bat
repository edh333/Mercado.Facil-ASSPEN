@echo off
REM ============================================================
REM Mercado Fácil - Script de Deploy para Produção
REM ============================================================
REM Executa: lint -> testes -> build -> deploy (functions + hosting + firestore + storage)
REM ============================================================

setlocal enabledelayedexpansion

echo.
echo ============================================================
echo  MERCADO FACIL - DEPLOY PRODUCAO
echo ============================================================
echo.

REM 1. Verifica se estamos na branch correta
for /f "tokens=*" %%i in ('git branch --show-current') do set BRANCH=%%i
echo Branch atual: %BRANCH%
if "%BRANCH%" neq "refactor-profissional" (
    echo AVISO: Nao esta na branch refactor-profissional
    set /p CONFIRM="Continuar mesmo assim? (s/N): "
    if /i "!CONFIRM!" neq "s" (
        echo Deploy cancelado.
        exit /b 1
    )
)

REM 2. Lint + Typecheck
echo.
echo [1/5] Executando lint + typecheck...
npm run lint
if %errorlevel% neq 0 (
    echo ERRO: Lint falhou. Corrija os erros antes de deployar.
    exit /b 1
)
echo OK

REM 3. Testes (web + functions)
echo.
echo [2/5] Executando testes web...
npx vitest run
if %errorlevel% neq 0 (
    echo ERRO: Testes web falharam.
    exit /b 1
)
echo OK

echo.
echo [3/5] Executando testes functions...
cd functions
npm test
if %errorlevel% neq 0 (
    echo ERRO: Testes functions falharam.
    exit /b 1
)
cd ..
echo OK

REM 4. Build produção
echo.
echo [4/5] Build de produção...
npm run build
if %errorlevel% neq 0 (
    echo ERRO: Build falhou.
    exit /b 1
)
echo OK

REM 5. Deploy Firebase (--force para functions 2nd gen com minInstances)
echo.
echo [5/5] Deploy no Firebase (projeto: mercado-facil-mt)...
echo ATENCAO: Isso vai deployar functions, hosting, firestore rules e storage rules.
set /p CONFIRM="Confirmar deploy em PRODUCAO? (s/N): "
if /i "!CONFIRM!" neq "s" (
    echo Deploy cancelado pelo usuario.
    exit /b 1
)

firebase deploy --project mercado-facil-mt --force
if %errorlevel% neq 0 (
    echo ERRO: Deploy falhou.
    exit /b 1
)

echo.
echo ============================================================
echo  DEPLOY CONCLUIDO COM SUCESSO!
echo ============================================================
echo.
echo URL do app: https://mercado-facil-mt.web.app
echo Console: https://console.firebase.google.com/project/mercado-facil-mt/overview
echo.
echo Lembre-se de:
echo  - Verificar alertas de erro no Cloud Logging
echo  - Testar fluxo crítico: PDV -> cupom -> estorno -> caixa
echo  - Verificar se App Check está ativo no Console
echo ============================================================

pause