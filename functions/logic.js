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

/** Lança Error se o gasto semanal + valor exceder o limite (default 300). */
function verificarLimiteSemanal(weeklySpent, valor, limite) {
  const limiteFinal = Number(limite) || 300;
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
};
