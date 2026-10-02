// Testes da derivação do resumo de pós-venda do PDV (tela de confirmação de
// venda). O dinheiro mostrado aqui é o que o operador confere antes de chamar a
// próxima venda, então total/troco/composição precisam ser números — nunca NaN,
// nunca texto vazio, mesmo quando o pedido vem da fila offline (montado à mão,
// com campos possivelmente ausentes).

import { describe, it, expect } from 'vitest';
import { resumoPosVenda, rotuloPagamento, PAYMENT_LABELS } from '../utils/pdvPayment';

describe('rotuloPagamento', () => {
  it('traduz as formas de pagamento do PDV para PT-BR', () => {
    expect(rotuloPagamento('CASH')).toBe('Dinheiro');
    expect(rotuloPagamento('CARD')).toBe('Cartão');
    expect(rotuloPagamento('WALLET')).toBe('Carteira');
    expect(rotuloPagamento('FIADO_30')).toBe('Fiado 30 dias');
    expect(rotuloPagamento('PIX')).toBe('PIX');
  });

  it('aceita entrada em minúsculas ou com espaços', () => {
    expect(rotuloPagamento('cash')).toBe('Dinheiro');
    expect(rotuloPagamento('  card ')).toBe('Cartão');
  });

  it('nunca devolve string vazia (vazio apareceria como rótulo sem texto)', () => {
    expect(rotuloPagamento('')).toBe('—');
    expect(rotuloPagamento(null)).toBe('—');
    expect(rotuloPagamento(undefined)).toBe('—');
  });

  it('mantém o código cru quando a forma é desconhecida', () => {
    expect(rotuloPagamento('BOLETO')).toBe('BOLETO');
  });

  it('é a fonte única: o mapa cobre todas as formas aceitas no PDV', () => {
    for (const m of ['PIX', 'WALLET', 'CASH', 'CARD', 'MIXED', 'FIADO', 'FIADO_30']) {
      expect(PAYMENT_LABELS[m]).toBeTruthy();
    }
  });
});

describe('resumoPosVenda', () => {
  it('resume uma venda online de dinheiro com troco', () => {
    const r = resumoPosVenda({
      id: 'abcdef1234567890',
      total: 47.5,
      paymentMethod: 'CASH',
      change: 12.5,
      items: [{ id: 1 }, { id: 2 }, { id: 3 }],
    });
    expect(r.total).toBe(47.5);
    expect(r.troco).toBe(12.5);
    expect(r.metodoRotulo).toBe('Dinheiro');
    expect(r.itens).toBe(3);
    expect(r.offline).toBe(false);
    expect(r.idCurto).toBe('abcdef123456');
  });

  it('esconde o troco quando não há troco a devolver', () => {
    expect(resumoPosVenda({ total: 10, paymentMethod: 'PIX' }).troco).toBe(0);
    expect(resumoPosVenda({ total: 10, paymentMethod: 'CASH', change: 0 }).troco).toBe(0);
  });

  it('trunca troco negativo a zero (troco jamais é negativo na tela)', () => {
    const r = resumoPosVenda({ total: 10, paymentMethod: 'CASH', change: -3 });
    expect(r.troco).toBe(0);
  });

  it('lista a composição do pagamento misto', () => {
    const r = resumoPosVenda({
      total: 30,
      paymentMethod: 'MIXED',
      payments: [
        { method: 'PIX', amount: 10 },
        { method: 'CASH', amount: 15 },
        { method: 'WALLET', amount: 5 },
      ],
    });
    expect(r.composicao).toEqual([
      { metodo: 'PIX', metodoRotulo: 'PIX', valor: 10 },
      { metodo: 'CASH', metodoRotulo: 'Dinheiro', valor: 15 },
      { metodo: 'WALLET', metodoRotulo: 'Carteira', valor: 5 },
    ]);
    expect(r.composicao.reduce((s, p) => s + p.valor, 0)).toBe(30);
  });

  it('não mostra composição em pagamento único', () => {
    expect(resumoPosVenda({ total: 10, paymentMethod: 'CASH', payments: [{ method: 'CASH', amount: 10 }] }).composicao)
      .toEqual([]);
  });

  it('marca venda offline registrada na fila', () => {
    expect(resumoPosVenda({ total: 10, offlinePending: true }).offline).toBe(true);
    expect(resumoPosVenda({ total: 10, status: 'offline_pending' }).offline).toBe(true);
  });

  it('não marca venda online como offline', () => {
    expect(resumoPosVenda({ total: 10, status: 'completed' }).offline).toBe(false);
    expect(resumoPosVenda({ total: 10, offlinePending: false }).offline).toBe(false);
  });

  it('nunca produz NaN nem Infinity com pedido incompleto da fila offline', () => {
    const r = resumoPosVenda({ id: 'x', items: [] });
    expect(r.total).toBe(0);
    expect(r.troco).toBe(0);
    expect(r.itens).toBe(0);
    expect(r.metodoRotulo).toBe('—');
    expect(r.composicao).toEqual([]);
  });

  it('tolera valores numéricos estruturados e totais fracionários', () => {
    // Firestore pode devolver o total como objeto de precisão.
    const r = resumoPosVenda({
      total: { low: 0, high: 0, units: 0, negative: false },
      paymentMethod: 'cash',
      items: [{ id: 1 }],
    });
    expect(Number.isFinite(r.total)).toBe(true);
    expect(Number.isFinite(r.troco)).toBe(true);
    expect(r.metodoRotulo).toBe('Dinheiro');
  });

  it('arredonda para centavos (regra da moeda do sistema)', () => {
    const r = resumoPosVenda({ total: 10.005, paymentMethod: 'CASH', change: 2.004 });
    expect(r.total).toBe(10.01);
    expect(r.troco).toBe(2);
  });

  it('não quebra com pedido nulo, indefinido ou de outro tipo', () => {
    for (const v of [null, undefined, 0, 'texto', []]) {
      const r = resumoPosVenda(v);
      expect(r.total).toBe(0);
      expect(r.itens).toBe(0);
      expect(r.troco).toBe(0);
    }
  });

  it('usa o clientToken como identificador quando o pedido ainda é da fila offline', () => {
    // Na fila offline o id local É o clientToken do reenvio ao servidor.
    expect(resumoPosVenda({ id: '', clientToken: 'OFFLINE_1712_AB12', total: 5 }).idCurto)
      .toBe('OFFLINE_1712');
  });
});