@echo off
echo TESTE
npm run lint
if errorlevel 1 (
    echo ERRO
)
echo FIM
pause