// EXCLUSÃO DE CLIENTE DE FIADO — o fim do hard delete no cliente.
//
// Antes, a tela de Clientes chamava deleteDoc() direto no documento do
// usuário: o histórico de compras sumia, dava para apagar alguém COM DÍVIDA
// em aberto (o fiado virava perda invisível) e não exigia senha mestra.
//
// Este teste trava o comportamento novo:
//  - soft delete (o doc continua no banco) + audit log;
//  - recusa com dívida em aberto;
//  - 2º fator (senha mestra) e permissão 'finance';
//  - o administrador principal nunca é excluído.
import { beforeEach, describe, expect, it } from "vitest";
import { fake, call } from "./test-support/harness.js";
import { baseSeed, MASTER_PASSWORD } from "./test-support/fixtures.js";

function seed(extraUsers = {}) {
  const base = baseSeed();
  return {
    ...base,
    users: { ...base.users, ...extraUsers },
  };
}

async function excluir(userId, authUid = "admin1", senhaMestra = MASTER_PASSWORD) {
  return call("excluirClienteFiado", { userId, senhaMestra }, authUid);
}

beforeEach(() => {
  fake.reset(baseSeed());
});

describe("excluirClienteFiado", () => {
  it("encerra a conta com SOFT delete (sem apagar o histórico) e audita", async () => {
    const res = await excluir("fiado1");

    expect(res.ok).toBe(true);
    expect(res.userId).toBe("fiado1");

    // O DOC CONTINUA NO BANCO — só sai do fiado. Apagar o doc sumia com o
    // histórico de compras e com a conciliação.
    const doc = fake.getDoc("users", "fiado1");
    expect(doc).toBeTruthy();
    expect(doc.deleted).toBe(true);
    expect(doc.allowCredit).toBe(false);
    expect(doc.status).toBe("suspended");
    // A ficha e o histórico continuam íntegros.
    expect(doc.name).toBe("Cliente Fiado");
    expect(doc.cpf).toBe("16899535009");
    expect(doc.creditLimit).toBe(500);

    expect(fake.allDocs("audit_logs").some((l) => l.acaoTipo === "EXCLUIR_CLIENTE_FIADO")).toBe(true);
  });

  it("RECUSA cliente com dívida em aberto (a perda não pode sumir)", async () => {
    fake.reset(seed({ fiado2: { authUid: "fiado2", role: "user", status: "active", name: "Devedor", allowCredit: true, creditLimit: 500, currentDebt: 120 } }));

    await expect(excluir("fiado2")).rejects.toMatchObject({
      code: "functions/failed-precondition",
    });

    // Nada mudou: a dívida continua registrada.
    const doc = fake.getDoc("users", "fiado2");
    expect(doc.deleted).toBeUndefined();
    expect(doc.currentDebt).toBe(120);
  });

  it("exige senha mestra (2º fator)", async () => {
    await expect(excluir("fiado1", "admin1", "senha-errada")).rejects.toMatchObject({
      code: "functions/permission-denied",
    });
    expect(fake.getDoc("users", "fiado1").deleted).toBeUndefined();
  });

  it("não deixa admin sem a permissão 'finance' excluir cliente de fiado", async () => {
    fake.reset(seed({ admin2: { authUid: "admin2", role: "admin", status: "active", name: "Admin Vendas", permissions: ["sales"] } }));

    await expect(excluir("fiado1", "admin2")).rejects.toMatchObject({
      code: "functions/permission-denied",
    });
    expect(fake.getDoc("users", "fiado1").deleted).toBeUndefined();
  });

  it("não exclui o administrador principal", async () => {
    await expect(excluir("admin1")).rejects.toMatchObject({
      code: "functions/failed-precondition",
    });
    expect(fake.getDoc("users", "admin1").deleted).toBeUndefined();
  });

  it("recusa cliente inexistente", async () => {
    await expect(excluir("nao-existe")).rejects.toMatchObject({
      code: "functions/not-found",
    });
  });

  it("exige autenticação", async () => {
    await expect(call("excluirClienteFiado", { userId: "fiado1", senhaMestra: MASTER_PASSWORD }, null)).rejects.toMatchObject({
      code: "functions/unauthenticated",
    });
  });
});
