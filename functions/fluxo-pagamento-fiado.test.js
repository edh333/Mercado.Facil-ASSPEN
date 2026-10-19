// FLUXO 4 — Recebimento de fiado (registrarPagamentoConta).
//
// Regressão de duas falhas reais: o pagamento NÃO tinha guarda de idempotência
// (um retry abatia a dívida em dobro e creditava a gaveta duas vezes, aparecendo
// como sobra no fechamento) e a sessão de caixa precisa estar aberta para o
// dinheiro entrar na conciliação.
import { beforeEach, describe, expect, it } from "vitest";
import { fake, call } from "./test-support/harness.js";
import { baseSeed, MASTER_PASSWORD } from "./test-support/fixtures.js";

/** Semente com dívida em aberto e caixa ABERTO do admin que recebe. */
function seedComDivida(divida = 100) {
  const base = baseSeed();
  return {
    ...base,
    users: {
      ...base.users,
      fiado1: { ...base.users.fiado1, currentDebt: divida },
    },
    cash_sessions: {
      s1: { ...base.cash_sessions.s1, operatorId: "admin1", openedBy: "admin1", operatorName: "Admin Um" },
    },
  };
}

function pagar(data, clientToken) {
  return call("registrarPagamentoConta", {
    customerAccountId: "fiado1",
    senhaMestra: MASTER_PASSWORD,
    clientToken,
    ...data,
  }, "admin1");
}

beforeEach(() => fake.reset(seedComDivida()));

describe("recebimento de fiado (registrarPagamentoConta)", () => {
  it("abate a dívida e credita o valor na gaveta do caixa", async () => {
    const res = await pagar({ amount: 40 }, "tok-pg-1");

    expect(res.ok).toBe(true);
    expect(res.dividaAnterior).toBe(100);
    expect(res.novoDebito).toBe(60);
    expect(fake.getDoc("users", "fiado1").currentDebt).toBe(60);
    expect(fake.getDoc("cash_sessions", "s1").currentBalance).toBe(40);
  });

  it("reenvio com o MESMO clientToken não abate duas vezes nem credita em dobro", async () => {
    const first = await pagar({ amount: 40 }, "tok-pg-2");
    expect(first.novoDebito).toBe(60);

    const second = await pagar({ amount: 40 }, "tok-pg-2");
    expect(second.replay).toBe(true);
    expect(second.novoDebito).toBe(60);

    // gaveta: apenas UMA entrada de R$ 40 (não R$ 80)
    const sessao = fake.getDoc("cash_sessions", "s1");
    expect(sessao.currentBalance).toBe(40);
    expect(sessao.supplements).toHaveLength(1);
    expect(fake.getDoc("users", "fiado1").currentDebt).toBe(60);
    // auditoria gravada UMA vez
    expect(fake.allDocs("audit_logs").filter((l) => l.acaoTipo === "PAGAR_CONTA_FIADO")).toHaveLength(1);
  });

  it("token diferente aplica o pagamento normalmente", async () => {
    await pagar({ amount: 40 }, "tok-pg-3a");
    const res = await pagar({ amount: 20 }, "tok-pg-3b");

    expect(res.novoDebito).toBe(40);
    expect(fake.getDoc("cash_sessions", "s1").currentBalance).toBe(60);
  });

  it("recusa pagamento maior que a dívida sem mexer em nada", async () => {
    await expect(pagar({ amount: 150 }, "tok-pg-4")).rejects.toMatchObject({ code: "functions/invalid-argument" });

    expect(fake.getDoc("users", "fiado1").currentDebt).toBe(100);
    expect(fake.getDoc("cash_sessions", "s1").currentBalance).toBe(0);
  });

  it("quando zera a dívida, limpa os marcos de vencimento", async () => {
    const semente = seedComDivida(50);
    fake.reset({
      ...semente,
      users: {
        ...semente.users,
        fiado1: { ...semente.users.fiado1, debtStartedAt: "2026-01-01", debtDueAt: "2026-02-01" },
      },
    });

    const res = await pagar({ amount: 50 }, "tok-pg-5");
    expect(res.novoDebito).toBe(0);

    const fiado = fake.getDoc("users", "fiado1");
    expect(fiado.debtStartedAt).toBeUndefined();
    expect(fiado.debtDueAt).toBeUndefined();
  });

  it("exige a senha mestra", async () => {
    await expect(
      call("registrarPagamentoConta", { customerAccountId: "fiado1", amount: 10, clientToken: "tok-pg-6" }, "admin1")
    ).rejects.toMatchObject({ code: "functions/permission-denied" });
  });
});
