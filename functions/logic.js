// ──────────────────────────────────────────────
// LÓGICA PURA DE NEGÓCIO (testável em vitest)
// Nenhuma dependência de Firebase aqui — as Cloud Functions (index.js)
// importam estas funções para TODAS as decisões financeiras: arredondamento,
// saldo, limite semanal, pagamentos mistos e idempotência.
// ──────────────────────────────────────────────
"use strict";

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

module.exports = {
  arredondar,
  cleanCpf,
  validarCpf,
  sanitizarToken,
  validarItensPuros,
  calcularPartesPagamento,
  validarTroco,
  verificarLimiteSemanal,
  validarSaldoSuficiente,
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
