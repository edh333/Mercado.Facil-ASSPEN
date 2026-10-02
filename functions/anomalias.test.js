// Testes do motor de auditoria de anomalias (functions/logic.js).
// Regras determinísticas que avisam o admin quando dinheiro foge do padrão.
import { describe, it, expect } from "vitest";
import { detectarAnomalias, paraMs, TOLERANCIA_CAIXA_CENTAVOS } from "./logic.js";


// ──────────────────────────────────────────────
// AUDITORIA DE ANOMALIAS — o sistema que AVISA quando dinheiro some
// ──────────────────────────────────────────────
// Estas regras são o motor de detectarAnomalias(). O objetivo não é "acusar":
// é que o admin saiba, sem caçar planilha, o que fugiu do padrão ontem.

const AGORA = Date.parse("2026-09-28T23:00:00.000Z");
const h = (n) => AGORA - n * 3600 * 1000;
const iso = (ms) => new Date(ms).toISOString();

const logEstorno = (op, horasAtras, extra = {}) => ({
  acaoTipo: "ESTORNAR_VENDA",
  operadorUid: op,
  timestamp: iso(h(horasAtras)),
  payloadDepois: { pedidoId: "PED1", motivo: "erro de operação", ...extra },
});

describe("paraMs (datas do Firestore)", () => {
  it("aceita ISO, epoch, Date e Timestamp do Admin SDK", () => {
    expect(paraMs("2026-09-28T12:00:00.000Z")).toBe(AGORA - 11 * 3600 * 1000);
    expect(paraMs(AGORA)).toBe(AGORA);
    expect(paraMs(new Date(AGORA))).toBe(AGORA);
    expect(paraMs({ seconds: AGORA / 1000 })).toBe(AGORA);
    expect(paraMs({ toMillis: () => AGORA })).toBe(AGORA);
  });

  it("devolve NaN (nunca lança) em entrada inútil", () => {
    expect(Number.isNaN(paraMs(null))).toBe(true);
    expect(Number.isNaN(paraMs(undefined))).toBe(true);
    expect(Number.isNaN(paraMs("ontem"))).toBe(true);
    expect(Number.isNaN(paraMs({}))).toBe(true);
  });
});

describe("REGRA 1 — estorno em rajada", () => {
  it("acusа 3 estornos do mesmo operador na janela", () => {
    const achados = detectarAnomalias({
      agoraMs: AGORA,
      auditLogs: [logEstorno("op1", 1), logEstorno("op1", 2), logEstorno("op1", 3)],
    });
    const achado = achados.find((a) => a.regra === "ESTORNO_EM_RAJADA");
    expect(achado).toBeTruthy();
    expect(achado.operador).toBe("op1");
    expect(achado.quantidade).toBe(3);
    expect(achado.severidade).toBe("ALTO");
  });

  it("NÃO acusa 2 estornos (abaixo do mínimo)", () => {
    const achados = detectarAnomalias({
      agoraMs: AGORA,
      auditLogs: [logEstorno("op1", 1), logEstorno("op1", 2)],
    });
    expect(achados.find((a) => a.regra === "ESTORNO_EM_RAJADA")).toBeFalsy();
  });

  it("separa operadores diferentes", () => {
    const achados = detectarAnomalias({
      agoraMs: AGORA,
      auditLogs: [
        logEstorno("op1", 1), logEstorno("op1", 2),
        logEstorno("op2", 1), logEstorno("op2", 2),
      ],
    });
    expect(achados.filter((a) => a.regra === "ESTORNO_EM_RAJADA")).toHaveLength(0);
  });

  it("ignora estorno fora da janela de 24h", () => {
    const achados = detectarAnomalias({
      agoraMs: AGORA,
      auditLogs: [logEstorno("op1", 25), logEstorno("op1", 26), logEstorno("op1", 27)],
    });
    expect(achados.find((a) => a.regra === "ESTORNO_EM_RAJADA")).toBeFalsy();
  });

  it("6+ estornos escalam para CRITICO", () => {
    const achados = detectarAnomalias({
      agoraMs: AGORA,
      auditLogs: [1, 2, 3, 4, 5, 6].map((n) => logEstorno("op1", n)),
    });
    expect(achados.find((a) => a.regra === "ESTORNO_EM_RAJADA").severidade).toBe("CRITICO");
  });
});

describe("REGRA 2 — venda em dinheiro sem sessão de caixa", () => {
  const pedidoCash = (operador, horasAtras, total = 50) => ({
    id: "PED1",
    operatorId: operador,
    paymentMethod: "CASH",
    total,
    createdAt: iso(h(horasAtras)),
  });

  it("acusа venda CASH sem nenhuma sessão", () => {
    const achados = detectarAnomalias({
      agoraMs: AGORA,
      pedidos: [pedidoCash("op1", 1, 30)],
      sessoes: [],
    });
    const achado = achados.find((a) => a.regra === "VENDA_SEM_SESSAO_CAIXA");
    expect(achado).toBeTruthy();
    expect(achado.quantidade).toBe(1);
  });

  it("NÃO acusa quando havia sessão aberta no instante da venda", () => {
    const achados = detectarAnomalias({
      agoraMs: AGORA,
      pedidos: [pedidoCash("op1", 1)],
      sessoes: [{
        id: "S1",
        operatorId: "op1",
        status: "open",
        openedAt: iso(h(5)),
        closedAt: null,
      }],
    });
    expect(achados.find((a) => a.regra === "VENDA_SEM_SESSAO_CAIXA")).toBeFalsy();
  });

  it("NÃO acusa venda fora do horário da sessão (venda após o fechamento)", () => {
    const achados = detectarAnomalias({
      agoraMs: AGORA,
      pedidos: [pedidoCash("op1", 1)],
      sessoes: [{
        id: "S1",
        operatorId: "op1",
        status: "closed",
        openedAt: iso(h(10)),
        closedAt: iso(h(6)),
      }],
    });
    expect(achados.find((a) => a.regra === "VENDA_SEM_SESSAO_CAIXA")).toBeTruthy();
  });

  it("PIX/WALLET nunca contam (não são dinheiro físico)", () => {
    const achados = detectarAnomalias({
      agoraMs: AGORA,
      pedidos: [
        { id: "P1", operatorId: "op1", paymentMethod: "PIX", total: 100, createdAt: iso(h(1)) },
        { id: "P2", operatorId: "op1", paymentMethod: "WALLET", total: 100, createdAt: iso(h(1)) },
      ],
      sessoes: [],
    });
    expect(achados.find((a) => a.regra === "VENDA_SEM_SESSAO_CAIXA")).toBeFalsy();
  });

  it("reconhece pagamento MISTO com parte em dinheiro", () => {
    const achados = detectarAnomalias({
      agoraMs: AGORA,
      pedidos: [{
        id: "P1", operatorId: "op1", paymentMethod: "MIXED", total: 60,
        payments: [{ method: "PIX", amount: 40 }, { method: "CASH", amount: 20 }],
        createdAt: iso(h(1)),
      }],
      sessoes: [],
    });
    expect(achados.find((a) => a.regra === "VENDA_SEM_SESSAO_CAIXA")).toBeTruthy();
  });

  it("soma o valor e escala para CRITICO acima de R$ 500", () => {
    const achados = detectarAnomalias({
      agoraMs: AGORA,
      pedidos: [pedidoCash("op1", 1, 300), pedidoCash("op1", 2, 400)],
      sessoes: [],
    });
    expect(achados.find((a) => a.regra === "VENDA_SEM_SESSAO_CAIXA").severidade).toBe("CRITICO");
  });
});

describe("REGRA 3 — divergência de caixa recorrente", () => {
  const sessaoFechada = (op, horasAtras, diff) => ({
    id: "S" + horasAtras,
    operatorId: op,
    operatorName: "Operador",
    status: "closed",
    openedAt: iso(h(horasAtras + 8)),
    closedAt: iso(h(horasAtras)),
    expectedBalance: 100,
    closedBalance: 100 - diff,
    balanceDiff: diff,
  });

  it("acusа 3 fechamentos com diferença acima de R$ 5", () => {
    const achados = detectarAnomalias({
      agoraMs: AGORA,
      sessoes: [sessaoFechada("op1", 1, -20), sessaoFechada("op1", 2, -15), sessaoFechada("op1", 3, -30)],
    });
    const achado = achados.find((a) => a.regra === "DIVERGENCIA_CAIXA_RECORRENTE");
    expect(achado).toBeTruthy();
    expect(achado.quantidade).toBe(3);
  });

  it("NÃO acusa diferença de centavos (erro de contagem normal)", () => {
    const achados = detectarAnomalias({
      agoraMs: AGORA,
      sessoes: [sessaoFechada("op1", 1, -1), sessaoFechada("op1", 2, 2), sessaoFechada("op1", 3, -0.5)],
    });
    expect(achados.find((a) => a.regra === "DIVERGENCIA_CAIXA_RECORRENTE")).toBeFalsy();
  });

  it("NÃO acusa sessõesABERTAS (ainda não fechadas)", () => {
    const achados = detectarAnomalias({
      agoraMs: AGORA,
      sessoes: [
        { ...sessaoFechada("op1", 1, -50), status: "open", balanceDiff: 0 },
        { ...sessaoFechada("op1", 2, -50), status: "open", balanceDiff: 0 },
        { ...sessaoFechada("op1", 3, -50), status: "open", balanceDiff: 0 },
      ],
    });
    expect(achados.find((a) => a.regra === "DIVERGENCIA_CAIXA_RECORRENTE")).toBeFalsy();
  });

  it("soma o prejuízo e escala para CRITICO acima de R$ 100", () => {
    const achados = detectarAnomalias({
      agoraMs: AGORA,
      sessoes: [sessaoFechada("op1", 1, -60), sessaoFechada("op1", 2, -60), sessaoFechada("op1", 3, -60)],
    });
    expect(achados.find((a) => a.regra === "DIVERGENCIA_CAIXA_RECORRENTE").severidade).toBe("CRITICO");
  });
});

describe("REGRA 4 — depósito oscilante (aprovado e recusado)", () => {
  const logDeposito = (tipo, uid, horasAtras) => ({
    acaoTipo: tipo,
    operadorUid: "op1",
    timestamp: iso(h(horasAtras)),
    payloadDepois: { userId: uid },
  });

  it("acusа aprovação seguida de recusa do mesmo depósito", () => {
    const achados = detectarAnomalias({
      agoraMs: AGORA,
      auditLogs: [
        logDeposito("LIBERAR_CREDITO_DEPOSITO", "user9", 5),
        logDeposito("REJEITAR_DEPOSITO", "user9", 3),
      ],
    });
    const achado = achados.find((a) => a.regra === "DEPOSITO_OSCILANTE");
    expect(achado).toBeTruthy();
    expect(achado.alvo).toBe("user9");
  });

  it("NÃO acusa depósitos de usuários diferentes", () => {
    const achados = detectarAnomalias({
      agoraMs: AGORA,
      auditLogs: [
        logDeposito("LIBERAR_CREDITO_DEPOSITO", "user1", 5),
        logDeposito("REJEITAR_DEPOSITO", "user2", 3),
      ],
    });
    expect(achados.find((a) => a.regra === "DEPOSITO_OSCILANTE")).toBeFalsy();
  });

  it("NÃO acusa quem só aprova (fluxo normal)", () => {
    const achados = detectarAnomalias({
      agoraMs: AGORA,
      auditLogs: [
        logDeposito("LIBERAR_CREDITO_DEPOSITO", "user1", 5),
        logDeposito("LIBERAR_CREDITO_DEPOSITO", "user2", 4),
      ],
    });
    expect(achados.find((a) => a.regra === "DEPOSITO_OSCILANTE")).toBeFalsy();
  });
});

describe("REGRA 5 — venda abaixo do custo", () => {
  it("acusа item vendido por menos que o custo", () => {
    const achados = detectarAnomalias({
      agoraMs: AGORA,
      pedidos: [{
        id: "P1",
        status: "paid",
        createdAt: iso(h(1)),
        items: [{ productId: "prod1", name: "Arroz", priceAtPurchase: 5, quantity: 2, costPrice: 10 }],
      }],
      produtosPorId: { prod1: 10 },
    });
    const achado = achados.find((a) => a.regra === "VENDA_ABAIXO_DO_CUSTO");
    expect(achado).toBeTruthy();
    // (10 - 5) x 2 = R$ 10 de prejuízo
    expect(achado.titulo).toContain("10.00");
  });

  it("NÃO acusa venda com lucro", () => {
    const achados = detectarAnomalias({
      agoraMs: AGORA,
      pedidos: [{
        id: "P1", status: "paid", createdAt: iso(h(1)),
        items: [{ productId: "prod1", name: "Arroz", priceAtPurchase: 15, quantity: 1 }],
      }],
      produtosPorId: { prod1: 10 },
    });
    expect(achados.find((a) => a.regra === "VENDA_ABAIXO_DO_CUSTO")).toBeFalsy();
  });

  it("tolerância de 1% absorve arredondamento", () => {
    const achados = detectarAnomalias({
      agoraMs: AGORA,
      pedidos: [{
        id: "P1", status: "paid", createdAt: iso(h(1)),
        items: [{ productId: "prod1", name: "Arroz", priceAtPurchase: 9.9, quantity: 1 }],
      }],
      produtosPorId: { prod1: 10 },
    });
    expect(achados.find((a) => a.regra === "VENDA_ABAIXO_DO_CUSTO")).toBeFalsy();
  });

  it("NÃO acusa venda cancelada", () => {
    const achados = detectarAnomalias({
      agoraMs: AGORA,
      pedidos: [{
        id: "P1", status: "CANCELLED", createdAt: iso(h(1)),
        items: [{ productId: "prod1", name: "Arroz", priceAtPurchase: 1, quantity: 1 }],
      }],
      produtosPorId: { prod1: 10 },
    });
    expect(achados.find((a) => a.regra === "VENDA_ABAIXO_DO_CUSTO")).toBeFalsy();
  });

  it("NÃO julga produto sem custo cadastrado", () => {
    const achados = detectarAnomalias({
      agoraMs: AGORA,
      pedidos: [{
        id: "P1", status: "paid", createdAt: iso(h(1)),
        items: [{ productId: "prodX", name: "Sem custo", priceAtPurchase: 1, quantity: 1 }],
      }],
      produtosPorId: {},
    });
    expect(achados.find((a) => a.regra === "VENDA_ABAIXO_DO_CUSTO")).toBeFalsy();
  });
});

describe("REGRA 6 — crédito manual elevado", () => {
  const logCredito = (valor, horasAtras) => ({
    acaoTipo: "CREDITO_MANUAL",
    operadorUid: "op1",
    timestamp: iso(h(horasAtras)),
    payloadDepois: { valor, userId: "user1", motivo: "ajuste" },
  });

  it("acusа crédito manual acima de R$ 500", () => {
    const achados = detectarAnomalias({ agoraMs: AGORA, auditLogs: [logCredito(800, 1)] });
    expect(achados.find((a) => a.regra === "CREDITO_MANUAL_ELEVADO")).toBeTruthy();
  });

  it("NÃO acusa crédito pequeno (ajuste legítimo)", () => {
    const achados = detectarAnomalias({ agoraMs: AGORA, auditLogs: [logCredito(50, 1)] });
    expect(achados.find((a) => a.regra === "CREDITO_MANUAL_ELEVADO")).toBeFalsy();
  });

  it("escala para ALTO em crédito 4x o limite", () => {
    const achados = detectarAnomalias({ agoraMs: AGORA, auditLogs: [logCredito(2500, 1)] });
    expect(achados.find((a) => a.regra === "CREDITO_MANUAL_ELEVADO").severidade).toBe("ALTO");
  });
});

describe("motor — ordenação e robustez", () => {
  it("ordena por severidade (CRITICO primeiro)", () => {
    const achados = detectarAnomalias({
      agoraMs: AGORA,
      auditLogs: [
        logEstorno("op1", 1), logEstorno("op1", 2), logEstorno("op1", 3),
        { acaoTipo: "CREDITO_MANUAL", operadorUid: "op2", timestamp: iso(h(1)), payloadDepois: { valor: 3000 } },
      ],
      pedidos: [{ id: "P1", operatorId: "op9", paymentMethod: "CASH", total: 900, createdAt: iso(h(1)) }],
      sessoes: [],
    });
    expect(achados[0].severidade).toBe("CRITICO");
    expect(achados[achados.length - 1].severidade).toBe("ALTO");
  });

  it("dia tranquilo devolve lista vazia", () => {
    const achados = detectarAnomalias({
      agoraMs: AGORA,
      auditLogs: [{ acaoTipo: "VENDA_PDV_ADMIN", operadorUid: "op1", timestamp: iso(h(1)) }],
      pedidos: [{ id: "P1", operatorId: "op1", paymentMethod: "PIX", total: 20, createdAt: iso(h(1)) }],
      sessoes: [],
    });
    expect(achados).toHaveLength(0);
  });

  it("nunca lança com entrada vazia/incompleta", () => {
    expect(detectarAnomalias({})).toEqual([]);
    expect(detectarAnomalias()).toEqual([]);
    expect(detectarAnomalias({ auditLogs: null, pedidos: undefined, sessoes: null })).toEqual([]);
  });

  it("é determinístico: mesma entrada, mesma saída", () => {
    const entrada = {
      agoraMs: AGORA,
      auditLogs: [logEstorno("op1", 1), logEstorno("op1", 2), logEstorno("op1", 3)],
    };
    expect(detectarAnomalias(entrada)).toEqual(detectarAnomalias(entrada));
  });
});
