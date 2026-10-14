// Teste de CARGA do fluxo de venda do PDV (k6).
//
// NUNCA aponte para produção: este teste CRIA pedidos e BAIXA ESTOQUE de verdade.
// Use SEMPRE o projeto de HOMOLOG (mercado-facil-homolog).
//
// Pré-requisitos (veja README.md):
//   - Usuário(s) de teste com papel de operador e permissão "sales".
//   - Produto de teste com estoque alto (o teste decrementa a cada venda).
//   - Para METHOD=CASH: uma sessão de caixa aberta (SESSION_ID).
//
// Variáveis de ambiente (todas via -e CHAVE=valor):
//   PROJECT_ID   projeto Firebase (default: mercado-facil-homolog)
//   REGION       região das functions (default: us-central1)
//   FN_BASE      base das functions (default: https://<REGION>-<PROJECT>.cloudfunctions.net)
//   API_KEY      Web API key do projeto (obrigatória para login)
//   USERS        "email1:senha1,email2:senha2" (uma ou várias contas; obrigatório)
//   PROFILE      smoke (só leitura) | venda (carga de venda) | ramp | spike (default: smoke)
//   VUS          usuários virtuais no patamar (default: 5)
//   DURATION     duração do patamar (default: 1m)
//   METHOD       CASH | PIX | CARD | WALLET (default: CASH)
//   PRODUCT_ID / PRODUCT_NAME / PRODUCT_PRICE   item vendido (default: dados de placeholder)
//   SESSION_ID   id da sessão de caixa aberta (necessário para CASH/MIXED)
//   TARGET_RPS   alvo de requisições/seg no perfil "ramp" (default: 20)
//
// @ts-nocheck
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const PROJECT = __ENV.PROJECT_ID || 'mercado-facil-homolog';
const REGION = __ENV.REGION || 'us-central1';
const FN_BASE = __ENV.FN_BASE || `https://${REGION}-${PROJECT}.cloudfunctions.net`;
const API_KEY = __ENV.API_KEY || '';
const PROFILE = (__ENV.PROFILE || 'smoke').toLowerCase();
const METHOD = (__ENV.METHOD || 'CASH').toUpperCase();
const VUS = Number(__ENV.VUS || 5);
const DURATION = __ENV.DURATION || '1m';
const TARGET_RPS = Number(__ENV.TARGET_RPS || 20);

const PRODUCT_ID = __ENV.PRODUCT_ID || 'PRODUTO_DE_TESTE';
const PRODUCT_NAME = __ENV.PRODUCT_NAME || 'Produto de Teste';
const PRODUCT_PRICE = Number(__ENV.PRODUCT_PRICE || 5.5);
const SESSION_ID = __ENV.SESSION_ID || '';

// Métricas de negócio (além das nativas do k6).
const vendaOk = new Rate('venda_sucesso');
const vendaDuracao = new Trend('venda_duracao_ms', true);

function perfis() {
  if (PROFILE === 'smoke') {
    return { smoke: { executor: 'constant-vus', vus: 1, duration: '10s' } };
  }
  if (PROFILE === 'ramp') {
    return {
      ramp: {
        executor: 'ramping-arrival-rate',
        startRate: 1,
        timeUnit: '1s',
        stages: [
          { duration: '30s', target: Math.ceil(TARGET_RPS / 2) },
          { duration: DURATION, target: TARGET_RPS },
          { duration: '15s', target: 0 },
        ],
        preAllocatedVUs: Math.max(10, VUS),
        maxVUs: Math.max(50, VUS * 5),
      },
    };
  }
  if (PROFILE === 'spike') {
    return {
      spike: { executor: 'ramping-vus', startVUs: 1, stages: [
        { duration: '10s', target: VUS },
        { duration: '20s', target: VUS * 4 },
        { duration: '10s', target: 0 },
      ] },
    };
  }
  // venda (patamar constante)
  return { venda: { executor: 'constant-vus', vus: VUS, duration: DURATION } };
}

export const options = {
  scenarios: perfis(),
  thresholds: {
    // Falha de requisição (erro de rede/HTTP) abaixo de 1%.
    http_req_failed: ['rate<0.01'],
    // Latência do endpoint dentro de limites aceitáveis para o PDV.
    http_req_duration: ['p(95)<1500', 'p(99)<3000'],
    // Em perfis de escrita, a esmagadora maioria das vendas deve ser aceita.
    venda_sucesso: ['rate>0.99'],
  },
};

// Faz login via Firebase Auth REST e devolve o ID token (usado como Bearer).
function login(email, senha) {
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`;
  const res = http.post(url, JSON.stringify({ email, password: senha, returnSecureToken: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
  if (res.status !== 200) {
    throw new Error(`Login falhou para ${email} (HTTP ${res.status}): ${res.body}`);
  }
  return res.json('idToken');
}

// Chama uma Cloud Function callable (protocolo de callable do Firebase).
function callable(nome, token, data) {
  const res = http.post(`${FN_BASE}/${nome}`, JSON.stringify({ data }), {
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    tags: { callable: nome },
  });
  return res;
}

export function setup() {
  const usuarios = (__ENV.USERS || '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const i = p.indexOf(':');
      return { email: p.slice(0, i), senha: p.slice(i + 1) };
    });

  if (!API_KEY) throw new Error('Defina API_KEY (Web API key do projeto).');
  if (usuarios.length === 0) throw new Error('Defina USERS no formato "email:senha,email2:senha2".');

  const tokens = usuarios.map((u) => login(u.email, u.senha));
  return { tokens, project: PROJECT, profile: PROFILE, method: METHOD };
}

export default function (data) {
  const token = data.tokens[(__VU - 1) % data.tokens.length];

  // Perfil "smoke": apenas mede latência de uma leitura barata (sem mutação).
  if (data.profile === 'smoke') {
    const res = callable('obterHoraServidor', token, {});
    check(res, {
      'smoke: HTTP 200': (r) => r.status === 200,
      'smoke: sem erro de função': (r) => !r.body || r.body.indexOf('"error"') === -1,
    });
    sleep(1);
    return;
  }

  // Perfil de venda: grava pedido (e baixa estoque).
  const clientToken = `${__VU}-${__ITER}-${Date.now()}`;
  const payload = {
    targetUserId: 'balcao_anonimo',
    paymentMethod: data.method,
    items: [{ productId: PRODUCT_ID, name: PRODUCT_NAME, price: PRODUCT_PRICE, quantity: 1 }],
    total: PRODUCT_PRICE,
    clientToken,
  };
  if (SESSION_ID) payload.sessaoCaixaId = SESSION_ID;

  const inicio = Date.now();
  const res = callable('processarVendaAdmin', token, payload);
  vendaDuracao.add(Date.now() - inicio);

  const semErro = res.status === 200 && res.body.indexOf('"error"') === -1;
  vendaOk.add(semErro);

  check(res, {
    'venda: HTTP 200': (r) => r.status === 200,
    'venda: sem erro de função': (r) => r.body.indexOf('"error"') === -1,
  });

  // Ritmo humano entre vendas por operador (evita martelar sem pausa).
  sleep(1);
}
