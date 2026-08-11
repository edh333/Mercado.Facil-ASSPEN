@echo off
title MERCADO FACIL PDV - IMPLANTAÇÃO PROFISSIONAL
echo ====================================================================
echo               MERCADO FACIL - ESTEIRA DE DEPLOY COMPLETA            
echo ====================================================================
echo.
echo [1/4] LIMPANDO RESÍDUOS DE BUILDS ANTERIORES NO WINDOWS...
if exist dist (
    rd /s /q dist
    echo - Pasta dist antiga removida com sucesso.
) else (
    echo - Nenhuma pasta dist anterior detectada.
)
echo.
echo [2/4] COMPILANDO PROJETO EM MODO DE PRODUÇÃO (VITE)...
set NODE_OPTIONS=--max-old-space-size=4096
call npm run build
if %errorlevel% neq 0 (
    echo.
    echo [ERRO CRÍTICO] A COMPILAÇÃO DO VITE FALHOU COM ERROS DE CÓDIGO!
    echo O Deploy foi abortado para proteger o sistema online. Fix os erros acima.
    pause
    exit /b %errorlevel%
)
echo.
echo [3/4] DEPLOY FORÇADO PARA OS SERVIDORES DO GOOGLE FIREBASE...
call firebase deploy --force --only hosting
if %errorlevel% neq 0 (
    echo.
    echo [ERRO CRÍTICO] FALHA NA CONEXÃO OU AUTENTICAÇÃO DO FIREBASE DEPLOY!
    pause
    exit /b %errorlevel%
)
echo.
echo [4/4] ==============================================================
echo        IMPLANTAÇÃO CONCLUÍDA! SISTEMA ONLINE E ATUALIZADO NO AR!    
echo ====================================================================
echo.
pause
