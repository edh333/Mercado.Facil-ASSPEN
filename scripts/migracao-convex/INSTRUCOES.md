# Migração Convex (sistema 2 / ASSPEN antigo) → Firestore (este sistema)

O sistema 2 usa **Convex** (`ceaseless-mink-783.convex.cloud`). Este kit importa os
dados dele para o nosso Firebase de forma segura e rastreável.

## Passo 1 — Exportar os dados do Convex

1. Acesse https://dashboard.convex.dev e entre na conta dona do projeto.
2. Abra o deployment **ceaseless-mink-783** (ou o que estiver em produção).
3. Vá em **Data** e exporte cada tabela abaixo em **JSON**:
   - `users`
   - `products`
   - `orders`
   - `deposits`
   - `expenses`
   - `messages`
   - `promissories`
   - `settings`
4. Salve os arquivos dentro de `scripts/migracao-convex/export/` com os nomes
   exatos acima (ex.: `export/users.json`).

> Alternativa via CLI (se preferir): `npx convex export --path ./export` dentro
> de um projeto logado no Convex.

## Passo 2 — Chave do Firebase

1. Console Firebase → projeto **mercado-facil-mt** → Configurações do projeto →
   **Contas de serviço** → *Gerar nova chave privada*.
2. Salve como `scripts/migracao-convex/serviceAccountKey.json`.

⚠️ Esse arquivo NUNCA vai para o git (já está no `.gitignore` deste kit).

## Passo 3 — Instalar dependências e rodar

```bash
npm i --no-save firebase-admin bcryptjs

# Simulação (não grava nada — mostra o que seria importado):
node scripts/migracao-convex/importar.mjs --dry-run

# Importar tudo:
node scripts/migracao-convex/importar.mjs

# Importar só algumas tabelas:
node scripts/migracao-convex/importar.mjs --only=users,products
```

## O que o importador faz

| Tabela Convex | Destino Firestore | Observações |
|---|---|---|
| `users` | `users` | `parent`→FAMILY, `admin`→ADMIN; status mapeado; saldo mantido |
| `products` | `products` | `active:false` vira `available:false`; preço/custo/estoque validados |
| `orders` | `orders` | statuses são idênticos nos dois sistemas; itens e totais preservados |
| `deposits` | `wallet_transactions` | type=`deposit`, status pending/approved/rejected |
| `expenses` | `expenses` | descrição, valor, data |
| `messages` | `messages` | thread usuário↔admin |
| `promissories` | `migracao_promissorias` | coleção separada para conferência manual (fiado) |
| `settings` | `settings/general` | apenas chaves seguras (PIX, CNPJ, nome) |

- Cada documento recebe `migradoDe: "convex"` e `migradoEm` (ISO) para auditoria.
- Os **IDs originais do Convex são preservados**, então pedidos continuam
  apontando para os usuários corretos.
- **Senhas não migram** (hashes incompatíveis). Todo usuário migrado recebe a
  senha temporária **`asspen2026`** (bcrypt, gravada em `auth_secrets`) e deve
  trocá-la no primeiro acesso — ou usar "Esqueci minha senha"
  (CPF + CPF do interno + nome).

## Depois da migração

1. Rodar no app: aprovar/recusar pendências que vierem com status `pending`.
2. Conferir saldos de alguns familiares contra o sistema antigo.
3. Reconciliar `migracao_promissorias` (converter em dívidas fiado ou arquivar).
4. Comunicar aos familiares a senha temporária e orientar a troca.
