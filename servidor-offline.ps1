# ─────────────────────────────────────────────────────────────────────────────
#  Mercado Facil - Servidor Local (Modo OFFLINE)
#  Serve a pasta "dist" (build do sistema) por HTTP local no navegador padrao.
#  NAO precisa instalar nada: usa o PowerShell (ja vem no Windows) e o
#  HttpListener do .NET. Funciona de qualquer pasta/pendrive (o build do Vite
#  usa caminhos absolutos "/assets/..." que resolvem corretamente porque o
#  servidor ROOT e a propria pasta dist).
#
#  Como usar:
#    1. Copie esta pasta com o "dist" (e o Iniciar-Offline.bat) para o
#       pendrive/computador.
#    2. De dois cliques em Iniciar-Offline.bat  (ou rode este script).
#    3. Abre direto na TELA DE LOGIN DO PAINEL ADMIN (?mode=admin).
#    4. IMPORTANTE - PRIMEIRA VEZ NESTE COMPUTADOR:
#       precisa de INTERNET para entrar com o login do administrador e baixar
#       produtos/clientes (fica salvo no cache do navegador). Depois disso,
#       pode vender SEM internet quando precisar.
#    5. Quando a internet voltar, o sistema sincroniza SOZINHO: as vendas
#       feitas offline vao para a nuvem e os dados (produtos, saldos) sao
#       atualizados automaticamente.
# ─────────────────────────────────────────────────────────────────────────────

$ErrorActionPreference = 'Stop'

# Caminho do dist relativo a ESTE script (funciona em qualquer letra de drive)
$raiz = Join-Path $PSScriptRoot 'dist'

if (-not (Test-Path (Join-Path $raiz 'index.html'))) {
    Write-Host ''
    Write-Host '  [Mercado Facil - OFFLINE] Pasta "dist" nao encontrada nesta pasta.' -ForegroundColor Red
    Write-Host '  Gere o build antes (precisa Node):  npm run build' -ForegroundColor DarkYellow
    Write-Host '  Ou rode criar-portatil.bat, que monta a pasta portatil/ pronta.' -ForegroundColor DarkYellow
    Write-Host ''
    Read-Host ' Pressione ENTER para fechar'
    exit 1
}

# Extensao -> MIME (PWA/Firebase precisam do "application/javascript", nao "text/plain")
$mime = @{
    '.html' = 'text/html; charset=utf-8'
    '.js'   = 'application/javascript; charset=utf-8'
    '.mjs'  = 'application/javascript; charset=utf-8'
    '.json' = 'application/json; charset=utf-8'
    '.css'  = 'text/css; charset=utf-8'
    '.png'  = 'image/png'
    '.jpg'  = 'image/jpeg'
    '.jpeg' = 'image/jpeg'
    '.svg'  = 'image/svg+xml'
    '.ico'  = 'image/x-icon'
    '.webp' = 'image/webp'
    '.woff' = 'font/woff'
    '.woff2' = 'font/woff2'
    '.webmanifest' = 'application/manifest+json'
    '.txt'  = 'text/plain; charset=utf-8'
}

$listener = [System.Net.HttpListener]::new()
$porta = 8080
# Porta fixa (nao "porta dinamica"): os dados locais do navegador (login,
# cache do Firestore, fila de vendas offline) ficam atrelados ao endereco.
# Se a porta mudasse a cada abertura, o sistema "esqueceria" o login/cache.
try {
    $listener.Prefixes.Add("http://localhost:$porta/")
} catch {
    Write-Host ''
    Write-Host "  [Mercado Facil] A porta $porta ja esta em uso." -ForegroundColor Red
    Write-Host '  Feche outra instancia do sistema/browser e tente de novo.' -ForegroundColor DarkYellow
    Write-Host ''
    Read-Host ' Pressione ENTER para fechar'
    exit 1
}

try { $listener.Start() } catch {
    Write-Host ''
    Write-Host "  [Mercado Facil] Nao foi possivel iniciar o servidor na porta $porta." -ForegroundColor Red
    Write-Host "  Detalhe: $($_.Exception.Message)" -ForegroundColor DarkGray
    Read-Host ' Pressione ENTER para fechar'
    exit 1
}

Write-Host ''
Write-Host '  ================================================' -ForegroundColor Green
Write-Host '  Mercado Facil - rodando OFFLINE (servidor local)' -ForegroundColor Green
Write-Host '  ================================================' -ForegroundColor Green
Write-Host "  Endereco aberto:  http://localhost:$porta/?mode=admin" -ForegroundColor Cyan
Write-Host '  Com internet: conecta normalmente no Firebase.' -ForegroundColor DarkGray
Write-Host '  Sem internet: usa o cache local e a fila de vendas offline.' -ForegroundColor DarkGray
Write-Host '  Dica 1a vez neste PC: precisa de internet para logar e carregar produtos.' -ForegroundColor DarkGray
Write-Host '  Sincroniza sozinho quando a internet voltar.' -ForegroundColor DarkGray
Write-Host '  Para sair: feche esta janela.' -ForegroundColor DarkGray
Write-Host ''

# Abre o navegador padrao ja na tela de LOGIN DO ADMIN (nao na Landing).
Start-Process "http://localhost:$porta/?mode=admin"

function Get-Mime([string]$arquivo) {
  $ext = [System.IO.Path]::GetExtension($arquivo).ToLowerInvariant()
  if ($mime.ContainsKey($ext)) { return $mime[$ext] }
  return 'application/octet-stream'
}

# index.html/sw.js/manifest SEMPRE do disco (Cache-Control: no-cache):
# evita o navegador usar uma versao velha guardada no cache HTTP quando o
# dono atualiza a pasta do pendrive. O Service Worker (cache offline) NAO e
# afetado por esse cabecalho e continua funcionando normalmente.
$noCache = @('.html', '.js', '.json', '.webmanifest', '.txt', '.css')

while ($true) {
    try { $contexto = $listener.GetContext() } catch { break }
    $req = $contexto.Request
    $res = $contexto.Response
    $rel = $req.Url.AbsolutePath
    if ($rel -eq '/') { $rel = '/index.html' }

    $caminho = [System.IO.Path]::GetFullPath((Join-Path $raiz ($rel.TrimStart('/'))))

    # Seguranca: jamais servir arquivos fora da pasta dist (traversal de caminho)
    $dentro = $caminho.StartsWith($raiz, [System.StringComparison]::OrdinalIgnoreCase)

    try {
        if (-not $dentro -or -not (Test-Path -LiteralPath $caminho -PathType Leaf)) {
            $res.StatusCode = 404
            $res.ContentType = 'text/plain; charset=utf-8'
            $texto = '404 - nao encontrado'
            $bytes = [System.Text.Encoding]::UTF8.GetBytes($texto)
            $res.ContentLength64 = $bytes.Length
            $res.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $ext = [System.IO.Path]::GetExtension($rel).ToLowerInvariant()
            if ($noCache.Contains($ext)) {
                $res.Headers.Add('Cache-Control', 'no-cache, no-store, must-revalidate')
            }
            $bytes = [System.IO.File]::ReadAllBytes($caminho)
            $res.StatusCode = 200
            $res.ContentType = Get-Mime $caminho
            $res.ContentLength64 = $bytes.Length
            $res.OutputStream.Write($bytes, 0, $bytes.Length)
        }
    } catch {
        try {
            $res.StatusCode = 500
            $res.ContentType = 'text/plain; charset=utf-8'
            $texto = '500 - erro interno do servidor local'
            $bytes = [System.Text.Encoding]::UTF8.GetBytes($texto)
            $res.ContentLength64 = $bytes.Length
            $res.OutputStream.Write($bytes, 0, $bytes.Length)
        } catch { }
    } finally {
        try { $res.OutputStream.Close() } catch { }
        try { $res.Close() } catch { }
    }
}