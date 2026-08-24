@echo off
title MERCADO FACIL - Diagnostico de Saude do Sistema
:: Garante execução na pasta do projeto mesmo "como administrador"
cd /d "%~dp0"
color 0B
echo ====================================================================
echo          MERCADO FACIL - AUTO-DIAGNOSTICO DE MANUTENCAO
echo   Rode este arquivo 1x por mes. Ele avisa se algo precisa de cuidado.
echo ====================================================================
echo.
set /a PROBLEMAS=0

echo [1/5] Verificando sintaxe das Cloud Functions...
node --check functions\index.js
if %errorlevel% neq 0 (
    echo    [X] FALHA: ha erro de sintaxe em functions/index.js
    set /a PROBLEMAS+=1
) else (
    echo    [OK] Cloud Functions validas
)
echo.

echo [2/5] Verificando vulnerabilidades de seguranca (producao)...
call npm audit --omit=dev >nul 2>&1
if %errorlevel% neq 0 (
    echo    [!] ATENCAO: ha vulnerabilidades. Rode: npm audit --omit=dev
    set /a PROBLEMAS+=1
) else (
    echo    [OK] Nenhuma vulnerabilidade de producao
)
echo.

echo [3/5] Verificando erros de codigo (TypeScript)...
call npm run lint >nul 2>&1
if %errorlevel% neq 0 (
    echo    [X] FALHA: erros de tipografia/codigo encontrados
    set /a PROBLEMAS+=1
) else (
    echo    [OK] Codigo sem erros
)
echo.

echo [4/5] Rodando testes automaticos (40 verificacoes)...
call npx vitest run tests >nul 2>&1
if %errorlevel% neq 0 (
    echo    [X] FALHA: testes quebraram - NAO faca deploy antes de corrigir
    set /a PROBLEMAS+=1
) else (
    echo    [OK] Todos os testes passaram
)
echo.

echo [5/5] Testando build de producao...
if exist "build\index.html" (
    echo    [OK] Build atual existe em pasta build\
) else (
    echo    [!] Sem build local. Rode start-offline.bat apos um "npm run build"
    set /a PROBLEMAS+=1
)
echo.

echo ====================================================================
if %PROBLEMAS% equ 0 (
    color 0A
    echo   RESULTADO: SISTEMA 100%% SAUDAVEL. Nada a fazer ate o proximo mes.
) else (
    color 0E
    echo   RESULTADO: %PROBLEMAS% item(ns) precisa(m) de atencao ^(veja acima^).
    echo   Na duvida, rode o deploy.bat - ele so publica se tudo passar.
)
echo ====================================================================
echo.
pause
