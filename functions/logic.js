// ──────────────────────────────────────────────
// LÓGICA PURA DE NEGÓCIO (testável em vitest)
// Nenhuma dependência de Firebase aqui — as Cloud Functions (index.js)
// importam estas funções para TODAS as decisões financeiras: arredondamento,
// saldo, limite semanal, pagamentos mistos e idempotência.
// ──────────────────────────────────────────────
"use strict";

// DOM parser para a NFe (Node não tem DOMParser nativo).
const { DOMParser } = require("@xmldom/xmldom");

/** Arredonda para 2 casas decimais (moeda). Nunca lança. */
function arredondar(v) {
  return Math.round((Number(v) || 0) * 100) / 100;
}

/** Remove tudo que não é dígito (CPF). */
function cleanCpf(v) {
  return String(v || "").replace(/\D/g, "");
}

/**
 * Valida o dígito verificador do CPF (algoritmo oficial do Ministério da
 * Fazenda). Devolve true SOMENTE para CPF matematicamente válido e com 11
 * dígitos. Rejeita sequências repetidas (000.000.000-00, 111.111.111-11...),
 * que passam no algoritmo mas são proibidas pela Receita. Nunca lança.
 */
function validarCpf(cpf) {
  const c = String(cpf || "").replace(/\D/g, "");
  if (c.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(c)) return false;
  try {
    let soma = 0;
    for (let i = 0; i < 9; i++) soma += parseInt(c.charAt(i), 10) * (10 - i);
    let resto = (soma * 10) % 11;
    if (resto === 10) resto = 0;
    if (resto !== parseInt(c.charAt(9), 10)) return false;
    soma = 0;
    for (let i = 0; i < 10; i++) soma += parseInt(c.charAt(i), 10) * (11 - i);
    resto = (soma * 10) % 11;
    if (resto === 10) resto = 0;
    return resto === parseInt(c.charAt(10), 10);
  } catch {
    return false;
  }
}

/** Sanitiza token de idempotência (somente [a-zA-Z0-9_-], máx 64). */
function sanitizarToken(token) {
  return String(token || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
}

/**
 * Valida e agrega itens de uma venda: produtos repetidos viram UMA linha
 * somada (mesma semântica da regra de estoque). Lança Error em caso inválido.
 */
function validarItensPuros(itens) {
  if (!Array.isArray(itens) || itens.length === 0) {
    throw new Error("Lista de itens vazia.");
  }
  const agregados = new Map();
  for (const raw of itens) {
    const productId = String(raw?.productId || "");
    const quantity = Math.floor(Number(raw?.quantity) || 0);
    if (!productId || quantity <= 0) {
      throw new Error("Item inválido na lista de compras (produto ou quantidade incorretos).");
    }
    agregados.set(productId, (agregados.get(productId) || 0) + quantity);
  }
  return Array.from(agregados.entries()).map(([productId, quantity]) => ({ productId, quantity }));
}

/**
 * Calcula as partes de carteira/dinheiro conforme a forma de pagamento
 * (WALLET / MIXED / CASH / PIX). O total SEMPRE vem do servidor (nunca do
 * cliente). Lança Error para qualquer violação — a venda NÃO acontece.
 */
function calcularPartesPagamento(paymentMethod, payments, total, isConsumer) {
  const metodosValidos = ["PIX", "WALLET", "CASH", "CARD", "FIADO", "MIXED"];
  let walletPortion = 0;
  let cashPortion = 0;

  if (paymentMethod === "WALLET") {
    if (isConsumer) throw new Error("Venda para consumidor final não pode usar carteira.");
    walletPortion = total;
  } else if (paymentMethod === "MIXED") {
    if (!payments || payments.length === 0) throw new Error("Pagamento misto sem valores.");
    for (const p of payments) {
      if (!metodosValidos.includes(p.method)) throw new Error("Método inválido no pagamento misto.");
      if (!isFinite(Number(p.amount)) || Number(p.amount) < 0) throw new Error("Valor inválido no pagamento misto.");
      if (p.method === "WALLET") walletPortion = arredondar(walletPortion + Number(p.amount));
      if (p.method === "CASH") cashPortion = arredondar(cashPortion + Number(p.amount));
    }
    const somaPagamentos = arredondar((payments || []).reduce((s, p) => s + (Number(p.amount) || 0), 0));
    // Tolerância de ±R$ 0,02: o operador digita valores a partir do total exibido
    // no PDV (cache local), enquanto o total AQUI é recalculado dos preços no
    // servidor. Diferença de centavo (promo/preço alterado, arredondamento)
    // NÃO pode rejeitar a venda com "tente novamente".
    if (Math.abs(somaPagamentos - total) > 0.02) throw new Error("A soma dos pagamentos não confere com o total.");
    if (walletPortion > total + 0.02) throw new Error("Valor de carteira excede o total.");
    if (payments.some((p) => p.method === "FIADO" || p.method === "CARD")) {
      throw new Error("FIADO e CARD não são suportados em pagamento misto. Use somente PIX, WALLET e/ou CASH.");
    }
    if (isConsumer && walletPortion > 0) throw new Error("Venda para consumidor final não pode usar carteira.");
  } else if (paymentMethod === "CASH") {
    cashPortion = total;
  }

  return { walletPortion, cashPortion };
}

/** Valida o troco: undefined (sem troco) ou entre 0 e o valor REAL entregue em dinheiro.
 *  O cliente envia o valor LÍQUIDO em dinheiro (cashPortion === entregue − troco);
 *  o dinheiro efetivamente entregue é, portanto, cashPortion + troco. Sem isso,
 *  trocos legítimos (ex.: R$ 80 de troco sobre R$ 120 entregues) eram rejeitados
 *  porque o troco ultrapassava a metade do valor líquido. */
function validarTroco(change, cashPortion) {
  if (change === undefined || change === null) return;
  const troco = Number(change);
  const dinheiroEntregue = arredondar(Number(cashPortion || 0) + troco);
  if (!Number.isFinite(troco) || troco < 0) {
    throw new Error("Troco inválido (deve ser maior ou igual a zero).");
  }
  if (troco > dinheiroEntregue) {
    throw new Error("Troco inválido (deve estar entre 0 e o valor pago em dinheiro).");
  }
}

/** Lança Error se o gasto semanal + valor exceder o limite (default 300).
 *  Limite 0 (zero) é HONRADO: bloqueia compras por carteira.
 *  Apenas undefined/null/NaN/valor negativo caem no padrão 300. */
function verificarLimiteSemanal(weeklySpent, valor, limite) {
  const numLimite = Number(limite);
  const limiteFinal = Number.isFinite(numLimite) && numLimite >= 0 ? numLimite : 300;
  if (arredondar(Number(weeklySpent || 0) + valor) > limiteFinal) {
    throw new Error(
      `Limite semanal excedido. Disponível: R$ ${arredondar(limiteFinal - Number(weeklySpent || 0)).toFixed(2)}`
    );
  }
}

/** Lança Error se o saldo for insuficiente (com o valor disponível). */
function validarSaldoSuficiente(saldo, valor) {
  if (Number(saldo || 0) < valor) {
    throw new Error(`Saldo insuficiente! Disponível: R$ ${Number(saldo || 0).toFixed(2)}`);
  }
}

/**
 * FIADO: a venda fiada ultrapassa o limite de crédito do cliente?
 * Sem limite configurado (0/ausente) = NÃO pode vender fiado — paridade com o
 * limite semanal da carteira, onde 0 já significa "bloqueado". Só
 * `autorizacaoExcepcional` (override explícito do admin) ignora o teto.
 * Retorna { excede: boolean, disponivel: number } — nunca lança.
 */
function fiadoExcedeLimite({ creditLimit, currentDebt, total, autorizacaoExcepcional }) {
  const limite = arredondar(Number(creditLimit) || 0);
  const divida = arredondar(Number(currentDebt) || 0);
  const valor = arredondar(Number(total) || 0);
  if (autorizacaoExcepcional === true) {
    return { excede: false, disponivel: arredondar(Math.max(0, limite - divida)) };
  }
  if (limite <= 0) return { excede: true, disponivel: 0 };
  return {
    excede: arredondar(divida + valor) > limite,
    disponivel: arredondar(Math.max(0, limite - divida)),
  };
}

/** Novo saldo após débito, arredondado para centavos. */
function calcularNovoSaldo(saldo, debito) {
  return arredondar(Number(saldo || 0) - Number(debito || 0));
}

/**
 * Extrai o caminho de um arquivo do NOSSO bucket a partir da URL pública do
 * Firebase Storage (…/v0/b/{bucket}/o/{caminho-encoded}). Devolve null para
 * URLs de outros buckets/domínios/protocolos — o apagador de comprovantes
 * nunca mexe em arquivo alheio (a segurança da limpeza depende disto).
 */
function caminhoStorageDeUrl(url, bucket) {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return null;
    const m = /^\/v0\/b\/([^/]+)\/o\/(.+)$/.exec(u.pathname);
    if (!m) return null;
    if (decodeURIComponent(m[1]) !== bucket) return null;
    return decodeURIComponent(m[2]);
  } catch {
    return null;
  }
}

/**
 * VENDA EM DUPLA: divide a parte de carteira entre o 1º e o 2º devedor.
 * Regra crítica de segurança: a soma das parcelas NUNCA excede a parte de
 * carteira da venda — um cliente malicioso não pode debitá-la inteira da
 * carteira do 2º devedor (ou mais que isso). Lança Error se violado.
 * Sem split válido, devolve tudo ao 1º devedor (emDupla: false).
 */
function calcularSplitVenda(walletPortion, jointWallet) {
  const total = arredondar(walletPortion);
  if (!jointWallet || typeof jointWallet !== "object") {
    return { primeiraParcela: total, segundaParcela: 0, emDupla: false };
  }
  const secondUserId = String(jointWallet.secondUserId || "").trim();
  const segundaParcela = arredondar(Math.max(0, Number(jointWallet.secondWalletAmount) || 0));
  if (!secondUserId || segundaParcela <= 0) {
    return { primeiraParcela: total, segundaParcela: 0, emDupla: false };
  }
  if (segundaParcela > total) {
    throw new Error("Valor do 2º devedor excede a parte de carteira da venda.");
  }
  return {
    primeiraParcela: arredondar(total - segundaParcela),
    segundaParcela,
    emDupla: true,
  };
}

/**
 * ESTORNO ciente do split: devolve a cada devedor a PRÓPRIA parcela.
 * Funciona para WALLET puro e para MIXED com parte em carteira; ignora
 * splits inválidos (2º devedor igual ao dono) e limita a parcela do 2º
 * ao total de carteira (defesa em profundidade contra dados corrompidos).
 */
function calcularEstornoCarteira(pedido) {
  const pm = String(pedido?.paymentMethod || "");
  const payments = Array.isArray(pedido?.payments) ? pedido.payments : [];
  const ehWallet = pm === "WALLET" || payments.some((p) => p.method === "WALLET");
  if (!ehWallet) {
    return { ehWallet: false, walletPortionTotal: 0, primeiraParcela: 0, segundaParcela: 0, secondUserId: null };
  }
  const walletPortionTotal = pm === "WALLET"
    ? arredondar(Math.abs(Number(pedido.total) || 0))
    : arredondar(payments.filter((p) => p.method === "WALLET").reduce((s, p) => s + (Math.max(0, Number(p.amount)) || 0), 0));
  const jw = pedido?.jointWallet && pedido.jointWallet.secondUserId ? pedido.jointWallet : null;
  let segundaParcela = 0;
  if (jw && String(jw.secondUserId) !== String(pedido.userId)) {
    segundaParcela = arredondar(Math.max(0, Math.min(Number(jw.secondWalletAmount) || 0, walletPortionTotal)));
  }
  return {
    ehWallet: true,
    walletPortionTotal,
    primeiraParcela: arredondar(walletPortionTotal - segundaParcela),
    segundaParcela,
    secondUserId: jw ? String(jw.secondUserId) : null,
  };
}

/**
 * DOWNLOAD DO APP ADMIN (token de uso curto).
 * O exe admin NÃO tem URL pública: o cliente pede um token novo a cada clique
 * (gerarLinkDownloadAdmin) e o endpoint de redirect o consome
 * (baixarAppAdmin: 302 para URL V4 assinada de 10 min). TTL curto limita
 * janela de vazamento do link; o limite de
 * usos tolera a retomada que alguns navegadores fazem no mesmo download sem
 * permitir reuso posterior (efetivamente um uso por clique).
 */
const TOKEN_DOWNLOAD_TTL_MINUTOS = 15;
const TOKEN_DOWNLOAD_MAX_USOS = 3;

/** Formato do token: 32 bytes aleatórios em hex (64 chars minúsculos). */
function formatoTokenDownloadValido(token) {
  return typeof token === "string" && /^[a-f0-9]{64}$/.test(token);
}

/**
 * Valida um doc de download_tokens/{token}. Devolve null quando VÁLIDO, ou o
 * motivo da recusa: 'nao_encontrado' | 'expirado' | 'consumido'.
 * Doc sem exp ou com exp malformado falha como 'expirado' (falha seguro).
 * Nunca lança.
 */
function motivoTokenDownloadInvalido(doc, agoraMs) {
  if (!doc || typeof doc !== "object") return "nao_encontrado";
  const exp = Date.parse(String(doc.exp || ""));
  if (!Number.isFinite(exp) || exp <= Number(agoraMs)) return "expirado";
  if ((Number(doc.usos) || 0) >= TOKEN_DOWNLOAD_MAX_USOS) return "consumido";
  return null;
}

// ──────────────────────────────────────────────
// AUDITORIA DE ANOMALIAS (regras puras e determinísticas)
// ──────────────────────────────────────────────
// O sistema validava a ENTRADA de cada operação (senha, saldo, estoque), mas
// não observava o COMPORTAMENTO ao longo do dia. Estas regras olham a soma
// do que aconteceu e acusam padrões que dinheiro some sem ninguém perceber.
//
// Princípios (importantes para a auditoria do código):
//  - Nenhuma dependência de Firebase: recebe arrays planos e devolve achados.
//  - Determinístico: mesma entrada => mesma saída. Sem aleatoriedade, sem hora
//    do sistema (o corte é um parâmetro), sem rede. Testável sem mocks.
//  - NUNCA bloqueia nada. Esta função só OBSERVA e relata. Quem decide é o admin.
//  - Severidade ordena a fila: CRITICO > ALTO > MEDIO > BAIXO.

const SEVERIDADES = { CRITICO: 3, ALTO: 2, MEDIO: 1, BAIXO: 0 };

const TOLERANCIA_CAIXA_CENTAVOS = 500; // R$ 5,00

/** Converte qualquer data do Firestore (ISO, Timestamp, Date, epoch) em ms.
 *  Devolve NaN quando não dá para interpretar — nunca lança. */
function paraMs(valor) {
  if (valor === null || valor === undefined) return NaN;
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : NaN;
  // Firestore Timestamp do Admin SDK: tem toMillis(); do Web SDK, toDate().
  if (typeof valor.toMillis === "function") {
    try { return valor.toMillis(); } catch { /* segue para o fallback */ }
  }
  if (typeof valor.toDate === "function") {
    try { return valor.toDate().getTime(); } catch { /* segue para o fallback */ }
  }
  if (valor instanceof Date) {
    const t = valor.getTime();
    return Number.isFinite(t) ? t : NaN;
  }
  if (typeof valor === "object" && typeof valor.seconds === "number") {
    return valor.seconds * 1000;
  }
  const t = Date.parse(String(valor));
  return Number.isFinite(t) ? t : NaN;
}

function textoDe(valor, padrao = "desconhecido") {
  const s = String(valor === null || valor === undefined ? "" : valor).trim();
  return s || padrao;
}

/** A venda envolveu dinheiro físico? (PIX/CARD/WALLET não entram no caixa.) */
function ehVendaEmDinheiro(pedido) {
  if (!pedido || typeof pedido !== "object") return false;
  if (String(pedido.paymentMethod || "").toUpperCase() === "CASH") return true;
  return Array.isArray(pedido.payments) &&
    pedido.payments.some((p) => String(p && p.method).toUpperCase() === "CASH");
}

/**
 * REGRA 1 — Estorno em rajada.
 * Mesmo operador cancelando várias vendas em pouco tempo é o padrão de quem
 * está corrigindo a própria venda indevida (erro de operação) ou de desvio.
 * Regra de FREQUÊNCIA, não de valor: conta ocorrências numa janela.
 */
function regraEstornoEmRajada(auditLogs, opcoes) {
  const { agoraMs, janelaHoras = 24, minimo = 3 } = opcoes;
  const desde = agoraMs - janelaHoras * 3600000;
  const porOperador = new Map();

  (auditLogs || []).forEach((log) => {
    if (String(log && log.acaoTipo) !== "ESTORNAR_VENDA") return;
    const t = paraMs(log.timestamp);
    if (!Number.isFinite(t) || t < desde || t > agoraMs) return;
    const op = textoDe(log.operadorUid);
    if (!porOperador.has(op)) porOperador.set(op, []);
    porOperador.get(op).push({ t, log });
  });

  const achados = [];
  porOperador.forEach((lista, operador) => {
    if (lista.length < minimo) return;
    lista.sort((a, b) => b.t - a.t);
    achados.push({
      regra: "ESTORNO_EM_RAJADA",
      severidade: lista.length >= minimo * 2 ? "CRITICO" : "ALTO",
      operador,
      quantidade: lista.length,
      janelaHoras,
      titulo: `${lista.length} estornos em ${janelaHoras}h`,
      detalhe: `O mesmo operador realizou ${lista.length} estornos nas últimas ${janelaHoras} horas.`,
      evidencia: lista.slice(0, 10).map((x) => ({
        quando: new Date(x.t).toISOString(),
        pedidoId: (x.log.payloadDepois && x.log.payloadDepois.pedidoId) || (x.log.payloadAntes && x.log.payloadAntes.pedidoId) || "",
        motivo: (x.log.payloadDepois && x.log.payloadDepois.motivo) || "",
      })),
    });
  });
  return achados;
}

/**
 * REGRA 2 — Venda em dinheiro sem sessão de caixa.
 * Dinheiro físico que não entra em nenhuma gaveta é dinheiro que some do
 * relatório. Uma venda CASH só é legítima se a sessão do operador existia
 * ABERTA no instante da venda.
 */
function regraVendaSemCaixa(pedidos, sessoes, opcoes) {
  const achados = [];
  const porOperador = new Map();

  (pedidos || []).forEach((pedido) => {
    if (!ehVendaEmDinheiro(pedido)) return;
    const t = paraMs(pedido.createdAt || pedido.date);
    if (!Number.isFinite(t)) return;
    const operador = textoDe(pedido.operatorId);
    const sessao = (sessoes || []).find((s) => {
      if (textoDe(s.operatorId) !== operador) return false;
      const abertura = paraMs(s.openedAt);
      const fechamento = paraMs(s.closedAt);
      if (!Number.isFinite(abertura) || abertura > t) return false;
      // Sessão ainda aberta cobre qualquer instante posterior à abertura.
      if (!Number.isFinite(fechamento)) return true;
      return fechamento >= t;
    });
    if (sessao) return;
    if (!porOperador.has(operador)) porOperador.set(operador, []);
    porOperador.get(operador).push({ t, pedido });
  });

  porOperador.forEach((lista, operador) => {
    const total = arredondar(lista.reduce((s, x) => s + Number(x.pedido.total || 0), 0));
    achados.push({
      regra: "VENDA_SEM_SESSAO_CAIXA",
      severidade: total >= 500 ? "CRITICO" : "ALTO",
      operador,
      quantidade: lista.length,
      titulo: `${lista.length} venda(s) em dinheiro sem caixa`,
      detalhe: `R$ ${total.toFixed(2)} em vendas CASH sem sessão de caixa aberta no instante da venda.`,
      evidencia: lista.slice(0, 10).map((x) => ({
        quando: new Date(x.t).toISOString(),
        pedidoId: textoDe(x.pedido.id, ""),
        total: Number(x.pedido.total || 0),
      })),
    });
  });
  return achados;
}

/**
 * REGRA 3 — Divergência de caixa recorrente.
 * Uma sessão com diferença de centavos é normal (erro de contagem). Três ou
 * mais seguidas do MESMO operador suggestem padrão — e dinheiro faltando é a
 * hipótese mais provável. Ignora o valor: sinaliza a repetição.
 */
function regraDivergenciaRecorrente(sessoes, opcoes) {
  const { minimoSessoes = 3, toleranciaCentavos = TOLERANCIA_CAIXA_CENTAVOS } = opcoes;
  // ATENÇÃO: balanceDiff é gravado em REAIS (ver gerenciarSessaoCaixa), mas a
  // tolerância é configurada em CENTAVOS (R$ 5,00 = 500). Comparar as duas
  // grandezas sem converter faz toda diferença real parecer "erro de contagem"
  // e some com a regra inteira.
  const toleranciaReais = toleranciaCentavos / 100;
  const porOperador = new Map();

  (sessoes || []).forEach((s) => {
    if (String(s && s.status) !== "closed") return;
    const diff = Number(s.balanceDiff);
    if (!Number.isFinite(diff) || diff === 0) return;
    if (Math.abs(diff) < toleranciaReais) return;
    const op = textoDe(s.operatorId);
    if (!porOperador.has(op)) porOperador.set(op, []);
    porOperador.get(op).push({ s, diff });
  });

  const achados = [];
  porOperador.forEach((lista, operador) => {
    if (lista.length < minimoSessoes) return;
    const soma = arredondar(lista.reduce((t, x) => t + x.diff, 0));
    const nome = textoDe(lista[0].s.operatorName, operador);
    achados.push({
      regra: "DIVERGENCIA_CAIXA_RECORRENTE",
      severidade: Math.abs(soma) >= 100 ? "CRITICO" : "ALTO",
      operador,
      quantidade: lista.length,
      titulo: `${lista.length} fechamentos com divergência`,
      detalhe: `${nome} fechou ${lista.length} sessões com diferença acima de R$ ${toleranciaReais.toFixed(2)}. Saldo somado: R$ ${soma.toFixed(2)}.`,
      evidencia: lista.slice(0, 10).map((x) => ({
        sessaoId: textoDe(x.s.id, ""),
        quando: paraMs(x.s.closedAt) ? new Date(paraMs(x.s.closedAt)).toISOString() : "",
        expected: Number(x.s.expectedBalance || 0),
        fechado: Number(x.s.closedBalance || 0),
        diferenca: x.diff,
      })),
    });
  });
  return achados;
}

/**
 * REGRA 4 — Depósito aprovado e recusado no mesmo dia, para o mesmo usuário.
 * Aprova, recusa, aprova de novo: ou o depósito foi liberado por influência,
 * ou o próprio requerente o contestou.
 * deposit disputed by whoever asked. Mesmo par dentro da janela é movimento.
 */
function regraDepositoAprovadoERecusado(auditLogs, opcoes) {
  const { agoraMs, janelaHoras = 24 } = opcoes;
  const desde = agoraMs - janelaHoras * 3600000;
  const eventos = new Map(); // userId -> { aprovacoes, recusas }

  const usuarioDoLog = (log) => {
    const depois = log && log.payloadDepois;
    const antes = log && log.payloadAntes;
    return textoDe((depois && depois.userId) || (antes && antes.userId), "");
  };

  (auditLogs || []).forEach((log) => {
    const tipo = String(log && log.acaoTipo || "");
    if (tipo !== "LIBERAR_CREDITO_DEPOSITO" && tipo !== "REJEITAR_DEPOSITO") return;
    const t = paraMs(log.timestamp);
    if (!Number.isFinite(t) || t < desde || t > agoraMs) return;
    const uid = usuarioDoLog(log);
    if (!uid) return;
    if (!eventos.has(uid)) eventos.set(uid, { aprovacoes: [], recusas: [] });
    const slot = tipo === "LIBERAR_CREDITO_DEPOSITO" ? "aprovacoes" : "recusas";
    eventos.get(uid)[slot].push(t);
  });

  const achados = [];
  eventos.forEach(({ aprovacoes, recusas }, uid) => {
    if (!aprovacoes.length || !recusas.length) return;
    const contra = aprovacoes.length + recusas.length;
    achados.push({
      regra: "DEPOSITO_OSCILANTE",
      severidade: contra >= 4 ? "ALTO" : "MEDIO",
      operador: "",
      alvo: uid,
      quantidade: contra,
      titulo: `${aprovacoes.length} aprovação(ões) e ${recusas.length} recusa(s)`,
      detalhe: `O mesmo depósito do usuário foi decidido ${contra} vezes em ${janelaHoras}h. Reprovação e liberação alternadas exigem conferência manual.`,
      evidencia: [
        ...aprovacoes.map((t) => ({ quando: new Date(t).toISOString(), decisao: "aprovado" })),
        ...recusas.map((t) => ({ quando: new Date(t).toISOString(), decisao: "recusado" })),
      ].sort((a, b) => a.quando.localeCompare(b.quando)),
    });
  });
  return achados;
}

/**
 * REGRA 5 — Venda abaixo do custo.
 * O PDV calcula tudo no servidor a partir de priceAtPurchase; se o preço pago
 * ficou abaixo do custo do produto, ou a venda saiu por um preço manual
 * questionável, o prejuízo é silencioso. Tolerância de 1% absorve arredondamento.
 */
function regraVendaNoPrejuizo(pedidos, produtosPorId, opcoes) {
  const { toleranciaPct = 0.01 } = opcoes;
  const achados = [];
  const porProduto = new Map();

  (pedidos || []).forEach((pedido) => {
    if (String(pedido && pedido.status || "").toUpperCase() === "CANCELLED") return;
    const itens = Array.isArray(pedido.items) ? pedido.items : [];
    itens.forEach((item) => {
      const custo = Number(produtosPorId && produtosPorId[item.productId]);
      if (!Number.isFinite(custo) || custo <= 0) return; // custo desconhecido: sem julgamento
      const pago = Number(item.priceAtPurchase !== undefined ? item.priceAtPurchase : item.price);
      if (!Number.isFinite(pago) || pago <= 0) return;
      // A tolerância é folga PARA BAIXO: pagando até 1% menos que o custo é
      // arredondamento, não prejuízo. Só vira alerta quando passa disso.
      const piso = custo * (1 - toleranciaPct);
      if (pago >= piso) return;
      const perda = arredondar((custo - pago) * (Number(item.quantity) || 1));
      if (perda <= 0) return;
      const chave = item.productId;
      if (!porProduto.has(chave)) porProduto.set(chave, { perda: 0, itens: [] });
      const acc = porProduto.get(chave);
      acc.perda = arredondar(acc.perda + perda);
      acc.itens.push({
        quando: paraMs(pedido.createdAt || pedido.date)
          ? new Date(paraMs(pedido.createdAt || pedido.date)).toISOString() : "",
        pedidoId: textoDe(pedido.id, ""),
        nome: textoDe(item.name, ""),
        pago,
        custo,
        perda,
      });
    });
  });

  porProduto.forEach((acc, productId) => {
    if (acc.itens.length < 1) return;
    achados.push({
      regra: "VENDA_ABAIXO_DO_CUSTO",
      severidade: acc.perda >= 100 ? "ALTO" : "MEDIO",
      operador: "",
      alvo: productId,
      quantidade: acc.itens.length,
      titulo: `Perda de R$ ${acc.perda.toFixed(2)} em "${textoDe(acc.itens[0].nome, productId)}"`,
      detalhe: `${acc.itens.length} venda(s) abaixo do custo do produto. Prejuízo total estimado: R$ ${acc.perda.toFixed(2)}.`,
      evidencia: acc.itens.slice(0, 10),
    });
  });
  return achados;
}

/**
 * REGRA 6 — Crédito manual elevado.
 * Creditar saldo na mão é o caminho mais curto para desvio. Não é proibido
 * (o admin precisa disso), mas um valor acima do normal merece registro.
 * `limitePadraoCredito` é o que a casa considera grande; sem ele, R$ 500.
 */
function regraCreditoManualElevado(auditLogs, opcoes) {
  const { agoraMs, janelaHoras = 24, limitePadraoCredito = 500 } = opcoes;
  const desde = agoraMs - janelaHoras * 3600000;
  const achados = [];

  (auditLogs || []).forEach((log) => {
    if (String(log && log.acaoTipo) !== "CREDITO_MANUAL") return;
    const t = paraMs(log.timestamp);
    if (!Number.isFinite(t) || t < desde || t > agoraMs) return;
    const depois = log.payloadDepois || {};
    const valor = Number(depois.valor !== undefined ? depois.valor : depois.amount);
    if (!Number.isFinite(valor) || valor < limitePadraoCredito) return;
    achados.push({
      regra: "CREDITO_MANUAL_ELEVADO",
      severidade: valor >= limitePadraoCredito * 4 ? "ALTO" : "MEDIO",
      operador: textoDe(log.operadorUid),
      alvo: textoDe(depois.userId, ""),
      quantidade: 1,
      titulo: `Crédito manual de R$ ${valor.toFixed(2)}`,
      detalhe: `Crédito liberado manualmente acima de R$ ${limitePadraoCredito.toFixed(2)}. Conferir se havia depósito aprovado correspondente.`,
      evidencia: [{ quando: new Date(t).toISOString(), valor, motivo: textoDe(depois.motivo, "") }],
    });
  });
  return achados;
}

/**
 * Motor principal: roda TODAS as regras e devolve os achados ordenados por
 * severidade (e, dentro da mesma severidade, pela perda/quantia).
 *
 * @param {object} entrada
 * @param {Array}  entrada.auditLogs    - ações de auditoria do período
 * @param {Array}  entrada.pedidos      - pedidos do período
 * @param {Array}  entrada.sessoes      - sessões de caixa (abertas e fechadas)
 * @param {object} entrada.produtosPorId- mapa { productId: custo }
 * @param {number} entrada.horas        - janela de análise (padrão 24)
 * @param {number} entrada.agoraMs      - instante de corte (injetado nos testes)
 * @returns {Array} achados ordenados
 */
function detectarAnomalias(entrada) {
  const {
    auditLogs = [], pedidos = [], sessoes = [],
    produtosPorId = {}, horas = 24, agoraMs = Date.now(),
    minimoEstornos = 3, minimoSessoesDivergentes = 3,
    toleranciaCaixaCentavos = TOLERANCIA_CAIXA_CENTAVOS,
    toleranciaPrejuizoPct = 0.01, limitePadraoCredito = 500,
  } = entrada || {};
  const opcoes = {
    agoraMs, janelaHoras: horas, minimo: minimoEstornos,
    minimoSessoes: minimoSessoesDivergentes,
    toleranciaCentavos: toleranciaCaixaCentavos,
    toleranciaPct: toleranciaPrejuizoPct,
    limitePadraoCredito,
  };

  const achados = []
    .concat(regraEstornoEmRajada(auditLogs, opcoes))
    .concat(regraVendaSemCaixa(pedidos, sessoes, opcoes))
    .concat(regraDivergenciaRecorrente(sessoes, opcoes))
    .concat(regraDepositoAprovadoERecusado(auditLogs, opcoes))
    .concat(regraVendaNoPrejuizo(pedidos, produtosPorId, opcoes))
    .concat(regraCreditoManualElevado(auditLogs, opcoes));

  return achados.sort((a, b) => {
    const sev = SEVERIDADES[b.severidade] - SEVERIDADES[a.severidade];
    if (sev !== 0) return sev;
    return (b.quantidade || 0) - (a.quantidade || 0);
  });
}

// ───────────────────────────────────────────────────────────────────────────
// NOMES DE PRODUTO — normalização p/ deduplicação (port de utils.ts)
// ───────────────────────────────────────────────────────────────────────────

function toTitleCase(str) {
  return str.replace(/\w\S*/g, (txt) => {
    if (["PET", "UVA", "COCA", "OVO", "USA", "IP", "LED", "PVC", "SAB", "DET", "YPE", "OMO", "QBOA", "SP"].includes(txt.toUpperCase())) return txt.toUpperCase();
    if (["KG", "ML", "L", "G", "M", "UN", "CM", "MM"].includes(txt.toUpperCase())) return txt.toLowerCase();
    if (["DE", "DA", "DO", "EM", "COM", "E", "POR", "PARA", "SEM"].includes(txt.toUpperCase())) return txt.toLowerCase();
    return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
  });
}

function cleanProductName(name) {
  if (!name) return "";

  let cleaned = name.toUpperCase();
  cleaned = cleaned.replace(/^[\d\s.-]+/, "");
  cleaned = cleaned.replace(/\(.*?\)/g, " ");
  cleaned = cleaned.replace(/[*'"_]/g, " ");

  const abbrevs = {
    BISC: "BISCOITO", "BISC.": "BISCOITO",
    REFRIG: "REFRIGERANTE", REF: "REFRIGERANTE", "REF.": "REFRIGERANTE",
    SAB: "SABONETE", "SAB.": "SABONETE",
    DET: "DETERGENTE", "DET.": "DETERGENTE",
    AMAC: "AMACIANTE", "AMAC.": "AMACIANTE",
    CR: "CREME", "CR.": "CREME",
    PAST: "PASTA", ESC: "ESCOVA", "ESC.": "ESCOVA",
    PAP: "PAPEL", HIG: "HIGIENICO", "HIG.": "HIGIENICO",
    CHOC: "CHOCOLATE", "CHOC.": "CHOCOLATE", BOMB: "BOMBOM",
    BAT: "BATATA", PAL: "PALHA", ACO: "ACO",
    INST: "INSTANTANEO", "INST.": "INSTANTANEO",
    LIMP: "LIMPEZA", MULTI: "MULTIUSO",
    DESINF: "DESINFETANTE", "DESINF.": "DESINFETANTE",
    ABS: "ABSORVENTE", "ABS.": "ABSORVENTE",
    COND: "CONDICIONADOR", "COND.": "CONDICIONADOR",
    SHAMP: "SHAMPOO", SHAM: "SHAMPOO",
  };

  cleaned = cleaned.split(/\s+/).map((word) => abbrevs[word] || word).join(" ");

  const trashWords = [
    "CAIXA", "CX", "CX.", "FARDO", "FDO", "FD", "FD.",
    "PACOTE", "PCT", "PCTE", "PCT.", "DISPLAY", "DSP",
    "DUZIA", "CARTELA", "CART",
    "PROMOCAO", "OFERTA", "GRATIS", "L.V.", "PAGUE", "LEVE",
    "SABORES", "SABOR", "SAB", "DE", "DA", "DO", "DOS", "DAS", "COM", "E", "EM", "PARA",
  ];

  trashWords.forEach((word) => {
    const regexEnd = new RegExp(`\\s+${word.replace(".", "\\.")}$`, "gi");
    const regexMid = new RegExp(`\\s+${word.replace(".", "\\.")}\\s+`, "gi");
    cleaned = cleaned.replace(regexEnd, "");
    cleaned = cleaned.replace(regexMid, " ");
  });

  cleaned = cleaned.replace(/\s+\d+\.\d{2}$/, "");
  cleaned = cleaned.replace(/\s{2,}/g, " ").replace(/^[\.\-\s]+|[\.\-\s]+$/g, "").trim();

  return toTitleCase(cleaned);
}

/** Chave de comparação de nomes: sem acento, sem espaço, sem pontuação. */
function normalizeName(name) {
  return cleanProductName(name).toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]/g, "");
}

/** Similaridade de Levenshtein normalizada (0..1). "" vs "" = 1. */
function stringSimilarity(a, b) {
  const longer = a.length >= b.length ? a : b;
  const shorter = a.length < b.length ? a : b;
  if (longer.length === 0) return 1.0;
  const costs = [];
  for (let i = 0; i <= shorter.length; i++) costs[i] = i;
  for (let i = 1; i <= longer.length; i++) {
    let prev = i;
    for (let j = 1; j <= shorter.length; j++) {
      const val = longer[i - 1] === shorter[j - 1] ? costs[j - 1] : Math.min(
        costs[j - 1] + 1,
        prev + 1,
        costs[j] + 1
      );
      costs[j - 1] = prev;
      prev = val;
    }
    costs[shorter.length] = prev;
  }
  return (longer.length - costs[shorter.length]) / longer.length;
}

// ───────────────────────────────────────────────────────────────────────────
// PARSER DE NOTA FISCAL ELETRÔNICA (NFe XML)
// Port de utils/invoiceParser.ts para o servidor — mesma semântica da prévia
// do painel (fallbacks qCom/vUnCom, GTIN, saneamento de custo/qtd) para o
// operador importar exatamente o que conferiu. DOM via @xmldom/xmldom (Node
// não tem DOMParser nativo). A busca casa por nome LOCAL (localName),
// ignorando prefixo nfe:/NFe: — o getElementsByTagName comum NÃO faz isso em
// XML prefixado (o comentário do port do front dizia o contrário).
// ───────────────────────────────────────────────────────────────────────────

/** Elementos descendentes cujo nome LOCAL casa com `nome` (ignora prefixo). */
function tagsLocais(raiz, nome) {
  const todos = raiz.getElementsByTagName("*");
  const achados = [];
  for (let i = 0; i < todos.length; i++) {
    const el = todos[i];
    const local = String(el.localName || el.tagName || "").split(":").pop();
    if (local === nome) achados.push(el);
  }
  return achados;
}

function tagPorNome(raiz, nome) {
  const encontrados = tagsLocais(raiz, nome);
  return encontrados.length > 0 ? encontrados[0] : null;
}

function textoTag(el, nome) {
  const tag = tagPorNome(el, nome);
  return ((tag && tag.textContent) || "").replace(/\u00A0/g, " ").trim();
}

function numeroNfe(el, nome) {
  // Layout oficial da NFe usa SEMPRE ponto como separador decimal
  // ("<vUnCom>4.99</vUnCom>" = R$ 4,99). Só ponto → decimal direto; só
  // vírgula → BR; os dois → o ÚLTIMO separador é o decimal.
  let s = textoTag(el, nome).replace(/\s/g, "");
  if (!s) return NaN;
  const temVirgula = s.includes(",");
  const temPonto = s.includes(".");
  if (temVirgula && temPonto) {
    s = s.lastIndexOf(",") > s.lastIndexOf(".")
      ? s.replace(/\./g, "").replace(/,/g, ".")
      : s.replace(/,/g, "");
  } else if (temVirgula) {
    s = s.replace(/\./g, "").replace(/,/g, ".");
  }
  const n = parseFloat(s);
  return isNaN(n) ? NaN : n;
}

function ehGtin(v) {
  return /^\d{8,14}$/.test(v);
}

function parseInvoiceXML(xml) {
  try {
    let problemas = "";
    let doc;
    try {
      doc = new DOMParser({
        onError: (nivel, mensagem) => {
          if (nivel !== "warning" && !problemas) problemas = String(mensagem || "");
        },
      }).parseFromString(xml, "text/xml");
    } catch (e) {
      // ParseError do xmldom (tag desalinhada, raiz ausente...) ≈ parsererror.
      console.error("[parseInvoiceXML] XML inválido:", e && e.message ? e.message : e);
      return null;
    }
    if (problemas || !doc || !doc.documentElement) {
      console.error("[parseInvoiceXML] XML inválido:", problemas || "sem elemento raiz");
      return null;
    }

    const result = { items: [] };

    // Fornecedor (emitente) — caminhos NFe e NFeProc (autorização)
    const emit = tagPorNome(doc, "emit");
    if (emit) {
      const nome = textoTag(emit, "xNome");
      const cnpj = textoTag(emit, "CNPJ") || textoTag(emit, "CPF");
      result.supplier = { name: nome, cnpj };
    }

    // Itens (produtos) — namespace-safe por nome local
    const dets = tagsLocais(doc, "det");
    for (let i = 0; i < dets.length; i++) {
      const prodElement = tagPorNome(dets[i], "prod");
      if (!prodElement) continue;

      const name = textoTag(prodElement, "xProd");
      if (!name) continue;

      const ean = textoTag(prodElement, "cEAN") || textoTag(prodElement, "cEANTrib") || "";
      const eanValido = ehGtin(ean);
      const code = textoTag(prodElement, "cProd") || "";
      const ncm = textoTag(prodElement, "NCM");
      const unidade = textoTag(prodElement, "uCom") || textoTag(prodElement, "uTrib") || "UN";

      // Marca: lista conhecida ou primeira palavra em maiúsculas
      let brand = "";
      const brandList = [
        "ALBA", "AVIANCA", "BIC", "LOREAL", "NESTLE", "NESTLÉ", "DANONE", "AMBEV", "HEINEKEN", "COCA COLA", "COCA-COLA", "PEPSI",
        "SKOL", "BRASEIRO", "PERNAMBUCANAS", "HAVAN", "SAMSUNG", "LG", "PHILCO", "ELECTROLUX", "BRASTEMP", "CONSUL", "XIAOMI",
        "MOTOROLA", "APPLE", "POSITIVO", "MULTILASER", "ARNO", "MONDIAL", "PARATI", "MARILAN", "UNILEVER", "P&G", "BRF", "JBS",
        "AURORA", "MINUANO", "SADIA", "PERDIGAO", "PERDIGÃO", "SEARA", "KIMBERLY", "COLGATE", "PALMOLIVE", "NIVEA", "JOHNSON",
        "OAKLEY", "NIKE", "ADIDAS", "PUMA", "FILA", "ASICS", "MIZUNO", "KAPPA", "UMBRO", "PENALTY", "TOPPER", "LUPO", "TRIFIL",
        "HERING", "MALWEE", "MARISA", "C&A", "REACHUELO", "RENNER", "ZARA", "LEVIS", "DIESEL", "CALVIN KLEIN", "GUESS",
        "TOMMY HILFIGER", "LACOSTE", "HUGO BOSS", "ARMANI", "ROLEX", "PANDORA", "VIVARA", "CHILLI BEANS", "RAY-BAN",
        "NATURA", "AVON", "BOTICARIO", "EUDORA", "JEQUITI", "PAMPERS", "HUGGIES", "TURMA DA MONICA", "RENOVE", "VEJA",
        "OMOR", "IPÊ", "LIMPOL", "YPÊ", "MINUANO", "BOMBRIL", "TIXAN", "ARIEL", "BRILHANTE", "SUFRESH", "TANG", "MID",
        "CAMP", "VALLE", "KAPO", "MAGUARY", "GAROTO", "LACTA", "HERSHEY", "ARCOR", "M&M", "FINI", "DOCILE",
      ];
      const brandRegex = new RegExp(`(?:^|\\s)(${brandList.join("|")})(?:\\s|$)`, "i");
      const brandMatch = name.match(brandRegex);
      if (brandMatch && brandMatch[1]) {
        brand = brandMatch[1].trim().toUpperCase();
      } else {
        const words = name.split(" ");
        if (words[0] && words[0].length > 2 && words[0] === words[0].toUpperCase() && !/^\d+$/.test(words[0]) && !["COM", "PARA", "SEM", "PROD", "KIT"].includes(words[0])) {
          brand = words[0];
        }
      }

      // Quantidade e preço com fallbacks: qCom → qTrib / vUnCom → vProd/qCom → vUnTrib
      let quantity = numeroNfe(prodElement, "qCom");
      if (isNaN(quantity) || quantity <= 0) quantity = numeroNfe(prodElement, "qTrib");
      if (isNaN(quantity) || quantity <= 0) quantity = 1;

      let costPrice = numeroNfe(prodElement, "vUnCom");
      if (isNaN(costPrice) || costPrice <= 0) {
        const qtdRef = numeroNfe(prodElement, "qCom") || quantity;
        const vProd = numeroNfe(prodElement, "vProd");
        if (!isNaN(vProd) && qtdRef > 0) costPrice = vProd / qtdRef;
        else costPrice = numeroNfe(prodElement, "vUnTrib");
      }
      if (isNaN(costPrice) || costPrice < 0) costPrice = 0;

      // SANITY: preço plausível de supermercado (R$ 0,01 a R$ 100.000/un).
      // NFe corrompida ("vUnCom=78.434.600.000") → tenta vProd/qCom e vUnTrib;
      // se continuar absurdo, zera para o operador ajustar na tela.
      const PRECO_PLAUSIVEL = 100000;
      if (costPrice > PRECO_PLAUSIVEL) {
        const qtdRef = numeroNfe(prodElement, "qCom") || quantity;
        const vProd = numeroNfe(prodElement, "vProd");
        const tentativa = (!isNaN(vProd) && qtdRef > 0) ? vProd / qtdRef : numeroNfe(prodElement, "vUnTrib");
        if (!isNaN(tentativa) && tentativa > 0 && tentativa <= PRECO_PLAUSIVEL) costPrice = tentativa;
        else costPrice = 0;
      }

      // Quantidade absurda (> 999.999) indica qCom corrompida na NFe
      if (quantity > 999999) quantity = 1;

      let category = "Geral";
      if (ncm) {
        if (ncm.startsWith("02") || ncm.startsWith("03")) category = "Carnes";
        else if (ncm.startsWith("04") || ncm.startsWith("05")) category = "Laticínios";
        else if (ncm.startsWith("09")) category = "Bebidas";
        else if (ncm.startsWith("16") || ncm.startsWith("19")) category = "Massas";
        else if (ncm.startsWith("17") || ncm.startsWith("20")) category = "Bebidas";
        else if (ncm.startsWith("21") || ncm.startsWith("22")) category = "Chocolate";
        else if (ncm.startsWith("23")) category = "Rações";
        else if (ncm.startsWith("24")) category = "Bebidas Alcoólicas";
        else if (ncm.startsWith("25") || ncm.startsWith("28")) category = "Cervejas";
        else if (ncm.startsWith("30") || ncm.startsWith("32")) category = "Condimentos";
        else if (ncm.startsWith("33")) category = "Sopas";
        else if (ncm.startsWith("34")) category = "Sal";
        else if (ncm.startsWith("35")) category = "Açúcar";
        else if (ncm.startsWith("36")) category = "Café";
        else if (ncm.startsWith("38")) category = "Sabão";
        else if (ncm.startsWith("39") || ncm.startsWith("40")) category = "Sabonetes";
        else if (ncm.startsWith("44")) category = "Perfumes";
        else if (ncm.startsWith("48")) category = "Papel";
        else if (ncm.startsWith("49")) category = "Revistas";
        else if (ncm.startsWith("61")) category = "Medicamentos";
        else if (ncm.startsWith("62")) category = "Higiene";
        else if (ncm.startsWith("63")) category = "Absorventes";
        else if (ncm.startsWith("64") || ncm.startsWith("65")) category = "Higiene Pessoal";
        else if (ncm.startsWith("70") || ncm.startsWith("73")) category = "Limpeza";
        else if (ncm.startsWith("84")) category = "Utensílios";
        else if (ncm.startsWith("85") || ncm.startsWith("87")) category = "Eletrodomésticos";
        else if (ncm.startsWith("90")) category = "Suprimentos";
        else if (ncm.startsWith("94")) category = "Bebidas";
      }

      // Código de barras: GTIN válido da nota, senão o código do fornecedor
      const codigoBarras = eanValido ? ean : (code || undefined);
      result.items.push({
        name,
        costPrice,
        quantity,
        category,
        description: `${code ? "Código: " + code + " | " : ""}NCM: ${ncm} | Und: ${unidade}`,
        ean: codigoBarras,
        barcode: codigoBarras,
        brand: brand || undefined,
      });
    }

    return result.items.length > 0 ? result : null;
  } catch (e) {
    console.error("[parseInvoiceXML] Erro ao processar XML:", e);
    return null;
  }
}

module.exports = {
  arredondar,
  cleanCpf,
  validarCpf,
  normalizeName,
  stringSimilarity,
  parseInvoiceXML,
  sanitizarToken,
  validarItensPuros,
  calcularPartesPagamento,
  validarTroco,
  verificarLimiteSemanal,
  validarSaldoSuficiente,
  fiadoExcedeLimite,
  calcularNovoSaldo,
  caminhoStorageDeUrl,
  calcularSplitVenda,
  calcularEstornoCarteira,
  formatoTokenDownloadValido,
  motivoTokenDownloadInvalido,
  TOKEN_DOWNLOAD_TTL_MINUTOS,
  TOKEN_DOWNLOAD_MAX_USOS,
  detectarAnomalias,
  paraMs,
  TOLERANCIA_CAIXA_CENTAVOS,
};
