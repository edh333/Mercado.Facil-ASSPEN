// Testes do mapa de atalhos do painel admin (utils/adminShortcuts.ts).
//
// Antes, a tabela tecla→ação vivia dentro de um handler não exportado do
// AdminDashboard, sem cobertura. Aqui garantimos o mapeamento exato de F1–F12,
// a regra de permissão do F2 e o reconhecimento correto das teclas.

import { describe, it, expect, vi } from 'vitest';
import { construirMapaAtalhos, ehTeclaDeAtalho, AtalhosDeps } from '../utils/adminShortcuts';

function deps(overrides: Partial<AtalhosDeps> = {}): AtalhosDeps {
  return {
    irPara: vi.fn(),
    irParaInicio: vi.fn(),
    permissao: vi.fn(() => true),
    abrirVenda: vi.fn(),
    notificar: vi.fn(),
    ...overrides,
  };
}

describe('ehTeclaDeAtalho', () => {
  it('aceita F1–F12 e "?"', () => {
    for (let i = 1; i <= 12; i++) expect(ehTeclaDeAtalho(`F${i}`)).toBe(true);
    expect(ehTeclaDeAtalho('?')).toBe(true);
  });

  it('rejeita F0, F13, "F", "f2" e outras teclas', () => {
    for (const t of ['F0', 'F13', 'F', 'f2', 'Escape', 'Enter', 'a']) {
      expect(ehTeclaDeAtalho(t)).toBe(false);
    }
  });
});

describe('construirMapaAtalhos', () => {
  it('F1 vai para o início', () => {
    const d = deps();
    construirMapaAtalhos(d).F1();
    expect(d.irParaInicio).toHaveBeenCalledTimes(1);
    expect(d.irPara).not.toHaveBeenCalled();
  });

  it('mapeia cada tecla de função para a aba correta', () => {
    const esperado: Record<string, string> = {
      F3: 'orders', F4: 'reports', F5: 'products', F6: 'finance',
      F7: 'wallet', F8: 'users', F9: 'bi', F10: 'settings',
      F11: 'cash', F12: 'customers',
    };
    for (const [tecla, aba] of Object.entries(esperado)) {
      const d = deps();
      construirMapaAtalhos(d)[tecla]();
      expect(d.irPara).toHaveBeenCalledWith(aba);
    }
  });

  it('F2 abre a venda quando há permissão', () => {
    const d = deps({ permissao: vi.fn(() => true) });
    construirMapaAtalhos(d).F2();
    expect(d.abrirVenda).toHaveBeenCalledTimes(1);
    expect(d.notificar).not.toHaveBeenCalled();
  });

  it('F2 avisa e não abre a venda sem permissão', () => {
    const d = deps({ permissao: vi.fn(() => false) });
    construirMapaAtalhos(d).F2();
    expect(d.abrirVenda).not.toHaveBeenCalled();
    expect(d.notificar).toHaveBeenCalledWith(expect.stringContaining('Permissão negada'), 'error');
  });
});
