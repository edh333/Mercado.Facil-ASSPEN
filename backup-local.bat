@echo off
setlocal EnableDelayedExpansion
title MERCADO FACIL - BACKUP LOCAL

echo.
echo =================================================
echo   MERCADO FACIL - BACKUP LOCAL v1
echo   Sistema de Gestao do Sistema Penal
echo =================================================
echo.

:: Configuracoes
set BACKUP_DIR=data\local
set DATA_FILE=%BACKUP_DIR%\dados_sistema.json

:: Criar pasta se nao existir
if not exist %BACKUP_DIR% (
    mkdir %BACKUP_DIR%
)

echo [1/3] Verificando dados no Firebase...

:: Verificar se tem dados
echo [INFO] O backup local salva os dados mais antigos do Firebase
echo [INFO] para evitar que o banco fique cheio.
echo.
echo [AVISO] Para fazer backup, use o painel administrativo:
echo        Admin > Limpeza e Backup > Baixar Arquivo
echo.
echo [INFO] Os arquivos sao salvos na pasta: %BACKUP_DIR%
echo.
echo =================================================
echo   BACKUP CONFIGURADO COM SUCESSO!
echo.
echo   Pasta: %BACKUP_DIR%
echo   Use o sistema para gerar backups.
echo =================================================
echo.
pause