// @vitest-environment jsdom
// Regressão do modal de desconto do PDV (components/admin/TelaPDV.tsx).
//
// Regra: desconto >20% exige DOIS fatores — senha MESTRA (campo 1) e senha de
// LOGIN do administrador logado (campo 2). Antes o primeiro campo era o login e
// o segundo a mestra; o pedido foi deixar a senha do admin como a "segunda".

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
  // O rótulo "Desconto (até 50%)" é um <span>; o botão que abre o modal é "Aplicar".
  fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
};

const digitarPercentual = (valor: string) => {
  fireEvent.change(screen.getByPlaceholderText('Ex.: 10 ou 25,5'), { target: { value: valor } });
};

afterEach(() => cleanup());

describe('modal de desconto do PDV', () => {
  it('até 20%: só o campo da senha mestra', () => {
    renderPDV();
    abrirDesconto();
    digitarPercentual('10');

    expect(screen.getByText(/^Senha mestra$/i)).toBeTruthy();
    expect(screen.queryByText(/Senha do administrador/i)).toBeNull();
  });

  it('acima de 20%: campo 1 = senha mestra e campo 2 = senha do administrador (login)', () => {
    renderPDV();
    abrirDesconto();
    digitarPercentual('25');

    expect(screen.getByText(/^Senha mestra$/i)).toBeTruthy();
    expect(screen.getByText(/Senha do administrador \(login\)/i)).toBeTruthy();
    // O aviso do modal deixa claro a nova ordem.
    expect(screen.getByText(/senha mestra \+ a senha de login do administrador/i)).toBeTruthy();
  });
});
