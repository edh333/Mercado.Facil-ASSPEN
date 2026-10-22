// ESTORNO EM DINHEIRO COM O CAIXA JÁ FECHADO.
//
// O dinheiro da gaveta é físico: num estorno em CASH o valor SAI do caixa.
// Se a sessão já foi fechada (o operador já contou a gaveta), mexer no saldo
// fechado corromperia o fechamento — e o caso antigo sumia em SILÊNCIO: o
// dinheiro saía da gaveta e a diferença não aparecia em lugar nenhum.
//
// O comportamento novo:
//  - o saldo da sessão FECHADA não é alterado;
//  - a diferença fica REGISTRADA (pendingAdjustments na sessão);
//  - a resposta traz `avisoCaixa` para a tela mostrar ao operador;
//  - a abertura do próximo caixa do operador lembra a pendência.
import { beforeEach, describe, expect, it } from "vitest";
import { fake, call } from "./test-support/harness.js";
import { baseSeed, MASTER_PASSWORD } from "./test-support/fixtures.js";

async function vender(data) {
  return call("processarVendaAdmin", data, "op1");
}

async function estornar(orderId) {
  return call(
    "estornarVenda",
    { orderId, motivo: "devolução de teste", senhaMestra: MASTER_PASSWORD },
    "admin1"
  );
}

async function fecharSessao(sessaoId, contado) {
  return call("gerenciarSessaoCaixa", { acao: "close", sessaoId, closedBalance: contado }, "op1");
}

beforeEach(() => {
  fake.reset(baseSeed());
});

describe("estorno em dinheiro com o caixa FECHADO", () => {
  it("não altera o saldo já contado, mas registra a pendência e avisa", async () => {
    const { order } = await vender({
      targetUserId: "balcao_anonimo",
      paymentMethod: "CASH",
      items: [{ productId: "p1", quantity: 2 }], // R$ 20
      sessaoCaixaId: "s1",
      clientToken: "tok-cash-fechado",
    });

    // O operador fecha o caixa contando R$ 20.
    const fechado = await fecharSessao("s1", 20);
    expect(fechado.ok).toBe(true);
    expect(fake.getDoc("cash_sessions", "s1").status).toBe("closed");
    const saldoFechado = fake.getDoc("cash_sessions", "s1").currentBalance;
    expect(saldoFechado).toBe(20);

    // Estorno: o dinheiro sai da gaveta, o estoque volta.
    const est = await estornar(order.id);
    expect(est.ok).toBe(true);
    expect(fake.getDoc("products", "p1").stock).toBe(100);

    // O saldo FECHADO não muda (o fechamento já foi contado).
    expect(fake.getDoc("cash_sessions", "s1").currentBalance).toBe(20);

    // ... mas a diferença fica REGISTRADA na sessão.
    const sessao = fake.getDoc("cash_sessions", "s1");
    const pendencias = Array.isArray(sessao.pendingAdjustments) ? sessao.pendingAdjustments : [];
    expect(pendencias).toHaveLength(1);
    expect(pendencias[0].amount).toBe(-20);
    expect(pendencias[0].orderId).toBe(order.id);

    // ... e a tela é avisada (sem isso, a perda sumia do relatório).
    expect(est.avisoCaixa).toBeTruthy();
    expect(est.avisoCaixa.valor).toBe(20);
    expect(est.avisoCaixa.mensagem).toMatch(/caixa/i);
  });

  it("sem aviso quando o caixa da venda ainda está ABERTO (o saldo é abatido)", async () => {
    const { order } = await vender({
      targetUserId: "balcao_anonimo",
      paymentMethod: "CASH",
      items: [{ productId: "p1", quantity: 2 }],
      sessaoCaixaId: "s1",
      clientToken: "tok-cash-aberto",
    });

    const est = await estornar(order.id);
    expect(est.ok).toBe(true);
    expect(est.avisoCaixa).toBeNull();
    expect(fake.getDoc("cash_sessions", "s1").currentBalance).toBe(0);
  });

  it("a abertura do próximo caixa lembra a pendência herdada", async () => {
    const { order } = await vender({
      targetUserId: "balcao_anonimo",
      paymentMethod: "CASH",
      items: [{ productId: "p1", quantity: 2 }],
      sessaoCaixaId: "s1",
      clientToken: "tok-cash-pendencia",
    });
    await fecharSessao("s1", 20);
    await estornar(order.id);

    const abertura = await call(
      "gerenciarSessaoCaixa",
      { acao: "open", initialBalance: 0 },
      "op1"
    );

    expect(abertura.ok).toBe(true);
    expect(abertura.pendenciasCaixa.quantidade).toBe(1);
    expect(abertura.pendenciasCaixa.total).toBe(-20);
  });
});
