// @vitest-environment jsdom
// Saldo/limite do consumidor no CABEÇALHO do PDV — components/admin/TelaPDV.tsx.
//
// Antes, o saldo da carteira e o limite de fiado ficavam em DOIS cartões
// grandes dentro da zona de pagamento e empurravam "Aplicar desconto" e
// "Finalizar Venda" para fora da tela. Agora eles ficam em uma linha compacta
// logo abaixo do nome do consumidor selecionado.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TelaPDV } from '../components/admin/TelaPDV';
import { UserRole } from '../types';

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

const cliente = {
  id: 'u1',
  name: 'MARIA SOUZA',
  email: 'maria@test.com',
  role: UserRole.FAMILY,
  status: 'active',
  approved: true,
  cpf: '123.456.789-00',
  walletBalance: 150,
  creditLimit: 500,
  currentDebt: 200,
  weeklySpent: 0,
} as any;

function renderPDV() {
  return render(
    <TelaPDV
      isOpen
      onClose={vi.fn()}
      users={[cliente]}
      products={[]}
      orders={[]}
      onConfirm={vi.fn(async () => ({ id: 'V1', total: 10, status: 'completed', items: [] })) as any}
      setPrintOrder={vi.fn()}
      settings={{ autoPrint: false } as any}
    />
  );
}

async function selecionarCliente(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByPlaceholderText(/nome, cpf ou nome do interno/i), 'MARIA');
  await user.click(screen.getByText('MARIA SOUZA'));
}

beforeEach(() => {
  showNotification.mockClear();
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('PDV — crédito do consumidor no cabeçalho', () => {
  it('mostra saldo, limite de fiado e crédito da semana logo abaixo do nome', async () => {
    const user = userEvent.setup();
    renderPDV();

    // Sem cliente selecionado não existe faixa de crédito.
    expect(screen.queryByTestId('pdv-credito-cliente')).toBeNull();

    await selecionarCliente(user);

    const strip = screen.getByTestId('pdv-credito-cliente');
    expect(strip).toBeTruthy();
    // Saldo R$ 150,00 · limite de fiado 500 - 200 = 300 · crédito da semana 300
    expect(strip.textContent).toContain('Saldo');
    expect(strip.textContent).toContain('150,00');
    expect(strip.textContent).toContain('Limite fiado');
    expect(strip.textContent).toContain('300,00');
    expect(strip.textContent).toContain('Dívida atual');
    expect(strip.textContent).toContain('200,00');
  });

  it('não repete os valores em cartões dentro da zona de pagamento', async () => {
    const user = userEvent.setup();
    renderPDV();
    await selecionarCliente(user);

    // Títulos dos cartões antigos: saíram da zona de pagamento.
    expect(screen.queryByText('Saldo da Carteira')).toBeNull();
    expect(screen.queryByText('Limite Fiado')).toBeNull();
    expect(screen.queryByText('Créditos do Cliente')).toBeNull();
  });
});
