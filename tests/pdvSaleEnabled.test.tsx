// @vitest-environment jsdom
// Kill switch de venda (settings.general.saleEnabled) — components/admin/TelaPDV.tsx.
//
// O admin principal pode desativar o botão de venda do PDV. Estes testes garantem
// que, com saleEnabled === false, o botão Finalizar fica bloqueado e a venda NÃO é
// enviada; e que o default (ausente = habilitado) mantém o PDV operante.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
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
const onConfirm = vi.fn(async (..._args: any[]) => ({ id: 'V1', total: 10, status: 'completed', items: [] }));

function renderPDV(settings: any) {
  return render(
    <TelaPDV
      isOpen
      onClose={vi.fn()}
      users={[]}
      products={[produto]}
      orders={[]}
      onConfirm={onConfirm as any}
      setPrintOrder={vi.fn()}
      settings={settings}
    />
  );
}

async function adicionarProduto(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByPlaceholderText(/bipe o c/i), '7891000100103');
  await user.click(screen.getByRole('button', { name: /adicionar produto/i }));
}

beforeEach(() => {
  showNotification.mockClear();
  onConfirm.mockClear();
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('PDV — kill switch de venda (saleEnabled)', () => {
  it('com saleEnabled=false o botão Finalizar fica bloqueado e mostra o aviso', async () => {
    const user = userEvent.setup();
    renderPDV({ autoPrint: false, saleEnabled: false });
    await adicionarProduto(user);

    const finalizar = screen.getByRole('button', { name: /finalizar venda/i });
    expect((finalizar as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Vendas desativadas pelo administrador/i)).toBeTruthy();
  });

  it('com saleEnabled=false não envia a venda mesmo forçando o clique', async () => {
    const user = userEvent.setup();
    renderPDV({ autoPrint: false, saleEnabled: false });
    await adicionarProduto(user);

    const finalizar = screen.getByRole('button', { name: /finalizar venda/i });
    await user.click(finalizar);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('default (saleEnabled ausente) mantém o PDV operante', async () => {
    const user = userEvent.setup();
    renderPDV({ autoPrint: false });
    await user.click(screen.getByTitle('Dinheiro'));
    await adicionarProduto(user);

    const finalizar = screen.getByRole('button', { name: /finalizar venda/i });
    expect((finalizar as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByText(/Vendas desativadas pelo administrador/i)).toBeNull();
  });
});
