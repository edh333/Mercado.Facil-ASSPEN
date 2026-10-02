// @vitest-environment jsdom
// Teste de RENDERIZAÇÃO da tela de pós-venda do PDV.
//
// Os testes de pdvPosVenda cobrem as regras; este cobre a tela de verdade: o que
// o operador efetivamente lê e clica depois de concluir uma venda. É a camada
// que não existia no projeto (vitest rodava só em 'node', sem DOM), e ela é o
// que garante que a tela reapareceu depois de ser destravada do ajuste autoPrint.

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TelaPosVenda } from '../components/admin/TelaPosVenda';
import { Order } from '../types';

const pedidoBase = (extra: Partial<Order> = {}): Order =>
  ({
    id: 'VENDA1234567890',
    userId: 'u1',
    unitId: 'un1',
    total: 47.5,
    status: 'completed',
    date: '2026-10-01T12:00:00.000Z',
    paymentMethod: 'CASH',
    change: 12.5,
    items: [
      { productId: 'p1', quantity: 1, priceAtPurchase: 20 },
      { productId: 'p2', quantity: 3, priceAtPurchase: 9.166666 },
    ],
    ...extra,
  }) as unknown as Order;

const renderTela = (props: Partial<React.ComponentProps<typeof TelaPosVenda>> = {}) => {
  const onImprimir = vi.fn();
  const onVisualizar = vi.fn();
  const onConcluir = vi.fn();
  render(
    <TelaPosVenda
      pedido={props.pedido ?? pedidoBase()}
      cupomImpressoAuto={props.cupomImpressoAuto ?? false}
      reimprimindo={props.reimprimindo ?? false}
      onImprimir={props.onImprimir ?? onImprimir}
      onVisualizar={props.onVisualizar ?? onVisualizar}
      onConcluir={props.onConcluir ?? onConcluir}
    />
  );
  return { onImprimir, onVisualizar, onConcluir };
};

beforeEach(() => { window.HTMLElement.prototype.scrollIntoView = vi.fn(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('TelaPosVenda — a tela aparece sempre', () => {
  it('exibe a confirmação de venda e o resumo financeiro', () => {
    renderTela();
    expect(screen.getByRole('dialog', { name: /venda concluída/i })).toBeTruthy();
    expect(screen.getByText('Venda concluída')).toBeTruthy();
    expect(screen.getByText('VENDA1234567')).toBeTruthy(); // 12 primeiros chars
  });

  // A regressão que motivou o componente: a tela sumia quando o operador
  // desligava "Imprimir automaticamente". Este teste existe para não voltar.
  it('exibe a tela mesmo com a impressão automática desligada', () => {
    renderTela({ cupomImpressoAuto: false });
    expect(screen.getByRole('dialog', { name: /venda concluída/i })).toBeTruthy();
    expect(screen.getByText(/Cupom não impresso/i)).toBeTruthy();
  });

  it('exibe a tela mesmo com a impressão automática ligada e concluída', () => {
    renderTela({ cupomImpressoAuto: true });
    expect(screen.getByRole('dialog', { name: /venda concluída/i })).toBeTruthy();
    expect(screen.getByText(/Cupom impresso automaticamente/i)).toBeTruthy();
  });
});

describe('TelaPosVenda — valores exibidos', () => {
  it('mostra total, forma de pagamento, troco e contagem de itens', () => {
    renderTela();
    // formatarMoeda usa toLocaleString pt-BR (sem prefixo de moeda).
    expect(screen.getByText('47,50')).toBeTruthy();
    expect(screen.getByText('Dinheiro')).toBeTruthy();
    expect(screen.getByText('12,50')).toBeTruthy(); // troco
    expect(screen.getByText('2')).toBeTruthy(); // 2 linhas de item
  });

  it('omite o troco quando não há troco a devolver', () => {
    renderTela({ pedido: pedidoBase({ change: 0, paymentMethod: 'PIX' as any }) });
    expect(screen.getByText('PIX')).toBeTruthy();
    expect(screen.queryByText('Troco')).toBeNull();
  });

  it('lista a composição do pagamento misto', () => {
    renderTela({
      pedido: pedidoBase({
        total: 30,
        paymentMethod: 'MIXED' as any,
        change: undefined,
        payments: [
          { method: 'PIX' as any, amount: 10 },
          { method: 'CASH' as any, amount: 15 },
          { method: 'WALLET' as any, amount: 5 },
        ],
      }),
    });
    expect(screen.getByText('Composição')).toBeTruthy();
    expect(screen.getByText('PIX 10,00 · Dinheiro 15,00 · Carteira 5,00')).toBeTruthy();
  });

  it('avisa que a venda offline ainda está na fila', () => {
    renderTela({ pedido: pedidoBase({ offlinePending: true }) });
    expect(screen.getByText(/Venda offline/i)).toBeTruthy();
  });

  it('não mostra aviso de offline em venda online', () => {
    renderTela();
    expect(screen.queryByText(/Venda offline/i)).toBeNull();
  });

  it('não quebra com pedido incompleto vindo da fila offline', () => {
    expect(() => renderTela({ pedido: { id: '', items: [] } as unknown as Order })).not.toThrow();
    expect(screen.getByText('Pedido sem número')).toBeTruthy();
    expect(screen.getByText('0,00')).toBeTruthy();
  });
});

describe('TelaPosVenda — ações do operador', () => {
  it('oferece imprimir, visualizar e nova venda', async () => {
    const user = userEvent.setup();
    const { onImprimir, onVisualizar, onConcluir } = renderTela();

    await user.click(screen.getByRole('button', { name: /imprimir cupom/i }));
    expect(onImprimir).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: /visualizar/i }));
    expect(onVisualizar).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: /nova venda/i }));
    expect(onConcluir).toHaveBeenCalledTimes(1);
  });

  it('o rótulo do botão muda para "Reimprimir" quando o cupom já saiu', () => {
    renderTela({ cupomImpressoAuto: true });
    expect(screen.getByRole('button', { name: /reimprimir cupom/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^imprimir cupom$/i })).toBeNull();
  });

  it('desabilita o botão durante a reimpressão e mostra progresso', () => {
    renderTela({ reimprimindo: true });
    const botao = screen.getByRole('button', { name: /imprimindo/i });
    expect((botao as HTMLButtonElement).disabled).toBe(true);
  });

  it('não dispara reimpressão enquanto já está imprimindo', async () => {
    const user = userEvent.setup();
    const onImprimir = vi.fn();
    renderTela({ reimprimindo: true, onImprimir });
    await user.click(screen.getByRole('button', { name: /imprimindo/i }));
    expect(onImprimir).not.toHaveBeenCalled();
  });

  it('mantém os outros dois botões utilizáveis durante a reimpressão', () => {
    renderTela({ reimprimindo: true });
    expect(screen.getByRole('button', { name: /visualizar/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /nova venda/i })).toBeTruthy();
  });

  it('anuncia o atalho de teclado para a próxima venda', () => {
    renderTela();
    expect(screen.getByText(/Enter ou Esc/i)).toBeTruthy();
  });
});

describe('TelaPosVenda — acessibilidade', () => {
  it('é um diálogo modal rotulado', () => {
    renderTela();
    const dialogo = screen.getByRole('dialog');
    expect(dialogo.getAttribute('aria-modal')).toBe('true');
    expect(dialogo.getAttribute('aria-label')).toMatch(/venda concluída/i);
  });

  it('expõe as três ações como botões nomeados', () => {
    renderTela();
    const botoes = within(screen.getByRole('dialog')).getAllByRole('button');
    expect(botoes).toHaveLength(3);
    for (const b of botoes) {
      expect((b.textContent || '').trim().length).toBeGreaterThan(0);
    }
  });
});