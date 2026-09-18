# Mercado Fácil — PDV completo (Web + Windows)

Sistema de gestão para mercados/famílias: **PDV com cupom térmico, estoque, vendas fiadas (fiança digital), carteira, relatórios e BI**. Funciona como **PWA** (celular/navegador), **app de desktop Windows** (Usuário e Administrador) e **web** — tudo sobre **Firebase** e **React + Vite + Electron**.

- **Web (produção):** https://mercado-facil-mt.web.app
- **Instaladores:** botão **"Baixar App"** dentro do sistema (links assinados por 7 dias, Cloud Function `obterLinkDownloadApp`)

---

## Stack

| Camada | Tecnologia |
|---|---|
| Front | React 19, TypeScript, Vite 6, Tailwind 4 |
| Backend | Firebase (Auth, Firestore, Storage, Functions v2, Hosting) |
| Desktop | Electron 31 + electron-builder (portable .exe) |
| Impressão térmica | impressão silenciosa via `webContents.print` (bobina 76mm/48 colunas) |

## Estrutura

```
├── src|components|pages|services|context|utils|hooks   → aplicação web
├── desktop/            → processo principal do Electron (main.js, preload.js)
├── functions/          → Cloud Functions (index.js) + firestore.rules + indexes
├── public/             → PWA (manifest, sw.js), logo.png
├── scripts/            → automações profissionais (release, build-exe, publish-apps)
├── firebase.json       → deploy (hosting, functions, firestore, storage)
├── storage.rules       → regras do Firebase Storage
└── .firebaserc         → projeto padrão: mercado-facil-mt
```

## Ambiente local

```bash
npm install          # 1 dependências
# 2 copie .env.example → .env e preencha com as chaves do Firebase (console → Config. do app)
npm run dev          # 3 web em http://localhost:5177
npm run electron-dev # app desktop em modo desenvolvimento
```

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | Web em desenvolvimento |
| `npm run build` | Build de produção (saída em `build/`) |
| `npm run lint` | Typecheck (`tsc --noEmit`) |
| `npm run build:exe` | Gera os instaladores Usuário + Admin (`dist-electron/`) |
| `npm run build:exe:user` / `:admin` | Gera apenas uma versão |
| `npm run publish:apps` | Publica instaladores + `version.json` no Storage e verifica a integridade pública |
| `npm run deploy` | Deploy hosting + firestore + storage + functions |
| `npm run release` | **Release completo** (build → deploy → exe → publish) |
| `npm run release -- --web` | Apenas build + deploy (atualização da web) |
| `npm run release -- --apps` | Apenas instaladores + Storage |

## Fluxo de release (profissional)

```bash
npm version patch|minor|major    # gera tag git (ex.: v1.1.0) — ajusta também o desktop
node scripts/release.mjs         # build web → deploy Firebase → .exe → publish
git push --tags                  # (opcional) CI/CD roda o release automaticamente
```

**O que um release publica:**
1. Aplicação web nova (hosting) + regras + functions
2. Instaladores `MercadoFacil-Usuario-Setup.exe` e `MercadoFacil-Admin-Setup.exe` (nomes canônicos; versão antiga é removida do Storage)
3. `apps/version.json` — manifest público de versão que alimenta o aviso de atualização

**Como os usuários recebem atualizações:**
- **Desktop portátil:** ao abrir, o app consulta `version.json` (público). Se houver versão nova, mostra o aviso "Nova versão disponível" com atalho para o site. O instalador é substituído baixando pela opção "Baixar App" do próprio sistema.
- **PWA/Web:** o service worker (`public/sw.js`, cache versionado) serve a nova versão automaticamente; a hospedagem usa cache imutável para ativos com hash.
- **Celular:** o próprio PWA atualiza ao abrir (nova build no hosting).

## CI/CD (GitHub Actions)

O workflow [`.github/workflows/release.yml`](.github/workflows/release.yml) roda o release completo (Windows) quando uma tag `v*` é enviada ou manualmente (workflow_dispatch).

**Configurar no GitHub (1 vez):**
1. `firebase login:ci` no seu computador → imprime um token
2. GitHub → repo → Settings → Secrets → Actions → adicione como `FIREBASE_TOKEN`
3. Adicione também os 7 secrets `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID` e `VITE_GEMINI_API_KEY` (o build os converte no `.env`)

## Regras de segurança

- **Firestore** (`firestore.rules`): acesso por documento, papéis `admin`/`master` para gestão; cliente normal só lê produtos/loja e escreve nos próprios pedidos/carteira.
- **Storage** (`storage.rules`): `products/` leitura autenticada / escrita admin; pastas privadas por usuário (`wallet_proofs`, `docs`, `comprovantes_pix`, `receipts`); `apps/` (instaladores) **leitura pública** + escrita de `.exe`/`version.json` apenas autenticado.

## Observações

- `.env` contém chaves públicas do Firebase (projeto web) — **não commitar** (já no `.gitignore`).
- O upload de instaladores autentica com a conta ADMIN do sistema (via `.env`: `FIREBASE_ADMIN_EMAIL`/`FIREBASE_ADMIN_PASSWORD`) — as Storage Rules exigem `isAdmin()`. Nada de chaves de serviço no repositório.
- Para o desktop, o nome e versão do produto vêm do `package.json` (use `npm version` para versionar).