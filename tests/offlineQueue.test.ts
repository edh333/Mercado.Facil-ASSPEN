// Testes da FILA DE VENDAS OFFLINE (utils/offlineQueue.ts)
// Validam o "caderno digital": salvar, listar, remover, marcar erro,
// limpar erros e o teto de 200 registros — com localStorage simulado.
import { describe, it, expect, beforeEach } from "vitest";
import {
  listarVendasOffline,
  salvarVendaOffline,
  removerVendaOffline,
  marcarErroVendaOffline,
  limparErrosVendaOffline,
  VendaOffline,
} from "../utils/offlineQueue";

function venda(id: string, status: 'pending' | 'error' = 'pending'): VendaOffline {
  return {
    id,
    createdAt: new Date().toISOString(),
    targetUserId: 'balcao_anonimo',
    items: [{ productId: 'P1', name: 'Produto', price: 5.5, quantity: 2 }],
    paymentMethod: 'CASH',
    total: 11,
    status,
    tryCount: 0,
  };
}

beforeEach(() => {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, v); },
  };
  store.clear();
});

describe("filas de vendas offline", () => {
  it("começa vazia", () => {
    expect(listarVendasOffline()).toEqual([]);
  });

  it("salva e recupera", () => {
    salvarVendaOffline(venda('OFFLINE_1'));
    const lista = listarVendasOffline();
    expect(lista).toHaveLength(1);
    expect(lista[0].id).toBe('OFFLINE_1');
    expect(lista[0].total).toBe(11);
  });

  it("não duplica o mesmo id (sincronização repetida)", () => {
    salvarVendaOffline(venda('OFFLINE_1'));
    salvarVendaOffline(venda('OFFLINE_1'));
    expect(listarVendasOffline()).toHaveLength(1);
  });

  it("remove da fila quando sincroniza", () => {
    salvarVendaOffline(venda('OFFLINE_1'));
    removerVendaOffline('OFFLINE_1');
    expect(listarVendasOffline()).toEqual([]);
  });

  it("marca erro em venda recusada pelo servidor", () => {
    salvarVendaOffline(venda('OFFLINE_1'));
    marcarErroVendaOffline('OFFLINE_1', 'Saldo insuficiente');
    const [v] = listarVendasOffline();
    expect(v.status).toBe('error');
    expect(v.error).toBe('Saldo insuficiente');
    expect(v.tryCount).toBe(1);
  });

  it("limparErrosVendaOffline remove só as com erro (mantém pendentes)", () => {
    salvarVendaOffline(venda('OFFLINE_1', 'error'));
    salvarVendaOffline(venda('OFFLINE_2', 'pending'));
    salvarVendaOffline(venda('OFFLINE_3', 'error'));
    limparErrosVendaOffline();
    const restantes = listarVendasOffline();
    expect(restantes).toHaveLength(1);
    expect(restantes[0].id).toBe('OFFLINE_2');
  });

  it("mantém a fila íntegra com JSON corrompido no storage", () => {
    (globalThis as any).localStorage.setItem('mf_vendas_offline', '{corrompido');
    expect(listarVendasOffline()).toEqual([]);
    salvarVendaOffline(venda('OFFLINE_1'));
    expect(listarVendasOffline()).toHaveLength(1);
  });

  it("teto de 200 registros (não estoura o localStorage)", () => {
    for (let i = 0; i < 250; i++) salvarVendaOffline(venda(`OFFLINE_${i}`));
    expect(listarVendasOffline().length).toBeLessThanOrEqual(200);
  });
});