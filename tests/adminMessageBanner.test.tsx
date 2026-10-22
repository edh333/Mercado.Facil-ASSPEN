// @vitest-environment jsdom
// Banner do aviso do administrador (components/admin/AdminMessageBanner.tsx).
//
// A mensagem do admin principal deve aparecer por 10s ao entrar no sistema e
// sumir; enquanto existir, reaparece na próxima sessão; nova mensagem (novo
// updatedAt) reexibe mesmo na mesma sessão.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { AdminMessageBanner } from '../components/admin/AdminMessageBanner';

beforeEach(() => { sessionStorage.clear(); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('AdminMessageBanner', () => {
  it('não renderiza quando a mensagem é vazia', () => {
    const { container } = render(<AdminMessageBanner message="" />);
    expect(container.textContent).toBe('');
  });

  it('exibe a mensagem e some após 10 segundos', () => {
    vi.useFakeTimers();
    render(<AdminMessageBanner message="Reunião às 18h" updatedAt="2026-01-01T00:00:00.000Z" />);
    expect(screen.getByText('Reunião às 18h')).toBeTruthy();
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(screen.queryByText('Reunião às 18h')).toBeNull();
  });

  it('não repete a MESMA mensagem dentro da mesma sessão', () => {
    const { unmount } = render(<AdminMessageBanner message="Aviso A" updatedAt="t1" />);
    expect(screen.getByText('Aviso A')).toBeTruthy();
    unmount();
    render(<AdminMessageBanner message="Aviso A" updatedAt="t1" />);
    expect(screen.queryByText('Aviso A')).toBeNull();
  });

  it('exibe uma NOVA mensagem mesmo na mesma sessão', () => {
    const { unmount } = render(<AdminMessageBanner message="Aviso A" updatedAt="t1" />);
    unmount();
    render(<AdminMessageBanner message="Aviso B" updatedAt="t2" />);
    expect(screen.getByText('Aviso B')).toBeTruthy();
  });
});
