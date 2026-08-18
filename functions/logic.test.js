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
