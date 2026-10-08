// Testes da lógica financeira das Cloud Functions (functions/logic.js).
// São as regras que protegem o dinheiro: arredondamento, saldo, limite
// semanal, pagamentos mistos e idempotência.
import { describe, it, expect } from "vitest";
import {
  arredondar,
  cleanCpf,
  validarCpf,
  sanitizarToken,
  validarItensPuros,
  calcularPartesPagamento,
  validarTroco,
  verificarLimiteSemanal,
  validarSaldoSuficiente,
  fiadoExcedeLimite,
  calcularNovoSaldo,
  caminhoStorageDeUrl,
  calcularSplitVenda,
  calcularEstornoCarteira,
  formatoTokenDownloadValido,
  motivoTokenDownloadInvalido,
  TOKEN_DOWNLOAD_TTL_MINUTOS,
  TOKEN_DOWNLOAD_MAX_USOS,
  parseInvoiceXML,
  normalizeName,
  stringSimilarity,
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

describe("validarCpf (dígito verificador)", () => {
  it("aceita CPFs matematicamente válidos (com e sem máscara)", () => {
    expect(validarCpf("529.982.247-25")).toBe(true);
    expect(validarCpf("52998224725")).toBe(true);
    expect(validarCpf("111.444.777-35")).toBe(true);
    expect(validarCpf("168.995.350-09")).toBe(true);
  });

  it("rejeita dígito verificador incorreto", () => {
    expect(validarCpf("529.982.247-24")).toBe(false);
    expect(validarCpf("111.444.777-36")).toBe(false);
    expect(validarCpf("52998224726")).toBe(false);
  });

  it("rejeita sequências repetidas (000/111/999)", () => {
    expect(validarCpf("000.000.000-00")).toBe(false);
    expect(validarCpf("11111111111")).toBe(false);
    expect(validarCpf("99999999999")).toBe(false);
  });

  it("rejeita tamanho inválido, vazio e sem dígitos", () => {
    expect(validarCpf("123")).toBe(false);
    expect(validarCpf("")).toBe(false);
    expect(validarCpf(null)).toBe(false);
    expect(validarCpf("abcdefghijk")).toBe(false);
    expect(validarCpf("5299822472a6")).toBe(false);
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

describe("fiadoExcedeLimite (0 = bloqueado; exceção ignora teto)", () => {
  it("sem limite configurado (0/ausente) bloqueia a venda fiada", () => {
    expect(fiadoExcedeLimite({ creditLimit: 0, currentDebt: 0, total: 10 }).excede).toBe(true);
    expect(fiadoExcedeLimite({ currentDebt: 0, total: 10 }).excede).toBe(true);
    expect(fiadoExcedeLimite({ creditLimit: undefined, currentDebt: 0, total: 10 }).excede).toBe(true);
  });

  it("autorizacaoExcepcional ignora a ausência de limite", () => {
    const r = fiadoExcedeLimite({ creditLimit: 0, currentDebt: 0, total: 10, autorizacaoExcepcional: true });
    expect(r.excede).toBe(false);
  });

  it("bloqueia quando dívida + venda superam o limite", () => {
    const r = fiadoExcedeLimite({ creditLimit: 100, currentDebt: 90, total: 15 });
    expect(r.excede).toBe(true);
    expect(r.disponivel).toBe(10);
  });

  it("permite dentro do limite incluso", () => {
    expect(fiadoExcedeLimite({ creditLimit: 100, currentDebt: 40, total: 60 }).excede).toBe(false);
  });

  it("nunca lança com entradas absurdas", () => {
    expect(fiadoExcedeLimite({ creditLimit: NaN, currentDebt: "x", total: null }).excede).toBe(true);
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

// ─── Download do app admin: token de uso curto ───

describe("formatoTokenDownloadValido", () => {
  const hex64 = "a".repeat(64);
  const hex64Real = "0123456789abcdef".repeat(4);

  it("aceita exatamente 64 chars hex minusculos", () => {
    expect(formatoTokenDownloadValido(hex64)).toBe(true);
    expect(formatoTokenDownloadValido(hex64Real)).toBe(true);
  });

  it("rejeita tamanhos errados, maiusculas e nao-hex", () => {
    expect(formatoTokenDownloadValido("a".repeat(63))).toBe(false);
    expect(formatoTokenDownloadValido("a".repeat(65))).toBe(false);
    expect(formatoTokenDownloadValido("A".repeat(64))).toBe(false);
    expect(formatoTokenDownloadValido("g".repeat(64))).toBe(false);
    expect(formatoTokenDownloadValido("0x" + "a".repeat(62))).toBe(false);
  });

  it("rejeita tipos que nao sejam string", () => {
    expect(formatoTokenDownloadValido(null)).toBe(false);
    expect(formatoTokenDownloadValido(undefined)).toBe(false);
    expect(formatoTokenDownloadValido(123n)).toBe(false);
    expect(formatoTokenDownloadValido({})).toBe(false);
  });
});

describe("motivoTokenDownloadInvalido", () => {
  const T0 = Date.parse("2026-09-27T12:00:00.000Z");
  const valido = (extras = {}) => ({
    uid: "admin1",
    exp: new Date(T0 + TOKEN_DOWNLOAD_TTL_MINUTOS * 60 * 1000).toISOString(),
    usos: 0,
    ...extras,
  });

  it("doc ausente/nao-objeto => nao_encontrado", () => {
    expect(motivoTokenDownloadInvalido(null, T0)).toBe("nao_encontrado");
    expect(motivoTokenDownloadInvalido(undefined, T0)).toBe("nao_encontrado");
    expect(motivoTokenDownloadInvalido("token", T0)).toBe("nao_encontrado");
  });

  it("doc valido (dentro do TTL e com usos livres) => null", () => {
    expect(motivoTokenDownloadInvalido(valido(), T0)).toBe(null);
    expect(motivoTokenDownloadInvalido(valido({ usos: TOKEN_DOWNLOAD_MAX_USOS - 1 }), T0)).toBe(null);
    // faltando 1ms para expirar ainda passa
    expect(motivoTokenDownloadInvalido(valido(), T0 + TOKEN_DOWNLOAD_TTL_MINUTOS * 60 * 1000 - 1)).toBe(null);
  });

  it("exp vencida (inclusive no instante exato) => expirado", () => {
    const expMs = T0 + TOKEN_DOWNLOAD_TTL_MINUTOS * 60 * 1000;
    expect(motivoTokenDownloadInvalido(valido(), expMs)).toBe("expirado");
    expect(motivoTokenDownloadInvalido(valido(), expMs + 1)).toBe("expirado");
  });

  it("exp ausente/malformada falha seguro como expirado", () => {
    expect(motivoTokenDownloadInvalido({ usos: 0 }, T0)).toBe("expirado");
    expect(motivoTokenDownloadInvalido({ exp: "ontem", usos: 0 }, T0)).toBe("expirado");
    expect(motivoTokenDownloadInvalido({ exp: null, usos: 0 }, T0)).toBe("expirado");
  });

  it("usos esgotados => consumido (mesmo dentro do TTL)", () => {
    expect(motivoTokenDownloadInvalido(valido({ usos: TOKEN_DOWNLOAD_MAX_USOS }), T0)).toBe("consumido");
    expect(motivoTokenDownloadInvalido(valido({ usos: TOKEN_DOWNLOAD_MAX_USOS + 5 }), T0)).toBe("consumido");
    // usos corrompido (negativo/nao-numerico) conta como 0 => valido
    expect(motivoTokenDownloadInvalido(valido({ usos: -1 }), T0)).toBe(null);
    expect(motivoTokenDownloadInvalido(valido({ usos: "lixo" }), T0)).toBe(null);
  });

  it("expirado tem precedencia sobre consumido", () => {
    const depoisDoTtl = T0 + TOKEN_DOWNLOAD_TTL_MINUTOS * 60 * 1000 + 1;
    expect(motivoTokenDownloadInvalido(valido({ usos: 999 }), depoisDoTtl)).toBe("expirado");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// PARSER DE NFe (parseInvoiceXML) — port de utils/invoiceParser.ts.
// A prévia do painel usa o parser do navegador; este é o da importação.
// Precisam enxergar os MESMOS campos para o que o operador confere ser o que
// persiste.
// ───────────────────────────────────────────────────────────────────────────
const NFE_SEM_PREFIXO = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">
  <NFe><infNFe>
    <emit><xNome>DISTRIBUIDORA CENTRAL LTDA</xNome><CNPJ>12345678000195</CNPJ></emit>
    <det nItem="1"><prod>
      <cProd>FJ-1</cProd><cEAN>7891000100103</cEAN><xProd>ARROZ BRANCO TP1 5KG</xProd>
      <NCM>06031900</NCM><uCom>KG</uCom><qCom>2.0000</qCom><vUnCom>4.99</vUnCom><vProd>9.98</vProd>
    </prod></det>
  </infNFe></NFe>
</nfeProc>`;

const NFE_PREFIXADA = `<nfe:NFe xmlns:nfe="http://www.portalfiscal.inf.br/nfe">
  <nfe:emit><nfe:xNome>FORNECEDOR X</nfe:xNome><nfe:CNPJ>99999999000191</nfe:CNPJ></nfe:emit>
  <nfe:det nItem="1"><nfe:prod>
    <nfe:cProd>P1</nfe:cProd><nfe:cEAN>SEM GTIN</nfe:cEAN><nfe:xProd>CAFE PILAO 500G</nfe:xProd>
    <nfe:NCM>09012100</nfe:NCM><nfe:uCom>UN</nfe:uCom><nfe:qCom>1.0000</nfe:qCom><nfe:vUnCom>22.90</nfe:vUnCom>
  </nfe:prod></nfe:det>
</nfe:NFe>`;

describe("parseInvoiceXML (NFe)", () => {
  it("lê emitente e item com ponto decimal (layout oficial da NFe)", () => {
    const data = parseInvoiceXML(NFE_SEM_PREFIXO);
    expect(data).not.toBeNull();
    expect(data.supplier).toEqual({ name: "DISTRIBUIDORA CENTRAL LTDA", cnpj: "12345678000195" });
    expect(data.items).toHaveLength(1);
    const [item] = data.items;
    expect(item.name).toBe("ARROZ BRANCO TP1 5KG");
    expect(item.costPrice).toBe(4.99); // "4.99" = R$ 4,99 — NÃO 499
    expect(item.quantity).toBe(2);
    expect(item.ean).toBe("7891000100103");
    expect(item.description).toContain("NCM: 06031900");
    expect(item.description).toContain("Und: KG");
  });

  it("casa por nome local: XML com prefixo nfe: também é lido", () => {
    const data = parseInvoiceXML(NFE_PREFIXADA);
    expect(data).not.toBeNull();
    expect(data.supplier.name).toBe("FORNECEDOR X");
    expect(data.items[0].name).toBe("CAFE PILAO 500G");
    expect(data.items[0].costPrice).toBe(22.9);
    expect(data.items[0].ean).toBe("P1"); // SEM GTIN inválido => código do fornecedor
  });

  it("vírgula decimal, qCom zerado e custo corrompido caem nos fallbacks", () => {
    const xml = NFE_SEM_PREFIXO
      .replace("4.99", "8,50")        // decimal BR
      .replace("2.0000", "0")         // qCom inválido => 1
      .replace("9.98", "10.50");
    const data = parseInvoiceXML(xml);
    expect(data.items[0].costPrice).toBe(8.5);
    expect(data.items[0].quantity).toBe(1);
  });

  it("custo absurdo (> R$ 100k) usa vProd/qCom e, se ainda absurdo, zera", () => {
    const xmlCorrompido = NFE_SEM_PREFIXO.replace("4.99", "78434600000");
    // vProd 9.98 / qCom 2 => 4.99 (recuperado)
    expect(parseInvoiceXML(xmlCorrompido).items[0].costPrice).toBe(4.99);

    const tudoCorrompido = xmlCorrompido.replace("9.98", "78434600000");
    expect(parseInvoiceXML(tudoCorrompido).items[0].costPrice).toBe(0);
  });

  it("rejeita XML quebrado, texto comum, HTML e XML sem itens", () => {
    expect(parseInvoiceXML("<NFe><det></NFe>")).toBeNull();
    expect(parseInvoiceXML("isto nao e uma nota")).toBeNull();
    expect(parseInvoiceXML("<html><body>oi</body></html>")).toBeNull();
    expect(parseInvoiceXML("")).toBeNull();
  });
});

describe("normalizeName / stringSimilarity (dedup de importação e merge)", () => {
  it("normaliza igual ao front (utils.ts)", () => {
    expect(normalizeName("Açúcar Refinado")).toBe("ACUCARREFINADO");
    expect(normalizeName("Chocolate Lacta")).toBe("CHOCOLATELACTA");
    expect(normalizeName("  ARROZ  BRANCO 5KG ")).toBe("ARROZBRANCO5KG");
    expect(normalizeName("")).toBe("");
  });

  it("similaridade de Levenshtein normalizada", () => {
    expect(stringSimilarity("arroz", "arroz")).toBe(1);
    expect(stringSimilarity("", "")).toBe(1);
    expect(stringSimilarity("abc", "abd")).toBeCloseTo(2 / 3);
    expect(stringSimilarity("coca", "cocacola")).toBeCloseTo(0.5);
  });
});
