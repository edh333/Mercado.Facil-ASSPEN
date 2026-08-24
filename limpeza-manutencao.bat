@echo off
title MERCADO FACIL - Limpeza e Prolongamento de Vida Util
:: Garante execução na pasta do projeto mesmo "como administrador"
cd /d "%~dp0"
color 0B
echo ====================================================================
echo      MERCADO FACIL - LIMPEZA AUTOMATICA DE ARQUIVOS OBSOLETOS
echo   Remove caches temporarios que deixam o sistema lento com o tempo.
echo   NAO apaga dados, vendas, produtos nem configuracoes. Seguro rodar.
echo ====================================================================
echo.
set /a LIBERADO=0

:: 1. Cache do Vite (cresce a cada build)
if exist "node_modules\.vite" (
    echo [1/5] Removendo cache de compilacao antigo (node_modules\.vite)...
    call :tamanho "node_modules\.vite"
    rd /s /q "node_modules\.vite"
)

:: 2. Cache genérico do node_modules
if exist "node_modules\.cache" (
    echo [2/5] Removendo cache de ferramentas (node_modules\.cache)...
    call :tamanho "node_modules\.cache"
    rd /s /q "node_modules\.cache"
)

:: 3. Cache de deploy do Firebase (re-download automatico quando precisar)
if exist ".firebase" (
    echo [3/5] Removendo cache de uploads antigos do Firebase (.firebase)...
    call :tamanho ".firebase"
    rd /s /q ".firebase"
)

:: 4. Logs antigos soltos na raiz
for %%F in (*.log npm-debug.log* yarn-error.log*) do (
    if exist "%%F" (
        echo [4/5] Removendo log antigo: %%F
        del /q "%%F"
    )
)

:: 5. Build local antigo (o site online NAO depende dele; recria com npm run build)
if exist "build" (
    echo [5/5] Build local encontrado. Deseja remove-lo? ^(recrie com: npm run build^)
    choice /C SN /M "S=Sim, remover / N=Nao manter"
    if errorlevel 2 goto relatorio
    rd /s /q "build"
)

:relatorio
echo.
echo ====================================================================
echo   LIMPEZA CONCLUIDA.
echo   - O sistema online (Firebase Hosting) nao foi afetado.
echo   - Na proxima abertura, o app baixa so o que precisa de novo.
echo   - Rode 'verificar-saude.bat' para conferir que tudo esta OK.
echo   Dica: rode esta limpeza 1x por mes junto com o diagnostico.
echo ====================================================================
pause
exit /b

:tamanho
set /a MB=0
for /f "tokens=3" %%A in ('dir /s /w "%~1" 2^>nul ^| findstr /C:"bytes"') do set BYTES=%%A
echo       (%BYTES% bytes liberados)
exit /b
