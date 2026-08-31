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
    if (somaPagamentos !== total) throw new Error("A soma dos pagamentos não confere com o total.");
    if (walletPortion > total) throw new Error("Valor de carteira excede o total.");
    if (payments.some((p) => p.method === "FIADO" || p.method === "CARD")) {
      throw new Error("FIADO e CARD não são suportados em pagamento misto. Use somente PIX, WALLET e/ou CASH.");
    }
    if (isConsumer && walletPortion > 0) throw new Error("Venda para consumidor final não pode usar carteira.");
  } else if (paymentMethod === "CASH") {
    cashPortion = total;
  }

  return { walletPortion, cashPortion };
}

/** Valida o troco: undefined (sem troco) ou entre 0 e o valor TOTAL da venda.
 *  O cliente envia o valor LÍQUIDO em dinheiro (cashPortion === entregue − troco);
 *  por isso "cashPortion + troco" (o dinheiro entregue) é VAZIO como teto, já que
 *  cashPortion ≥ 0 torna "troco > cashPortion + troco" sempre falso. O teto sonoro
 *  e não-vacuoso é o TOTAL da venda: em dinheiro físico ninguém devolve mais troco
 *  do que o valor da compra (o caixa só é creditado com cashPortion). Sem isso um
 *  operador podia registrar change: 1.000.000 numa venda de R$ 5 — inconsistência
 *  contábil grave. totos legítimos (ex.: R$ 80 de troco numa venda de R$ 200)
 *  continuam OK, pois o teto é o total, não o valor líquido. */
function validarTroco(change, cashPortion, total) {
  if (change === undefined || change === null) return;
  const troco = Number(change);
  if (!Number.isFinite(troco) || troco < 0) {
    throw new Error("Troco inválido (deve ser maior ou igual a zero).");
  }
  if (troco > arredondar(Number(total) || 0)) {
    throw new Error("Troco inválido (não pode exceder o valor da venda).");
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

module.exports = {
  arredondar,
  cleanCpf,
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
};
