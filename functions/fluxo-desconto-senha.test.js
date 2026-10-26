// DESCONTO no PDV: o servidor e a fonte da verdade das senhas.
//
// Regra do pedido: até 20% aceita a senha de LOGIN do operador logado (a senha
// mestra continua valendo por compatibilidade). Acima de 20% exige admin/master
// e a DUPLA senha (login + mestra). Acima de 50% é proibido.
import bcrypt from "bcryptjs";
import { beforeEach, describe, expect, it } from "vitest";
import { fake, call } from "./test-support/harness.js";
import { baseSeed, MASTER_PASSWORD } from "./test-support/fixtures.js";

const LOGIN_OP = "login-op1";
const LOGIN_ADMIN = "login-admin1";

function seedComLogins() {
  const base = baseSeed();
  const abertoHaUmaHora = fake.Timestamp.fromDate(new Date(Date.now() - 3600 * 1000));
  return {
    ...base,
    auth_secrets: {
      op1: { password: bcrypt.hashSync(LOGIN_OP, 4) },
      admin1: { password: bcrypt.hashSync(LOGIN_ADMIN, 4) },
    },
    cash_sessions: {
      ...base.cash_sessions,
      s2: {
        operatorId: "admin1",
        operatorName: "Admin Um",
        status: "open",
        openedAt: abertoHaUmaHora,
        closedAt: null,
        initialBalance: 0,
        currentBalance: 0,
        supplements: [],
        withdrawals: [],
        closedBalance: 0,
        openedBy: "admin1",
      },
    },
  };
}

function vender(extra = {}, caller = "op1") {
  return call(
    "processarVendaAdmin",
    {
      targetUserId: "balcao_anonimo",
      paymentMethod: "CASH",
      items: [{ productId: "p1", quantity: 2 }],
      sessaoCaixaId: caller === "op1" ? "s1" : "s2",
      clientToken: "tok-desc-" + Math.random().toString(36).slice(2),
      ...extra,
    },
    caller
  );
}

beforeEach(() => fake.reset(seedComLogins()));

describe("desconto no PDV (processarVendaAdmin)", () => {
  it("até 20%: aceita a senha de LOGIN do operador", async () => {
    const res = await vender({ descontoPct: 10, senhaPrimaria: LOGIN_OP });

    expect(res.ok).toBe(true);
    expect(res.order.total).toBe(18); // 20 - 10%
    expect(res.order.discountPct).toBe(10);
    expect(fake.getDoc("products", "p1").stock).toBe(98);
    expect(fake.getDoc("cash_sessions", "s1").currentBalance).toBe(18);
  });

  it("até 20%: senha mestra continua valendo (compatibilidade)", async () => {
    const res = await vender({ descontoPct: 10, senhaPrimaria: MASTER_PASSWORD });

    expect(res.ok).toBe(true);
    expect(res.order.total).toBe(18);
  });

  it("até 20%: recusa senha de login errada sem mexer no estoque/caixa", async () => {
    await expect(vender({ descontoPct: 10, senhaPrimaria: "errada" })).rejects.toThrow(/Senha incorreta/);

    expect(fake.getDoc("products", "p1").stock).toBe(100);
    expect(fake.getDoc("cash_sessions", "s1").currentBalance).toBe(0);
    expect(fake.count("orders")).toBe(0);
  });

  it("acima de 20%: recusa vendedor, mesmo com login + mestra corretas", async () => {
    await expect(
      vender({ descontoPct: 25, senhaPrimaria: LOGIN_OP, senhaSecundaria: MASTER_PASSWORD }, "op1")
    ).rejects.toThrow(/exclusivo de administradores/);
  });

  it("acima de 20%: admin com login + mestra aplica o desconto", async () => {
    const res = await vender(
      { descontoPct: 25, senhaPrimaria: LOGIN_ADMIN, senhaSecundaria: MASTER_PASSWORD },
      "admin1"
    );

    expect(res.ok).toBe(true);
    expect(res.order.total).toBe(15); // 20 - 25%
    expect(res.order.discountPct).toBe(25);
    expect(fake.getDoc("cash_sessions", "s2").currentBalance).toBe(15);
  });

  it("acima de 20%: aponta a senha mestra errada (segundo campo)", async () => {
    await expect(
      vender({ descontoPct: 25, senhaPrimaria: LOGIN_ADMIN, senhaSecundaria: "mestra-errada" }, "admin1")
    ).rejects.toThrow(/Senha mestra incorreta/);
    expect(fake.count("orders")).toBe(0);
  });

  it("recusa desconto acima de 50%", async () => {
    await expect(vender({ descontoPct: 51, senhaPrimaria: LOGIN_OP })).rejects.toThrow(/50%/);
  });
});
