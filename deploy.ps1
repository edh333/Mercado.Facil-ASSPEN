<#
.SYNOPSIS
    Mercado Facil - Script de Deploy para Producao (PowerShell)
.DESCRIPTION
    Executa: pre-checagens -> lint -> testes -> build -> deploy
    (functions + hosting + firestore rules + storage rules)
.PARAMETER SkipConfirmation
    Nao pergunta confirmacao. Use em CI/CD.
.PARAMETER SkipWait
    Nao aguarda tecla no final. Use em CI/CD.
.PARAMETER SkipDeploy
    Executa apenas as validacoes (gates) e nao publica em producao.
.EXAMPLE
    .\deploy.ps1
.EXAMPLE
    .\deploy.ps1 -SkipConfirmation -SkipWait
#>

[CmdletBinding()]
param(
    [switch]$SkipConfirmation,
    [switch]$SkipWait,
    [switch]$SkipDeploy
)

$ErrorActionPreference = 'Stop'
$script:Step = 0
$script:TotalSteps = 6

function Write-Step {
    param([string]$Message)
    $script:Step++
    Write-Host ""
    Write-Host ("[{0}/{1}] {2}" -f $script:Step, $script:TotalSteps, $Message) -ForegroundColor Yellow
}

function Write-Ok {
    param([string]$Message = 'OK')
    Write-Host $Message -ForegroundColor Green
}

function Assert-LastExit {
    param([string]$Step)
    if ($LASTEXITCODE -ne 0) {
        throw "$Step falhou (codigo de saida $LASTEXITCODE). Corrija antes de deployar."
    }
    Write-Ok
}

function Confirm-Action {
    param([string]$Message)
    if ($SkipConfirmation) { return $true }

    # Read-Host LANCA excecao quando o stdin nao e interativo (CI, pipe,
    # execucao via ferramenta). Sem esta guarda o script morre com um erro
    # confuso em vez de exibir a mensagem de sucesso.
    $nonInteractive = $false
    try { $nonInteractive = [Console]::IsInputRedirected } catch { }
    if ($nonInteractive) {
        throw "Confirmacao necessaria ('$Message'), mas este ambiente nao e interativo. Use -SkipConfirmation em CI/CD."
    }

    try {
        $response = Read-Host "$Message (s/N)"
    } catch {
        throw 'Nao foi possivel solicitar confirmacao. Execute em um terminal interativo ou use -SkipConfirmation.'
    }

    if ([string]::IsNullOrWhiteSpace($response)) { return $false }
    return $response.Trim().ToLowerInvariant() -eq 's'
}

function Wait-ForKey {
    param([string]$Message = 'Pressione qualquer tecla para sair...')
    if ($SkipWait) { return }

    Write-Host ""
    Write-Host $Message -ForegroundColor Cyan

    # CI / stdin redirecionado: nao bloqueia
    try {
        if ([Console]::IsInputRedirected) { return }
    } catch { }

    try {
        $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
        return
    } catch { }

    # Fallback: Read-Host (funciona em terminais modernes)
    try {
        $null = Read-Host
    } catch { }
}

$exitCode = 0
$deployed = $false

try {
    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host "  MERCADO FACIL - DEPLOY PRODUCAO" -ForegroundColor Cyan
    Write-Host "============================================================" -ForegroundColor Cyan

    if ($SkipDeploy) {
        Write-Host "  MODO DRY-RUN: validacoes somente, sem publicar" -ForegroundColor Yellow
    }

    # ------------------------------------------------------------------
    Write-Step 'Verificando Git e branch...'
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
        throw 'git nao encontrado no PATH.'
    }
    # Bufferizar a saida antes de indexar: usar Select-Object -First 1
    # diretamente no comando nativo encerra o processo prematuramente.
    $branch = @(git rev-parse --abbrev-ref HEAD 2>$null)[0]
    if ([string]::IsNullOrWhiteSpace($branch)) { throw 'Nao e um repositorio Git valido ou git nao esta no PATH.' }
    Write-Host "Branch atual: $branch"
    if ($branch -ne 'refactor-profissional') {
        Write-Warning "Branch diferente de 'refactor-profissional'."
        if (-not (Confirm-Action 'Deseja continuar mesmo assim?')) {
            throw 'Deploy cancelado pelo usuario.'
        }
    }
    Write-Ok

    # ------------------------------------------------------------------
    Write-Step 'Verificando Node, npm e Firebase CLI...'
    foreach ($cmd in @('node', 'npm')) {
        if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
            throw "$cmd nao encontrado no PATH."
        }
    }
    $nodeVersion = @(node --version)[0].Trim()
    Write-Host "Node $nodeVersion"

    if (-not (Get-Command firebase -ErrorAction SilentlyContinue)) {
        throw 'Firebase CLI nao encontrado. Instale com: npm install -g firebase-tools'
    }
    $fbOutput = @(firebase --version 2>&1)
    $fbExit = $LASTEXITCODE
    if ($fbExit -ne 0) {
        throw "Firebase CLI respondeu com codigo $fbExit. Tente: firebase login"
    }
    $firebaseVersion = @($fbOutput | ForEach-Object { [string]$_ } | Where-Object { $_ -match '\d' })[0]
    Write-Host "Firebase CLI $firebaseVersion"

    # ------------------------------------------------------------------
    Write-Step 'Executando lint + typecheck...'
    npm run lint
    Assert-LastExit 'Lint + typecheck'

    # ------------------------------------------------------------------
    Write-Step 'Executando testes (web + functions)...'
    npx vitest run
    Assert-LastExit 'Testes web'

    Push-Location functions
    try {
        npm test
        Assert-LastExit 'Testes functions'
    } finally {
        Pop-Location
    }

    # ------------------------------------------------------------------
    Write-Step 'Gerando build de producao...'
    npm run build
    Assert-LastExit 'Build'

    # ------------------------------------------------------------------
    Write-Step 'Publicando no Firebase (projeto: mercado-facil-mt)...'
    if ($SkipDeploy) {
        Write-Host 'Dry-run: pulando firebase deploy.' -ForegroundColor Yellow
    } else {
        Write-Warning 'Ira publicar functions, hosting, firestore rules e storage rules em PRODUCAO.'
        if (-not (Confirm-Action 'Confirmar deploy em PRODUCAO?')) {
            throw 'Deploy cancelado pelo usuario.'
        }

        # --force: exigido pelo Firebase para billing de minInstances
        firebase deploy --project mercado-facil-mt --force
        Assert-LastExit 'Deploy Firebase'
        $deployed = $true
    }

    # ------------------------------------------------------------------
    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Green
    if ($deployed) {
        Write-Host "  DEPLOY CONCLUIDO COM SUCESSO!" -ForegroundColor Green
    } else {
        Write-Host "  VALIDACOES CONCLUIDAS COM SUCESSO!" -ForegroundColor Green
    }
    Write-Host "============================================================" -ForegroundColor Green

    if ($deployed) {
        Write-Host "URL do app:  https://mercado-facil-mt.web.app"
        Write-Host "Console:     https://console.firebase.google.com/project/mercado-facil-mt/overview"
        Write-Host ""
        Write-Host " proximos passos:"
        Write-Host "  1. Testar fluxo critico: PDV -> cupom -> estorno -> caixa"
        Write-Host "  2. Conferir erros no Cloud Logging"
        Write-Host "  3. Confirmar App Check ativo no Console Firebase"
    }
}
catch {
    $exitCode = 1
    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Red
    Write-Host "  DEPLOY FALHOU" -ForegroundColor Red
    Write-Host "  Motivo: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "============================================================" -ForegroundColor Red
}
finally {
    Wait-ForKey
}

exit $exitCode