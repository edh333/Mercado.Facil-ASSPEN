// @vitest-environment jsdom
// Comprovante de cancelamento/estorno — utils/comprovanteOperacao.ts.
//
// Garante as regras profissionais do papel impresso:
//  - cancelamento/estorno NÃO é documento fiscal (nunca sai "CUPOM FISCAL");
//  - a gaveta do caixa nunca abre no comprovante de estorno;
//  - o destino da impressão é escolhido pelo operador (fiscal / comum / .txt).

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  imprimirBobinaFiscal: vi.fn(async () => true),
  abrirJanelaImpressao: vi.fn(() => ({ focus: vi.fn(), closed: false })),
  baixarCupomTxt: vi.fn(),
}));

vi.mock('../utils/printUtils', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    imprimirBobinaFiscal: mocks.imprimirBobinaFiscal,
    abrirJanelaImpressao: mocks.abrirJanelaImpressao,
    baixarCupomTxt: mocks.baixarCupomTxt,
  };
});

import {
  montarPedidoComprovante,
  configComprovante,
  gerarTextoComprovante,
  imprimirComprovanteOperacao,
  STATUS_POR_ACAO,
} from '../utils/comprovanteOperacao';

const pedido = {
  id: 'ABC123DEF456',
  userName: 'MARIA SOUZA',
  total: 50,
  date: '2026-10-01T10:00:00.000Z',
  createdAt: '2026-10-01T10:00:00.000Z',
  status: 'completed',
  paymentMethod: 'CASH',
  items: [{ productId: 'p1', name: 'Cafe', quantity: 2, priceAtPurchase: 25 }],
} as any;

beforeEach(() => {
  mocks.imprimirBobinaFiscal.mockReset().mockResolvedValue(true);
  mocks.abrirJanelaImpressao.mockReset().mockReturnValue({ focus: vi.fn(), closed: false });
  mocks.baixarCupomTxt.mockReset();
});

describe('comprovanteOperacao — montagem do pedido', () => {
  it('marca o status da operação (cancelamento x estorno) sem mutar o pedido original', () => {
    const cancelado = montarPedidoComprovante(pedido, 'cancelar', 'Cliente desistiu', 'ADMIN');
    expect(cancelado.status).toBe(STATUS_POR_ACAO.cancelar);
    expect(cancelado.status).toBe('CANCELLED');

    const estornado = montarPedidoComprovante(pedido, 'estorno', 'Produto com defeito', 'ADMIN');
    expect(estornado.status).toBe('REFUNDED');

    // O pedido original continua intacto (o histórico no Firestore não muda).
    expect(pedido.status).toBe('completed');
  });

  it('guarda motivo, responsável e data do cancelamento', () => {
    const p = montarPedidoComprovante(pedido, 'cancelar', 'Cliente desistiu', 'JOAO ADMIN', '2026-10-02T09:00:00.000Z');
    expect(p.cancelReason).toBe('Cliente desistiu');
    expect(p.cancelledBy).toBe('JOAO ADMIN');
    expect(p.cancelReasonAt).toBe('2026-10-02T09:00:00.000Z');
  });
});

describe('comprovanteOperacao — configuração do papel', () => {
  it('desliga a emissão fiscal e a gaveta, e nomeia o documento da operação', () => {
    const conf = configComprovante({ fiscalEmission: true, drawerKick: true, cnpj: '123' }, 'cancelar');
    expect(conf.fiscalEmission).toBe(false);
    expect(conf.drawerKick).toBe(false);
    expect(conf.customReceiptDocName).toBe('COMPROVANTE DE CANCELAMENTO');
    // Nada do ajuste original se perde (cnpj, etc.).
    expect(conf.cnpj).toBe('123');
  });

  it('nomeia o documento de estorno', () => {
    expect(configComprovante({}, 'estorno').customReceiptDocName).toBe('COMPROVANTE DE ESTORNO');
  });
});

describe('comprovanteOperacao — texto impresso', () => {
  it('sai marcado como cancelado, com motivo/responsável e como NÃO fiscal', () => {
    const texto = gerarTextoComprovante({
      order: pedido,
      acao: 'cancelar',
      motivo: 'Cliente desistiu',
      operador: 'JOAO ADMIN',
      config: { fiscalEmission: true },
    });
    expect(texto).toContain('CUPOM CANCELADO / DEVOLVIDO');
    expect(texto).toContain('MOTIVO:');
    expect(texto).toContain('CLIENTE DESISTIU');
    expect(texto).toContain('CANCELADO POR:');
    expect(texto).toContain('JOAO ADMIN');
    expect(texto).toContain('NAO E DOCUMENTO FISCAL');
    // NUNCA sai como cupom fiscal: um cancelamento não é documento fiscal.
    expect(texto).not.toContain('CUPOM FISCAL');
  });

  it('estorno também sai cancelado/devolvido', () => {
    const texto = gerarTextoComprovante({ order: pedido, acao: 'estorno', motivo: 'Defeito' });
    expect(texto).toContain('CUPOM CANCELADO / DEVOLVIDO');
    expect(texto).toContain('COMPROVANTE DE ESTORNO');
  });
});

describe('comprovanteOperacao — destinos de impressão', () => {
  it('impressora fiscal: envia a bobina sem abrir a gaveta', async () => {
    const r = await imprimirComprovanteOperacao(
      { order: pedido, acao: 'cancelar', motivo: 'X', config: { drawerKick: true } },
      'fiscal'
    );
    expect(r.ok).toBe(true);
    expect(r.via).toBe('fiscal');
    expect(mocks.imprimirBobinaFiscal).toHaveBeenCalledTimes(1);
    const [, conf] = mocks.imprimirBobinaFiscal.mock.calls[0] as any;
    expect(conf.drawerKick).toBe(false);
    expect(conf.fiscalEmission).toBe(false);
  });

  it('impressora fiscal indisponível: avisa sem desviar para a comum', async () => {
    mocks.imprimirBobinaFiscal.mockResolvedValue(false);
    const r = await imprimirComprovanteOperacao({ order: pedido, acao: 'cancelar' }, 'fiscal');
    expect(r.ok).toBe(false);
    expect(r.mensagem).toMatch(/fiscal indisponível/i);
    expect(mocks.abrirJanelaImpressao).not.toHaveBeenCalled();
  });

  it('impressora comum: abre a janela de impressão com o tipo CUPOM_COMUM', async () => {
    const r = await imprimirComprovanteOperacao({ order: pedido, acao: 'estorno' }, 'comum');
    expect(r.ok).toBe(true);
    expect(r.via).toBe('comum');
    expect(mocks.abrirJanelaImpressao).toHaveBeenCalledTimes(1);
    const [item] = mocks.abrirJanelaImpressao.mock.calls[0] as any;
    expect(item.type).toBe('CUPOM_COMUM');
    expect(item.data.status).toBe('REFUNDED');
  });

  it('arquivo: baixa o comprovante em .txt', async () => {
    const r = await imprimirComprovanteOperacao({ order: pedido, acao: 'cancelar' }, 'arquivo');
    expect(r.ok).toBe(true);
    expect(r.via).toBe('arquivo');
    expect(mocks.baixarCupomTxt).toHaveBeenCalledTimes(1);
  });
});
