// Testes da composição de pagamento do PDV (utils/pdvPayment.ts).
// Cobrem TODAS as formas de venda do PDV: PIX, WALLET (com Venda em Dupla),
// CASH (com/sem troco), CARD, FIADO e MIXED (PIX+WALLET+CASH com troco).
import { describe, it, expect } from "vitest";
import {
  montarPagamentoPdv,
  arredondarCentavos,
  calcularDenominacoes,
} from "../utils/pdvPayment";

const base = (over: any = {}) => ({
  formaPagamento: "PIX",
  total: 50,
  clienteEhConsumidor: false,
  ...over,
});

describe("arredondarCentavos", () => {
  it("elimina ruído de ponto flutuante", () => {
    expect(arredondarCentavos(0.1 + 0.2)).toBe(0.3);
    expect(arredondarCentavos(1.19 * 3)).toBe(3.57);
    expect(arredondarCentavos(19.99 * 3)).toBe(59.97);
  });
});

describe("calcularDenominacoes (troco em cédulas/moedas)", () => {
  it("quebra R$ 145,75 nas cédulas/moedas reais", () => {
    expect(calcularDenominacoes(145.75)).toEqual([
      { valor: 100, qtd: 1 },
      { valor: 20, qtd: 2 },
      { valor: 5, qtd: 1 },
      { valor: 0.5, qtd: 1 },
      { valor: 0.25, qtd: 1 },
    ]);
  });

  it("nada com valor zero ou negativo", () => {
    expect(calcularDenominacoes(0)).toEqual([]);
    expect(calcularDenominacoes(-5)).toEqual([]);
    expect(calcularDenominacoes(NaN)).toEqual([]);
  });

  it("respeita ruído de float (0,1 + 0,2 = 0,30 → 1×0,25 + 1×0,05)", () => {
    // Greedy real: a maior cédula/moeda primeiro — 0,30 = 0,25 + 0,05.
    expect(calcularDenominacoes(0.1 + 0.2)).toEqual([
      { valor: 0.25, qtd: 1 },
      { valor: 0.05, qtd: 1 },
    ]);
  });
});

describe("PIX / CARD (sem lançamento local)", () => {
  it.each(["PIX", "CARD"])("%s: ok sem payments/change", (formaPagamento) => {
    const r = montarPagamentoPdv(base({ formaPagamento }));
    expect(r).toMatchObject({ ok: true, paymentsArray: undefined, changeValue: undefined, jointWalletPayload: undefined });
  });
});

describe("CASH (dinheiro)", () => {
  it("valor exato: sem troco", () => {
    const r = montarPagamentoPdv(base({ formaPagamento: "CASH", total: 34.9, valorRecebido: "34.90" }));
    expect(r).toEqual({ ok: true, paymentsArray: undefined, changeValue: undefined, jointWalletPayload: undefined });
  });

  it("valor maior: registra o troco", () => {
    const r = montarPagamentoPdv(base({ formaPagamento: "CASH", total: 34.9, valorRecebido: "50" }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.changeValue).toBe(15.1);
  });

  it("troco com ruído de float é arredondado a centavos", () => {
    const r = montarPagamentoPdv(base({ formaPagamento: "CASH", total: 19.99, valorRecebido: "20" }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.changeValue).toBe(0.01);
  });

  it("valor menor que o total: bloqueia (sem fallback offline)", () => {
    const r = montarPagamentoPdv(base({ formaPagamento: "CASH", total: 50, valorRecebido: "40" }));
    expect(r).toMatchObject({ ok: false });
    if (r.ok === false) expect(r.message).toContain("Valor recebido insuficiente");
  });
});

describe("MIXED (pagamento misto)", () => {
  it("PIX + CASH exato: sem troco e payments íntegros", () => {
    const r = montarPagamentoPdv(base({
      formaPagamento: "MIXED", total: 100,
      valorMisto: { PIX: "60", WALLET: "", CASH: "40" },
    }));
    expect(r).toEqual({
      ok: true,
      paymentsArray: [
        { method: "PIX", amount: 60 },
        { method: "CASH", amount: 40 },
      ],
      changeValue: undefined,
      jointWalletPayload: undefined,
    });
  });

  it("PIX + CASH com excedente: dinheiro líquido após o troco", () => {
    // Total 140, PIX 100 + CASH 50 → troco 10 → dinheiro registrado = 40
    const r = montarPagamentoPdv(base({
      formaPagamento: "MIXED", total: 140,
      valorMisto: { PIX: "100", WALLET: "", CASH: "50" },
    }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.changeValue).toBe(10);
      expect(r.paymentsArray).toEqual([{ method: "PIX", amount: 100 }, { method: "CASH", amount: 40 }]);
    }
  });

  it("PIX + WALLET + CASH: três lançamentos na ordem", () => {
    const r = montarPagamentoPdv(base({
      formaPagamento: "MIXED", total: 100,
      valorMisto: { PIX: "30", WALLET: "30", CASH: "40" },
      saldoCarteiraCliente: 50,
    }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.paymentsArray).toEqual([
        { method: "PIX", amount: 30 },
        { method: "WALLET", amount: 30 },
        { method: "CASH", amount: 40 },
      ]);
    }
  });

  it("soma menor que o total: bloqueia", () => {
    const r = montarPagamentoPdv(base({
      formaPagamento: "MIXED", total: 100,
      valorMisto: { PIX: "50", WALLET: "", CASH: "40" },
    }));
    expect(r).toMatchObject({ ok: false });
    if (r.ok === false) expect(r.message).toContain("insuficiente");
  });

  it("excedente sem dinheiro em caixa (só PIX/WALLET): bloqueia", () => {
    const r = montarPagamentoPdv(base({
      formaPagamento: "MIXED", total: 100,
      valorMisto: { PIX: "120", WALLET: "", CASH: "" },
    }));
    expect(r).toMatchObject({ ok: false });
    if (r.ok === false) expect(r.message).toContain("Excedente");
  });

  it("troco maior que o dinheiro informado: bloqueia", () => {
    // Total 40, PIX 42 + CASH 5 → recebido 47, troco 7 > dinheiro 5.
    const r = montarPagamentoPdv(base({
      formaPagamento: "MIXED", total: 40,
      valorMisto: { PIX: "42", WALLET: "", CASH: "5" },
    }));
    expect(r).toMatchObject({ ok: false });
    if (r.ok === false) expect(r.message).toContain("troco (R$ 7,00) é maior");
  });

  it("parte em carteira para consumidor final: rejeita", () => {
    expect(() => montarPagamentoPdv(base({
      formaPagamento: "MIXED", total: 100, clienteEhConsumidor: true,
      valorMisto: { PIX: "50", WALLET: "50", CASH: "" },
    }))).toThrow("consumidor final não pode usar créditos");
  });

  it("parte em carteira acima do saldo: rejeita", () => {
    expect(() => montarPagamentoPdv(base({
      formaPagamento: "MIXED", total: 100,
      valorMisto: { PIX: "40", WALLET: "60", CASH: "" },
      saldoCarteiraCliente: 50,
    }))).toThrow("Saldo insuficiente na carteira");
  });

  it("parte em carteira acima do limite semanal disponível: rejeita", () => {
    expect(() => montarPagamentoPdv(base({
      formaPagamento: "MIXED", total: 100,
      valorMisto: { PIX: "40", WALLET: "60", CASH: "" },
      saldoCarteiraCliente: 500,
      weeklySpentCliente: 280,
      weeklyWalletLimit: 300,
    }))).toThrow("Limite semanal de créditos excedido");
  });
});

describe("WALLET (créditos internos)", () => {
  it("pura: sem split, servidor debita do dono", () => {
    const r = montarPagamentoPdv(base({ formaPagamento: "WALLET", total: 25 }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.jointWalletPayload).toBeUndefined();
  });

  it("Venda em Dupla: split montado e arredondado", () => {
    const r = montarPagamentoPdv(base({
      formaPagamento: "WALLET", total: 100,
      isJointWalletMode: true, jointAdminAuthorized: true,
      secondUserId: "u2", secondWalletAmountInput: "33.333",
      saldoCarteiraCliente: 100,
    }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.jointWalletPayload).toEqual({ secondUserId: "u2", secondWalletAmount: 33.33 });
    }
  });

  it("Dupla com saldo combinado insuficiente: rejeita", () => {
    expect(() => montarPagamentoPdv(base({
      formaPagamento: "WALLET", total: 100,
      isJointWalletMode: true, jointAdminAuthorized: true,
      secondUserId: "u2", secondWalletAmountInput: "80",
      saldoCarteiraCliente: 10,
    }))).toThrow("Saldo combinado insuficiente");
  });

  it("Dupla com 2º devedor igual ao dono: rejeita", () => {
    expect(() => montarPagamentoPdv(base({
      formaPagamento: "WALLET", total: 50, clienteSelecionado: "u1",
      isJointWalletMode: true, jointAdminAuthorized: true,
      secondUserId: "u1", secondWalletAmountInput: "20",
    }))).toThrow("2º devedor deve ser diferente");
  });
});

describe("FIADO (usuário cadastrado — unificado)", () => {
  const fiadoOk = base({
    formaPagamento: "FIADO", total: 40, clienteSelecionado: "u1",
    contaFiadoSelecionada: { currentDebt: 20, creditLimit: 100 },
  });

  it("ok dentro do limite: sem lançamentos locais", () => {
    expect(montarPagamentoPdv(fiadoOk)).toEqual({ ok: true, paymentsArray: undefined, changeValue: undefined, jointWalletPayload: undefined });
  });

  it("sem cliente selecionado: rejeita", () => {
    expect(() => montarPagamentoPdv(base({ formaPagamento: "FIADO", contaFiadoSelecionada: { creditLimit: 100 } })))
      .toThrow("Selecione um cliente para venda fiada");
  });

  it("consumidor final: rejeita", () => {
    expect(() => montarPagamentoPdv(base({ formaPagamento: "FIADO", clienteSelecionado: "consumidor_geral", clienteEhConsumidor: true })))
      .toThrow("exige cliente cadastrado");
  });

  it("cliente selecionado SEM conta legada: ACEITA (universo unificado no usuário)", () => {
    // O PDV seleciona o cliente pelo estado global clienteSelecionado; não
    // existe mais conta/customer_accounts paralela — o servidor valida limite
    // e registra a dívida no doc do usuário.
    const r = montarPagamentoPdv(base({ formaPagamento: "FIADO", clienteSelecionado: "u1" }));
    expect(r).toEqual({ ok: true, paymentsArray: undefined, changeValue: undefined, jointWalletPayload: undefined });
  });

  it("dívida + venda acima do limite de crédito: ACEITA (limite é validado no servidor)", () => {
    const r = montarPagamentoPdv(base({
      formaPagamento: "FIADO", total: 90, clienteSelecionado: "u1",
      contaFiadoSelecionada: { currentDebt: 20, creditLimit: 100 },
    }));
    expect(r).toEqual({ ok: true, paymentsArray: undefined, changeValue: undefined, jointWalletPayload: undefined });
  });
});

describe("FIADO 30 DIAS (usuário cadastrado + senha mestra)", () => {
  const fiado30Base = base({ formaPagamento: "FIADO_30", total: 50, clienteSelecionado: "u1" });

  it("ok: usuário selecionado", () => {
    const r = montarPagamentoPdv({ ...fiado30Base, fiado30UserId: "u2" });
    expect(r).toEqual({ ok: true, paymentsArray: undefined, changeValue: undefined, jointWalletPayload: undefined });
  });

  it("ok: usuário selecionado pelo clienteSelecionado global (unificado)", () => {
    const r = montarPagamentoPdv(fiado30Base);
    expect(r).toEqual({ ok: true, paymentsArray: undefined, changeValue: undefined, jointWalletPayload: undefined });
  });

  it("sem cliente selecionado: rejeita", () => {
    expect(() => montarPagamentoPdv(base({ formaPagamento: "FIADO_30", contaFiadoSelecionada: { creditLimit: 100 } })))
      .toThrow("Selecione um cliente para venda fiada");
  });

  it("consumidor final: rejeita", () => {
    expect(() => montarPagamentoPdv(base({ formaPagamento: "FIADO_30", clienteSelecionado: "consumidor_geral", clienteEhConsumidor: true })))
      .toThrow("exige cliente cadastrado");
  });
});

describe("tolerância de centavos (float)", () => {
  it("MIXED com valores float fecha dentro da tolerância", () => {
    const r = montarPagamentoPdv(base({
      formaPagamento: "MIXED", total: 10.5,
      valorMisto: { PIX: "5.25", WALLET: "", CASH: "5.25" },
    }));
    expect(r.ok).toBe(true);
  });
});