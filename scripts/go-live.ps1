# ─────────────────────────────────────────────────────────────
# GO-LIVE — Mercado Fácil PDV (ordem técnica OBRIGATÓRIA)
#
#   Passo 1: Deploy das Cloud Functions   (contém a blindagem da venda)
#   Passo 2: Backfill de Admin Claims      (sincronizarClaims no Auth)
#   Passo 3: Deploy das Security Rules     (Firestore + Storage) — por ÚLTIMO
#
# Uso:
#   powershell -ExecutionPolicy Bypass -File scripts/go-live.ps1
#   powershell -ExecutionPolicy Bypass -File scripts/go-live.ps1 -KeyFile C:\path\adminsdk.json
#
# Regra de ouro das regras de segurança:
#   TODOS os admins precisam RELOGAR (sair e entrar) APÓS o passo 2 e ANTES do
#   passo 3. Um ID token antigo sem o claim admin:true fará o novo
#   request.auth.token.admin==true FALHAR as rules no servidor.
# ─────────────────────────────────────────────────────────────
param(
  [string]$KeyFile = ""
)

$ErrorActionPreference = "Stop"

function Step {
  param([string]$Title)
  Write-Host ""
  Write-Host ("=" * 70) -ForegroundColor Cyan
  Write-Host ("  " + $Title) -ForegroundColor Cyan
  Write-Host ("=" * 70) -ForegroundColor Cyan
}

Write-Host "Preparando Go-Live do Mercado Fácil PDV..." -ForegroundColor Yellow

# 0. Sanity check: build localmente antes de publicar qualquer coisa.
Step "Passo 0 - Build (garantia de que TypeScript e o bundle passam)"
npm run build
if ($LASTEXITCODE -ne 0) { throw "Build falhou. Abortando Go-Live." }

# 1. DEPLOY DAS CLOUD FUNCTIONS — PRIMEIRO.
#    A venda já valida a sessão de caixa DENTRO da transação (functions/index.js).
#    As rules ainda antigas continuam valendo (isAdmin() tem fallback no doc
#    users/{uid}) — por isso functions podem ir primeiro sem risco.
Step "Passo 1 - Deploy das Cloud Functions"
npm run deploy:functions
if ($LASTEXITCODE -ne 0) { throw "Deploy das Functions falhou. Abortando Go-Live." }

# 2. BACKFILL DE ADMIN CLAIMS — UMA VEZ, ANTES DAS RULES.
#    Garante que todo admin/master ativo tenha admin:true no custom claim.
Step "Passo 2 - Sincronização de Admin Claims (backfill)"
if (-not $KeyFile) {
  $KeyFile = Read-Host "Caminho da service account (.json) para o backfill de claims"
}
if (-not (Test-Path -LiteralPath $KeyFile)) {
  throw "Service account nao encontrada em: $KeyFile"
}
Push-Location "$PSScriptRoot\..\functions"
try {
  node backfill-claims.js $KeyFile
  if ($LASTEXITCODE -ne 0) { throw "Backfill de claims falhou. Abortando Go-Live." }
} finally {
  Pop-Location
}

Write-Host ""
Write-Host "ACÃO REQUERIDA: TODOS os admins devem RELOGAR (sair e entrar) " -ForegroundColor Magenta
Write-Host "antes do proximo passo, para os tokens pegarem o claim admin:true." -ForegroundColor Magenta
Read-Host "Pressione ENTER quando todos os admins confirmarem o re-login..."

# 3. DEPLOY DAS SECURITY RULES — POR ÚLTIMO.
#    firestore.rules agora inclui a regra da coleção locks (trava de caixa).
Step "Passo 3 - Deploy das Security Rules (Firestore + Storage)"
npm run deploy:rules
if ($LASTEXITCODE -ne 0) { throw "Deploy das Rules falhou." }

Write-Host ""
Write-Host "GO-LIVE CONCLUÍDO." -ForegroundColor Green
Write-Host "Resumo do que foi publicado:"
Write-Host "  [Functions] Validacao de sessao de caixa DENTRO da transacao de venda"
Write-Host "  [Auth]      Admin claims sincronizados (backfill)"
Write-Host "  [Rules]     firestore.rules + storage.rules (inclui colecao locks)"