// Testes de integração das rotinas de manutenção/administração sensíveis:
// - zerarCarteiras (zeragem manual de saldos, com auditoria e idempotência de contagem)
// - listarBackups (agora restrita ao ADMINISTRADOR PRINCIPAL)
// - arquivarDadosAntigos (reset semanal server-side, sempre na data local MT)
import { beforeEach, describe, expect, it } from "vitest";
import { fake, call } from "./test-support/harness.js";
import { baseSeed, MASTER_PASSWORD } from "./test-support/fixtures.js";

/** Segunda-feira da semana ATUAL no fuso America/Cuiaba, como "AAAA-MM-DD". */
function segundaFeiraMT() {
  const [ano, mes, dia] = new Date()
    .toLocaleDateString("en-CA", { timeZone: "America/Cuiaba" })
    .split("-")
    .map(Number);
  const ref = new Date(Date.UTC(ano, mes - 1, dia));
  const dow = ref.getUTCDay(); // 0 = domingo
  ref.setUTCDate(ref.getUTCDate() - (dow === 0 ? 6 : dow - 1));
  return ref.toISOString().slice(0, 10);
}

function seed() {
  const base = baseSeed();
  return {
    ...base,
    users: {
      ...base.users,
      // Admin secundário: NÃO é principal e não tem a permissão granular 'wallet'.
      admin2: {
        authUid: "admin2",
        role: "admin",
        status: "active",
        name: "Admin Dois",
        mainAdmin: false,
        permissions: [],
      },
      u1: { ...base.users.u1, walletBalance: 120, weeklySpent: 40 },
      u2: { ...base.users.u2, walletBalance: 30, weeklySpent: 15 },
    },
  };
}

beforeEach(() => fake.reset(seed()));

describe("zerarCarteiras", () => {
  it("zera os saldos, conta cada usuário UMA vez e registra transações + auditoria", async () => {
    const res = await call("zerarCarteiras", { senhaMestra: MASTER_PASSWORD }, "admin1");

    expect(res).toEqual({ ok: true, totalZeradas: 2 });
    expect(fake.getDoc("users", "u1").walletBalance).toBe(0);
    expect(fake.getDoc("users", "u2").walletBalance).toBe(0);

    const txs = fake.allDocs("wallet_transactions");
    expect(txs).toHaveLength(2);
    expect(txs.every((t) => t.type === "correction" && t.status === "approved")).toBe(true);
    expect(txs.reduce((s, t) => s + t.amount, 0)).toBe(-150);

    const auditorias = fake.allDocs("audit_logs").filter((l) => l.acaoTipo === "ZERAR_CREDITOS");
    expect(auditorias).toHaveLength(1);
    expect(auditorias[0].payloadDepois.totalZeradas).toBe(2);
    expect(auditorias[0].payloadAntes.usuariosComSaldo.map((u) => u.id).sort()).toEqual(["u1", "u2"]);
  });

  it("exige a senha mestra", async () => {
    await expect(call("zerarCarteiras", { senhaMestra: "errada" }, "admin1"))
      .rejects.toMatchObject({ code: "functions/permission-denied" });
    expect(fake.getDoc("users", "u1").walletBalance).toBe(120);
  });

  it("barra admin secundário sem a permissão granular de carteira", async () => {
    await expect(call("zerarCarteiras", { senhaMestra: MASTER_PASSWORD }, "admin2"))
      .rejects.toMatchObject({ code: "functions/permission-denied" });
    expect(fake.getDoc("users", "u1").walletBalance).toBe(120);
  });
});

describe("listarBackups", () => {
  it("barra admin secundário (área exclusiva do principal)", async () => {
    await expect(call("listarBackups", {}, "admin2"))
      .rejects.toMatchObject({ code: "functions/permission-denied" });
  });

  it("devolve apenas arquivos .json para o admin principal", async () => {
    fake.storageFileList = [
      { name: "backups/2026-01-02.json", metadata: { size: 2048, updated: "2026-01-02T00:00:00Z" } },
      { name: "backups/leia-me.txt", metadata: { size: 10, updated: "2026-01-01T00:00:00Z" } },
    ];
    const res = await call("listarBackups", {}, "admin1");

    expect(res.ok).toBe(true);
    expect(res.backups).toEqual([
      { nome: "backups/2026-01-02.json", tamanho: 2048, atualizadoEm: "2026-01-02T00:00:00Z" },
    ]);
  });
});

describe("arquivarDadosAntigos (reset semanal server-side)", () => {
  it("zera weeklySpent e grava a segunda-feira LOCAL (America/Cuiaba) como marcador", async () => {
    await call("arquivarDadosAntigos", null, null);

    expect(fake.getDoc("users", "u1").weeklySpent).toBe(0);
    expect(fake.getDoc("users", "u2").weeklySpent).toBe(0);
    expect(fake.getDoc("settings", "maintenance").lastWeeklyReset).toBe(segundaFeiraMT());
  });

  it("não regrava o marcador ao rodar de novo na mesma semana (idempotente)", async () => {
    await call("arquivarDadosAntigos", null, null);
    const marco = fake.getDoc("settings", "maintenance").lastWeeklyReset;
    await call("arquivarDadosAntigos", null, null);

    expect(fake.getDoc("settings", "maintenance").lastWeeklyReset).toBe(marco);
    expect(fake.getDoc("users", "u1").weeklySpent).toBe(0);
  });

  it("remove guardas de idempotência com mais de 7 dias e preserva as recentes", async () => {
    const base = seed();
    const agora = Date.now();
    fake.reset({
      ...base,
      request_guard: {
        "venda_antiga": { type: "venda", createdAt: fake.Timestamp.fromDate(new Date(agora - 8 * 24 * 60 * 60 * 1000)) },
        "credito_admin_recente": { type: "credito_admin", createdAt: fake.Timestamp.fromDate(new Date(agora - 60 * 1000)) },
      },
    });

    await call("arquivarDadosAntigos", null, null);

    // A antiga (>7 dias) sai; a recente permanece — a comparação é Timestamp x
    // Timestamp (antes o cutoff era string ISO e o filtro nunca casava).
    expect(fake.getDoc("request_guard", "venda_antiga")).toBeUndefined();
    expect(fake.getDoc("request_guard", "credito_admin_recente")).toBeTruthy();
  });
});
