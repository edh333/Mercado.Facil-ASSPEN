// Testes do DESBLOQUEIO OFFLINE DE EMERGÊNCIA (utils/offlineUnlock.ts)
// Validam: guardar o hash (nunca a senha em texto), verificar a senha,
// ciclo de vida da sessão de emergência (ativa/expira) e os clears.
import { describe, it, expect, beforeEach } from "vitest";
import {
  hasOfflineCredential,
  getOfflineCredential,
  setOfflineCredential,
  verifyOfflinePassword,
  clearOfflineCredential,
  startOfflineSession,
  hasActiveOfflineSession,
  getOfflineSession,
  clearOfflineSession,
} from "../utils/offlineUnlock";

const CRED_KEY = "mf_offline_admin_cred";
const SESSION_KEY = "mf_offline_admin_session";

beforeEach(() => {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
  };
  store.clear();
});

describe("credencial offline de emergência", () => {
  it("não existe credencial antes de qualquer login", () => {
    expect(hasOfflineCredential()).toBe(false);
    expect(getOfflineCredential()).toBeNull();
  });

  it("guardou só o hash bcrypt — nunca a senha em texto", async () => {
    await setOfflineCredential("Maria Admin", "senha-secreta-123");

    expect(hasOfflineCredential()).toBe(true);
    const cred = getOfflineCredential()!;
    expect(cred.name).toBe("Maria Admin");
    expect(cred.hash).toMatch(/^\$2[abvy]\$/); // bcrypt
    expect(cred.hash).not.toContain("senha-secreta-123");

    const raw = JSON.parse(localStorage.getItem(CRED_KEY)!);
    expect(raw.hash).toMatch(/^\$2[abvy]\$/);
  });

  it("aceita a senha correta e rejeita a errada", async () => {
    await setOfflineCredential("Admin", "minha-senha");
    expect(await verifyOfflinePassword("minha-senha")).toBe(true);
    expect(await verifyOfflinePassword("errada")).toBe(false);
    expect(await verifyOfflinePassword("")).toBe(false);
  });

  it("limpa a credencial", async () => {
    await setOfflineCredential("Admin", "x");
    clearOfflineCredential();
    expect(hasOfflineCredential()).toBe(false);
  });
});

describe("sessão de emergência", () => {
  it("inicia ativa e expira", async () => {
    startOfflineSession("Admin");
    expect(hasActiveOfflineSession()).toBe(true);
    expect(getOfflineSession()!.name).toBe("Admin");

    // Força expiração: mexe na data direto no storage
    const s = JSON.parse(localStorage.getItem(SESSION_KEY)!);
    s.expiresAt = Date.now() - 1000;
    localStorage.setItem(SESSION_KEY, JSON.stringify(s));

    expect(hasActiveOfflineSession()).toBe(false);
    expect(getOfflineSession()).toBeNull();
  });

  it("clearOfflineSession remove a sessão ativa", () => {
    startOfflineSession("Admin");
    clearOfflineSession();
    expect(hasActiveOfflineSession()).toBe(false);
  });
});