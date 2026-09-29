@echo off
setlocal EnableDelayedExpansion
title MERCADO FACIL - PONTO DE RESTAURACAO

echo.
echo =================================================
echo   MERCADO FACIL - PONTO DE RESTAURACAO v1
echo   Gera ZIP dos fontes + commit git + tag
echo =================================================
echo.

:: Timestamp sem depender de formato de data do Windows
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmmss"') do set STAMP=%%i

set OUTDIR=ponto-restauracao
set ZIPFILE=%OUTDIR%\mercado-facil_%STAMP%.zip
set TMPDIR=%TEMP%\mf_ponto_%STAMP%

if not exist "%OUTDIR%" mkdir "%OUTDIR%"

echo [1/4] Copiando fontes (excluindo node_modules, build, .git)...
if exist "%TMPDIR%" rd /s /q "%TMPDIR%"
robocopy . "%TMPDIR%" /E /XD node_modules .git build dist dist-electron .firebase ponto-restauracao /NFL /NDL /NJH /NJS /NC /NS /NP
if errorlevel 8 (
    echo [ERRO] Falha ao copiar os fontes.
    pause
    exit /b 1
)

echo [2/4] Compactando em %ZIPFILE%...
powershell -NoProfile -Command "Compress-Archive -Path '%TMPDIR%\*' -DestinationPath '%ZIPFILE%' -Force"
if not exist "%ZIPFILE%" (
    echo [ERRO] Falha ao criar o ZIP.
    if exist "%TMPDIR%" rd /s /q "%TMPDIR%"
    pause
    exit /b 1
)
if exist "%TMPDIR%" rd /s /q "%TMPDIR%"

echo [3/4] Registrando ponto no git (commit + tag)...
git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
    echo [AVISO] Pasta nao e um repositorio git - ZIP gerado, mas sem commit/tag.
) else (
    git add -A
    git commit -m "ponto-restauracao %STAMP%" >nul 2>&1
    git tag "ponto-%STAMP%"
    if errorlevel 1 (
        echo [AVISO] Nada para commitar ou tag ja existente.
    ) else (
        echo [OK] Commit e tag "ponto-%STAMP%" criados.
    )
)

echo.
echo =================================================
echo   PONTO DE RESTAURACAO CRIADO COM SUCESSO!
echo.
echo   ZIP: %ZIPFILE%
echo.
echo   COMO RESTAURAR:
echo   1) Pelo git (recomendado):
echo      git reset --hard ponto-%STAMP%
echo   2) Pelo ZIP:
echo      extraia o conteudo do ZIP por cima da pasta
echo      do projeto (apos mover a versao atual de lado).
echo   3) Apos restaurar os fontes, rode deploy.bat
echo      para republicar functions + web no Firebase.
echo   4) DADOS (Firestore): use Admin ^> Limpeza e Backup
echo      para exportar/importar - este ponto salva apenas
echo      o Codigo-fonte.
echo =================================================
echo.
pause
