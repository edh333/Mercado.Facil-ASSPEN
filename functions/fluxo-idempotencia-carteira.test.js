// IDEMPOTÊNCIA das operações administrativas de carteira.
//
// creditarSaldo, sacarSaldoAdmin e devolucaoAlvara movem dinheiro e exigem a
// senha mestra — mas nunca tiveram guarda de idempotência: um reenvio (retry de
// rede, duplo clique, reprodução) podia aplicar o efeito DUAS vezes. Agora um
// MESMO clientToken devolve o resultado gravado sem tocar no saldo de novo.
import { beforeEach, describe, expect, it } from "vitest";
import { fake, call } from "./test-support/harness.js";
import { baseSeed, MASTER_PASSWORD } from "./test-support/fixtures.js";

const senha = MASTER_PASSWORD;

const creditar = (data = {}) =>
  call("creditarSaldo", { userId: "u1", valor: 25, senhaMestra: senha, ...data }, "admin1");
const sacar = (data = {}) =>
  call("sacarSaldoAdmin", { userId: "u1", valor: 25, senhaMestra: senha, ...data }, "admin1");
const alvara = (data = {}) =>
  call("devolucaoAlvara", { userId: "u1", senhaMestra: senha, ...data }, "admin1");

beforeEach(() => fake.reset(baseSeed()));

describe("creditarSaldo — idempotência", () => {
  it("o mesmo token não credita duas vezes nem duplica transação/auditoria", async () => {
    const a = await creditar({ clientToken: "tok-cred-1" });
    expect(a.novoSaldo).toBe(125);

    const b = await creditar({ clientToken: "tok-cred-1" });
    expect(b.replay).toBe(true);
    expect(b.novoSaldo).toBe(125);

    expect(fake.getDoc("users", "u1").walletBalance).toBe(125);
    expect(fake.count("wallet_transactions")).toBe(1);
    expect(fake.allDocs("audit_logs").filter((l) => l.acaoTipo === "CREDITO_MANUAL")).toHaveLength(1);
  });

  it("token diferente aplica um novo crédito", async () => {
    await creditar({ clientToken: "tok-cred-2a" });
    const b = await creditar({ clientToken: "tok-cred-2b" });
    expect(b.novoSaldo).toBe(150);
    expect(fake.getDoc("users", "u1").walletBalance).toBe(150);
    expect(fake.count("wallet_transactions")).toBe(2);
  });
});

describe("sacarSaldoAdmin — idempotência", () => {
  it("o mesmo token não debita duas vezes", async () => {
    const a = await sacar({ clientToken: "tok-saq-1" });
    expect(a.novoSaldo).toBe(75);

    const b = await sacar({ clientToken: "tok-saq-1" });
    expect(b.replay).toBe(true);
    expect(b.novoSaldo).toBe(75);

    expect(fake.getDoc("users", "u1").walletBalance).toBe(75);
    expect(fake.count("wallet_transactions")).toBe(1);
  });

  it("token diferente aplica um novo saque", async () => {
    await sacar({ clientToken: "tok-saq-2a" });
    const b = await sacar({ clientToken: "tok-saq-2b" });
    expect(b.novoSaldo).toBe(50);
    expect(fake.getDoc("users", "u1").walletBalance).toBe(50);
  });
});

describe("devolucaoAlvara — idempotência", () => {
  it("o mesmo token não debita duas vezes e devolve o MESMO comprovante", async () => {
    // Sem valor informado: devolve o saldo total (R$ 100).
    const a = await alvara({ clientToken: "tok-alv-1" });
    expect(a.valorDevolvido).toBe(100);
    expect(a.novoSaldo).toBe(0);

    const b = await alvara({ clientToken: "tok-alv-1" });
    expect(b.replay).toBe(true);
    expect(b.valorDevolvido).toBe(100);
    expect(b.comprovante).toBeTruthy();

    expect(fake.getDoc("users", "u1").walletBalance).toBe(0);
    expect(fake.count("wallet_transactions")).toBe(1);
  });

  it("não reaplica a devolução quando o saldo já foi zerado (token novo)", async () => {
    await alvara({ clientToken: "tok-alv-2a" });
    // Segundo alvará com saldo 0: o servidor recusa (nada a devolver).
    await expect(alvara({ clientToken: "tok-alv-2b" })).rejects.toMatchObject({
      code: "functions/failed-precondition",
    });
    expect(fake.count("wallet_transactions")).toBe(1);
  });
});
