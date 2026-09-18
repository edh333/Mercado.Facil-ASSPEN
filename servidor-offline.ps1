# ─────────────────────────────────────────────────────────────────────────────
#  Mercado Fácil - Servidor Local (Modo OFFLINE)
#  Serve a pasta "dist" (build do sistema) por HTTP local no navegador padrão.
#  NÃO precisa instalar nada: usa o PowerShell (já vem no Windows) e o
#  HttpListener do .NET. Funciona de qualquer pasta/pendrive (caminhos 100%
#  relativos, porque o Vite foi compilado com --base=./).
#
#  Como usar:
#    1. Copie esta pasta com o "dist" (e o Iniciar-Offline.bat) para o
#       pendrive/computador.
#    2. Dê dois cliques em Iniciar-Offline.bat  (ou rode este script).
#    3. O sistema abre no navegador. Com internet conecta no Firebase;
#       sem internet, usa o cache local e a fila de vendas offline.
# ─────────────────────────────────────────────────────────────────────────────

$ErrorActionPreference = 'Stop'

# Caminho do dist relativo a ESTE script (funciona em qualquer letra de drive)
$raiz = Join-Path $PSScriptRoot 'dist'

if (-not (Test-Path (Join-Path $raiz 'index.html'))) {
    Write-Host ''
    Write-Host '  [Mercado Faceis - OFFLINE] Pasta "dist" nao encontrada nesta pasta.' -ForegroundColor Red
    Write-Host '  Gere antes o build:  npm run build:web   (precisa Node).' -ForegroundColor DarkYellow
    Write-Host '  Ou rode build-exe.mjs que tambem gera a pasta dist/.' -ForegroundColor DarkYellow
    Write-Host ''
    Read-Host ' Pressione ENTER para fechar'
    exit 1
}

# Extensão -> MIME (PWA/Firebase precisam do "application/javascript", não "text/plain")
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
# Porta fixa (não "porta dinâmica"): os dados locais do navegador (login,
# cache do Firestore, fila de vendas offline) ficam atrelados ao endereço.
# Se a porta mudasse a cada abertura, o sistema "esqueceria" o login/cache.
try {
    $listener.Prefixes.Add("http://localhost:$porta/")
} catch {
    Write-Host ''
    Write-Host "  [Mercado Faceis] A porta $porta ja esta em uso." -ForegroundColor Red
    Write-Host '  Feche outra instancia do sistema/browser e tente de novo.' -ForegroundColor DarkYellow
    Write-Host ''
    Read-Host ' Pressione ENTER para fechar'
    exit 1
}

try { $listener.Start() } catch {
    Write-Host ''
    Write-Host "  [Mercado Faceis] Nao foi possivel iniciar o servidor na porta $porta." -ForegroundColor Red
    Write-Host "  Detalhe: $($_.Exception.Message)" -ForegroundColor DarkGray
    Read-Host ' Pressione ENTER para fechar'
    exit 1
}

Write-Host ''
Write-Host '  ================================================' -ForegroundColor Green
Write-Host '  Mercado Facil - rodando OFFLINE (servidor local)' -ForegroundColor Green
Write-Host '  ================================================' -ForegroundColor Green
Write-Host "  Endereco aberto:  http://localhost:$porta" -ForegroundColor Cyan
Write-Host '  Com internet: conecta normalmente no Firebase.' -ForegroundColor DarkGray
Write-Host '  Sem internet: usa o cache local e a fila de vendas offline.' -ForegroundColor DarkGray
Write-Host '  Para sair: feche esta janela.' -ForegroundColor DarkGray
Write-Host ''

# Abre o navegador padrão
Start-Process "http://localhost:$porta/"

function Get-Mime([string]$arquivo) {
  $ext = [System.IO.Path]::GetExtension($arquivo).ToLowerInvariant()
  if ($mime.ContainsKey($ext)) { return $mime[$ext] }
  return 'application/octet-stream'
}

while ($true) {
    try { $contexto = $listener.GetContext() } catch { break }
    $req = $contexto.Request
    $res = $contexto.Response
    $rel = $req.Url.AbsolutePath
    if ($rel -eq '/') { $rel = '/index.html' }

    $caminho = [System.IO.Path]::GetFullPath((Join-Path $raiz ($rel.TrimStart('/'))))

    # Segurança: jamais servir arquivos fora da pasta dist (traversal de caminho)
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