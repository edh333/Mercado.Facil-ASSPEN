// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  lerUltimaAba, salvarUltimaAba,
  lerUltimaAbaAdmin, salvarUltimaAbaAdmin,
  lerUltimaAbaUsuario, salvarUltimaAbaUsuario,
  ABAS_ADMIN, ABAS_USUARIO,
} from '../utils/ultimaAba';

function criarFakeStorage() {
  const dados = new Map<string, string>();
  return {
    getItem: (k: string) => (dados.has(k) ? (dados.get(k) as string) : null),
    setItem: (k: string, v: string) => { dados.set(k, String(v)); },
    removeItem: (k: string) => { dados.delete(k); },
    clear: () => { dados.clear(); },
    key: (i: number) => [...dados.keys()][i] ?? null,
    get length() { return dados.size; },
  } as unknown as Storage;
}

describe('ultimaAba — lembra a aba aberta', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      writable: true,
      value: criarFakeStorage(),
    });
    globalThis.localStorage.clear();
  });

  it('retorna o padrão quando nada foi guardado', () => {
    expect(lerUltimaAbaAdmin()).toBe('home');
    expect(lerUltimaAbaUsuario()).toBe('store');
  });

  it('ciclo salvar → ler funciona por chave', () => {
    salvarUltimaAbaAdmin('wallet');
    salvarUltimaAbaUsuario('orders');
    expect(lerUltimaAbaAdmin()).toBe('wallet');
    expect(lerUltimaAbaUsuario()).toBe('orders');
  });

  it('rejeita valor inválido guardado (cai no padrão)', () => {
    const valida = (a: string) => ABAS_ADMIN.includes(a as any);
    globalThis.localStorage.setItem('mf_ultima_aba:admin', 'ghost_tab');
    expect(lerUltimaAba('admin', valida, 'home')).toBe('home');
  });

  it('ABAS_ADMIN cobre os ids reais de navegação do painel', () => {
    for (const tab of ['home', 'orders', 'products', 'cash', 'inmates', 'users', 'wallet', 'reports', 'settings']) {
      expect(ABAS_ADMIN.includes(tab as any)).toBe(true);
    }
    expect(ABAS_USUARIO).toEqual(['store', 'orders']);
  });

  it('sobrevive a giá corrompida no localStorage', () => {
    globalThis.localStorage.setItem('mf_ultima_aba:admin', '{"lixo');
    expect(lerUltimaAbaAdmin()).toBe('home');
  });
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _descartarVi = vi;