// @vitest-environment jsdom
// Central de Atalhos (components/admin/AdminCommandPalette.tsx) — paleta Ctrl+K.
//
// Complementa os atalhos F1–F12 reunindo botões de acesso rápido (funções,
// produtos, conexões, relatórios). Estes testes cobrem: filtro com busca sem
// acento, execução por clique, Enter no 1º resultado e não-render quando fechada.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminCommandPalette, AcaoAtalho } from '../components/admin/AdminCommandPalette';

afterEach(cleanup);

const executarVendas = vi.fn();
const executarProdutos = vi.fn();

const acoes: AcaoAtalho[] = [
  { id: 'pdv', grupo: 'Operação', label: 'Nova Venda (PDV)', icon: <span />, key: 'F2', run: executarVendas },
  { id: 'reports', grupo: 'Relatórios', label: 'Relatórios do Sistema', icon: <span />, key: 'F4', run: vi.fn() },
  { id: 'produtos', grupo: 'Produtos', label: 'Catálogo de Produtos', icon: <span />, run: executarProdutos },
];

describe('AdminCommandPalette', () => {
  it('não renderiza nada quando fechada', () => {
    const onClose = vi.fn();
    render(<AdminCommandPalette isOpen={false} onClose={onClose} acoes={acoes} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('lista os grupos e executa a ação ao clicar, fechando a paleta', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<AdminCommandPalette isOpen onClose={onClose} acoes={acoes} />);

    expect(screen.getByText('Operação')).toBeTruthy();
    expect(screen.getByText('Relatórios')).toBeTruthy();
    expect(screen.getByText('Produtos')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /Nova Venda/ }));
    expect(executarVendas).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('filtra por busca ignorando acentos e por grupo', async () => {
    const user = userEvent.setup();
    render(<AdminCommandPalette isOpen onClose={vi.fn()} acoes={acoes} />);

    // "relatorio" (sem acento) deve casar com "Relatórios".
    await user.type(screen.getByLabelText('Buscar atalho'), 'relatorio');
    expect(screen.getByRole('button', { name: /Relatórios do Sistema/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Nova Venda/ })).toBeNull();
  });

  it('mostra aviso quando nenhum atalho casa com a busca', async () => {
    const user = userEvent.setup();
    render(<AdminCommandPalette isOpen onClose={vi.fn()} acoes={acoes} />);
    await user.type(screen.getByLabelText('Buscar atalho'), 'xyz-inexistente');
    expect(screen.getByText('Nenhum atalho encontrado')).toBeTruthy();
  });

  it('Enter abre o primeiro resultado filtrado', () => {
    const onClose = vi.fn();
    render(<AdminCommandPalette isOpen onClose={onClose} acoes={acoes} />);
    const input = screen.getByLabelText('Buscar atalho');

    fireEvent.change(input, { target: { value: 'produtos' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(executarProdutos).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
