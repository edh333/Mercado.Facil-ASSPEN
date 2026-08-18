@echo off
title MERCADO FACIL PDV - IMPLANTAÇÃO PROFISSIONAL
echo ====================================================================
echo               MERCADO FACIL - ESTEIRA DE DEPLOY COMPLETA            
echo ====================================================================
echo.
echo [1/6] LIMPANDO RESÍDUOS DE BUILDS ANTERIORES NO WINDOWS...
if exist dist (
    rd /s /q dist
    echo - Pasta dist antiga removida com sucesso.
) else (
    echo - Nenhuma pasta dist anterior detectada.
)
echo.
echo [2/6] VALIDANDO SINTAXE DAS FUNÇÕES (CLOUD FUNCTIONS)...
node --check functions\index.js
if %errorlevel% neq 0 (
    echo.
    echo [ERRO CRÍTICO] SINTAXE INVÁLIDA EM functions\index.js!
    echo O Deploy foi abortado para proteger o sistema online. Corrija o erro acima.
    pause
    exit /b %errorlevel%
)
echo.
echo [3/6] EXECUTANDO TESTES AUTOMATIZADOS (FRONTEND + CLOUD FUNCTIONS)...
call npx vitest run tests
if %errorlevel% neq 0 (
    echo.
    echo [ERRO CRÍTICO] TESTES DO FRONTEND FALHARAM!
    echo O Deploy foi abortado para proteger o sistema online.
    pause
    exit /b %errorlevel%
)
pushd functions
call npx vitest run
if %errorlevel% neq 0 (
    popd
    echo.
    echo [ERRO CRÍTICO] TESTES DAS CLOUD FUNCTIONS FALHARAM!
    echo O Deploy foi abortado para proteger o sistema online.
    pause
    exit /b %errorlevel%
)
popd
echo.
echo [4/6] COMPILANDO PROJETO EM MODO DE PRODUÇÃO (VITE)...
set NODE_OPTIONS=--max-old-space-size=4096
call npm run build
if %errorlevel% neq 0 (
    echo.
    echo [ERRO CRÍTICO] A COMPILAÇÃO DO VITE FALHOU COM ERROS DE CÓDIGO!
    echo O Deploy foi abortado para proteger o sistema online. Corrija os erros acima.
    pause
    exit /b %errorlevel%
)
echo.
echo [5/6] DEPLOY FORÇADO PARA OS SERVIDORES DO GOOGLE FIREBASE...
echo - Hosting (site) + Cloud Functions (regras de negócio) + Storage Rules + Firestore Rules...
call firebase deploy --force --only hosting,functions,storage,firestore:rules
if %errorlevel% neq 0 (
    echo.
    echo [ERRO CRÍTICO] FALHA NA CONEXÃO OU AUTENTICAÇÃO DO FIREBASE DEPLOY!
    pause
    exit /b %errorlevel%
)
echo.
echo [6/6] ==============================================================
echo        IMPLANTAÇÃO CONCLUÍDA! SISTEMA ONLINE E ATUALIZADO NO AR!    
echo ====================================================================
echo.
pause