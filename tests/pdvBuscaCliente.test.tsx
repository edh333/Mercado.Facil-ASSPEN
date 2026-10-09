// @vitest-environment jsdom
// Regressão da LISTA DE BUSCA DE CLIENTES do PDV (components/admin/TelaPDV.tsx).
//
// Regra (pedido do usuário): o PRESO (interno/destinatário) é o nome em
// DESTAQUE da lista; o familiar (responsável/pagador) vem logo abaixo como
// texto pequeno "Familiar: ..."; CPF mascarado à direita.

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { TelaPDV } from '../components/admin/TelaPDV';

vi.mock('../context/StoreContext', () => ({
  useApp: () => ({
    showNotification: vi.fn(),
    validateAnyMasterPassword: vi.fn(async () => ({ ok: true })),
    validateDualMasterPassword: vi.fn(async () => ({ ok: true })),
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

const usuario = (over: Record<string, unknown>): any => ({
  id: 'u1',
  name: 'MARIA SOUZA',
  email: 'maria@ex.com',
  role: 'FAMILY',
  status: 'active',
  approved: true,
  cpf: '52998224725',
  walletBalance: 100,
  ...over,
});

function renderPDV(users: any[]) {
  return render(
    <TelaPDV
      isOpen
      onClose={vi.fn()}
      users={users}
      products={[]}
      orders={[]}
      onConfirm={vi.fn() as any}
      setPrintOrder={vi.fn()}
      settings={{ autoPrint: false } as any}
    />
  );
}

const buscar = (termo: string) => {
  fireEvent.change(screen.getByPlaceholderText('Nome, CPF ou nome do interno...'), {
    target: { value: termo },
  });
};

const texto = (el: HTMLElement) => (el.textContent || '').replace(/\s+/g, ' ').trim();
const valor = (el: HTMLElement) => (el as HTMLInputElement).value;

/** O botão da opção selecionada da lista. */
const opcao = (nome: string): HTMLElement => {
  const botoes = screen.getAllByRole('button');
  const alvo = botoes.find(b => b.textContent?.includes(nome));
  if (!alvo) throw new Error(`opção "${nome}" não encontrada na lista`);
  return alvo;
};

afterEach(() => cleanup());

describe('lista de clientes do PDV — preso é o destaque, familiar é apoio', () => {
  it('mostra o preso em destaque e o familiar rotulado abaixo', () => {
    renderPDV([usuario({ inmateName: 'JOSE SOUZA', inmateCpf: '11144477735' })]);
    buscar('MARIA');

    const t = texto(opcao('MARIA SOUZA'));
    expect(t).toMatch(/JOSE SOUZA/);
    expect(t).toMatch(/Familiar: MARIA SOUZA/i);
  });

  it('não deixa o nome do preso na coluna direita truncada', () => {
    renderPDV([usuario({ inmateName: 'JOSE SOUZA' })]);
    buscar('MARIA');
    // o preso é a linha principal; aparece uma única vez (não em coluna solta à direita)
    expect(opcao('MARIA SOUZA').textContent?.match(/JOSE SOUZA/g)).toHaveLength(1);
  });

  it('exibe o CPF mascarado do responsável à direita', () => {
    renderPDV([usuario({ cpf: '52998224725' })]);
    buscar('MARIA');
    expect(texto(opcao('MARIA SOUZA'))).toContain('529.***.***-25');
  });

  it('cai para o CPF do interno quando o responsável não tem CPF', () => {
    renderPDV([usuario({ cpf: '', inmateName: 'JOSE', inmateCpf: '11144477735' })]);
    buscar('MARIA');
    expect(texto(opcao('MARIA SOUZA'))).toContain('111.***.***-35');
  });

  it('não duplica o nome quando responsável e interno são a mesma pessoa', () => {
    renderPDV([usuario({ name: 'MARIA SOUZA', inmateName: 'maria souza' })]);
    buscar('MARIA');
    const item = opcao('MARIA SOUZA');
    expect(item.textContent?.match(/MARIA SOUZA/g)).toHaveLength(1);
    expect(item.textContent).not.toMatch(/Familiar:/i);
  });

  it('sem responsável cadastrado, mostra o interno como nome principal', () => {
    renderPDV([usuario({ name: '', inmateName: 'DETENTO SILVA' })]);
    buscar('DETENTO');
    expect(opcao('DETENTO SILVA')).toBeTruthy();
  });

  it('sem nome algum, não quebra a lista', () => {
    renderPDV([usuario({ name: '', inmateName: '', cpf: '52998224725' })]);
    buscar('529');
    expect(screen.getByText(/SEM NOME/i)).toBeTruthy();
  });

  it('ao selecionar, o campo recebe o nome do responsável (e não o do interno)', () => {
    renderPDV([usuario({ inmateName: 'JOSE SOUZA' })]);
    buscar('MARIA');
    fireEvent.click(opcao('MARIA SOUZA'));
    expect(valor(screen.getByPlaceholderText('Nome, CPF ou nome do interno...'))).toBe('MARIA SOUZA');
  });

  it('a lista só aparece depois de digitar (não vaza o cadastro)', () => {
    renderPDV([usuario({})]);
    expect(screen.queryByText(/MARIA SOUZA/)).toBeNull();
    buscar('MARIA');
    expect(screen.getByText(/MARIA SOUZA/)).toBeTruthy();
  });

  it('mantém a busca funcionando pelo nome do interno', () => {
    renderPDV([usuario({ inmateName: 'EDSON MENDES' })]);
    buscar('mendes');
    const btn = within(screen.getByText(/EDSON MENDES/).closest('button')!);
    expect(btn.getByText('EDSON MENDES')).toBeTruthy();
    expect(btn.getByText(/Familiar: MARIA SOUZA/i)).toBeTruthy();
  });
});