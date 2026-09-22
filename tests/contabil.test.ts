import { describe, it, expect } from 'vitest';
import {
  buildMonthlyDre,
  buildSalesCsv,
  buildStockAbc,
  buildDailySales,
  buildSalesByCategory,
  buildLowStock,
  buildProductsCatalog,
  buildExtratoIndividual,
  buildFiadoVendas,
  sanitizarCpf,
  formatarDataContabil,
  ALIQUOTA_IMPOSTO_ESTIMADA,
} from '../utils/contabil';

const produto = (id: string, over: any = {}) => ({
  id,
  name: `Produto ${id}`,
  price: 10,
  costPrice: 6,
  stock: 5,
  category: 'Bebidas',
  available: true,
  ...over,
});

const pedido = (over: any = {}) => ({
  id: 'pedido-1',
  userId: 'user-1',
  status: 'PAID',
  total: 100,
  date: new Date('2026-01-15T12:00:00'),
  paymentMethod: 'PIX',
  items: [{ productId: 'p1', quantity: 2, priceAtPurchase: 10 }],
  ...over,
});

const RANGE = { ini: '2026-01-01', fim: '2026-01-31' };

describe('sanitizarCpf', () => {
  it('mascara CPF válido mantendo os 4 últimos dígitos', () => {
    expect(sanitizarCpf('52998224725')).toBe('***.***.***-4725');
  });

  it('retorna SEM-CPF para curto/vazio', () => {
    expect(sanitizarCpf('')).toBe('SEM-CPF');
    expect(sanitizarCpf('123')).toBe('123');
  });
});

describe('formatarDataContabil', () => {
  it('formata Date (timezone local)', () => {
    expect(formatarDataContabil(new Date(2026, 0, 15))).toBe('15/01/2026');
  });

  it('dash para inválido', () => {
    expect(formatarDataContabil(null)).toBe('—');
    expect(formatarDataContabil(undefined)).toBe('—');
  });
});

describe('buildMonthlyDre', () => {
  it('consolida receita, custo, despesas e lucro', () => {
    const dre = buildMonthlyDre(
      [pedido()],
      [{ amount: 10, date: new Date('2026-01-05'), deleted: false }],
      [produto('p1')],
      RANGE.ini,
      RANGE.fim
    );
    expect(dre.receitaBruta).toBe(100);
    expect(dre.custoMercadoriasVendidas).toBe(12); // 2 x costPrice 6
    expect(dre.despesasOperacionais).toBe(10);
    expect(dre.impostosEstimados).toBe(100 * ALIQUOTA_IMPOSTO_ESTIMADA);
    expect(dre.qtdPedidos).toBe(1);
    expect(dre.ticketMedio).toBe(100);
  });

  it('ignora pedidos fora do período e não receita', () => {
    const dre = buildMonthlyDre(
      [
        pedido({ date: new Date('2026-03-01') }),
        pedido({ status: 'CANCELLED' }),
        pedido({ status: 'pending' }),
      ],
      [],
      [],
      RANGE.ini,
      RANGE.fim
    );
    expect(dre.receitaBruta).toBe(0);
    expect(dre.qtdPedidos).toBe(0);
  });

  it('conta cancelados separadamente', () => {
    const dre = buildMonthlyDre(
      [pedido(), pedido({ id: 'c', status: 'CANCELLED' })],
      [],
      [],
      RANGE.ini,
      RANGE.fim
    );
    expect(dre.qtdPedidosCancelados).toBe(1);
  });
});

describe('buildSalesCsv', () => {
  it('gera CSV com BOM e cabeçalho', () => {
    const { csv, cabecalho, totalVendas } = buildSalesCsv(
      [pedido()],
      [{ id: 'user-1', cpf: '52998224725' }],
      RANGE.ini,
      RANGE.fim
    );
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(cabecalho[0]).toBe('DATA');
    expect(totalVendas).toBe(100);
    expect(csv).toContain('PIX');
  });

  it('sanitiza CPF no CSV', () => {
    const { csv } = buildSalesCsv(
      [pedido()],
      [{ id: 'user-1', cpf: '52998224725' }],
      RANGE.ini,
      RANGE.fim
    );
    expect(csv).toContain('***.***.***-4725');
    expect(csv).not.toContain('52998224725');
  });
});

describe('buildStockAbc', () => {
  it('classifica A/B/C por receita acumulada', () => {
    const abc = buildStockAbc(
      [
        produto('a', { id: 'a', price: 100 }),
        produto('b', { id: 'b', price: 50 }),
        produto('c', { id: 'c', price: 10 }),
      ],
      [
        pedido({ id: 'o1', items: [{ productId: 'a', quantity: 1, priceAtPurchase: 100 }] }),
        pedido({ id: 'o2', items: [{ productId: 'b', quantity: 1, priceAtPurchase: 50 }] }),
        pedido({ id: 'o3', items: [{ productId: 'c', quantity: 1, priceAtPurchase: 10 }] }),
      ],
      RANGE.ini,
      RANGE.fim
    );
    expect(abc.linhas).toHaveLength(3);
    expect(abc.linhas[0].classe).toBe('A'); // 100/160 = 62%
    expect(abc.totalReceita).toBe(160);
  });

  it('detecta produtos parados', () => {
    const abc = buildStockAbc(
      [produto('a'), produto('parado', { id: 'parado' })],
      [pedido({ items: [{ productId: 'a', quantity: 1, priceAtPurchase: 10 }] })],
      RANGE.ini,
      RANGE.fim
    );
    expect(abc.qtdProdutosParados).toBe(1);
    expect(abc.qtdProdutosTotais).toBe(2);
  });
});

describe('buildDailySales', () => {
  it('agrupa por dia', () => {
    const { dias, totalGeral, totalVendas } = buildDailySales(
      [
        pedido({ date: new Date('2026-01-10') }),
        pedido({ id: 'o2', date: new Date('2026-01-10') }),
        pedido({ id: 'o3', date: new Date('2026-01-11') }),
      ],
      RANGE.ini,
      RANGE.fim
    );
    expect(dias).toHaveLength(2);
    expect(dias[0].vendas).toBe(2);
    expect(totalGeral).toBe(300);
    expect(totalVendas).toBe(3);
  });
});

describe('buildSalesByCategory', () => {
  it('agrupa por categoria do produto', () => {
    const { linhas, totalReceita } = buildSalesByCategory(
      [pedido({ items: [{ productId: 'p1', quantity: 1, priceAtPurchase: 10 }] })],
      [produto('p1')],
      RANGE.ini,
      RANGE.fim
    );
    expect(linhas[0].categoria).toBe('BEBIDAS');
    expect(totalReceita).toBe(10);
  });
});

describe('buildLowStock', () => {
  it('lista somente críticos e separa zerados', () => {
    const rel = buildLowStock(
      [
        produto('ok', { id: 'ok', stock: 50, minStock: 5 }),
        produto('critico', { id: 'critico', stock: 2, minStock: 5 }),
        produto('zero', { id: 'zero', stock: 0 }),
      ],
      RANGE.ini,
      RANGE.fim
    );
    expect(rel.totalCriticos).toBe(2);
    expect(rel.totalZerados).toBe(1);
    expect(rel.linhas.map(l => l.id).sort()).toEqual(['critico', 'zero']);
  });
});

describe('buildProductsCatalog', () => {
  it('ordena por categoria e nome', () => {
    const { linhas, totalProdutos, totalEstoque } = buildProductsCatalog([
      produto('b', { id: 'b', stock: 2, category: 'Bebidas' }),
      produto('a', { id: 'a', stock: 3, category: 'Carnes' }),
    ]);
    expect(totalProdutos).toBe(2);
    expect(totalEstoque).toBe(5);
    expect(linhas[0].id).toBe('b'); // Bebidas < Carnes
    expect(linhas[0].disponivel).toBe(true);
  });
});

describe('buildExtratoIndividual', () => {
  const user = { id: 'user-1', name: 'João', cpf: '52998224725', walletBalance: 50 };

  it('monta compras como saída', () => {
    const extrato = buildExtratoIndividual(user, [pedido()], [], RANGE.ini, RANGE.fim);
    expect(extrato?.movs[0].type).toBe('EXIT');
    expect(extrato?.totalSaidas).toBe(100);
  });

  it('monta depósito aprovado como entrada', () => {
    const tx = {
      id: 'tx1',
      userId: 'user-1',
      type: 'deposit',
      status: 'approved',
      amount: 200,
      createdAt: new Date('2026-01-10'),
    };
    const extrato = buildExtratoIndividual(user, [], [tx], RANGE.ini, RANGE.fim);
    expect(extrato?.movs[0].type).toBe('ENTRY');
    expect(extrato?.totalEntradas).toBe(200);
    expect(extrato?.saldoPeriodo).toBe(200);
  });

  it('estorno vira entrada', () => {
    const extrato = buildExtratoIndividual(
      user,
      [pedido({ status: 'REFUNDED' })],
      [],
      RANGE.ini,
      RANGE.fim
    );
    expect(extrato?.movs[0].type).toBe('ENTRY');
  });

  it('retorna null sem usuário', () => {
    expect(buildExtratoIndividual(null, [], [], RANGE.ini, RANGE.fim)).toBeNull();
  });

  it('ignora pedidos apagados (deleted)', () => {
    const extrato = buildExtratoIndividual(user, [pedido({ deleted: true })], [], RANGE.ini, RANGE.fim);
    expect(extrato?.movs).toHaveLength(0);
    expect(extrato?.totalSaidas).toBe(0);
    expect(extrato?.saldoPeriodo).toBe(0);
  });
});

describe('buildFiadoVendas', () => {
  it('lista apenas FIADO e FIADO_30 dentro do período', () => {
    const orders = [
      pedido({ id: 'f1', paymentMethod: 'FIADO', date: new Date('2026-01-10T10:00:00'), userName: 'Maria' }),
      pedido({ id: 'f2', paymentMethod: 'FIADO_30', date: new Date('2026-01-20T10:00:00') }),
      pedido({ id: 'pix', paymentMethod: 'PIX', date: new Date('2026-01-11T10:00:00') }),
      pedido({ id: 'velho', paymentMethod: 'FIADO', date: new Date('2025-12-31T10:00:00') }),
    ];
    const r = buildFiadoVendas(orders, RANGE.ini, RANGE.fim);
    expect(r.count).toBe(2);
    expect(r.total).toBe(200);
    expect(r.vendas.map(v => v.id)).toEqual(['f2', 'f1']);
  });

  it('ignora pedidos apagados (deleted)', () => {
    const r = buildFiadoVendas(
      [pedido({ paymentMethod: 'FIADO', deleted: true }), pedido({ paymentMethod: 'FIADO_30', deleted: true })],
      RANGE.ini,
      RANGE.fim
    );
    expect(r.count).toBe(0);
    expect(r.total).toBe(0);
    expect(r.vendas).toEqual([]);
  });

  it('mapeia cliente, CPF mascarado, forma, status e itens', () => {
    const r = buildFiadoVendas(
      [
        pedido({
          paymentMethod: 'FIADO',
          status: 'PENDING',
          userName: 'Maria',
          userCpf: '52998224725',
        }),
      ],
      RANGE.ini,
      RANGE.fim
    );
    const v = r.vendas[0];
    expect(v.cliente).toBe('Maria');
    expect(v.cpf).toBe('***.***.***-4725');
    expect(v.forma).toBe('FIADO');
    expect(v.status).toBe('PENDING');
    expect(v.total).toBe(100);
    expect(v.items).toEqual([{ nome: 'Item', qtd: 2, preco: 10 }]);
  });

  it('lista vazia sem vendas fiado no período', () => {
    const r = buildFiadoVendas([], RANGE.ini, RANGE.fim);
    expect(r).toEqual({ vendas: [], total: 0, count: 0 });
  });
});