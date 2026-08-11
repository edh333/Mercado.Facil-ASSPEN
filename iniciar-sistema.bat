@echo off
setlocal
title MERCADO FACIL - ASSPEN/MT
cls
echo ============================================================
echo           MERCADO FACIL - SISTEMA DE GESTAO
echo    ASSOCIACAO DOS SERVIDORES DO SISTEMA PENAL - MT
echo ============================================================
echo.
echo [1] Verificando dependencias...
if not exist node_modules (
    echo [!] Pasta node_modules nao encontrada. Instalando...
    call npm install
)

echo [2] Iniciando o sistema...
echo.
echo >>> O sistema abrira no navegador em instantes.
echo >>> Nao feche esta janela enquanto estiver usando o sistema.
echo.
start http://localhost:5177
call npm run dev
pause
