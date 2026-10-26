// @vitest-environment jsdom
// Regressão do erro "URI too long" ao imprimir relatórios grandes.
// O payload deve ir pelo localStorage quando não couber na URL.

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { abrirJanelaImpressao } from '../utils/printUtils';

// O jsdom deste projeto roda sem um Storage nativo. Um mapa em memória basta
// para verificar que o payload grande sai da URL e cai no localStorage.
const store = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => { store.clear(); },
  },
});

const abrirSpy = () => {
  const win = { closed: false, focus: vi.fn() } as unknown as Window;
  return vi.spyOn(window, 'open').mockReturnValue(win);
};

beforeEach(() => store.clear());
afterEach(() => {
  vi.restoreAllMocks();
  store.clear();
});

describe('abrirJanelaImpressao', () => {
  it('não coloca payload grande na URL (evita URI too long)', () => {
    const spy = abrirSpy();
    const linhas = Array.from({ length: 600 }, (_, i) => ({
      id: `pedido-${i}`,
      nome: `Cliente com nome comprido ${i}`,
      total: i * 1.25,
    }));

    const win = abrirJanelaImpressao(
      { type: 'RELATORIO', data: { titulo: 'Relatório grande', linhas } },
      { appName: 'Mercado Fácil' }
    );

    expect(win).toBeTruthy();
    const url = String(spy.mock.calls[0][0]);
    expect(url).toBe('/print.html');
    expect(url).not.toContain('?d=');
    expect(localStorage.getItem('printItem')).toContain('pedido-599');
  });

  it('mantém o payload na URL quando é pequeno', () => {
    const spy = abrirSpy();

    abrirJanelaImpressao({ type: 'RECIBO', data: { id: '1' } }, {});

    const url = String(spy.mock.calls[0][0]);
    expect(url.startsWith('/print.html?d=')).toBe(true);
    expect(url.length).toBeLessThan(1800);
  });
});
