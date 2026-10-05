@echo off
cls
REM ============================================================
REM Mercado Facil - Script de Deploy para Producao
REM ============================================================
REM Executa: lint -> testes -> build -> deploy (functions + hosting + firestore + storage)
REM ============================================================

@echo off
cls
echo.
echo ============================================================
echo   MERCADO FACIL - DEPLOY PRODUCAO
echo ============================================================
echo.

REM Verifica se esta no cmd.exe
ver | find "Windows" >nul
if %errorlevel% neq 0 (
    echo ERRO: Execute este script no CMD.EXE (Prompt de Comando), nao no PowerShell.
    pause
    exit /b 1
)

REM 1. Verifica branch Git
echo.
echo [1/6] Verificando branch Git...
git branch --show-current >nul 2>nul
if %errorlevel% neq 0 (
    echo ERRO: Nao e um repositorio Git ou git nao esta no PATH.
    goto erro_final
)

for /f "tokens=*" %%i in ('git branch --show-current') do set BRANCH=%%i
echo Branch atual: %BRANCH%
if "%BRANCH%" neq "refactor-profissional" (
    echo AVISO: Nao esta na branch refactor-profissional (atual: %BRANCH%)
    set /p CONFIRM="Continuar mesmo assim? (s/N): "
    if /i "%CONFIRM%" neq "s" (
        echo Deploy cancelado pelo usuario.
        goto erro_final
    )
)
echo OK

REM 2. Verifica Firebase CLI
echo.
echo [2/6] Verificando Firebase CLI...
firebase --version >nul 2>nul
if %errorlevel% neq 0 (
    echo ERRO: Firebase CLI nao encontrado. Instale com: npm install -g firebase-tools
    goto erro_final
)
echo OK

REM 3. Lint + Typecheck
echo.
echo [3/6] Executando lint + typecheck...
npm run lint
if %errorlevel% neq 0 (
    echo.
    echo ============================================================
    echo  ERRO: Lint falhou. Corrija os erros antes de deployar.
    echo ============================================================
    goto erro_final
)
echo OK

REM 4. Testes web
echo.
echo [4/6] Executando testes web...
npx vitest run
if %errorlevel% neq 0 (
    echo.
    echo ============================================================
    echo  ERRO: Testes web falharam.
    echo ============================================================
    goto erro_final
)
echo OK

REM 5. Testes functions
echo.
echo [5/6] Executando testes functions...
cd functions
npm test
if %errorlevel% neq 0 (
    echo.
    echo ============================================================
    echo  ERRO: Testes functions falharam.
    echo ============================================================
    cd ..
    goto erro_final
)
cd ..
echo OK

REM 6. Build producao
echo.
echo [6/6] Build de producao...
npm run build
if %errorlevel% neq 0 (
    echo.
    echo ============================================================
    echo  ERRO: Build falhou.
    echo ============================================================
    goto erro_final
)
echo OK

REM 7. Deploy Firebase
echo.
echo [7/7] Deploy no Firebase (projeto: mercado-facil-mt)...
echo ATENCAO: Isso vai deployar functions, hosting, firestore rules e storage rules.
set /p CONFIRM="Confirmar deploy em PRODUCAO? (s/N): "
if /i "%CONFIRM%" neq "s" (
    echo Deploy cancelado pelo usuario.
    goto erro_final
)

firebase deploy --project mercado-facil-mt --force
if %errorlevel% neq 0 (
    echo.
    echo ============================================================
    echo  ERRO: Deploy falhou. Verifique os logs acima.
    echo ============================================================
    goto erro_final
)

echo.
echo ============================================================
echo   DEPLOY CONCLUIDO COM SUCESSO!
echo ============================================================
echo.
echo URL do app: https://mercado-facil-mt.web.app
echo Console:   https://console.firebase.google.com/project/mercado-facil-mt/overview
echo.
echo Proximos passos recomendados:
echo   1. Testar fluxo critico: PDV -> cupom -> estorno -> caixa
echo   2. Verificar alertas de erro no Cloud Logging
echo  3. Confirmar App Check ativo no Console Firebase
echo ============================================================
echo.
echo Pressione qualquer tecla para sair...
pause >nul
exit /b 0

:erro_final
echo.
echo ============================================================
echo  DEPLOY FALHOU OU CANCELADO
echo ============================================================
echo.
pause
exit /b 1