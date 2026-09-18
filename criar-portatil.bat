@echo off
setlocal EnableExtensions
title Mercado Facil - Criar Pacote Portatil
chcp 65001 >nul
rem ================================================================
rem  MERCADO FACIL - CRIAR PACOTE PORTATIL (para pendrive)
rem
rem  Faz o build atual do sistema e monta a pasta "portatil" pronta
rem  para copiar para um pendrive e rodar em qualquer computador
rem  Windows SEM instalar nada:
rem
rem       portatil\
rem         Iniciar-Offline.bat     <- dois cliques para abrir
rem         servidor-offline.ps1
rem         LEIA-ME_PORTAVEL.txt
rem         dist\                    <- sistema compilado
rem
rem  USO: so precisa de Node.js instalado NESTE computador (o
rem  computador da venda NAO precisa de nada).
rem ================================================================

echo.
echo   ==================================================
echo    MERCADO FACIL - CRIAR PACOTE PORTATIL (pendrive)
echo   ==================================================
echo.

rem --- [1] Node presente? ---
where node >nul 2>&1
if errorlevel 1 (
    echo   [ERRO] Node.js nao encontrado neste computador.
    echo   Instale em https://nodejs.org e rode de novo.
    echo.
    pause
    exit /b 1
)

rem --- [2] Build de producao (gera a pasta build/) ---
echo   [1/3] Build de producao...
call npm run build
if errorlevel 1 goto :erro

rem --- [3] Monta a pasta portatil ---
echo   [2/3] Montando a pasta portatil...
if exist "portatil" rmdir /s /q "portatil"
mkdir "portatil" >nul

rem Copia o build atual para a pasta dist (dentro do pacote)
robocopy "build" "portatil\dist" /MIR /NFL /NDL /NJH /NJS /NC /NS >nul
if errorlevel 8 goto :erro

rem Copia os launchers e as instrucoes
copy /y "Iniciar-Offline.bat" "portatil\" >nul
copy /y "servidor-offline.ps1" "portatil\" >nul
copy /y "LEIA-ME_PORTAVEL.txt" "portatil\" >nul

rem --- [4] Tambem atualiza a pasta dist local (usada pelo Iniciar-Offline.bat daqui) ---
echo   [3/3] Atualizando a pasta dist local...
robocopy "build" "dist" /MIR /NFL /NDL /NJH /NJS /NC /NS >nul
if errorlevel 8 goto :erro

echo.
echo   ==================================================
echo    PRONTO! Pacote criado na pasta  "portatil"
echo   ==================================================
echo.
echo   PARA USAR:
echo    1. Copie a PASTA "portatil" inteira para o pendrive.
echo    2. No computador da venda, abra o pendrive e de dois
echo       cliques em  Iniciar-Offline.bat
echo    3. PRIMEIRA VEZ naquele computador: precisa de INTERNET
echo       - entre com o login do administrador e espere os
echo         produtos/clientes carregarem (fica no cache).
echo    4. Depois disso pode vender SEM internet quando precisar.
echo    5. Quando a internet voltar, o sistema sincroniza sozinho
echo       as vendas offline e atualiza os dados.
echo.
echo   (Deixou de vender? Refaca este bat ANTES de copiar de novo
echo   para o pendrive, para o pacote ter sempre a versao nova.)
echo.
pause
exit /b 0

:erro
echo.
echo   [ERRO] Falha ao criar o pacote. Veja as mensagens acima.
echo.
pause
exit /b 1