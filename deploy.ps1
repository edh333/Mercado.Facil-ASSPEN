<# 
.SYNOPSIS
    Mercado Fácil - Script de Deploy para Produção (PowerShell)
.DESCRIPTION
    Executa: lint -> testes -> build -> deploy (functions + hosting + firestore + storage)
#>

param(
    [switch]$SkipConfirmation
)

Write-Host "`n============================================================" -ForegroundColor Cyan
Write-Host "  MERCADO FACIL - DEPLOY PRODUCAO (PowerShell)" -ForegroundColor Cyan
Write-Host "============================================================`n" -ForegroundColor Cyan

# Verifica se está no PowerShell
if (-not $PSVersionTable.PSVersion) {
    Write-Error "ERRO: Execute este script no PowerShell, não no CMD."
    exit 1
}

function Check-Error {
    param($Step)
    if ($LASTEXITCODE -ne 0) {
        Write-Error "`n============================================================"
        Write-Error "  ERRO: $Step falhou. Corrija os erros antes de deployar."
        Write-Error "============================================================`n"
        exit 1
    }
    Write-Host "OK" -ForegroundColor Green
}

function Confirm-Action {
    param($Message)
    if ($SkipConfirmation) { return $true }
    $response = Read-Host "$Message (s/N)"
    return $_.ToLower() -eq 's'
}

try {
    # 1. Verifica branch Git
    Write-Host "`n[1/6] Verificando branch Git..." -ForegroundColor Yellow
    $branch = git branch --show-current 2>$null
    if (-not $branch) { throw "Não é um repositório Git ou git não está no PATH" }
    Write-Host "Branch atual: $branch"
    if ($branch -ne "refactor-profissional") {
        Write-Warning "Não está na branch refactor-profissional (atual: $branch)"
        if (-not (Confirm-Action "Continuar mesmo assim? (s/N)")) {
            throw "Deploy cancelado pelo usuário"
        }
    }
    Check-Error "Verificação de branch"

    # 2. Verifica Firebase CLI
    Write-Host "`n[2/6] Verificando Firebase CLI..." -ForegroundColor Yellow
    $version = firebase --version 2>$null
    if ($LASTEXITCODE -ne 0) { throw "Firebase CLI não encontrado. Instale com: npm install -g firebase-tools" }
    Write-Host "OK - $version" -ForegroundColor Green

    # 3. Lint + Typecheck
    Write-Host "`n[3/6] Executando lint + typecheck..." -ForegroundColor Yellow
    npm run lint
    Check-Error "Lint + Typecheck"

    # 4. Testes web
    Write-Host "`n[2/6] Executando testes web..." -ForegroundColor Yellow
    npx vitest run
    Check-Error "Testes web"

    # 5. Testes functions
    Write-Host "`n[3/6] Executando testes functions..." -ForegroundColor Yellow
    Push-Location functions
    npm test
    Pop-Location
    Check-Error "Testes functions"

    # 4. Build produção
    Write-Host "`n[4/6] Build de produção..." -ForegroundColor Yellow
    npm run build
    Check-Error "Build"

    # 5. Deploy Firebase
    Write-Host "`n[5/6] Deploy no Firebase (projeto: mercado-facil-mt)..." -ForegroundColor Yellow
    Write-Warning "Isso vai deployar functions, hosting, firestore rules e storage rules."
    if (-not (Confirm-Action "Confirmar deploy em PRODUCAO? (s/N)")) {
        throw "Deploy cancelado pelo usuário"
    }

    firebase deploy --project mercado-facil-mt --force
    Check-Error "Deploy Firebase"

    # Sucesso
    Write-Host "`n============================================================" -ForegroundColor Green
    Write-Host "  DEPLOY CONCLUIDO COM SUCESSO!" -ForegroundColor Green
    Write-Host "============================================================`n" -ForegroundColor Green
    Write-Host "URL do app: https://mercado-facil-mt.web.app"
    Write-Host "Console:   https://console.firebase.google.com/project/mercado-facil-mt/overview"
    Write-Host "`nPróximos passos recomendados:"
    Write-Host "  1. Testar fluxo crítico: PDV -> cupom -> estorno -> caixa"
    Write-Host "  2. Verificar alertas de erro no Cloud Logging"
    Write-Host "  3. Confirmar App Check ativo no Console Firebase"
    Write-Host "============================================================"
    Write-Host "`nPressione qualquer tecla para sair..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    exit 0
}
catch {
    Write-Error "`n============================================================"
    Write-Error "  DEPLOY FALHOU OU CANCELADO"
    Write-Error "  Erro: $($_.Exception.Message)"
    Write-Error "============================================================`n"
    pause
    exit 1
}