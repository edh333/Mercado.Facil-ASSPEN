// FLUXO 1 — Venda no PDV → Estorno → Caixa.
//
// Exercita a integração REAL de processarVendaAdmin + estornarVenda sobre um
// Firestore em memória: estoque, carteira, caixa e idempotência, na mesma
// transação. São exatamente os pontos onde um bug move dinheiro errado.
import { beforeEach, describe, expect, it } from "vitest";
import { fake, call } from "./test-support/harness.js";
import { baseSeed, MASTER_PASSWORD } from "./test-support/fixtures.js";

async function vender(data) {
  return call("processarVendaAdmin", data, "op1");
}

async function estornar(orderId, extra = {}) {
  return call("estornarVenda", { orderId, motivo: "devolução de teste", senhaMestra: MASTER_PASSWORD, ...extra }, "admin1");
}

beforeEach(() => {
  fake.reset(baseSeed());
});

describe("fluxo venda → estorno → caixa (CASH)", () => {
  it("venda em dinheiro credita a gaveta, baixa estoque e grava o pedido", async () => {
    const res = await vender({
      targetUserId: "balcao_anonimo",
      paymentMethod: "CASH",
      items: [{ productId: "p1", quantity: 2 }],
      sessaoCaixaId: "s1",
      clientToken: "tok-cash-1",
    });

    expect(res.ok).toBe(true);
    expect(res.order.total).toBe(20);
    expect(res.order.status).toBe("paid");

    expect(fake.getDoc("products", "p1").stock).toBe(98);

    const sessao = fake.getDoc("cash_sessions", "s1");
    expect(sessao.currentBalance).toBe(20);
    expect(sessao.supplements).toHaveLength(1);
    expect(sessao.supplements[0].amount).toBe(20);

    expect(fake.count("orders")).toBe(1);
    expect(fake.count("wallet_transactions")).toBe(0);
    expect(fake.allDocs("audit_logs").some((l) => l.acaoTipo === "VENDA_PDV_ADMIN")).toBe(true);
  });

  it("estorno devolve o estoque e debita EXATAMENTE o que foi creditado na gaveta", async () => {
    const { order } = await vender({
      targetUserId: "balcao_anonimo",
      paymentMethod: "CASH",
      items: [{ productId: "p1", quantity: 2 }],
      sessaoCaixaId: "s1",
      clientToken: "tok-cash-2",
    });

    const est = await estornar(order.id);
    expect(est.ok).toBe(true);

    expect(fake.getDoc("products", "p1").stock).toBe(100);
    expect(fake.getDoc("cash_sessions", "s1").currentBalance).toBe(0);
    expect(fake.getDoc("orders", order.id).status).toBe("cancelled");
    expect(fake.getDoc("orders", order.id).refundReason).toBe("devolução de teste");
    expect(fake.allDocs("audit_logs").some((l) => l.acaoTipo === "ESTORNAR_VENDA")).toBe(true);
  });

  it("não permite estornar a MESMA venda duas vezes (sem double-refund)", async () => {
    const { order } = await vender({
      targetUserId: "balcao_anonimo",
      paymentMethod: "CASH",
      items: [{ productId: "p1", quantity: 1 }],
      sessaoCaixaId: "s1",
      clientToken: "tok-cash-3",
    });

    await estornar(order.id);
    await expect(estornar(order.id)).rejects.toMatchObject({ code: "functions/invalid-argument" });

    // gaveta e estoque não voltaram a mexer
    expect(fake.getDoc("cash_sessions", "s1").currentBalance).toBe(0);
    expect(fake.getDoc("products", "p1").stock).toBe(100);
  });

  it("replay com o mesmo clientToken NÃO debita estoque nem gaveta de novo", async () => {
    const payload = {
      targetUserId: "balcao_anonimo",
      paymentMethod: "CASH",
      items: [{ productId: "p1", quantity: 2 }],
      sessaoCaixaId: "s1",
      clientToken: "tok-replay",
    };

    const first = await vender(payload);
    const stockAfter = fake.getDoc("products", "p1").stock;
    const balAfter = fake.getDoc("cash_sessions", "s1").currentBalance;

    const second = await vender(payload);
    expect(second.order.replay).toBe(true);
    expect(second.order.id).toBe(first.order.id);

    expect(fake.getDoc("products", "p1").stock).toBe(stockAfter);
    expect(fake.getDoc("cash_sessions", "s1").currentBalance).toBe(balAfter);
    expect(fake.count("orders")).toBe(1);
  });

  it("venda em dinheiro SEM caixa aberto é recusada", async () => {
    fake.reset({ ...baseSeed(), cash_sessions: {} });
    await expect(
      vender({
        targetUserId: "balcao_anonimo",
        paymentMethod: "CASH",
        items: [{ productId: "p1", quantity: 1 }],
        clientToken: "tok-nocash",
      })
    ).rejects.toMatchObject({ code: "functions/invalid-argument" });
  });

  it("recusa creditar a gaveta de OUTRO operador", async () => {
    fake.reset({
      ...baseSeed(),
      cash_sessions: {
        s2: {
          operatorId: "op2",
          operatorName: "Outro",
          status: "open",
          openedAt: fake.Timestamp.fromDate(new Date(Date.now() - 3600 * 1000)),
          closedAt: null,
          initialBalance: 0,
          currentBalance: 0,
          supplements: [],
          withdrawals: [],
        },
      },
    });
    await expect(
      vender({
        targetUserId: "balcao_anonimo",
        paymentMethod: "CASH",
        items: [{ productId: "p1", quantity: 1 }],
        sessaoCaixaId: "s2",
        clientToken: "tok-outro",
      })
    ).rejects.toMatchObject({ code: "functions/permission-denied" });
  });
});

describe("fluxo venda → estorno → carteira (WALLET)", () => {
  it("venda com carteira debita saldo e gasto semanal; estorno devolve tudo", async () => {
    const res = await vender({
      targetUserId: "u1",
      paymentMethod: "WALLET",
      items: [{ productId: "p1", quantity: 1 }],
      clientToken: "tok-wallet-1",
    });

    expect(res.order.total).toBe(10);
    expect(fake.getDoc("users", "u1").walletBalance).toBe(90);
    expect(fake.getDoc("users", "u1").weeklySpent).toBe(10);

    const txs = fake.allDocs("wallet_transactions");
    expect(txs).toHaveLength(1);
    expect(txs[0].amount).toBe(-10);
    expect(txs[0].type).toBe("withdrawal");

    const est = await estornar(res.order.id);
    expect(est.ok).toBe(true);

    expect(fake.getDoc("users", "u1").walletBalance).toBe(100);
    expect(fake.getDoc("users", "u1").weeklySpent).toBe(0);
    // estorno registrou a correção na carteira
    expect(fake.allDocs("wallet_transactions").some((t) => t.type === "correction")).toBe(true);
  });

  it("weeklySpent do estorno NUNCA fica negativo (clamp em 0)", async () => {
    // Usuário compra 10, mas o weeklySpent corrente é 100.
    // O estorno deve SUBTRAIR 10 (não deixar negativo em hipótese alguma).
    fake.reset({
      ...baseSeed(),
      users: {
        ...baseSeed().users,
        u1: { ...baseSeed().users.u1, walletBalance: 100, weeklySpent: 100 },
      },
    });

    const res = await vender({
      targetUserId: "u1",
      paymentMethod: "WALLET",
      items: [{ productId: "p1", quantity: 1 }],
      clientToken: "tok-wallet-clamp",
    });
    expect(fake.getDoc("users", "u1").weeklySpent).toBe(110);

    await estornar(res.order.id);
    expect(fake.getDoc("users", "u1").weeklySpent).toBe(100);
  });

  it("bloqueia venda com carteira acima do saldo", async () => {
    await expect(
      vender({
        targetUserId: "u2", // saldo 50
        paymentMethod: "WALLET",
        items: [{ productId: "p1", quantity: 10 }], // 100
        clientToken: "tok-sem-saldo",
      })
    ).rejects.toMatchObject({ code: "functions/invalid-argument" });
  });
});

describe("fluxo FIADO (crédito) — regressão do ReferenceError", () => {
  it("venda fiada soma a dívida no doc do usuário", async () => {
    const res = await vender({
      targetUserId: "fiado1",
      paymentMethod: "FIADO",
      customerAccountId: "fiado1",
      items: [{ productId: "p2", quantity: 2 }],
      senhaPrimaria: MASTER_PASSWORD,
      clientToken: "tok-fiado-1",
    });

    expect(res.ok).toBe(true);
    expect(res.order.total).toBe(17);
    expect(fake.getDoc("users", "fiado1").currentDebt).toBe(17);
    expect(fake.getDoc("users", "fiado1").weeklySpent).toBe(17);
  });

  it("recusa fiado acima do limite de crédito com mensagem de negócio", async () => {
    fake.reset({
      ...baseSeed(),
      users: {
        ...baseSeed().users,
        fiado1: { ...baseSeed().users.fiado1, creditLimit: 10 },
      },
    });

    await expect(
      vender({
        targetUserId: "fiado1",
        paymentMethod: "FIADO",
        customerAccountId: "fiado1",
        items: [{ productId: "p2", quantity: 2 }], // 17 > 10
        senhaPrimaria: MASTER_PASSWORD,
        clientToken: "tok-fiado-limite",
      })
    ).rejects.toMatchObject({ code: "functions/invalid-argument" });

    // efeito colateral colateral NENHUM: dívida e estoque intactos
    expect(fake.getDoc("users", "fiado1").currentDebt).toBe(0);
    expect(fake.getDoc("products", "p2").stock).toBe(50);
  });

  it("estorno de venda fiada reverte a dívida", async () => {
    const res = await vender({
      targetUserId: "fiado1",
      paymentMethod: "FIADO",
      customerAccountId: "fiado1",
      items: [{ productId: "p2", quantity: 2 }],
      senhaPrimaria: MASTER_PASSWORD,
      clientToken: "tok-fiado-estorno",
    });
    expect(fake.getDoc("users", "fiado1").currentDebt).toBe(17);

    await estornar(res.order.id);
    expect(fake.getDoc("users", "fiado1").currentDebt).toBe(0);
    expect(fake.getDoc("products", "p2").stock).toBe(50);
  });
});

// Fluxo 3 — Compra do usuário no app (carteira). Regressão do typo
// dataDiaLocalSP() (o helper real é dataDiaLocalMT): o campo `date` quebrava
// comprarComCarteira e registrarPedidoPix com ReferenceError.
describe("fluxo compra no app (comprarComCarteira)", () => {
  it("debita carteira/estoque e grava o pedido com date no formato local (YYYY-MM-DD)", async () => {
    const res = await call("comprarComCarteira", {
      items: [{ productId: "p1", quantity: 2 }],
      clientToken: "tok-app-1",
    }, "u1");

    expect(res.ok).toBe(true);
    const order = res.order;

    expect(order.total).toBe(20);
    expect(order.status).toBe("paid");
    expect(order.paymentMethod).toBe("WALLET");
    // O campo que estourava ReferenceError — precisa ser o dia local do MT.
    expect(order.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    expect(fake.getDoc("users", "u1").walletBalance).toBe(80);
    expect(fake.getDoc("users", "u1").weeklySpent).toBe(20);
    expect(fake.getDoc("products", "p1").stock).toBe(98);

    const txs = fake.allDocs("wallet_transactions");
    expect(txs).toHaveLength(1);
    expect(txs[0].amount).toBe(-20);
    expect(txs[0].type).toBe("withdrawal");
  });

  it("replay com o mesmo clientToken não debita duas vezes", async () => {
    const payload = { items: [{ productId: "p1", quantity: 1 }], clientToken: "tok-app-replay" };
    await call("comprarComCarteira", payload, "u1");
    const saldoApos = fake.getDoc("users", "u1").walletBalance;

    const second = await call("comprarComCarteira", payload, "u1");
    expect(second.order?.replay || second.replay).toBe(true);

    expect(fake.getDoc("users", "u1").walletBalance).toBe(saldoApos);
    expect(fake.getDoc("products", "p1").stock).toBe(99);
    expect(fake.count("orders")).toBe(1);
  });

  it("recusa compra acima do saldo da carteira sem mexer em nada", async () => {
    await expect(
      call("comprarComCarteira", { items: [{ productId: "p1", quantity: 20 }], clientToken: "tok-app-sem" }, "u1")
    ).rejects.toMatchObject({ code: "functions/invalid-argument" });

    expect(fake.getDoc("users", "u1").walletBalance).toBe(100);
    expect(fake.getDoc("products", "p1").stock).toBe(100);
    expect(fake.count("orders")).toBe(0);
  });

  it("respeita o limite semanal de compras com carteira", async () => {
    fake.reset({
      ...baseSeed(),
      users: { ...baseSeed().users, u1: { ...baseSeed().users.u1, weeklySpent: 995 } },
    });

    await expect(
      call("comprarComCarteira", { items: [{ productId: "p1", quantity: 1 }], clientToken: "tok-app-limite" }, "u1")
    ).rejects.toMatchObject({ code: "functions/invalid-argument" });

    expect(fake.getDoc("users", "u1").walletBalance).toBe(100);
  });
});
