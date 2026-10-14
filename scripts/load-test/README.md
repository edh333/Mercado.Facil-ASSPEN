# Teste de carga do PDV (k6)

Mede **quantas vendas simultâneas o sistema aguenta** e por quanto tempo, em um
projeto de **homologação**. Diferente dos testes unitários (`npm test`), que
provam que a regra de negócio está correta, este teste responde "a que carga o
backend responde sem degradar?".

> ⚠️ **NUNCA aponte para produção.** O perfil de venda CRIA pedidos e BAIXA
> ESTOQUE de verdade, além de consumir cota do Firebase (leitura/escrita/funções
> = custo real). Use apenas o projeto de homolog (`mercado-facil-homolog`).

## 1. Instalar o k6

Windows (winget): `winget install k6` — ou baixe em https://k6.io/docs/get-started/installation/

## 2. Preparar o ambiente de homolog

1. **Contas de teste** com papel de operador e permissão `sales` (o mesmo perfil
   que opera o PDV). Anote `email:senha`.
2. **Produto de teste** com **estoque alto** (cada venda decrementa 1 unidade).
   Anote `PRODUCT_ID`, `PRODUCT_NAME`, `PRODUCT_PRICE`.
3. Para **`METHOD=CASH`**: abra uma **sessão de caixa** no PDV e copie o
   `SESSION_ID` (sem ela a venda em dinheiro é recusada).
4. A **Web API key** do projeto de homolog (está no `.env.homolog` local, na
   variável `VITE_FIREBASE_API_KEY`).

## 3. Rodar

Smoke (só leitura, sem mutação — valide a conexão primeiro):

```powershell
k6 run -e API_KEY=<chave> -e USERS="operador@homolog:senha" -e PROFILE=smoke scripts/load-test/pdv-venda.k6.js
```

Carga de venda (patamar de 10 operadores por 5 minutos):

```powershell
k6 run -e API_KEY=<chave> `
  -e USERS="op1@homolog:senha,op2@homolog:senha" `
  -e PROFILE=venda -e VUS=10 -e DURATION=5m `
  -e METHOD=CASH -e SESSION_ID=<id-da-sessao> `
  -e PRODUCT_ID=P1 -e PRODUCT_NAME="Refri" -e PRODUCT_PRICE=5.5 `
  scripts/load-test/pdv-venda.k6.js
```

Rampa até um alvo de vendas/segundo (acha o ponto de saturação):

```powershell
k6 run -e API_KEY=<chave> -e USERS="op1@homolog:senha" -e PROFILE=ramp -e TARGET_RPS=30 -e METHOD=CASH -e SESSION_ID=<id> scripts/load-test/pdv-venda.k6.js
```

Pico súbito (spike) para ver recuperação:

```powershell
k6 run -e API_KEY=<chave> -e USERS="op1@homolog:senha" -e PROFILE=spike -e VUS=10 -e METHOD=CASH -e SESSION_ID=<id> scripts/load-test/pdv-venda.k6.js
```

## 4. Perfis

| PROFILE | O que faz | Muta dados? |
|---|---|---|
| `smoke` | 1 usuário, 10s, só chama `obterHoraServidor` (leitura) | Não |
| `venda` | Patamar constante de `VUS` operadores por `DURATION` | Sim |
| `ramp` | Sobe até `TARGET_RPS` vendas/seg e mantém | Sim |
| `spike` | Sobe a `VUS*4` de uma vez e cai | Sim |

## 5. Como ler o resultado

- `http_req_duration` **p(95)/p(99)**: latência da venda. O limiar reprova se
  p95 ≥ 1500 ms ou p99 ≥ 3000 ms.
- `http_req_failed`: taxa de falha de rede/HTTP (limiar: < 1%).
- `venda_sucesso`: % de vendas aceitas pelo servidor (limiar: > 99%).
- `http_reqs` (total) ÷ duração = **vazão** alcançada (vendas/seg).

O k6 imprime `✓`/`✗` por limiar e retorna código de saída ≠ 0 se algum limiar
falhar — dá para plugar num CI depois.

## 6. Limites que costumam aparecer primeiro

- **Firestore**: ~1 escrita/seg por documento; o contador de estoque do produto é
  um ponto quente se todas as vendas usarem o MESMO `PRODUCT_ID`.
- **Cloud Functions**: `maxInstances: 20` (topo do `functions/index.js`) limita a
  concorrência simultânea — é o teto mais provável sob pico.
- **Custo**: cada venda gera várias leituras/escritas + auditoria. Rode janelas
  curtas em homolog.
