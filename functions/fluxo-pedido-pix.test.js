// FLUXO 5 — Pedido PIX (registrarPedidoPix).
//
// Cobre o caminho de compra pelo app: validação do comprovante no Storage,
// baixa de estoque, marca de idempotência e as DUAS camadas de deduplicação
// (URL e hash). A checagem por URL agora também roda DENTRO da transação —
// antes só existia fora, o que deixava uma janela de corrida: dois envios
// simultâneos do mesmo comprovante viravam dois pedidos.
import { beforeEach, describe, expect, it } from "vitest";
import { fake, call } from "./test-support/harness.js";
import { baseSeed } from "./test-support/fixtures.js";

const BUCKET = "mercado-facil-mt.firebasestorage.app";

/** URL realista de comprovante na pasta do próprio usuário. */
function urlComprovante(uid, nome = "recibo.jpg") {
  return `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(`comprovantes_pix/${uid}/${nome}`)}`;
}

function pedir(authUid, data) {
  return call("registrarPedidoPix", {
    items: [{ productId: "p1", quantity: 2 }],
    paymentProofUrl: urlComprovante(authUid),
    proofHash: "hash-" + authUid,
    ...data,
  }, authUid);
}

beforeEach(() => fake.reset(baseSeed()));

describe("pedido PIX (registrarPedidoPix)", () => {
  it("cria o pedido pendente, baixa o estoque e grava a marca de idempotência", async () => {
    const res = await pedir("u1", { clientToken: "pixtok01" });

    expect(res.ok).toBe(true);
    expect(res.order.status).toBe("pending");
    expect(res.order.paymentMethod).toBe("PIX");
    expect(res.order.total).toBe(20);
    expect(fake.getDoc("products", "p1").stock).toBe(98);
    expect(fake.getDoc("request_guard", "venda_pixtok01")).toMatchObject({ type: "venda", userId: "u1" });
    expect(fake.allDocs("audit_logs").filter((l) => l.acaoTipo === "PEDIDO_PIX")).toHaveLength(1);
  });

  it("reenvio com o mesmo clientToken devolve o MESMO pedido sem baixar estoque de novo", async () => {
    const first = await pedir("u2", { clientToken: "pixtok02" });
    const second = await pedir("u2", { clientToken: "pixtok02" });

    expect(second.order.replay).toBe(true);
    expect(second.order.id).toBe(first.order.id);
    expect(fake.count("orders")).toBe(1);
    // estoque debitado UMA vez (100 -> 98), não duas (96)
    expect(fake.getDoc("products", "p1").stock).toBe(98);
    expect(fake.allDocs("audit_logs").filter((l) => l.acaoTipo === "PEDIDO_PIX")).toHaveLength(1);
  });

  it("bloqueia o MESMO comprovante usado em outro pedido (dedup por URL)", async () => {
    await pedir("u1", { clientToken: "pixtok03a" });

    await expect(
      pedir("u1", { clientToken: "pixtok03b", proofHash: "hash-outro" })
    ).rejects.toMatchObject({ code: "functions/already-exists" });

    expect(fake.count("orders")).toBe(1);
    // o segundo pedido foi rejeitado ANTES de mexer no estoque
    expect(fake.getDoc("products", "p1").stock).toBe(98);
  });

  it("rejeita comprovante que não está na pasta do próprio usuário", async () => {
    await expect(
      pedir("op1", { paymentProofUrl: urlComprovante("u2"), clientToken: "pixtok04" })
    ).rejects.toMatchObject({ code: "functions/invalid-argument" });

    expect(fake.count("orders")).toBe(0);
  });

  it("bloqueia o MESMO hash de comprovante em URLs diferentes (dedup por hash)", async () => {
    await pedir("u1", { clientToken: "pixtok05a", proofHash: "hash-unico" });

    await expect(
      pedir("u2", {
        clientToken: "pixtok05b",
        proofHash: "hash-unico",
        paymentProofUrl: urlComprovante("u2", "copia.jpg"),
      })
    ).rejects.toMatchObject({ code: "functions/already-exists" });

    expect(fake.count("orders")).toBe(1);
  });

  it("exige comprovante", async () => {
    await expect(
      pedir("u1", { paymentProofUrl: "", proofHash: "", clientToken: "pixtok06" })
    ).rejects.toMatchObject({ code: "functions/invalid-argument" });
  });
});
