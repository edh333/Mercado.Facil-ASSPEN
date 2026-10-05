@echo off
echo [1/6] Verificando branch Git...
git branch --show-current >nul 2>nul
if errorlevel 1 (
    echo ERRO
    goto erro_final
)
echo OK
pause