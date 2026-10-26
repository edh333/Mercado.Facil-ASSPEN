// @vitest-environment jsdom
// Regressão do modal de desconto do PDV (components/admin/TelaPDV.tsx).
//
// Regra: até 20% = senha de LOGIN do administrador logado (1 senha).
// Acima de 20% = senha de LOGIN + senha MESTRA (dupla), como no servidor.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { TelaPDV } from '../components/admin/TelaPDV';

const mocks = vi.hoisted(() => ({
  validateDiscountPassword: vi.fn(async () => true),
  validateDualMasterPassword: vi.fn(async () => ({ ok: true, motivo: '' })),
  validateAnyMasterPassword: vi.fn(async () => true),
}));

vi.mock('../context/StoreContext', () => ({
  useApp: () => ({
    showNotification: vi.fn(),
    validateAnyMasterPassword: mocks.validateAnyMasterPassword,
    validateDiscountPassword: mocks.validateDiscountPassword,
    validateDualMasterPassword: mocks.validateDualMasterPassword,
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
  fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
};

const digitarPercentual = (valor: string) => {
  fireEvent.change(screen.getByPlaceholderText('Ex.: 10 ou 25,5'), { target: { value: valor } });
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('modal de desconto do PDV', () => {
  it('até 20%: um único campo de senha, sem dica de administrador', () => {
    renderPDV();
    abrirDesconto();
    digitarPercentual('10');

    expect(screen.getByPlaceholderText('Digite a senha do operador')).toBeTruthy();
    expect(screen.queryByText(/senha de login do administrador/i)).toBeNull();
    expect(screen.queryByText(/senha mestra/i)).toBeNull();
  });

  it('até 20%: valida pela senha de login (validateDiscountPassword)', async () => {
    renderPDV();
    abrirDesconto();
    digitarPercentual('10');
    fireEvent.change(screen.getByPlaceholderText('Digite a senha do operador'), { target: { value: 'minhaSenha' } });
    fireEvent.click(screen.getByRole('button', { name: /Autorizar/i }));

    await waitFor(() => expect(mocks.validateDiscountPassword).toHaveBeenCalledWith('minhaSenha'));
    expect(mocks.validateDualMasterPassword).not.toHaveBeenCalled();
  });

  it('acima de 20%: exige senha de login e senha mestra', async () => {
    renderPDV();
    abrirDesconto();
    digitarPercentual('25');

    expect(screen.getByPlaceholderText('Digite a senha de login do operador')).toBeTruthy();
    expect(screen.getByPlaceholderText('Digite a senha mestra')).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText('Digite a senha de login do operador'), { target: { value: 'login' } });
    fireEvent.change(screen.getByPlaceholderText('Digite a senha mestra'), { target: { value: 'mestra' } });
    fireEvent.click(screen.getByRole('button', { name: /Autorizar/i }));

    await waitFor(() => expect(mocks.validateDualMasterPassword).toHaveBeenCalledWith('login', 'mestra'));
    expect(mocks.validateDiscountPassword).not.toHaveBeenCalled();
  });

  it('rejeita percentual acima de 50% antes de validar a senha', async () => {
    renderPDV();
    abrirDesconto();
    digitarPercentual('60');
    fireEvent.change(screen.getByPlaceholderText('Digite a senha de login do operador'), { target: { value: 'login' } });
    fireEvent.change(screen.getByPlaceholderText('Digite a senha mestra'), { target: { value: 'mestra' } });
    fireEvent.click(screen.getByRole('button', { name: /Autorizar/i }));

    expect(await screen.findByText(/máximo permitido é de 50%/i)).toBeTruthy();
    expect(mocks.validateDiscountPassword).not.toHaveBeenCalled();
    expect(mocks.validateDualMasterPassword).not.toHaveBeenCalled();
  });
});
