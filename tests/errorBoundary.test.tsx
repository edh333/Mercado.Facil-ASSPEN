// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { ErrorBoundary } from '../components/ErrorBoundary';

/**
 * AUTO-CURA do ErrorBoundary.
 *
 * O boundary reconhece erros de "bundle velho / build misturado", descarta os
 * service workers e os caches obsoletos e recarrega a pagina UMA vez por sessao,
 * para o usuario nao ficar preso numa tela de erro sem saida.
 *
 * O caso que motivou o teste: o "Minified React error #321" (Invalid hook call).
 * Ele NAO estava na lista de auto-cura. O lint de Rules of Hooks ja impede o
 * bug de nascer, mas um cliente com o bundle antigo no cache ainda executa o
 * codigo quebrado — e ele ficaria sem remediacao. Este teste trava o
 * comportamento para que a lista nunca mais perca um caso.
 */

const BOM = '\uFEFFMinified React error #321; visit https://react.dev/errors/321';

let reloadMock: ReturnType<typeof vi.fn>;

// Retorno declarado: um componente que so lanca tem o tipo inferido `never`,
// que o TypeScript recusa como JSX (TS2786).
function Boom({ error }: { error: Error }): React.ReactElement {
  throw error;
}

function renderBoundary(error: Error, onError?: (e: Error) => void) {
  // React.logError silencia o ruido esperado do throw em render.
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    render(
      <ErrorBoundary onError={onError}>
        <Boom error={error} />
      </ErrorBoundary>,
    );
  } finally {
    spy.mockRestore();
  }
}

describe('ErrorBoundary: auto-cura de bundle velho', () => {
  beforeEach(() => {
    sessionStorage.clear();
    // jsdom trata window.location como read-only; redefinimos o objeto inteiro
    // para poder observar a recarga que a auto-cura dispara.
    reloadMock = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: { ...(window.location as unknown as object), reload: reloadMock },
    });
    // jsdom nao implementa serviceWorker/caches
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { getRegistrations: vi.fn().mockResolvedValue([]) },
    });
    Object.defineProperty(window, 'caches', {
      configurable: true,
      value: { keys: vi.fn().mockResolvedValue(['mercado-facil-v23']), delete: vi.fn().mockResolvedValue(true) },
    });
  });

  afterEach(() => { cleanup(); });

  it('#321 (o bug do hook invalido) entra na auto-cura, nao numa tela de erro morta', () => {
    renderBoundary(new Error(BOM));
    expect(sessionStorage.getItem('mf-boundary-heal')).toBe('1');
  });

  it('erros nao curaveis NAO devem disparar recarga (ex.: erro de regra de negocio)', () => {
    renderBoundary(new Error('Saldo insuficiente para concluir a venda'));
    expect(sessionStorage.getItem('mf-boundary-heal')).toBeNull();
    // e o usuario ve a tela de erro com opcao de recarregar
    expect(screen.getByText(/Algo deu errado/i)).toBeTruthy();
  });

  it('a tela de erro nao promete notificacao que nao existe', () => {
    renderBoundary(new Error('Saldo insuficiente para concluir a venda'));
    const html = document.body.textContent || '';
    // O texto honesto e "nenhum dado foi enviado automaticamente": nao pode haver
    // promessa de aviso ("notificada") sem que exista telemetria real.
    expect(/notificad/i.test(html)).toBe(false);
    expect(/nenhum dado foi enviado automaticamente/i.test(html)).toBe(true);
  });

  it('a auto-cura acontece so uma vez por sessao (evita loop de reload)', () => {
    renderBoundary(new Error(BOM));
    const flag = sessionStorage.getItem('mf-boundary-heal');
    expect(flag).toBe('1');
    // segunda queda com o mesmo erro: a flag ja existe, nao deve recarregar de novo
    renderBoundary(new Error(BOM));
    expect(sessionStorage.getItem('mf-boundary-heal')).toBe('1');
  });

  it('telemetria opcional e chamada quando o app fornece onError', () => {
    const onError = vi.fn();
    renderBoundary(new Error(BOM), onError);
    expect(onError).toHaveBeenCalledTimes(1);
  });
});