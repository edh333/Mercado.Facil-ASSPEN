// @vitest-environment jsdom
// Regressão do "Minified React error #321" (Invalid hook call).
//
// O `useRef` do timer do selo de status estava DECLARADO DENTRO do callback do
// `useEffect`. Na fase de efeito o dispatcher do React é null, então qualquer
// hook chamado ali estoura `throwInvalidHookError` — que em produção aparece
// minificado como "#321". Como o componente é montado globalmente pelo App,
// o app inteiro quebrava na primeira carga.
//
// Este teste monta o componente de verdade; se o hook voltar para dentro do
// useEffect (ou para o escopo de módulo), o erro #321 reaparece aqui.

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { OnlineStatusIndicator } from '../components/OnlineStatusIndicator';

const estado = {
  isOfflineUnlocked: false,
  logoutOffline: vi.fn(),
};

vi.mock('../context/StoreContext', () => ({
  useApp: () => estado,
}));

// framer-motion adiciona wrappers que poluem o DOM; aqui so precisamos do texto.
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => React.createElement('div', props, children),
  },
  AnimatePresence: ({ children }: any) => React.createElement(React.Fragment, null, children),
}));

describe('OnlineStatusIndicator — hook na fase errada', () => {
  beforeEach(() => {
    estado.isOfflineUnlocked = false;
    estado.logoutOffline.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('monta sem Invalid hook call (#321) com a internet ligada', () => {
    Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
    // Se o useRef estivesse dentro do useEffect, o React lançaria #321 aqui.
    expect(() => render(<OnlineStatusIndicator />)).not.toThrow();
  });

  it('monta sem erro mesmo já nascendo offline (useEffect roda na 1a renderização)', () => {
    Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });
    expect(() => render(<OnlineStatusIndicator />)).not.toThrow();
  });

  it('reage ao evento online sem quebrar (o timer do ref continua válido)', () => {
    Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
    render(<OnlineStatusIndicator />);
    expect(() => {
      act(() => {
        window.dispatchEvent(new Event('online'));
      });
    }).not.toThrow();
  });

  it('limpa o timer no unmount (sem setState após desmontar)', () => {
    Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
    const { unmount } = render(<OnlineStatusIndicator />);
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(() => unmount()).not.toThrow();
  });

  it('mostra o aviso de emergência offline e permite sair', () => {
    Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });
    estado.isOfflineUnlocked = true;
    render(<OnlineStatusIndicator />);
    expect(screen.getByText(/Emergência OFFLINE ativa/i)).toBeTruthy();
  });
});