import { describe, it, expect } from 'vitest';
import {
  relatorioVendas,
  relatorioCreditos,
  relatorioClientes,
  relatorioProdutos,
  relatorioPresos,
  relatorioVendasProdutos,
  filtrarVendasPorPeriodo,
} from '../components/admin/relatoriosSimples';

const isoHoje = () => new Date().toISOString();
const isoDiasAtras = (d: number) => {
  const x = new Date();
  x.setDate(x.getDate() - d);
  return x.toISOString();
};

describe('filtrarVendasPorPeriodo', () => {
  const orders: any[] = [
    { id: 'a', status: 'delivered', total: 10, date: isoHoje() },
    { id: 'b', status: 'delivered', total: 20, date: isoDiasAtras(3) },
    { id: 'c', status: 'delivered', total: 40, date: isoDiasAtras(20) },
    { id: 'd', status: 'cancelled', total: 99, date: isoHoje() },
    { id: 'e', status: 'pending', total: 50, date: isoHoje() },
  ];

  it('conta apenas pedidos de receita (exclui cancelado/pendente)', () => {
    const todos = filtrarVendasPorPeriodo(orders, 'tudo');
    expect(todos.map(o => o.id).sort()).toEqual(['a', 'b', 'c']);
  });

  it('filtra por período', () => {
    expect(filtrarVendasPorPeriodo(orders, 'hoje').map(o => o.id)).toEqual(['a']);
    expect(filtrarVendasPorPeriodo(orders, '7').map(o => o.id).sort()).toEqual(['a', 'b']);
    expect(filtrarVendasPorPeriodo(orders, '30').map(o => o.id).sort()).toEqual(['a', 'b', 'c']);
  });
});

describe('relatorioVendas', () => {
  const orders: any[] = [
    {
      id: 'aaaaaaaa-1111',
      status: 'delivered',
      total: 30,
      date: isoHoje(),
      userName: 'Maria',
      operatorName: 'João',
      items: [{ quantity: 2 }, { quantity: 1 }],
      payments: [
        { method: 'CASH', amount: 20 },
        { method: 'PIX', amount: 10 },
      ],
    },
  ];

  it('calcula itens, ticket e total', () => {
    const r = relatorioVendas(orders, 'hoje');
    expect(r.linhas).toHaveLength(1);
    const resumo = Object.fromEntries(r.resumo.map(x => [x.rotulo, x.valor]));
    expect(resumo['Vendas']).toBe('1');
    expect(resumo['Itens vendidos']).toBe('3');
    expect(resumo['Total vendido']).toBe('R$ 30,00');
    expect(resumo['Ticket médio']).toBe('R$ 30,00');
  });

  it('quebra formas de pagamento no rodapé (pagamento misto)', () => {
    const r = relatorioVendas(orders, 'hoje');
    expect(r.rodape).toContain('Dinheiro');
    expect(r.rodape).toContain('PIX');
  });

  it('devolve mensagem de vazio quando não há vendas', () => {
    const r = relatorioVendas([], 'hoje');
    expect(r.linhas).toHaveLength(0);
    expect(r.vazio).toBeTruthy();
  });
});

describe('relatorioCreditos', () => {
  const users: any[] = [
    { id: '1', name: 'Ana', role: 'FAMILY', cpf: '11111111111', inmateName: 'Interno A', walletBalance: 50 },
    { id: '2', name: 'Beto', role: 'FAMILY', walletBalance: 0 },
    { id: '3', name: 'Admin', role: 'ADMIN', walletBalance: 999 },
    { id: '4', name: 'Vend', role: 'VENDEDOR', walletBalance: 5 },
  ];

  it('inclui apenas familiares e ignora admin/operador', () => {
    const r = relatorioCreditos(users);
    expect(r.linhas).toHaveLength(2);
    const resumo = Object.fromEntries(r.resumo.map(x => [x.rotulo, x.valor]));
    expect(resumo['Total em créditos']).toBe('R$ 50,00');
    expect(resumo['Com saldo']).toBe('1');
    expect(resumo['Sem saldo']).toBe('1');
  });

  it('mascara o CPF', () => {
    const r = relatorioCreditos(users);
    expect(r.linhas[0][1]).toMatch(/\*\*\*/);
  });
});

describe('relatorioClientes', () => {
  const users: any[] = [
    { id: '1', name: 'Devedor', currentDebt: 30, creditLimit: 100, allowCredit: true },
    { id: '2', name: 'Limpo', currentDebt: 0, creditLimit: 50, allowCredit: true },
    { id: '3', name: 'Comum', currentDebt: 0, allowCredit: false },
  ];

  it('lista apenas contas de fiado (dívida ou crédito habilitado)', () => {
    const r = relatorioClientes(users);
    expect(r.linhas).toHaveLength(2);
    const resumo = Object.fromEntries(r.resumo.map(x => [x.rotulo, x.valor]));
    expect(resumo['Total a receber']).toBe('R$ 30,00');
    expect(resumo['Devedores']).toBe('1');
    expect(resumo['Limite concedido']).toBe('R$ 150,00');
  });
});

describe('relatorioProdutos', () => {
  const products: any[] = [
    { id: '1', name: 'Refri', category: 'Bebidas', stock: 10, costPrice: 2, price: 5 },
    { id: '2', name: 'Água', category: 'Bebidas', stock: 0, costPrice: 1, price: 3 },
  ];

  it('soma unidades e valores de estoque', () => {
    const r = relatorioProdutos(products);
    const resumo = Object.fromEntries(r.resumo.map(x => [x.rotulo, x.valor]));
    expect(resumo['Produtos']).toBe('2');
    expect(resumo['Unidades']).toBe('10');
    expect(resumo['Estoque (custo)']).toBe('R$ 20,00');
    expect(resumo['Estoque (venda)']).toBe('R$ 50,00');
  });

  it('conta produtos sem estoque e em nível baixo', () => {
    const comMinimo: any[] = [
      { id: '1', name: 'Refri', stock: 10, costPrice: 2, price: 5 },
      { id: '2', name: 'Água', stock: 0, costPrice: 1, price: 3 },
      { id: '3', name: 'Suco', stock: 2, costPrice: 1, price: 4, minStock: 5 },
    ];
    const resumo = Object.fromEntries(relatorioProdutos(comMinimo).resumo.map(x => [x.rotulo, x.valor]));
    expect(resumo['Sem estoque']).toBe('1');
    expect(resumo['Estoque baixo']).toBe('1');
  });

  it('ordena por nome', () => {
    const r = relatorioProdutos(products);
    expect(r.linhas[0][0]).toBe('Água');
    expect(r.linhas[1][0]).toBe('Refri');
  });

  it('mostra o valor de venda atual do produto', () => {
    const r = relatorioProdutos(products);
    const colVenda = r.colunas.findIndex(c => c.rotulo === 'Venda atual');
    expect(colVenda).toBeGreaterThan(-1);
    expect(r.linhas[1][colVenda]).toBe('R$ 5,00');
  });

  it('destaca o valor promocional como venda atual', () => {
    const comPromo: any[] = [
      { id: '1', name: 'Refri', stock: 5, costPrice: 2, price: 5, promoPrice: 3, onPromo: true },
    ];
    const r = relatorioProdutos(comPromo);
    const colVenda = r.colunas.findIndex(c => c.rotulo === 'Venda atual');
    expect(r.linhas[0][colVenda]).toMatch(/R\$ 3,00 \(promo\)/);
  });
});

describe('relatorioPresos', () => {
  const users: any[] = [
    { id: '1', name: 'Familiar A', role: 'FAMILY', inmateName: 'Interno X', inmateCpf: '22222222222', walletBalance: 40 },
    { id: '2', name: 'Familiar B', role: 'FAMILY', inmateName: 'Interno X', inmateCpf: '22222222222', walletBalance: 10 },
    { id: '3', name: 'Familiar C', role: 'FAMILY', inmateName: 'Interno Y', inmateCpf: '33333333333', walletBalance: 0 },
    { id: '4', name: 'Sem Interno', role: 'FAMILY', walletBalance: 7 },
  ];

  it('agrupa por interno e soma os saldos dos familiares', () => {
    const r = relatorioPresos(users);
    const resumo = Object.fromEntries(r.resumo.map(x => [x.rotulo, x.valor]));
    expect(resumo['Internos']).toBe('2');
    expect(resumo['Total em saldos']).toBe('R$ 50,00');
    // Interno X (saldo 50) vem primeiro
    expect(r.linhas[0][0]).toBe('Interno X');
    expect(r.linhas[0][3]).toBe('R$ 50,00');
    // Familiar sem interno é ignorado
    expect(r.linhas.every(l => l[0] !== 'Sem Interno')).toBe(true);
  });

  it('destaca quantos internos estão com e sem saldo', () => {
    const r = relatorioPresos(users);
    const resumo = Object.fromEntries(r.resumo.map(x => [x.rotulo, x.valor]));
    expect(resumo['Com saldo']).toBe('1');
    expect(resumo['Sem saldo']).toBe('1');
    expect(resumo['Familiares']).toBe('3');
  });
});

describe('relatorioVendasProdutos', () => {
  const orders: any[] = [
    {
      id: 'o1',
      status: 'delivered',
      total: 13,
      date: isoHoje(),
      items: [
        { productId: 'p1', name: 'Refri', category: 'Bebidas', quantity: 2, priceAtPurchase: 5 },
        { productId: 'p2', name: 'Água', category: 'Bebidas', quantity: 1, priceAtPurchase: 3 },
      ],
    },
    {
      id: 'o2',
      status: 'delivered',
      total: 10,
      date: isoHoje(),
      items: [{ productId: 'p1', name: 'Refri', category: 'Bebidas', quantity: 2, priceAtPurchase: 5 }],
    },
    {
      id: 'o3',
      status: 'cancelled',
      total: 99,
      date: isoHoje(),
      items: [{ productId: 'p1', name: 'Refri', quantity: 100, priceAtPurchase: 5 }],
    },
    {
      id: 'o4',
      status: 'pending',
      total: 99,
      date: isoHoje(),
      items: [{ productId: 'p2', name: 'Água', quantity: 50, priceAtPurchase: 3 }],
    },
  ];

  it('agrega quantidade e receita por produto e ordena pelo que mais faturou', () => {
    const r = relatorioVendasProdutos(orders, 'hoje');

    expect(r.linhas).toHaveLength(2);
    // Refri: 4 unidades x R$ 5 = R$ 20 (2 pedidos) — vem antes da Água
    expect(r.linhas[0][0]).toBe('Refri');
    expect(r.linhas[0][2]).toBe('4');
    expect(r.linhas[0][3]).toBe('2');
    expect(r.linhas[0][4]).toBe('R$ 5,00'); // preço médio
    expect(r.linhas[0][5]).toBe('R$ 20,00'); // receita
    // Água: 1 unidade x R$ 3 = R$ 3
    expect(r.linhas[1][0]).toBe('Água');
    expect(r.linhas[1][5]).toBe('R$ 3,00');
  });

  it('resume produtos distintos, unidades, campeão e receita total', () => {
    const r = relatorioVendasProdutos(orders, 'hoje');
    const resumo = Object.fromEntries(r.resumo.map(x => [x.rotulo, x.valor]));
    expect(resumo['Produtos vendidos']).toBe('2');
    expect(resumo['Unidades vendidas']).toBe('5');
    expect(resumo['Mais vendido']).toBe('Refri');
    expect(resumo['Receita total']).toBe('R$ 23,00');
  });

  it('mostra a participação de cada produto no faturamento', () => {
    const r = relatorioVendasProdutos(orders, 'hoje');
    expect(r.linhas[0][6]).toMatch(/%$/);
  });

  it('ignora pedidos cancelados e pendentes', () => {
    const r = relatorioVendasProdutos(orders, 'hoje');
    const resumo = Object.fromEntries(r.resumo.map(x => [x.rotulo, x.valor]));
    // 100 unidades do pedido cancelado e 50 do pendente não entram
    expect(resumo['Unidades vendidas']).toBe('5');
  });

  it('devolve mensagem de vazio quando não há vendas', () => {
    const r = relatorioVendasProdutos([], '7');
    expect(r.linhas).toHaveLength(0);
    expect(r.vazio).toBeTruthy();
  });
});
