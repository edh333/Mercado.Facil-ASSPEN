// FLUXO 3 — Sessão de caixa: abrir, suprimento, sangria e fechar.
//
// Este é o fluxo que fecha o dia: o saldo esperado, a diferença (quebra) e o
// lock de "um caixa por operador" precisam ser consistentes, senão a
// conciliação de dinheiro do presídio fica errada.
import { beforeEach, describe, expect, it } from "vitest";
import { fake, call } from "./test-support/harness.js";
import { baseSeed, MASTER_PASSWORD } from "./test-support/fixtures.js";

function abrir(initialBalance, authUid = "op1") {
  return call("gerenciarSessaoCaixa", { acao: "open", initialBalance }, authUid);
}
function suprir(sessaoId, valor, authUid = "op1", senhaMestra) {
  return call("gerenciarSessaoCaixa", { acao: "supplement", sessaoId, valor, motivo: "troco", senhaMestra }, authUid);
}
function sangrar(sessaoId, valor, authUid = "op1", senhaMestra) {
  return call("gerenciarSessaoCaixa", { acao: "withdrawal", sessaoId, valor, motivo: "depósito", senhaMestra }, authUid);
}
function fechar(sessaoId, closedBalance, authUid = "op1", extra = {}) {
  return call("gerenciarSessaoCaixa", { acao: "close", sessaoId, closedBalance, ...extra }, authUid);
}

beforeEach(() => {
  // sem caixa pré-aberto neste arquivo (o baseSeed traz s1 aberto).
  fake.reset({ ...baseSeed(), cash_sessions: {} });
});

describe("gerenciarSessaoCaixa", () => {
  it("abre o caixa com saldo inicial e cria o lock do operador", async () => {
    const res = await abrir(100);
    expect(res.ok).toBe(true);
    expect(res.sessaoId).toBeTruthy();

    const sessao = fake.getDoc("cash_sessions", res.sessaoId);
    expect(sessao.status).toBe("open");
    expect(sessao.operatorId).toBe("op1");
    expect(sessao.initialBalance).toBe(100);
    expect(sessao.currentBalance).toBe(100);
    expect(sessao.supplements).toEqual([]);

    const lock = fake.getDoc("locks", "caixa_ativo_op1");
    expect(lock.active).toBe(true);
    expect(lock.sessaoId).toBe(res.sessaoId);

    expect(fake.allDocs("audit_logs").some((l) => l.acaoTipo === "ABRIR_CAIXA")).toBe(true);
  });

  it("não permite dois caixas abertos para o mesmo operador", async () => {
    await abrir(100);
    await expect(abrir(50)).rejects.toMatchObject({ code: "functions/failed-precondition" });
  });

  it("recusa saldo inicial negativo", async () => {
    await expect(abrir(-1)).rejects.toMatchObject({ code: "functions/invalid-argument" });
  });

  it("suprimento e sangria movem o saldo e ficam registrados no histórico", async () => {
    const { sessaoId } = await abrir(100);

    await suprir(sessaoId, 50);
    expect(fake.getDoc("cash_sessions", sessaoId).currentBalance).toBe(150);
    expect(fake.getDoc("cash_sessions", sessaoId).supplements).toHaveLength(1);

    await sangrar(sessaoId, 30);
    const s = fake.getDoc("cash_sessions", sessaoId);
    expect(s.currentBalance).toBe(120);
    expect(s.withdrawals).toHaveLength(1);
    expect(s.withdrawals[0].amount).toBe(30);
  });

  it("sangria acima do saldo em caixa é recusada", async () => {
    const { sessaoId } = await abrir(100);
    await expect(sangrar(sessaoId, 150)).rejects.toMatchObject({ code: "functions/failed-precondition" });
    expect(fake.getDoc("cash_sessions", sessaoId).currentBalance).toBe(100);
  });

  it("fechar calcula a diferença (quebra) e libera o lock", async () => {
    const { sessaoId } = await abrir(100);
    await suprir(sessaoId, 50); // esperado = 150

    const res = await fechar(sessaoId, 145); // faltou R$ 5
    expect(res.ok).toBe(true);
    expect(res.expected).toBe(150);
    expect(res.diff).toBe(-5);

    const s = fake.getDoc("cash_sessions", sessaoId);
    expect(s.status).toBe("closed");
    expect(s.expectedBalance).toBe(150);
    expect(s.cashDifference).toBe(-5);
    expect(s.hasDiscrepancy).toBe(true);

    expect(fake.getDoc("locks", "caixa_ativo_op1").active).toBe(false);
    expect(fake.allDocs("audit_logs").some((l) => l.acaoTipo === "FECHAR_CAIXA")).toBe(true);
  });

  it("fechar com valor contado igual ao esperado zera a diferença", async () => {
    const { sessaoId } = await abrir(80);
    const res = await fechar(sessaoId, 80);
    expect(res.diff).toBe(0);
    expect(fake.getDoc("cash_sessions", sessaoId).hasDiscrepancy).toBe(false);
  });

  it("nenhuma operação depois de fechado", async () => {
    const { sessaoId } = await abrir(100);
    await fechar(sessaoId, 100);

    await expect(suprir(sessaoId, 10)).rejects.toMatchObject({ code: "functions/failed-precondition" });
    await expect(sangrar(sessaoId, 10)).rejects.toMatchObject({ code: "functions/failed-precondition" });
    await expect(fechar(sessaoId, 100)).rejects.toMatchObject({ code: "functions/failed-precondition" });
  });

  it("vendedor não movimenta a gaveta de outro operador", async () => {
    fake.reset({
      ...baseSeed(),
      cash_sessions: {
        s2: {
          operatorId: "op2",
          operatorName: "Outro",
          status: "open",
          openedAt: fake.Timestamp.fromDate(new Date(Date.now() - 3600 * 1000)),
          closedAt: null,
          initialBalance: 0,
          currentBalance: 100,
          supplements: [],
          withdrawals: [],
        },
      },
    });

    await expect(suprir("s2", 10, "op1")).rejects.toMatchObject({ code: "functions/permission-denied" });
    expect(fake.getDoc("cash_sessions", "s2").currentBalance).toBe(100);
  });

  it("admin precisa da senha mestra para suprimento em caixa alheio", async () => {
    fake.reset({
      ...baseSeed(),
      cash_sessions: {
        s2: {
          operatorId: "op2",
          status: "open",
          openedAt: fake.Timestamp.fromDate(new Date(Date.now() - 3600 * 1000)),
          closedAt: null,
          initialBalance: 100,
          currentBalance: 100,
          supplements: [],
          withdrawals: [],
        },
      },
    });

    // sem senha mestra → recusado
    await expect(suprir("s2", 10, "admin1")).rejects.toMatchObject({ code: "functions/permission-denied" });
    expect(fake.getDoc("cash_sessions", "s2").currentBalance).toBe(100);

    // com senha mestra → aceito
    const res = await suprir("s2", 10, "admin1", MASTER_PASSWORD);
    expect(res.ok).toBe(true);
    expect(fake.getDoc("cash_sessions", "s2").currentBalance).toBe(110);
  });

  it("sessão inexistente devolve not-found", async () => {
    await expect(suprir("inexistente", 10)).rejects.toMatchObject({ code: "functions/not-found" });
  });
});
