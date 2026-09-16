// Testes da lógica financeira das Cloud Functions (functions/logic.js).
// São as regras que protegem o dinheiro: arredondamento, saldo, limite
// semanal, pagamentos mistos e idempotência.
import { describe, it, expect } from "vitest";
import {
  arredondar,
  cleanCpf,
  sanitizarToken,
  validarItensPuros,
  calcularPartesPagamento,
  validarTroco,
  verificarLimiteSemanal,
  validarSaldoSuficiente,
  calcularNovoSaldo,
  caminhoStorageDeUrl,
  calcularSplitVenda,
  calcularEstornoCarteira,
} from "./logic.js";

describe("arredondar (centavos)", () => {
  it("arredonda para 2 casas", () => {
    expect(arredondar(0.1 + 0.2)).toBe(0.3);
    expect(arredondar(1.239)).toBe(1.24);
    expect(arredondar(19.9 * 3)).toBe(59.7);
    expect(arredondar("10.50")).toBe(10.5);
  });

  it("nunca lança com valores inválidos", () => {
    expect(arredondar(NaN)).toBe(0);
    expect(arredondar(undefined)).toBe(0);
    expect(arredondar(null)).toBe(0);
  });
});

describe("cleanCpf", () => {
  it("remove máscara e não-dígitos", () => {
    expect(cleanCpf("529.982.247-25")).toBe("52998224725");
    expect(cleanCpf("abc123")).toBe("123");
    expect(cleanCpf(null)).toBe("");
  });
});

describe("sanitizarToken (idempotência)", () => {
  it("mantém apenas [a-zA-Z0-9_-] e limita a 64", () => {
    expect(sanitizarToken("abc123_-é$ ")).toBe("abc123_-");
    expect(sanitizarToken("x".repeat(100)).length).toBe(64);
    expect(sanitizarToken("")).toBe("");
  });
});

describe("validarItensPuros", () => {
  it("agrega produtos repetidos em uma linha (estoque correto)", () => {
    expect(validarItensPuros([
      { productId: "p1", quantity: 2 },
      { productId: "p2", quantity: 1 },
      { productId: "p1", quantity: 3 },
    ])).toEqual([
      { productId: "p1", quantity: 5 },
      { productId: "p2", quantity: 1 },
    ]);
  });

  it("arredonda quantidade para baixo (inteiros)", () => {
    expect(validarItensPuros([{ productId: "p1", quantity: 2.9 }]))
      .toEqual([{ productId: "p1", quantity: 2 }]);
  });

  it("rejeita lista vazia, produto vazio e quantidade <= 0", () => {
    expect(() => validarItensPuros([])).toThrow("Lista de itens vazia");
    expect(() => validarItensPuros(null)).toThrow("Lista de itens vazia");
    expect(() => validarItensPuros([{ productId: "", quantity: 1 }])).toThrow("Item inválido");
    expect(() => validarItensPuros([{ productId: "p1", quantity: 0 }])).toThrow("Item inválido");
  });
});

describe("calcularPartesPagamento", () => {
  it("WALLET: debita o total na carteira", () => {
    expect(calcularPartesPagamento("WALLET", undefined, 50, false)).toEqual({ walletPortion: 50, cashPortion: 0 });
  });

  it("WALLET: consumidor final não pode usar carteira", () => {
    expect(() => calcularPartesPagamento("WALLET", undefined, 50, true)).toThrow("consumidor final não pode usar carteira");
  });

  it("CASH: total vira dinheiro no caixa", () => {
    expect(calcularPartesPagamento("CASH", undefined, 34.9, true)).toEqual({ walletPortion: 0, cashPortion: 34.9 });
  });

  it("PIX: nada debitado localmente (confirmação separada)", () => {
    expect(calcularPartesPagamento("PIX", undefined, 20, false)).toEqual({ walletPortion: 0, cashPortion: 0 });
  });

  it("MIXED: divide carteira e dinheiro corretamente", () => {
    const partes = calcularPartesPagamento("MIXED", [
      { method: "WALLET", amount: 10.5 },
      { method: "CASH", amount: 15.25 },
    ], 25.75, false);
    expect(partes).toEqual({ walletPortion: 10.5, cashPortion: 15.25 });
  });

  it("MIXED: soma diferente do total bloqueia a venda", () => {
    expect(() => calcularPartesPagamento("MIXED", [
      { method: "WALLET", amount: 10 },
      { method: "CASH", amount: 10 },
    ], 25, false)).toThrow("A soma dos pagamentos não confere");
  });

  it("MIXED: diferença de centavos (preço/promo recalculado) não bloqueia", () => {
    const partes = calcularPartesPagamento("MIXED", [
      { method: "WALLET", amount: 10.5 },
      { method: "CASH", amount: 15.25 },
    ], 25.76, false);
    expect(partes.walletPortion + partes.cashPortion).toBeCloseTo(25.75, 2);
  });

  it("MIXED: FIADO e CARD não são permitidos", () => {
    expect(() => calcularPartesPagamento("MIXED", [
      { method: "CASH", amount: 5 },
      { method: "FIADO", amount: 5 },
    ], 10, false)).toThrow("FIADO e CARD não são suportados");
  });

  it("MIXED: consumidor final com parte em carteira é bloqueado", () => {
    expect(() => calcularPartesPagamento("MIXED", [
      { method: "WALLET", amount: 5 },
      { method: "CASH", amount: 5 },
    ], 10, true)).toThrow("consumidor final não pode usar carteira");
  });

  it("MIXED: sem valores lança erro", () => {
    expect(() => calcularPartesPagamento("MIXED", [], 10, false)).toThrow("Pagamento misto sem valores");
  });

  it("MIXED: valor negativo é inválido", () => {
    expect(() => calcularPartesPagamento("MIXED", [
      { method: "CASH", amount: -1 },
    ], 10, false)).toThrow("Valor inválido no pagamento misto");
  });

  it("MIXED: método desconhecido é inválido", () => {
    expect(() => calcularPartesPagamento("MIXED", [
      { method: "BITCOIN", amount: 10 },
    ], 10, false)).toThrow("Método inválido no pagamento misto");
  });

  it("PIX/CARD/FIADO: nenhuma parte local (só registro no servidor)", () => {
    for (const pm of ["PIX", "CARD", "FIADO"]) {
      expect(calcularPartesPagamento(pm, undefined, 33.3, true)).toEqual({ walletPortion: 0, cashPortion: 0 });
      expect(calcularPartesPagamento(pm, undefined, 33.3, false)).toEqual({ walletPortion: 0, cashPortion: 0 });
    }
  });

  it("MIXED: PIX puro é permitido como pagamento misto de 1 componente", () => {
    expect(calcularPartesPagamento("MIXED", [{ method: "PIX", amount: 25.75 }], 25.75, true))
      .toEqual({ walletPortion: 0, cashPortion: 0 });
  });

  it("MIXED: valor acima do total (excedente sem cash) é rejeitado", () => {
    expect(() => calcularPartesPagamento("MIXED", [{ method: "PIX", amount: 120 }], 100, false))
      .toThrow("A soma dos pagamentos não confere com o total");
  });
});

describe("validarTroco", () => {
  it("aceita troco válido e undefined", () => {
    expect(() => validarTroco(5, 50)).not.toThrow();
    expect(() => validarTroco(undefined, 50)).not.toThrow();
    expect(() => validarTroco(0, 50)).not.toThrow();
  });

  it("rejeita troco negativo ou não numérico", () => {
    expect(() => validarTroco(-1, 50)).toThrow("Troco inválido");
    expect(() => validarTroco(NaN, 50)).toThrow("Troco inválido");
  });

  it("aceita troco maior que a metade (contrato: cashPortion já vem LÍQUIDO)", () => {
    // Cliente entrega R$200 numa venda de R$80 → cashPortion líquido = 80,
    // troco = 120 > cashPortion. Antes isso era rejeitado (bug): o troco era
    // comparado contra o valor líquido, e não contra o dinheiro realmente entregue.
    expect(() => validarTroco(120, 80)).not.toThrow();
    expect(() => validarTroco(150, 100)).not.toThrow();
  });

  it("troco igual ao valor entregue (venda de 0 após troco) é aceito", () => {
    expect(() => validarTroco(120, 0)).not.toThrow();
  });

  it("DADOS CORROMPIDOS: troco maior que o dinheiro entregue é rejeitado", () => {
    // cashPortion negativo só aparece com payload adulterado (o servidor nunca
    // envia isso). O contrato usa cashPortion = entregue − troco, então entregue
    // = troco − |negativo| → troco supera o entregue REAL.
    expect(() => validarTroco(121, -1)).toThrow("Troco inválido");
  });
});

describe("verificarLimiteSemanal", () => {
  it("permite dentro do limite", () => {
    expect(() => verificarLimiteSemanal(250, 49.99, 300)).not.toThrow();
    expect(() => verificarLimiteSemanal(250, 50, 300)).not.toThrow();
  });

  it("bloqueia acima do limite com valor disponível na mensagem", () => {
    try {
      verificarLimiteSemanal(250, 50.01, 300);
      throw new Error("deveria ter lançado");
    } catch (e) {
      expect(e.message).toContain("Limite semanal excedido");
      expect(e.message).toContain("50.00");
    }
  });

  it("usa limite padrão de 300 quando não informado", () => {
    expect(() => verificarLimiteSemanal(299, 1, undefined)).not.toThrow();
    expect(() => verificarLimiteSemanal(299, 2, undefined)).toThrow("Limite semanal excedido");
  });

  it("HONRA limite zero (bloqueia carteira) — antes 0 virava 300", () => {
    expect(() => verificarLimiteSemanal(0, 0.01, 0)).toThrow("Limite semanal excedido");
  });

  it("aceita limite finito arbitrário e rejeita negativo/NaN (vira 300)", () => {
    expect(() => verificarLimiteSemanal(50, 25, 100)).not.toThrow();
    expect(() => verificarLimiteSemanal(80, 25.01, 100)).toThrow("Limite semanal excedido");
    expect(() => verificarLimiteSemanal(299, 2, NaN)).toThrow("Limite semanal excedido");
    expect(() => verificarLimiteSemanal(299, 2, -5)).toThrow("Limite semanal excedido");
  });
});

describe("validarSaldoSuficiente", () => {
  it("permite quando o saldo cobre o valor", () => {
    expect(() => validarSaldoSuficiente(100, 100)).not.toThrow();
  });

  it("bloqueia saldo insuficiente com o valor disponível", () => {
    try {
      validarSaldoSuficiente(10.5, 20);
      throw new Error("deveria ter lançado");
    } catch (e) {
      expect(e.message).toContain("Saldo insuficiente");
      expect(e.message).toContain("10.50");
    }
  });
});

describe("calcularNovoSaldo", () => {
  it("debita arredondando", () => {
    expect(calcularNovoSaldo(100, 25.5)).toBe(74.5);
    expect(calcularNovoSaldo(0.1 + 0.2, 0.05)).toBe(0.25);
    expect(calcularNovoSaldo(undefined, 10)).toBe(-10);
  });
});

describe("caminhoStorageDeUrl (segurança do apagador de comprovantes)", () => {
  const BUCKET = "mercado-facil-mt.firebasestorage.app";

  it("extrai o caminho de URL padrão com token", () => {
    const url = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/wallet_proofs%2FUID123%2F1700000000000_abc.jpg?alt=media&token=xyz`;
    expect(caminhoStorageDeUrl(url, BUCKET)).toBe("wallet_proofs/UID123/1700000000000_abc.jpg");
  });

  it("decodifica caminhos com %2F e %20", () => {
    const url = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/comprovantes_pix%2FUID%2Fmeu%20comprovante.png`;
    expect(caminhoStorageDeUrl(url, BUCKET)).toBe("comprovantes_pix/UID/meu comprovante.png");
  });

  it("RECUSA URL de outro bucket (nunca apaga arquivo alheio)", () => {
    const url = "https://firebasestorage.googleapis.com/v0/b/outro-projeto.appspot.com/o/docs/UID/x.jpg";
    expect(caminhoStorageDeUrl(url, BUCKET)).toBeNull();
  });

  it("RECUSA URL de domínio diferente", () => {
    const url = "https://storage.googleapis.com/v0/b/x/o/y.jpg";
    expect(caminhoStorageDeUrl(url, BUCKET)).toBeNull();
  });

  it("RECUSA protocolo não-https", () => {
    expect(caminhoStorageDeUrl("http://firebasestorage.googleapis.com/v0/b/x/o/y.jpg", BUCKET)).toBeNull();
  });

  it("RECUSA URLs malformadas sem lançar", () => {
    expect(caminhoStorageDeUrl("não é uma url", BUCKET)).toBeNull();
    expect(caminhoStorageDeUrl("", BUCKET)).toBeNull();
    expect(caminhoStorageDeUrl(null, BUCKET)).toBeNull();
    expect(caminhoStorageDeUrl(undefined, BUCKET)).toBeNull();
  });

  it("RECUSA URL sem o padrão /o/", () => {
    const url = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/wallet_proofs/x.jpg`;
    expect(caminhoStorageDeUrl(url, BUCKET)).toBeNull();
  });
});

describe("calcularSplitVenda (Venda em Dupla)", () => {
  it("sem jointWallet: tudo para o 1o devedor", () => {
    expect(calcularSplitVenda(100, null)).toEqual({ primeiraParcela: 100, segundaParcela: 0, emDupla: false });
    expect(calcularSplitVenda(100, undefined)).toEqual({ primeiraParcela: 100, segundaParcela: 0, emDupla: false });
  });

  it("jointWallet sem 2o devedor ou com valor zero: trata como venda simples", () => {
    expect(calcularSplitVenda(100, { secondUserId: "  ", secondWalletAmount: 50 }).emDupla).toBe(false);
    expect(calcularSplitVenda(100, { secondUserId: "u2", secondWalletAmount: 0 }).emDupla).toBe(false);
    expect(calcularSplitVenda(100, { secondUserId: "u2", secondWalletAmount: -5 }).emDupla).toBe(false);
    expect(calcularSplitVenda(100, "lixo")).toEqual({ primeiraParcela: 100, segundaParcela: 0, emDupla: false });
  });

  it("split valido divide e preserva centavos", () => {
    expect(calcularSplitVenda(100, { secondUserId: "u2", secondWalletAmount: 30 }))
      .toEqual({ primeiraParcela: 70, segundaParcela: 30, emDupla: true });
    const { primeiraParcela, segundaParcela } = calcularSplitVenda(19.99, { secondUserId: "u2", secondWalletAmount: 10.005 });
    expect(primeiraParcela + segundaParcela).toBeCloseTo(19.99, 2);
    expect(segundaParcela).toBe(10.01);
  });

  it("SEGURANCA: RECUSA 2a parcela maior que a parte de carteira (cliente malicioso)", () => {
    // Carrinho de R$ 50; cliente pede R$ 80 no devedor 2 -> a venda NAO acontece.
    expect(() => calcularSplitVenda(50, { secondUserId: "u2", secondWalletAmount: 80 }))
      .toThrow("excede");
  });

  it("parcela igual ao total e permitida (devedor 2 assume tudo)", () => {
    expect(calcularSplitVenda(50, { secondUserId: "u2", secondWalletAmount: 50 }))
      .toEqual({ primeiraParcela: 0, segundaParcela: 50, emDupla: true });
  });
});

describe("calcularEstornoCarteira (estorno ciente do split)", () => {
  it("WALLET puro sem dupla: devolve o total ao dono", () => {
    const r = calcularEstornoCarteira({ paymentMethod: "WALLET", total: 120.5, userId: "dono" });
    expect(r).toMatchObject({ ehWallet: true, walletPortionTotal: 120.5, primeiraParcela: 120.5, segundaParcela: 0, secondUserId: null });
  });

  it("WALLET com dupla: cada devedor recebe a propria parcela", () => {
    const pedido = { paymentMethod: "WALLET", total: 100, userId: "dono", jointWallet: { secondUserId: "amigo", secondWalletAmount: 40 } };
    const r = calcularEstornoCarteira(pedido);
    expect(r.primeiraParcela).toBe(60);
    expect(r.segundaParcela).toBe(40);
    expect(r.secondUserId).toBe("amigo");
  });

  it("MIXED com parte em carteira + dupla: estorna so a parte de carteira, dividida", () => {
    const pedido = {
      paymentMethod: "MIXED",
      total: 200,
      userId: "dono",
      payments: [{ method: "PIX", amount: 120 }, { method: "WALLET", amount: 80 }],
      jointWallet: { secondUserId: "amigo", secondWalletAmount: 30 },
    };
    const r = calcularEstornoCarteira(pedido);
    expect(r.ehWallet).toBe(true);
    expect(r.walletPortionTotal).toBe(80);
    expect(r.primeiraParcela).toBe(50);
    expect(r.segundaParcela).toBe(30);
  });

  it("MIXED sem carteira: nada a estornar em carteira", () => {
    const pedido = { paymentMethod: "MIXED", total: 100, payments: [{ method: "PIX", amount: 60 }, { method: "CASH", amount: 40 }] };
    expect(calcularEstornoCarteira(pedido).ehWallet).toBe(false);
  });

  it("PIX/CASH/FIADO: nao toca carteira", () => {
    for (const pm of ["PIX", "CASH", "FIADO"]) {
      expect(calcularEstornoCarteira({ paymentMethod: pm, total: 50 }).ehWallet).toBe(false);
    }
  });

  it("DEFESA: split corrompido (2o devedor = dono) NAO divide", () => {
    const pedido = { paymentMethod: "WALLET", total: 90, userId: "dono", jointWallet: { secondUserId: "dono", secondWalletAmount: 80 } };
    const r = calcularEstornoCarteira(pedido);
    expect(r.segundaParcela).toBe(0);
    expect(r.primeiraParcela).toBe(90);
  });

  it("DEFESA: parcela do 2o maior que o total de carteira e limitada ao total", () => {
    const pedido = { paymentMethod: "WALLET", total: 50, userId: "dono", jointWallet: { secondUserId: "amigo", secondWalletAmount: 999 } };
    const r = calcularEstornoCarteira(pedido);
    expect(r.segundaParcela).toBe(50);
    expect(r.primeiraParcela).toBe(0);
  });

  it("valores negativos/corrompidos nao geram estorno negativo", () => {
    const pedido = { paymentMethod: "WALLET", total: -33, userId: "dono", jointWallet: { secondUserId: "amigo", secondWalletAmount: -9 } };
    const r = calcularEstornoCarteira(pedido);
    expect(r.walletPortionTotal).toBe(33);
    expect(r.segundaParcela).toBe(0);
  });
});
