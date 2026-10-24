// @vitest-environment jsdom
// Regressão do modal de desconto do PDV (components/admin/TelaPDV.tsx).
//
// Regra: até 20% = senha de LOGIN do administrador logado (1 senha).
// Acima de 20% = senha SECUNDÁRIA/MESTRA (1 senha).

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { TelaPDV } from '../components/admin/TelaPDV';

vi.mock('../context/StoreContext', () => ({
  useApp: () => ({
    showNotification: vi.fn(),
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

function renderPDV() {
  return render(
    <TelaPDV
      isOpen
      onClose={vi.fn()}
      users={[]}
      products={[]}
      orders={[]}
      onConfirm={vi.fn() as any}
      setPrintOrder={vi.fn()}
      settings={{ autoPrint: false } as any}
    />
  );
}

const abrirDesconto = () => {
  // O rótulo "Desconto" é um <span>; o botão que abre o modal é "Aplicar".
  fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
};

const digitarPercentual = (valor: string) => {
  fireEvent.change(screen.getByPlaceholderText('Ex.: 10 ou 25,5'), { target: { value: valor } });
};

afterEach(() => cleanup());

describe('modal de desconto do PDV', () => {
  it('até 20%: só o campo da senha de login do administrador', () => {
    renderPDV();
    abrirDesconto();
    digitarPercentual('10');

    expect(screen.getAllByText(/Senha de login do administrador/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Senha secundária/i)).toBeNull();
  });

  it('acima de 20%: senha secundária/mestra', () => {
    renderPDV();
    abrirDesconto();
    digitarPercentual('25');

    expect(screen.getAllByText(/Senha secundária/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/senha secundária\/mestra/i).length).toBeGreaterThan(0);
  });
});
