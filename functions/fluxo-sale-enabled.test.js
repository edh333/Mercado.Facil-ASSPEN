// KILL SWITCH DE VENDA — settings/general.saleEnabled (processarVendaAdmin).
//
// O admin principal pode desativar o botão de venda do PDV. A autoridade da
// decisão é o SERVIDOR: mesmo que o cliente tenha sessão válida e chame a
// callable diretamente, a venda deve ser recusada quando saleEnabled === false.
// Default seguro: ausente ⇒ vendas habilitadas.
import { beforeEach, describe, expect, it } from "vitest";
import { fake, call } from "./test-support/harness.js";
import { baseSeed } from "./test-support/fixtures.js";

function venderCash(extra = {}) {
  return call(
    "processarVendaAdmin",
    {
      targetUserId: "balcao_anonimo",
      paymentMethod: "CASH",
      items: [{ productId: "p1", quantity: 1 }],
      clientToken: "tok-sale-gate-1",
      ...extra,
    },
    "op1"
  );
}

beforeEach(() => fake.reset(baseSeed()));

describe("kill switch de venda (saleEnabled)", () => {
  it("recusa a venda quando saleEnabled === false", async () => {
    fake.reset({
      ...baseSeed(),
      settings: { general: { saleEnabled: false } },
    });
    await expect(venderCash()).rejects.toMatchObject({ code: "functions/failed-precondition" });
  });

  it("permite a venda quando saleEnabled === true", async () => {
    fake.reset({
      ...baseSeed(),
      settings: { general: { saleEnabled: true } },
    });
    const res = await venderCash();
    expect(res.ok).toBe(true);
  });

  it("default (saleEnabled ausente) mantém a venda habilitada", async () => {
    const res = await venderCash();
    expect(res.ok).toBe(true);
  });
});
