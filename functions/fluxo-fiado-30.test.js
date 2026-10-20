// FLUXO — Venda FIADO 30 DIAS (processarVendaAdmin).
//
// O FIADO_30 é uma venda a prazo contra o USUÁRIO cadastrado (não uma conta
// separada como o FIADO tradicional) e grava debtDueAt = agora + 30 dias para o
// painel "Contas a Receber". Antes o método não era selecionável no PDV; este
// teste trava o comportamento do servidor para o método agora exposto na UI.
import { beforeEach, describe, expect, it } from "vitest";
import { fake, call } from "./test-support/harness.js";
import { baseSeed, MASTER_PASSWORD } from "./test-support/fixtures.js";

const DIA_MS = 24 * 60 * 60 * 1000;

function vender30(extra = {}) {
  return call(
    "processarVendaAdmin",
    {
      targetUserId: "fiado1",
      customerAccountId: "fiado1",
      paymentMethod: "FIADO_30",
      items: [{ productId: "p1", quantity: 2 }],
      senhaPrimaria: MASTER_PASSWORD,
      clientToken: "tok-fiado30-1",
      ...extra,
    },
    "op1"
  );
}

/** Semente com o limite de crédito do cliente controlado pelo teste. */
function seedComLimite(creditLimit, extra = {}) {
  const base = baseSeed();
  return {
    ...base,
    users: {
      ...base.users,
      fiado1: { ...base.users.fiado1, creditLimit, ...extra },
    },
  };
}

beforeEach(() => fake.reset(baseSeed()));

describe("venda FIADO 30 dias (processarVendaAdmin)", () => {
  it("cria a dívida no usuário com vencimento em ~30 dias e marca o início", async () => {
    const antes = Date.now();
    const res = await vender30();

    expect(res.ok).toBe(true);
    expect(res.order.total).toBe(20);

    const u = fake.getDoc("users", "fiado1");
    expect(u.currentDebt).toBe(20);
    expect(u.debtStartedAt).toBeTruthy();
    expect(u.debtDueAt).toBeTruthy();

    const due = u.debtDueAt.toDate().getTime();
    expect(due).toBeGreaterThan(antes + 29 * DIA_MS);
    expect(due).toBeLessThan(antes + 31 * DIA_MS);

    // baixa estoque e NÃO mexe em caixa (fiado não entra dinheiro agora)
    expect(fake.getDoc("products", "p1").stock).toBe(98);
    expect(fake.getDoc("cash_sessions", "s1").currentBalance).toBe(0);
  });

  it("não reescreve debtStartedAt quando já havia dívida em aberto", async () => {
    fake.reset(seedComLimite(500, { currentDebt: 30, debtStartedAt: "2026-01-01", debtDueAt: "2026-02-01" }));

    await vender30();

    const u = fake.getDoc("users", "fiado1");
    expect(u.currentDebt).toBe(50);
    expect(u.debtStartedAt).toBe("2026-01-01"); // marco original preservado
  });

  it("recusa sem a senha mestra", async () => {
    await expect(
      call(
        "processarVendaAdmin",
        {
          targetUserId: "fiado1",
          customerAccountId: "fiado1",
          paymentMethod: "FIADO_30",
          items: [{ productId: "p1", quantity: 1 }],
          clientToken: "tok-sem-senha",
        },
        "op1"
      )
    ).rejects.toMatchObject({ code: "functions/invalid-argument" });
  });

  it("respeita o limite de crédito DENTRO da transação", async () => {
    fake.reset(seedComLimite(15)); // dívida de R$ 20 > limite de R$ 15
    await expect(vender30()).rejects.toThrow(/Limite de crédito excedido/);
    expect(fake.getDoc("users", "fiado1").currentDebt).toBe(0);
  });

  it("recusa quando a conta do fiado difere do usuário da venda", async () => {
    await expect(vender30({ customerAccountId: "u1" })).rejects.toThrow(/Inconsistência/);
  });

  it("recusa usuário sem permissão de crédito", async () => {
    fake.reset(seedComLimite(500, { allowCredit: false }));
    await expect(vender30()).rejects.toThrow(/sem permissão para fiado 30 dias/i);
  });
});
