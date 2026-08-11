# Script de Deploy Profissional - Mercado Facil
Write-Host "`n========================================================" -ForegroundColor Cyan
Write-Host "  MERCADO FACIL - SCRIPT DE DEPLOY (POWERSHELL)" -ForegroundColor Cyan
Write-Host "========================================================`n" -ForegroundColor Cyan

# 1. Aumentar Memória
Write-Host "[1/3] Configurando memoria do Node (4GB)..." -ForegroundColor Yellow
$env:NODE_OPTIONS = "--max-old-space-size=4096"

# 2. Rodar Build
Write-Host "[2/3] Iniciando Build Otimizado..." -ForegroundColor Yellow
npm run build-mem

if ($LASTEXITCODE -ne 0) {
    Write-Host "`n[ERRO] O build falhou. Tente fechar o Chrome ou outros apps pesados." -ForegroundColor Red
    Read-Host "Pressione Enter para fechar..."
    exit $LASTEXITCODE
}

# 3. Deploy
Write-Host "`n[3/3] Build concluido! Fazendo deploy no Firebase..." -ForegroundColor Yellow
firebase deploy

if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERRO] Erro ao enviar para o Firebase." -ForegroundColor Red
    Read-Host "Pressione Enter para fechar..."
    exit $LASTEXITCODE
}

Write-Host "`n========================================================" -ForegroundColor Green
Write-Host "  DEPLOY REALIZADO COM SUCESSO!" -ForegroundColor Green
Write-Host "========================================================`n" -ForegroundColor Green
Read-Host "Pressione Enter para sair..."
