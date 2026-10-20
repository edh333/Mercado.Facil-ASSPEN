// @vitest-environment jsdom
// Regressão do FIADO 30 DIAS no PDV (components/admin/TelaPDV.tsx).
//
// O backend, o cupom e os relatórios já tratavam FIADO, mas o método NÃO era
// selecionável: faltava o botão no grid de pagamento. Estes testes garantem que
// o operador consegue escolher "Fiado (30 dias)" e que a venda sai marcada como
// FIADO com o usuário cadastrado como conta do fiado (customerAccountId).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TelaPDV } from '../components/admin/TelaPDV';

const showNotification = vi.fn();

vi.mock('../context/StoreContext', () => ({
  useApp: () => ({
    showNotification,
    validateAnyMasterPassword: vi.fn(async () => true),
    validateDualMasterPassword: vi.fn(async () => ({ ok: true, motivo: '' })),
    sessaoCaixaAtiva: { id: 'caixa-1' },
    refreshSessaoCaixa: vi.fn(),
    sendSystemMessage: vi.fn(),
  }),
}));

vi.mock('../utils/printUtils', () => ({
  imprimirSilenciosoFiscal: vi.fn(async () => true),
  imprimirComPrioridadeFiscal: vi.fn(async () => true),
  abrirJanelaImpressao: vi.fn(),
  gerarConteudoCupom: vi.fn(async () => ''),
}));

const produto = { id: 'p1', name: 'Café', barcode: '7891000100103', price: 10, stock: 99, active: true, category: 'Bebidas' } as any;

const cliente = {
  id: 'u1',
  name: 'MARIA SOUZA',
  email: 'maria@ex.com',
  role: 'FAMILY',
  status: 'active',
  approved: true,
  cpf: '52998224725',
  walletBalance: 0,
  allowCredit: true,
  creditLimit: 500,
  currentDebt: 0,
} as any;

const onConfirm = vi.fn(async (..._args: any[]) => ({ id: 'VENDA_1', userId: 'u1', total: 10, status: 'completed', paymentMethod: 'FIADO', items: [] }));

function renderPDV() {
  return render(
    <TelaPDV
      isOpen
      onClose={vi.fn()}
      users={[cliente]}
      products={[produto]}
      orders={[]}
      onConfirm={onConfirm as any}
      setPrintOrder={vi.fn()}
      settings={{ autoPrint: false } as any}
    />
  );
}

const opcaoCliente = (nome: string): HTMLElement => {
  const alvo = screen.getAllByRole('button').find(b => b.textContent?.includes(nome));
  if (!alvo) throw new Error(`opção "${nome}" não encontrada`);
  return alvo as HTMLElement;
};

beforeEach(() => {
  showNotification.mockClear();
  onConfirm.mockClear();
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('PDV — FIADO 30 DIAS é selecionável', () => {
  it('o grid de pagamento tem o método "Fiado (30 dias)"', () => {
    renderPDV();
    expect(screen.getByTitle('Fiado (30 dias)')).toBeTruthy();
  });

  it('selecionar "Fiado (30 dias)" mostra o painel de autorização rotulado com 30 dias', async () => {
    const user = userEvent.setup();
    renderPDV();
    await user.click(screen.getByTitle('Fiado (30 dias)'));
    expect(screen.getByText(/Fiado \(30 dias\) — Requer Autorização/i)).toBeTruthy();
  });

  it('finalizar um fiado 30 dias envia paymentMethod FIADO e o cliente como conta', async () => {
    const user = userEvent.setup();
    renderPDV();

    // 1) seleciona o cliente cadastrado
    await user.type(screen.getByPlaceholderText('Nome, CPF ou nome do interno...'), 'MARIA');
    await user.click(opcaoCliente('MARIA SOUZA'));

    // 2) bipa o produto
    await user.type(screen.getByPlaceholderText(/bipe o c/i), '7891000100103');
    await user.click(screen.getByRole('button', { name: /adicionar produto/i }));

    // 3) escolhe Fiado 30 dias
    await user.click(screen.getByTitle('Fiado (30 dias)'));

    // 4) valida a senha do supervisor (Enter dispara a validação)
    const senha = screen.getByPlaceholderText('Digite a senha de validação');
    await user.type(senha, 'mestra-ok{Enter}');

    // 5) finaliza
    const finalizar = await screen.findByRole('button', { name: /finalizar venda/i });
    await waitFor(() => expect((finalizar as HTMLButtonElement).disabled).toBe(false));
    await user.click(finalizar);

    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    const args = onConfirm.mock.calls[0];
    expect(args[2]).toBe('FIADO'); // paymentMethod
    expect(args[6]).toBe('u1'); // customerAccountId = cliente cadastrado
  });
});
