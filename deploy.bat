@echo off
setlocal EnableExtensions
title Mercado Facil - Deploy Completo
cd /d "%~dp0"

set "PROJ=mercado-facil-mt"

echo.
echo  ==================================================
echo     MERCADO FACIL - DEPLOY COMPLETO
echo     Projeto: %PROJ%
echo  ==================================================
echo.

if not exist node_modules goto :instala
if not exist functions\node_modules goto :instala

goto :prepara

:instala
echo  [1/7] Instalando dependencias...
call npm install
call npm --prefix functions install
if errorlevel 1 goto :falha

:prepara
echo  [2/7] Checagem de tipos...
call npm run lint
if errorlevel 1 goto :falha

echo  [3/7] Testes unitarios...
call npm test
if errorlevel 1 goto :falha
call npm --prefix functions test
if errorlevel 1 goto :falha

echo  [4/7] Sintaxe das Cloud Functions...
node -c functions\index.js
if errorlevel 1 goto :falha

echo  [5/7] Build de producao...
call npm run build
if errorlevel 1 goto :falha

echo  [6/7] Publicando Cloud Functions...
firebase deploy --only functions
if errorlevel 1 goto :falha

echo  [7/7] Publicando Regras + Storage + Hosting...
firebase deploy --only firestore,storage:main,hosting
if errorlevel 1 goto :falha

echo.
echo  ==================================================
echo     DEPLOY CONCLUIDO COM SUCESSO!
echo  ==================================================
echo.
echo  PASSO OBRIGATORIO A POS-DEPLOY:
echo  - Roteie as 2 senhas expostas no historico do repositorio.
echo  - Teste no PDV real: PIX / MISTA / CASH / FIADO.
echo  - Teste estorno (F9 e aba Ordens), ambos com senha.
echo.
echo  Se alguma venda ainda falhar, a mensagem que aparece
echo  agora revela a causa exata. Me mande o texto dela.
echo.
pause
goto :fim

:falha
echo.
echo  ==================================================
echo    DEPLOY INTERROMPIDO - veja o erro acima
echo  ==================================================
echo.
echo  Dica: se o erro for sobre "cloudresourcemanager" ou
echo  "Failed to make request", habilite a API no navegador:
echo    start https://console.cloud.google.com/apis/library/cloudresourcemanager.googleapis.com?project=%PROJ%
echo.
echo  Comando manual equivalente se este arquivo fechar:
echo    npm run lint ^&^& npm test ^&^& npm --prefix functions test ^&^& npm run build ^&^& firebase deploy --only functions ^&^& firebase deploy --only hosting
echo.
pause

:fim
endlocal
