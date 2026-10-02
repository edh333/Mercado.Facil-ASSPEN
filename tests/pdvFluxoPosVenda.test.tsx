// @vitest-environment jsdom
// Teste de INTEGRAÇÃO do PDV: venda concluída → tela de pós-venda.
//
// Este é o teste da regressão que motivou a mudança. Antes, a tela de
// confirmação estava atrelada ao ajuste "Imprimir automaticamente": com ele
// desligado o operador perdia a tela inteira. Aqui vendemos de verdade (carrinho
// → pagamento → finalizar) e verificamos que a tela aparece nos DOIS casos.
//
// O que é mockado: o contexto global (StoreContext) e o caminho de impressão.
// O que é real: o TelaPDV inteiro, o fluxo de carrinho/pagamento e o teclado.

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TelaPDV } from '../components/admin/TelaPDV';

const showNotification = vi.fn();
const refreshSessaoCaixa = vi.fn();
const imprimirSilenciosoFiscal = vi.fn(async () => true);
const imprimirComPrioridadeFiscal = vi.fn(async () => true);

vi.mock('../context/StoreContext', () => ({
  useApp: () => ({
    showNotification,
    validateAnyMasterPassword: vi.fn(async () => ({ ok: true })),
    validateDualMasterPassword: vi.fn(async () => ({ ok: true })),
    sessaoCaixaAtiva: { id: 'caixa-1' },
    refreshSessaoCaixa,
    sendSystemMessage: vi.fn(),
  }),
}));

vi.mock('../utils/printUtils', () => ({
  imprimirSilenciosoFiscal: (...a: unknown[]) => imprimirSilenciosoFiscal(...(a as [])),
  imprimirComPrioridadeFiscal: (...a: unknown[]) => imprimirComPrioridadeFiscal(...(a as [])),
  abrirJanelaImpressao: vi.fn(),
  gerarConteudoCupom: vi.fn(async () => ''),
}));

const produto = { id: 'p1', name: 'Café', barcode: '7891000100103', price: 10, stock: 99, active: true, category: 'Bebidas' } as any;

const pedidoServidor = {
  id: 'VENDA_ABC123',
  userId: 'u1',
  unitId: 'un1',
  total: 10,
  status: 'completed',
  date: '2026-10-01T12:00:00.000Z',
  paymentMethod: 'CASH',
  change: 4,
  items: [{ productId: 'p1', quantity: 1, priceAtPurchase: 10 }],
} as any;

const setPrintOrder = vi.fn();
const onClose = vi.fn();
const onConfirm = vi.fn(async () => pedidoServidor);

/** O diálogo de pós-venda, com as consultas restritas a ele: o PDV inteiro
 *  tem outros "Visualizar"/valores que colidiria por nome. */
const posVenda = () => within(screen.getByRole('dialog', { name: /venda concluída/i }));

function renderPDV(autoPrint: boolean) {
  return render(
    <TelaPDV
      isOpen
      onClose={onClose}
      users={[]}
      products={[produto]}
      orders={[]}
      onConfirm={onConfirm as any}
      setPrintOrder={setPrintOrder}
      settings={{ autoPrint } as any}
    />
  );
}

/** Leva o PDV do estado inicial até a venda concluída. */
async function concluirVendaNaTela(user: ReturnType<typeof userEvent.setup>) {
  // 1) bipa o produto no carrinho
  const busca = screen.getByPlaceholderText(/bipe o c/i);
  await user.type(busca, '7891000100103');
  await user.click(screen.getByRole('button', { name: /adicionar produto/i }));

  // 2) paga em dinheiro (exige valor recebido >= total)
  await user.click(screen.getByTitle('Dinheiro'));
  await user.type(screen.getByLabelText(/valor recebido/i), '14');

  // 3) finaliza
  const finalizar = await screen.findByRole('button', { name: /finalizar venda/i });
  await waitFor(() => expect((finalizar as HTMLButtonElement).disabled).toBe(false));
  await user.click(finalizar);
}

beforeEach(() => {
  showNotification.mockClear();
  refreshSessaoCaixa.mockClear();
  onConfirm.mockClear();
  onClose.mockClear();
  setPrintOrder.mockClear();
  imprimirSilenciosoFiscal.mockClear();
  imprimirComPrioridadeFiscal.mockClear();
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('PDV — a tela de pós-venda aparece depois da venda', () => {
  it('mostra a confirmação com o autoPrint LIGADO e imprime sozinho', async () => {
    const user = userEvent.setup();
    renderPDV(true);
    await concluirVendaNaTela(user);

    await waitFor(() => expect(screen.getByRole('dialog', { name: /venda concluída/i })).toBeTruthy());
    expect(posVenda().getByText('10,00')).toBeTruthy(); // total
    expect(posVenda().getByText('4,00')).toBeTruthy(); // troco
    await waitFor(() => expect(imprimirSilenciosoFiscal).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText(/Cupom impresso automaticamente/i)).toBeTruthy());
  });

  // A REGRESSÃO. Sem este teste, o dia em que alguém religar a dependência de
  // autoPrint na tela passa batido.
  it('mostra a confirmação com o autoPrint DESLIGADO (não abre janela de impressão)', async () => {
    const user = userEvent.setup();
    renderPDV(false);
    await concluirVendaNaTela(user);

    await waitFor(() => expect(screen.getByRole('dialog', { name: /venda concluída/i })).toBeTruthy());
    expect(screen.getByText(/Cupom não impresso/i)).toBeTruthy();
    // Desligado = não imprime sozinho, mas a tela segue com o botão à mão.
    expect(imprimirSilenciosoFiscal).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /imprimir cupom/i })).toBeTruthy();
  });

  it('não abre o modal de cupom sozinho: a impressão é silenciosa e a tela decide', async () => {
    const user = userEvent.setup();
    renderPDV(true);
    await concluirVendaNaTela(user);
    await waitFor(() => expect(screen.getByRole('dialog', { name: /venda concluída/i })).toBeTruthy());
    expect(setPrintOrder).not.toHaveBeenCalled();
  });

  it('imprime UMA vez só por venda, mesmo com o ajuste mudando de identidade', async () => {
    const user = userEvent.setup();
    const { rerender } = renderPDV(true);
    await concluirVendaNaTela(user);
    await waitFor(() => expect(imprimirSilenciosoFiscal).toHaveBeenCalledTimes(1));

    // Re-render com novo objeto settings (releitura do Firestore): o efeito
    // roda de novo e não pode reimprimir o mesmo cupom.
    rerender(
      <TelaPDV isOpen onClose={onClose} users={[]} products={[produto]} orders={[]}
        onConfirm={onConfirm as any} setPrintOrder={setPrintOrder}
        settings={{ autoPrint: true } as any} />
    );
    await waitFor(() => expect(screen.getByRole('dialog', { name: /venda concluída/i })).toBeTruthy());
    expect(imprimirSilenciosoFiscal).toHaveBeenCalledTimes(1);
  });

  it('a reimpressão da tela usa a via com prioridade (abre a janela)', async () => {
    const user = userEvent.setup();
    renderPDV(false);
    await concluirVendaNaTela(user);
    await waitFor(() => expect(screen.getByRole('dialog', { name: /venda concluída/i })).toBeTruthy());

    await user.click(screen.getByRole('button', { name: /imprimir cupom/i }));
    await waitFor(() => expect(imprimirComPrioridadeFiscal).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText(/Cupom impresso automaticamente/i)).toBeTruthy());
  });

  it('"Visualizar" abre o modal de cupom com o pedido da venda', async () => {
    const user = userEvent.setup();
    renderPDV(false);
    await concluirVendaNaTela(user);
    await waitFor(() => expect(screen.getByRole('dialog', { name: /venda concluída/i })).toBeTruthy());

    await user.click(posVenda().getByRole('button', { name: /visualizar/i }));
    expect(setPrintOrder).toHaveBeenCalledWith(pedidoServidor);
  });
});

describe('PDV — teclado na tela de pós-venda', () => {
  it('ESC leva à próxima venda sem fechar o PDV', async () => {
    const user = userEvent.setup();
    renderPDV(false);
    await concluirVendaNaTela(user);
    await waitFor(() => expect(screen.getByRole('dialog', { name: /venda concluída/i })).toBeTruthy());

    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /venda concluída/i })).toBeNull());
    expect(onClose).not.toHaveBeenCalled(); // continua no PDV, não saiu do módulo
  });

  it('ENTER também leva à próxima venda', async () => {
    const user = userEvent.setup();
    renderPDV(false);
    await concluirVendaNaTela(user);
    await waitFor(() => expect(screen.getByRole('dialog', { name: /venda concluída/i })).toBeTruthy());

    fireEvent.keyDown(window, { key: 'Enter' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /venda concluída/i })).toBeNull());
  });

  // ModalShell não faz stopPropagation e os dois escutam o window: sem a guarda
  // do TelaPDV, um ESC só derrubava o cupom e a confirmação juntos.
  it('ESC com um modal aberto por cima NÃO fecha a confirmação', async () => {
    const user = userEvent.setup();
    renderPDV(false);
    await concluirVendaNaTela(user);
    await waitFor(() => expect(screen.getByRole('dialog', { name: /venda concluída/i })).toBeTruthy());

    const modalAberto = document.createElement('div');
    modalAberto.className = 'modal-container';
    document.body.appendChild(modalAberto);

    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.getByRole('dialog', { name: /venda concluída/i })).toBeTruthy());

    modalAberto.remove();
  });
});

describe('PDV — a próxima venda começa limpa', () => {
  it('"Nova venda" volta ao PDV com carrinho vazio e sem cliente', async () => {
    const user = userEvent.setup();
    renderPDV(false);
    await concluirVendaNaTela(user);
    await waitFor(() => expect(screen.getByRole('dialog', { name: /venda concluída/i })).toBeTruthy());

    await user.click(screen.getByRole('button', { name: /nova venda/i }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /venda concluída/i })).toBeNull());

    const finalizar = await screen.findByRole('button', { name: /finalizar venda/i });
    expect((finalizar as HTMLButtonElement).disabled).toBe(true); // carrinho vazio
  });
});