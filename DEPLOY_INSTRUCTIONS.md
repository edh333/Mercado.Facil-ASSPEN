# Guia de Deploy Profissional — Mercado Fácil

## Pré-requisitos

- Node.js 20+ (recomendado 22, alinhado às Cloud Functions)
- Acesso ao projeto Firebase `mercado-facil-mt`
- Firebase CLI instalado (`npm install -g firebase-tools`) e autenticado (`firebase login`)
- Arquivo `.env` na raiz (copie de `.env.example` e preencha as chaves do Firebase)

## Release completo (recomendado)

Um único comando faz tudo — build, deploy (web/regras/functions) e publicação dos instaladores:

```bash
npm run release
```

Ou, em partes:

| Etapa | Comando |
|---|---|
| Build web + deploy completo | `npm run deploy` |
| Gerar instaladores (Usuário + Admin) | `npm run build:exe` |
| Publicar instaladores + version.json | `npm run publish:apps` |
| Apenas atualização da web | `npm run release -- --web` |
| Apenas instaladores | `npm run release -- --apps` |

## Versionamento

```bash
npm version patch   # ou minor/major — cria tag git (ex.: v1.1.0)
node scripts/release.mjs
git push --tags     # ao enviar a tag, o GitHub Actions roda o release automaticamente
```

## Verificação pós-deploy

- Web: https://mercado-facil-mt.web.app
- Instaladores: botão **"Baixar App"** do sistema (links assinados por 7 dias via `obterLinkDownloadApp`)
- Manifest público de versão: `apps/version.json` (usado pelo desktop para avisar de atualizações)

## CI/CD

O workflow `.github/workflows/release.yml` roda em tags `v*` (ou manualmente). Requer os secrets
`FIREBASE_TOKEN` (obtido com `firebase login:ci`) e as 7 variáveis `VITE_FIREBASE_*` + `VITE_GEMINI_API_KEY`.

## Observações Importantes

- As regras (`firestore.rules`, `storage.rules`) são publicadas junto no `npm run deploy`.
- O script de publicação usa um usuário temporário do Firebase Auth — não há chave de serviço no repositório.
- Instaladores usam nomes canônicos: `apps/MercadoFacil-Usuario-Setup.exe` e `apps/MercadoFacil-Admin-Setup.exe` — uma nova publicação sobrescreve a versão anterior.
- O cache do navegador pode exibir versão antiga — use **Ctrl+F5** para forçar atualização.
