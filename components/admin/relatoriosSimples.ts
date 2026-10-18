// Construtores PUROS dos "Relatórios Simples" — a janela de consulta rápida da
// tela inicial do admin. Diferente dos relatórios formais (AdminReportsTab /
// RelatorioA4), aqui o objetivo é uma visão direta, sem configuração: recebem
// as coleções já carregadas no painel (orders/products/users) e devolvem uma
// tabela pronta (colunas + linhas + cartões de resumo).
//
// Sem efeitos colaterais e sem acesso a rede: dá para unit-testar e a janela
// abre instantaneamente mesmo no modo offline.

import { Order, Product, User } from '../../types';
import { formatarMoeda, formatPhone, isAdminRole, mascararCpf } from '../../utils';
import { precoEfetivo } from '../../utils/money';
import { toDate } from '../../utils/dateUtils';
import { ehReceita } from './adminUtils';
import { rotuloPagamento } from '../../utils/pdvPayment';

export type PeriodoVendas = 'hoje' | '7' | '30' | 'tudo';

/** Rótulo humano do período — fonte única para o filtro e o cabeçalho impresso. */
export const ROTULO_PERIODO: Record<PeriodoVendas, string> = {
  hoje: 'Hoje',
  '7': 'Últimos 7 dias',
  '30': 'Últimos 30 dias',
  tudo: 'Todo o período',
};

export interface RelatorioColuna {
  rotulo: string;
  align?: 'left' | 'center' | 'right';
}

export interface RelatorioResumoItem {
  rotulo: string;
  valor: string;
}

export interface RelatorioSimples {
  /** Cabeçalho da tabela (ordem das colunas = ordem das células em cada linha). */
  colunas: RelatorioColuna[];
  /** Linhas já formatadas (texto pronto para exibir/imprimir). */
  linhas: string[][];
  /** Cartões de totais exibidos acima da tabela. */
  resumo: RelatorioResumoItem[];
  /** Observação opcional abaixo da tabela (ex.: quebra por forma de pagamento). */
  rodape?: string;
  /** Texto exibido quando não há registros. */
  vazio: string;
}

const moeda = (v: number): string => `R$ ${formatarMoeda(Number(v) || 0)}`;

/** Operador de caixa (vendedor) — não entra nas listas de familiares/internos. */
const ehOperador = (u: User): boolean => {
  const r = String(u?.role || '').toLowerCase();
  return r === 'vendedor' || r === 'operator';
};

/** Familiar (titular da carteira) — todo usuário que não é admin nem operador. */
export const ehFamiliar = (u: User): boolean => !!u && !isAdminRole(u?.role) && !ehOperador(u);

const dataDoPedido = (o: Order): Date | null => toDate(o?.date || (o as any)?.createdAt);

/**
 * Filtra pedidos que contam como VENDA (receita) num período.
 * 'hoje' = desde 00:00; '7' = últimos 7 dias (incluindo hoje); '30' idem; 'tudo'.
 */
export function filtrarVendasPorPeriodo(orders: Order[], periodo: PeriodoVendas): Order[] {
  const receitas = (orders || []).filter((o) => ehReceita(o?.status));
  if (periodo === 'tudo') return receitas;
  const fim = new Date();
  const inicio = new Date();
  inicio.setHours(0, 0, 0, 0);
  if (periodo === '7') inicio.setDate(inicio.getDate() - 6);
  else if (periodo === '30') inicio.setDate(inicio.getDate() - 29);
  return receitas.filter((o) => {
    const d = dataDoPedido(o);
    return !!d && d >= inicio && d <= fim;
  });
}

/** Rótulo das formas de pagamento de um pedido (suporta pagamento misto). */
function formasDoPedido(o: Order): string {
  if (Array.isArray(o?.payments) && o.payments.length) {
    return Array.from(new Set(o.payments.map((p) => rotuloPagamento(p?.method)))).join(' + ');
  }
  return rotuloPagamento(o?.paymentMethod);
}

export function relatorioVendas(orders: Order[], periodo: PeriodoVendas): RelatorioSimples {
  const vendas = filtrarVendasPorPeriodo(orders, periodo)
    .slice()
    .sort((a, b) => (dataDoPedido(b)?.getTime() || 0) - (dataDoPedido(a)?.getTime() || 0));

  let total = 0;
  let totalItens = 0;
  const porForma: Record<string, number> = {};

  const linhas = vendas.map((o) => {
    const d = dataDoPedido(o);
    const itens = (o?.items || []).reduce((s, i) => s + (Number(i?.quantity) || 1), 0);
    const valor = Number(o?.total) || 0;
    total += valor;
    totalItens += itens;

    if (Array.isArray(o?.payments) && o.payments.length) {
      o.payments.forEach((p) => {
        const f = rotuloPagamento(p?.method);
        porForma[f] = (porForma[f] || 0) + (Number(p?.amount) || 0);
      });
    } else {
      const f = rotuloPagamento(o?.paymentMethod);
      porForma[f] = (porForma[f] || 0) + valor;
    }

    return [
      d ? d.toLocaleDateString('pt-BR') : '—',
      `#${String(o?.id || '').slice(0, 8).toUpperCase()}`,
      String(o?.userName || o?.inmateName || 'Cliente'),
      String(o?.operatorName || '—'),
      formasDoPedido(o) || '—',
      String(itens),
      moeda(valor),
    ];
  });

  const ticket = vendas.length ? total / vendas.length : 0;
  const rodapeFormas = Object.entries(porForma)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}: ${moeda(v)}`)
    .join('  •  ');

  return {
    colunas: [
      { rotulo: 'Data', align: 'center' },
      { rotulo: 'Pedido', align: 'center' },
      { rotulo: 'Cliente' },
      { rotulo: 'Operador' },
      { rotulo: 'Pagamento', align: 'center' },
      { rotulo: 'Itens', align: 'center' },
      { rotulo: 'Total', align: 'right' },
    ],
    linhas,
    resumo: [
      { rotulo: 'Vendas', valor: String(vendas.length) },
      { rotulo: 'Itens vendidos', valor: String(totalItens) },
      { rotulo: 'Ticket médio', valor: moeda(ticket) },
      { rotulo: 'Total vendido', valor: moeda(total) },
    ],
    rodape: rodapeFormas ? `Formas de pagamento: ${rodapeFormas}` : undefined,
    vazio: 'Nenhuma venda registrada no período selecionado.',
  };
}

export function relatorioCreditos(users: User[]): RelatorioSimples {
  const familiares = (users || [])
    .filter(ehFamiliar)
    .map((u) => ({
      nome: String(u?.name || u?.nome || 'Familiar'),
      cpf: u?.cpf || u?.inmateCpf || u?.prisonerCpf || '',
      interno: String(u?.inmateName || u?.prisonerName || '—'),
      saldo: Number(u?.walletBalance) || 0,
    }))
    .sort((a, b) => b.saldo - a.saldo);

  const total = familiares.reduce((s, f) => s + f.saldo, 0);
  const comSaldo = familiares.filter((f) => f.saldo > 0).length;

  return {
    colunas: [
      { rotulo: 'Familiar' },
      { rotulo: 'CPF', align: 'center' },
      { rotulo: 'Interno' },
      { rotulo: 'Saldo', align: 'right' },
    ],
    linhas: familiares.map((f) => [f.nome, mascararCpf(f.cpf), f.interno, moeda(f.saldo)]),
    resumo: [
      { rotulo: 'Total em créditos', valor: moeda(total) },
      { rotulo: 'Com saldo', valor: String(comSaldo) },
      { rotulo: 'Sem saldo', valor: String(familiares.length - comSaldo) },
      { rotulo: 'Familiares', valor: String(familiares.length) },
    ],
    vazio: 'Nenhum familiar cadastrado.',
  };
}

export function relatorioClientes(users: User[]): RelatorioSimples {
  const contas = (users || [])
    .filter((u) => (Number(u?.currentDebt) || 0) > 0 || u?.allowCredit === true)
    .map((u) => ({
      nome: String(u?.name || u?.nome || 'Cliente'),
      cpf: u?.cpf || '',
      telefone: u?.phone || u?.telefone || '',
      limite: Number(u?.creditLimit) || 0,
      divida: Number(u?.currentDebt) || 0,
      saldo: Number(u?.walletBalance) || 0,
    }))
    .sort((a, b) => b.divida - a.divida);

  const totalDivida = contas.reduce((s, c) => s + c.divida, 0);
  const devedores = contas.filter((c) => c.divida > 0).length;
  const limiteTotal = contas.reduce((s, c) => s + c.limite, 0);
  const disponivel = contas.reduce((s, c) => s + Math.max(0, c.limite - c.divida), 0);

  return {
    colunas: [
      { rotulo: 'Cliente' },
      { rotulo: 'CPF', align: 'center' },
      { rotulo: 'Telefone', align: 'center' },
      { rotulo: 'Limite', align: 'right' },
      { rotulo: 'Dívida', align: 'right' },
      { rotulo: 'Saldo', align: 'right' },
    ],
    linhas: contas.map((c) => [
      c.nome,
      mascararCpf(c.cpf),
      c.telefone ? formatPhone(c.telefone) : '—',
      moeda(c.limite),
      moeda(c.divida),
      moeda(c.saldo),
    ]),
    resumo: [
      { rotulo: 'Total a receber', valor: moeda(totalDivida) },
      { rotulo: 'Devedores', valor: String(devedores) },
      { rotulo: 'Limite concedido', valor: moeda(limiteTotal) },
      { rotulo: 'Crédito disponível', valor: moeda(disponivel) },
    ],
    vazio: 'Nenhum cliente de fiado cadastrado.',
  };
}

export function relatorioProdutos(products: Product[]): RelatorioSimples {
  const itens = (products || [])
    .slice()
    .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || ''), 'pt-BR'));

  let unidades = 0;
  let custoTotal = 0;
  let vendaTotal = 0;

  const linhas = itens.map((p) => {
    const estoque = Number(p?.stock) || 0;
    const custo = Number(p?.costPrice) || 0;
    const venda = precoEfetivo(p);
    unidades += estoque;
    custoTotal += estoque * custo;
    vendaTotal += estoque * venda;
    const margem = venda > 0 ? ((venda - custo) / venda) * 100 : 0;
    return [
      String(p?.name || 'Produto'),
      String(p?.category || '—'),
      String(estoque),
      moeda(custo),
      moeda(venda),
      `${formatarMoeda(margem)}%`,
      moeda(estoque * custo),
    ];
  });

  return {
    colunas: [
      { rotulo: 'Produto' },
      { rotulo: 'Categoria' },
      { rotulo: 'Estoque', align: 'center' },
      { rotulo: 'Custo', align: 'right' },
      { rotulo: 'Venda', align: 'right' },
      { rotulo: 'Margem', align: 'right' },
      { rotulo: 'Custo em estoque', align: 'right' },
    ],
    linhas,
    resumo: [
      { rotulo: 'Produtos', valor: String(itens.length) },
      { rotulo: 'Unidades', valor: String(unidades) },
      { rotulo: 'Estoque (custo)', valor: moeda(custoTotal) },
      { rotulo: 'Estoque (venda)', valor: moeda(vendaTotal) },
    ],
    vazio: 'Nenhum produto cadastrado.',
  };
}

export function relatorioPresos(users: User[]): RelatorioSimples {
  interface Grupo {
    interno: string;
    cpf: string;
    saldo: number;
    responsaveis: string[];
  }
  const mapa = new Map<string, Grupo>();

  (users || []).filter(ehFamiliar).forEach((u) => {
    const interno = u?.inmateName || u?.prisonerName;
    const cpfInterno = u?.inmateCpf || u?.prisonerCpf;
    if (!interno && !cpfInterno) return;
    const chave = String(cpfInterno || interno);
    if (!mapa.has(chave)) {
      mapa.set(chave, { interno: String(interno || 'Interno sem nome'), cpf: String(cpfInterno || ''), saldo: 0, responsaveis: [] });
    }
    const g = mapa.get(chave)!;
    g.saldo += Number(u?.walletBalance) || 0;
    const familiar = String(u?.name || u?.nome || 'Familiar');
    if (!g.responsaveis.includes(familiar)) g.responsaveis.push(familiar);
  });

  const rotuloResponsaveis = (nomes: string[]): string => {
    if (nomes.length === 0) return '—';
    if (nomes.length <= 3) return nomes.join(', ');
    return `${nomes.slice(0, 3).join(', ')} +${nomes.length - 3}`;
  };

  const grupos = Array.from(mapa.values()).sort((a, b) => b.saldo - a.saldo);
  const total = grupos.reduce((s, g) => s + g.saldo, 0);
  const comSaldo = grupos.filter((g) => g.saldo > 0).length;

  return {
    colunas: [
      { rotulo: 'Interno' },
      { rotulo: 'CPF Interno', align: 'center' },
      { rotulo: 'Familiar(is)', align: 'center' },
      { rotulo: 'Saldo', align: 'right' },
    ],
    linhas: grupos.map((g) => [g.interno, mascararCpf(g.cpf), rotuloResponsaveis(g.responsaveis), moeda(g.saldo)]),
    resumo: [
      { rotulo: 'Internos', valor: String(grupos.length) },
      { rotulo: 'Com saldo', valor: String(comSaldo) },
      { rotulo: 'Total em saldos', valor: moeda(total) },
    ],
    vazio: 'Nenhum interno com familiar cadastrado.',
  };
}
