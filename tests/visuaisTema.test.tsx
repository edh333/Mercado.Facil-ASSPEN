// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import {
  resolverVisual, lerVisualLocal, salvarVisualLocal,
  VISUAL_PRESETS, VISUAL_AUTO, VISUAL_PADRAO,
} from '../utils/visuais';
import { ThemeOption } from '../types';

// --- Mocks: ThemeProvider fala com Firestore; aqui um snapshot controlável ---
const { snapAtual } = vi.hoisted(() => ({ snapAtual: { value: null as any } }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({})),
  onSnapshot: vi.fn((_ref: any, cb: any) => {
    if (typeof cb === 'function') cb(snapAtual.value);
    return () => {};
  }),
}));
vi.mock('../firebase', () => ({ db: {} }));

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

describe('visuais: resolverVisual (lógica pura)', () => {
  it('sem nada → padrão de fábrica Esmeralda, acento por modo', () => {
    const claro = resolverVisual({ overrideLocal: VISUAL_AUTO, themeFleet: null, primaryFleet: null, isDark: false });
    expect(claro.id).toBe(VISUAL_PADRAO);
    expect(claro.primary).toBe(VISUAL_PRESETS[VISUAL_PADRAO].primaryLight);
    expect(claro.superficie.bgMain).toBe('#fafaf9');

    const escuro = resolverVisual({ overrideLocal: VISUAL_AUTO, themeFleet: null, primaryFleet: null, isDark: true });
    expect(escuro.primary).toBe(VISUAL_PRESETS[VISUAL_PADRAO].primaryDark);
    expect(escuro.superficie.bgMain).toBe('#09090b');
  });

  it('preset do admin (fleet) define superfícies e acento por modo', () => {
    const claro = resolverVisual({ overrideLocal: VISUAL_AUTO, themeFleet: ThemeOption.POLICE_MT, primaryFleet: null, isDark: false });
    expect(claro.id).toBe(ThemeOption.POLICE_MT);
    expect(claro.primary).toBe('#0369a1');
    expect(claro.superficie.bgMain).toBe('#f1f5f9'); // slate-light

    const escuro = resolverVisual({ overrideLocal: VISUAL_AUTO, themeFleet: ThemeOption.POLICE_MT, primaryFleet: null, isDark: true });
    expect(escuro.primary).toBe('#38bdf8'); // acento claro no escuro (legível)
    expect(escuro.superficie.bgMain).toBe('#0f172a'); // slate-900
  });

  it('override local vence o preset do admin', () => {
    const r = resolverVisual({ overrideLocal: ThemeOption.PROFESSIONAL_BLUE, themeFleet: ThemeOption.POLICE_MT, primaryFleet: null, isDark: false });
    expect(r.id).toBe(ThemeOption.PROFESSIONAL_BLUE);
    expect(r.primary).toBe('#2563eb');
  });

  it("override local 'auto' volta a seguir o admin", () => {
    const r = resolverVisual({ overrideLocal: VISUAL_AUTO, themeFleet: ThemeOption.POLICE_MT, primaryFleet: null, isDark: false });
    expect(r.id).toBe(ThemeOption.POLICE_MT);
  });

  it('id desconhecido (dado antigo) + primaryColor válido → superfícies padrão com acento legado', () => {
    const r = resolverVisual({ overrideLocal: VISUAL_AUTO, themeFleet: 'visual_antigo_desconhecido', primaryFleet: '#7c3aed', isDark: false });
    expect(r.id).toBe(VISUAL_PADRAO);
    expect(r.primary).toBe('#7c3aed');
    expect(r.superficie.bgMain).toBe('#fafaf9');
  });

  it('verde legado #0e7a4d é ignorado (não prende o app no verde escuro antigo)', () => {
    const r = resolverVisual({ overrideLocal: VISUAL_AUTO, themeFleet: null, primaryFleet: '#0e7a4d', isDark: false });
    expect(r.primary).toBe(VISUAL_PRESETS[VISUAL_PADRAO].primaryLight);
  });

  it('todos os presets existentes resolvem sem cair no fallback', () => {
    for (const id of Object.keys(VISUAL_PRESETS)) {
      const r = resolverVisual({ overrideLocal: id, themeFleet: null, primaryFleet: null, isDark: true });
      expect(r.id).toBe(id);
      expect(r.primary).toBe(VISUAL_PRESETS[id].primaryDark);
      expect(r.superficie).toBe(VISUAL_PRESETS[id].dark);
    }
  });
});

describe('visuais: override local (localStorage)', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      writable: true,
      value: criarFakeStorage(),
    });
  });

  it('ler sem nada → auto (segue o admin)', () => {
    expect(lerVisualLocal()).toBe(VISUAL_AUTO);
  });

  it('salvar e ler volta o id escolhido', () => {
    salvarVisualLocal(ThemeOption.POLICE_MT);
    expect(lerVisualLocal()).toBe(ThemeOption.POLICE_MT);
  });

  it('salvar id inválido cai em auto; salvar auto é explicitamente auto', () => {
    salvarVisualLocal('visual_inexistente');
    expect(lerVisualLocal()).toBe(VISUAL_AUTO);
    salvarVisualLocal(VISUAL_AUTO);
    expect(lerVisualLocal()).toBe(VISUAL_AUTO);
  });
});

describe('visuais: aplicação real no DOM via ThemeProvider', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      writable: true,
      value: criarFakeStorage(),
    });
    snapAtual.value = { exists: () => false, data: () => ({}) };
    document.documentElement.removeAttribute('style');
    document.documentElement.classList.remove('dark');
  });

  it('aplica acento + superfícies do visual (override local, claro)', async () => {
    globalThis.localStorage.setItem('mercado-theme-mode', 'light');
    globalThis.localStorage.setItem('mf_visual_local', ThemeOption.POLICE_MT);

    const { ThemeProvider } = await import('../context/ThemeContext');
    const { unmount } = render(
      <ThemeProvider><div data-testid="alvo">x</div></ThemeProvider>
    );
    try {
      await waitFor(() => {
        expect(document.documentElement.style.getPropertyValue('--primary-color').trim().toLowerCase()).toBe('#0369a1');
      });
      expect(document.documentElement.style.getPropertyValue('--bg-main')).toBe('#f1f5f9');
      expect(document.documentElement.style.getPropertyValue('--border-color')).toBe('#e2e8f0');
      expect(document.documentElement.classList.contains('dark')).toBe(false);
    } finally {
      unmount();
    }
  });

  it('modo escuro usa acento próprio do visual (legível sobre fundo escuro)', async () => {
    globalThis.localStorage.setItem('mercado-theme-mode', 'dark');
    globalThis.localStorage.setItem('mf_visual_local', ThemeOption.HIGH_CONTRAST);

    const { ThemeProvider } = await import('../context/ThemeContext');
    const { unmount } = render(<ThemeProvider><div>x</div></ThemeProvider>);
    try {
      await waitFor(() => {
        expect(document.documentElement.style.getPropertyValue('--primary-color').trim().toLowerCase()).toBe('#3b82f6');
      });
      expect(document.documentElement.style.getPropertyValue('--bg-main')).toBe('#000000');
      expect(document.documentElement.style.getPropertyValue('--text-main')).toBe('#ffffff');
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    } finally {
      unmount();
    }
  });

  it('sem override local, segue o preset do admin (fleet) mesmo no escuro', async () => {
    globalThis.localStorage.setItem('mercado-theme-mode', 'dark');
    globalThis.localStorage.setItem('mf_visual_local', VISUAL_AUTO);
    snapAtual.value = { exists: () => true, data: () => ({ theme: ThemeOption.POLICE_MT }) };

    const { ThemeProvider } = await import('../context/ThemeContext');
    const { unmount } = render(<ThemeProvider><div>x</div></ThemeProvider>);
    try {
      await waitFor(() => {
        expect(document.documentElement.style.getPropertyValue('--primary-color').trim().toLowerCase()).toBe('#38bdf8');
      });
      expect(document.documentElement.style.getPropertyValue('--bg-main')).toBe('#0f172a');
    } finally {
      unmount();
    }
  });
});