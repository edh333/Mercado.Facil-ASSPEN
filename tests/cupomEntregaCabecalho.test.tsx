// @vitest-environment jsdom
// Cabeçalho do cupom RENDERIZADO (pré-visualização do PrintPage e impressão
// pelo diálogo do navegador) — o componente CupomEntrega. A correção do nome
// curto foi feita primeiro só no cupom cru (caminho térmico/QZ) e este
// caminho continuava imprimindo institutionName inteiro em text-lg.
//
// Mesma regra de tituloInstitucional(): appName → sigla → instituição,
// 1 linha só; fiscal mantém o nome legal completo em até 2 linhas.

import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { CupomEntrega } from '../components/CupomEntrega';

const ASSPEN_LONGO = 'ASSOCIAÇÃO DOS SERVIDORES DO SISTEMA PENAL DE PEIXOTO DE AZEVEDO / MT - ASSPEN';
const cfgAsspen = {
  institutionName: ASSPEN_LONGO,
  appName: ASSPEN_LONGO.split(' - ')[0],
  cnpj: '12.345.678/0001-90',
  contactPhone: '65 99999-8888',
};
const venda = {
  id: 'V1234567890',
  total: 10,
  items: [{ name: 'ARROZ', quantity: 1, priceAtPurchase: 10 }],
};

afterEach(() => cleanup());

describe('CupomEntrega — cabeçalho com nome curto', () => {
  it('título é a sigla curta (1 linha), nunca o nome legal inteiro', () => {
    render(<CupomEntrega order={venda} config={cfgAsspen as any} />);
    expect(screen.getByRole('heading', { level: 1 }).textContent?.trim()).toBe('ASSPEN');
    expect(screen.queryByText(/ASSOCIAÇÃO DOS SERVIDORES/)).toBeNull();
  });

  it('usa o appName curto quando ele couber (marca configurada)', () => {
    render(
      <CupomEntrega
        order={venda}
        config={{ institutionName: ASSPEN_LONGO, appName: 'MERCADO FÁCIL' } as any}
      />
    );
    expect(screen.getByRole('heading', { level: 1 }).textContent?.trim()).toBe('MERCADO FÁCIL');
    expect(screen.queryByText(/ASSOCIAÇÃO DOS SERVIDORES/)).toBeNull();
  });

  it('fiscal mantém o nome legal completo em até 2 linhas', () => {
    render(<CupomEntrega order={venda} config={{ ...cfgAsspen, fiscalEmission: true } as any} />);
    const h1 = screen.getByRole('heading', { level: 1 }).textContent || '';
    expect(h1).toContain('ASSOCIAÇÃO DOS SERVIDORES');
    const corpo = screen.getByText(/PEIXOTO DE AZEVEDO \/ MT - ASSPEN/);
    expect(corpo).toBeTruthy();
    expect(screen.queryByText(/NAO E DOCUMENTO FISCAL/)).toBeNull();
  });

  it('sem config, cai no título customizado (prop title) como antes', () => {
    render(<CupomEntrega order={venda} title="MINHA LOJA" />);
    expect(screen.getByRole('heading', { level: 1 }).textContent?.trim()).toBe('MINHA LOJA');
  });
});

describe('CupomEntrega — desconto no cupom', () => {
  it('mostra SUBTOTAL e DESCONTO (% valor) quando pedido tem desconto gravado', () => {
    const pedido = {
      id: 'V1',
      total: 45,
      subtotal: 50,
      discountPct: 10,
      discountValue: 5,
      items: [{ name: 'ARROZ', quantity: 1, priceAtPurchase: 50 }],
      paymentMethod: 'CASH',
    };
    render(<CupomEntrega order={pedido as any} config={cfgAsspen as any} />);
    expect(screen.getByText('SUBTOTAL:')).toBeTruthy();
    expect(screen.getByText('DESCONTO (10%):')).toBeTruthy();
    expect(screen.getByText('-R$ 5,00')).toBeTruthy();
    expect(screen.getByText('TOTAL PEDIDO:')).toBeTruthy();
    expect(screen.getByText('R$ 45,00')).toBeTruthy();
  });

  it('não mostra SUBTOTAL/DESCONTO quando não há diferença', () => {
    const pedido = {
      id: 'V2',
      total: 50,
      items: [{ name: 'ARROZ', quantity: 1, priceAtPurchase: 50 }],
      paymentMethod: 'CASH',
    };
    render(<CupomEntrega order={pedido as any} config={cfgAsspen as any} />);
    expect(screen.queryByText('SUBTOTAL:')).toBeNull();
    expect(screen.queryByText(/DESCONTO/)).toBeNull();
    expect(screen.getAllByText('R$ 50,00').length).toBeGreaterThan(0);
  });

  it('calcula o desconto pela soma dos itens quando o pedido não gravou subtotal', () => {
    const pedido = {
      id: 'V3',
      total: 45,
      items: [{ name: 'ARROZ', quantity: 2, priceAtPurchase: 25 }],
      paymentMethod: 'CASH',
    };
    render(<CupomEntrega order={pedido as any} config={cfgAsspen as any} />);
    expect(screen.getByText('SUBTOTAL:')).toBeTruthy();
    expect(screen.getByText('DESCONTO:')).toBeTruthy();
    expect(screen.getByText('-R$ 5,00')).toBeTruthy();
  });
});
