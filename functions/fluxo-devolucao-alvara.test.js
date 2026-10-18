// FLUXO 2 — Devolução por alvará (saída de saldo da carteira).
//
// A devolução ENTREGA o dinheiro ao familiar, então o saldo SAI da conta.
// O bug histórico era o sinal invertido (increment(+valor)) — este teste trava
// a semântica correta e o clamp de valor parcial.
import { beforeEach, describe, expect, it } from "vitest";
import { fake, call } from "./test-support/harness.js";
import { baseSeed, MASTER_PASSWORD } from "./test-support/fixtures.js";

async function devolver(data, authUid = "admin1") {
  return call("devolucaoAlvara", { motivo: "alvará", senhaMestra: MASTER_PASSWORD, ...data }, authUid);
}

beforeEach(() => {
  fake.reset(baseSeed());
});

describe("devolucaoAlvara", () => {
  it("sem valor explícito devolve o saldo TOTAL e ZERA a carteira", async () => {
    const res = await devolver({ userId: "u1" });

    expect(res.ok).toBe(true);
    expect(res.valorDevolvido).toBe(100);
    expect(res.novoSaldo).toBe(0);

    expect(fake.getDoc("users", "u1").walletBalance).toBe(0);

    const txs = fake.allDocs("wallet_transactions");
    expect(txs).toHaveLength(1);
    expect(txs[0].amount).toBe(-100);
    expect(txs[0].type).toBe("alvara_return");
    expect(txs[0].userId).toBe("u1");

    const comprovante = res.comprovante;
    expect(comprovante.saldoAnterior).toBe(100);
    expect(comprovante.valorDevolvido).toBe(100);
    expect(comprovante.novoSaldo).toBe(0);

    expect(fake.allDocs("audit_logs").some((l) => l.acaoTipo === "DEVOLUCAO_ALVARA")).toBe(true);
  });

  it("com valor parcial devolve só o valor pedido", async () => {
    const res = await devolver({ userId: "u1", valor: 60 });
    expect(res.valorDevolvido).toBe(60);
    expect(res.novoSaldo).toBe(40);
    expect(fake.getDoc("users", "u1").walletBalance).toBe(40);
  });

  it("valor acima do saldo é LIMITADO ao saldo (nunca credita negativo)", async () => {
    const res = await devolver({ userId: "u2", valor: 999 }); // saldo = 50
    expect(res.valorDevolvido).toBe(50);
    expect(res.novoSaldo).toBe(0);
    expect(fake.getDoc("users", "u2").walletBalance).toBe(0);
  });

  it("recusa devolução de quem já está zerado", async () => {
    fake.reset({
      ...baseSeed(),
      users: { ...baseSeed().users, u1: { ...baseSeed().users.u1, walletBalance: 0 } },
    });
    await expect(devolver({ userId: "u1" })).rejects.toMatchObject({
      code: "functions/failed-precondition",
    });
  });

  it("recusa usuário inexistente", async () => {
    await expect(devolver({ userId: "nao-existe" })).rejects.toMatchObject({
      code: "functions/not-found",
    });
  });

  it("exige senha mestra correta (2º fator)", async () => {
    await expect(
      call("devolucaoAlvara", { userId: "u1", motivo: "x", senhaMestra: "errada" }, "admin1")
    ).rejects.toMatchObject({ code: "functions/permission-denied" });
    // nada mudou
    expect(fake.getDoc("users", "u1").walletBalance).toBe(100);
  });

  it("não deixa um operador sem permissão de carteira chamar a função", async () => {
    await expect(devolver({ userId: "u1" }, "op1")).rejects.toMatchObject({
      code: "functions/permission-denied",
    });
  });

  it("exige autenticação", async () => {
    await expect(call("devolucaoAlvara", { userId: "u1", senhaMestra: MASTER_PASSWORD }, null)).rejects.toMatchObject({
      code: "functions/unauthenticated",
    });
  });
});
