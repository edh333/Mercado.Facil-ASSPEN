# App Check — passo a passo (monitor → enforce)

Guia operacional para ligar o **Firebase App Check** no Mercado Fácil sem derrubar
o sistema. Escrito a partir do estado real do código (ver “Estado atual”).

> Regra de ouro: **primeiro monitorar, depois bloquear.** Nunca ligue `enforce`
> sem ter confirmado, no Console, que as chamadas chegam com token válido.

---

## 0. Estado atual do código (importante)

- **Cliente** (`firebase.ts:106`): o App Check só é inicializado se a variável
  `VITE_APP_CHECK_SITE_KEY` existir no `.env`. Hoje ela **não** existe → o cliente
  **não envia** o header `X-Firebase-AppCheck`.
- **Servidor** (`functions/index.js:67`):
  ```js
  const APP_CHECK_ENFORCE = process.env.APP_CHECK_ENFORCE === "true";
  const OPCOES_APP_CHECK = APP_CHECK_ENFORCE ? { enforceAppCheck: true } : {};
  ```
  Ou seja, sem `APP_CHECK_ENFORCE=true` o `OPCOES_APP_CHECK` é `{}` (inerte).
- **Cobertura**: apenas **2** endpoints recebem `...OPCOES_APP_CHECK` hoje
  (`redefinirSenhaPublica` e `obterDownloadAppUsuario`). As callables sensíveis
  (ex.: `creditarSaldo`, `processarVendaAdmin`, `sacarSaldoAdmin`) **NÃO** têm —
  então ligar o enforce hoje **não protege o dinheiro** e ainda arrisca os 2
  endpoints públicos. A **Fase 2** abaixo corrige isso.

---

## Fase 1 — Registrar o provedor e ligar em MONITOR (não bloqueia)

1. **reCAPTCHA v3 (chave de site)**
   - Console reCAPTCHA (google.com/recaptcha/admin) → criar site, tipo **v3**.
   - Copie a **site key** (o código usa `ReCaptchaV3Provider`, que é v3).
2. **Registrar no Firebase**
   - Firebase Console → **App Check** → Apps → app **Web** → provedor
     **reCAPTCHA v3** → cole a site key.
   - **NÃO** clique em “Enforce” ainda (as APIs ficam “Unenforced” = monitor).
3. **Cliente**
   - No `.env` (raiz): `VITE_APP_CHECK_SITE_KEY=<sua site key>`
   - `npm run build` e deploy do hosting (`npx firebase deploy --only hosting`).
4. **Dev local (opcional)**
   - O código ainda **não** trata token de debug. Para testar sem reCAPTCHA em
     `localhost`, registre um **debug token** no Console (App Check → Debug
     tokens) e adicione no `firebase.ts` **antes** do `initializeAppCheck`:
     ```ts
     // @ts-expect-error — global do SDK
     self.FIREBASE_APPCHECK_DEBUG_TOKEN = import.meta.env.VITE_APP_CHECK_DEBUG_TOKEN;
     ```
5. **Observar ~1–2 dias**
   - Console → App Check → **APIs**: as métricas devem mostrar requisições
     **Verified** subindo e **Unverified** caindo a zero para cada API.
   - DevTools → Network → chamadas a `*.run.app` / `firestore` devem ir com o
     header `X-Firebase-AppCheck`.

**Checklist Fase 1**
- [ ] App registrado no App Check com provedor reCAPTCHA v3
- [ ] `VITE_APP_CHECK_SITE_KEY` no `.env` + hosting deployado
- [ ] Header `X-Firebase-AppCheck` presente nas requisições (Network)
- [ ] Métricas do Console com `Verified` > 0 e `Unverified` → 0
- [ ] Nenhum erro novo no Cloud Logging / Sentry

---

## Fase 2 — Cobrir os endpoints protegidos (mudança de código, ainda inerte)

Enquanto `APP_CHECK_ENFORCE` for `false`, esta mudança **não altera nada** —
ela só prepara o terreno para o enforce.

### Opção A (recomendada): uma linha global em `functions/index.js`

`setGlobalOptions` (firebase-functions v5) **suporta `enforceAppCheck`**. Basta
mover a constante para antes do `setGlobalOptions` e incluir a flag:

```js
// (mover o bloco APP_CHECK — linhas ~48-68 — para ANTES do setGlobalOptions)
const APP_CHECK_ENFORCE = process.env.APP_CHECK_ENFORCE === "true";

setGlobalOptions({ maxInstances: 20, enforceAppCheck: APP_CHECK_ENFORCE });
```

Isso passa a exigir token em **todas** as funções. Em seguida, **exclua** os
endpoints que não conseguem enviar o header, sobrescrevendo por função:

```js
// baixarAppAdmin: responde redirect(302) e é acessado por navegação normal —
// não tem como mandar X-Firebase-AppCheck.
exports.baixarAppAdmin = onRequest({ enforceAppCheck: false }, async (req, res) => { ... });
```

> Confirme se a Landing (`obterDownloadAppUsuario`) também deve ficar fora. Se o
> bundle web inicializa o App Check mesmo sem login, ele consegue enviar token e
> pode ficar **dentro** do enforce.

### Opção B (padrão atual): espalhar `...OPCOES_APP_CHECK`

Adicionar `...OPCOES_APP_CHECK,` ao objeto de opções de cada `onCall` sensível
(mais verboso e fácil de esquecer algum).

---

## Fase 3 — Ativar o ENFORCE

1. **Definir a variável de runtime das Functions**
   - Crie `functions/.env` (ignorado pelo git — `.env`/`.env.*` estão no
     `.gitignore`) com:
     ```
     APP_CHECK_ENFORCE=true
     ```
   - Alternativa por projeto: `functions/.env.mercado-facil-mt`.
2. **Deploy das Functions**
   - `npx firebase deploy --only functions` (ou `deploy.bat`).
3. **Enforce no Console** (para Auth/Firestore/Storage) — só depois das Functions:
   - App Check → **APIs** → ativar **Enforce** em **Cloud Firestore** e
     **Cloud Storage** e **Authentication**.
4. **Monitorar de perto as primeiras horas**: Cloud Logging por
   `app_check`/`unauthenticated`, e o Sentry.

**Checklist Fase 3**
- [ ] `functions/.env` com `APP_CHECK_ENFORCE=true` deployado
- [ ] Logs sem erros `unauthenticated`/`app-check` após o deploy das Functions
- [ ] PWA (navegador) operando normalmente
- [ ] **App desktop (Electron)** operando — ver risco abaixo
- [ ] Só então “Enforce” ligado no Console para Firestore/Storage/Auth

---

## Riscos e cuidados (leia antes)

- **App desktop (Electron)**: reCAPTCHA v3 **não** roda no Electron da mesma
  forma que no navegador. Se o desktop chama as Functions e o enforce estiver
  ligado, ele **falha** sem um token. Antes de ativar enforce, garanta que o
  Electron inicialize o App Check com um provedor próprio (ou um debug token
  fixo em produção) — ver o comentário em `functions/index.js:59-60`.
- **`baixarAppAdmin`**: NUNCA colocar under enforce — é `redirect(302)` acessado
  por navegação, sem header possível (ver `functions/index.js:63-66`).
- **Landing pública** (`obterDownloadAppUsuario`): hoje está com
  `...OPCOES_APP_CHECK`, mas o comentário diz que é público de propósito. Decida
  conscientemente (dentro ou fora) antes de ligar o enforce.
- **Famílias/mobile**: usam o mesmo bundle web → recebem App Check normalmente.
- **Token de debug** nunca deve ir para produção (só `localhost`).

---

## Rollback rápido

1. `.env` da raiz: remover `VITE_APP_CHECK_SITE_KEY` (cliente para de enviar) —
   ou apenas reverter o hosting.
2. `functions/.env`: `APP_CHECK_ENFORCE=false` → `npx firebase deploy --only functions`.
3. Console → App Check → APIs → **Unenforced** (desliga o bloqueio imediatamente).

---

### Resumo do caminho feliz
registrar provedor → `VITE_APP_CHECK_SITE_KEY` + hosting → **monitor 1–2 dias**
→ **Fase 2** (código, inerte) → `functions/.env` `APP_CHECK_ENFORCE=true` +
deploy functions → **monitor** → só então “Enforce” no Console.
