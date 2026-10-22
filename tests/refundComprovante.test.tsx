// @vitest-environment jsdom
// Opção de imprimir o comprovante ao cancelar/estornar — components/admin/RefundSaleModal.tsx.
//
// Depois da operação (cancelamento OU estorno) o operador precisa do papel:
// o modal oferece impressora fiscal, impressora comum e download .txt.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RefundSaleModal } from '../components/admin/RefundSaleModal';

const refundOrder = vi.fn(async () => undefined);
const imprimirComprovanteOperacao = vi.fn(async (_dados: any, _destino: any) => ({
  ok: true,
  via: 'comum',
  mensagem: 'Comprovante enviado para a impressora comum.',
}));

vi.mock('../context/StoreContext', () => ({
  useApp: () => ({
    refundOrder,
    buscarPedidosParaEstorno: vi.fn(async () => ({ results: [], last: '' })),
    validateMasterPassword: vi.fn(async () => true),
    masterPasswordStatus: vi.fn(async () => ({ definida: true })),
    currentUser: { id: 'admin1', name: 'JOAO ADMIN' },
    settings: { appName: 'Mercado Facil' },
  }),
}));

vi.mock('../utils/comprovanteOperacao', () => ({
  imprimirComprovanteOperacao: (dados: any, destino: any) => imprimirComprovanteOperacao(dados, destino),
}));

const pedido = {
  id: 'ABC123DEF456',
  userName: 'MARIA SOUZA',
  userCpf: '123.456.789-00',
  total: 50,
  date: new Date().toISOString(),
  status: 'completed',
  paymentMethod: 'CASH',
  items: [{ productId: 'p1', name: 'Cafe', quantity: 1, priceAtPurchase: 50 }],
} as any;

beforeEach(() => {
  refundOrder.mockClear();
  imprimirComprovanteOperacao.mockClear();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

async function executarCancelamento(user: ReturnType<typeof userEvent.setup>) {
  await waitFor(() => expect(screen.getByText(/Confirme|Confirmar Cancelamento/i)).toBeTruthy());
  await user.type(screen.getByPlaceholderText('••••••••'), 'senha123');
  await user.click(screen.getByRole('button', { name: /confirmar cancelamento/i }));
  // A tela de sucesso só aparece com o pedido confirmado — os botões de
  // impressão do comprovante ficam logo abaixo.
  await waitFor(() => expect(screen.getByRole('button', { name: /fiscal/i })).toBeTruthy());
}

describe('RefundSaleModal — comprovante da operação', () => {
  it('depois de cancelar oferece fiscal, comum e .txt', async () => {
    const user = userEvent.setup();
    render(<RefundSaleModal isOpen acao="cancelar" initialOrder={pedido} onClose={vi.fn()} />);
    await executarCancelamento(user);

    expect(screen.getByRole('button', { name: /fiscal/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /comum/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /\.txt/i })).toBeTruthy();
  });

  it('imprimir na impressora comum monta o comprovante do cancelamento', async () => {
    const user = userEvent.setup();
    render(<RefundSaleModal isOpen acao="cancelar" initialOrder={pedido} onClose={vi.fn()} />);
    await executarCancelamento(user);

    await user.click(screen.getByRole('button', { name: /comum/i }));
    await waitFor(() => expect(imprimirComprovanteOperacao).toHaveBeenCalledTimes(1));
    const [dados, destino] = imprimirComprovanteOperacao.mock.calls[0] as any;
    expect(destino).toBe('comum');
    expect(dados.acao).toBe('cancelar');
    expect(dados.order.id).toBe(pedido.id);
    expect(dados.operador).toBe('JOAO ADMIN');
  });

  it('o comprovante de estorno usa a ação estorno', async () => {
    const user = userEvent.setup();
    render(<RefundSaleModal isOpen acao="estorno" initialOrder={pedido} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/Confirmar Estorno/i)).toBeTruthy());
    await user.type(screen.getByPlaceholderText('••••••••'), 'senha123');
    await user.click(screen.getByRole('button', { name: /confirmar estorno/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /fiscal/i })).toBeTruthy());

    await user.click(screen.getByRole('button', { name: /fiscal/i }));
    await waitFor(() => expect(imprimirComprovanteOperacao).toHaveBeenCalledTimes(1));
    const [dados, destino] = imprimirComprovanteOperacao.mock.calls[0] as any;
    expect(destino).toBe('fiscal');
    expect(dados.acao).toBe('estorno');
  });
});
