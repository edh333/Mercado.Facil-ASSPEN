import { formatarMoeda } from '../utils';
import { toDate } from './dateUtils';
import { rotuloPagamento } from './pdvPayment';

// ── Especificações compartilhadas das tabelas de relatório ──────────────────
// Fonte ÚNICA da formatação (colunas + linhas) dos relatórios que o A4 de
// impressão (RelatorioA4) e o preview em tela (AdminReportPreviewModal)
// desenham. Ambos consomem estas specs para nunca mais divergirem.
//
// Tipos intencionalmente NÃO compartilhados (estrutura difere de propósito —
// DRE é tabela no A4 e "card" na tela; fluxo/geral/financeiro/extrato têm
// layouts distintos):
//   DRE_MONTHLY, GENERAL, FINANCIAL, ACCOUNTABILITY, INDIVIDUAL.

export type CelulaSpec = string | {
  texto: string;
  align?: 'left' | 'center' | 'right';
  bold?: boolean;
  cor?: string;
  sub?: string;
};

export type SpecTabela = {
  colunas: string[];
  alinhamentos: ('left' | 'center' | 'right')[];
  linhas: CelulaSpec[][];
  rodape?: CelulaSpec[];
  vazio: string;
};

const VERDE = '#047857';
const VERMELHO = '#b91c1c';
const AMBAR = '#b45309';
const AZUL = '#1d4ed8';
const SLATE = '#334155';
const CINZA = '#64748b';

const fmt = (v: any): string => {
  const n = Number(v) || 0;
  return n < 0 ? `- R$ ${formatarMoeda(Math.abs(n))}` : `R$ ${formatarMoeda(n)}`;
};

const fmtHora = (d: any): string => (toDate(d)?.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) || '—');

const rotuloStatus = (status: string): string => {
  const s = String(status || '').toUpperCase();
  if (['PAID', 'PAGO', 'DELIVERED', 'ENTREGUE', 'PREPARING', 'SEPARACAO', 'OUT_FOR_DELIVERY', 'SAIU'].some(k => s === k || s.includes(k))) return 'Aprovado';
  if (s.includes('CANCEL') || s.includes('REJEITAD') || s.includes('REJECTED')) return 'Cancelado';
  if (s.includes('REFUND') || s.includes('ESTORNAD') || s.includes('DEVOLVID')) return 'Estornado';
  return status ? status.replace(/_/g, ' ') : '—';
};

const corStatus = (status: string): string => {
  const label = rotuloStatus(status);
  if (label === 'Aprovado') return VERDE;
  if (label === 'Cancelado' || label === 'Estornado') return VERMELHO;
  return CINZA;
};

export const specSalesCsv = (report: any): SpecTabela | null => {
  const csv = report?.salesCsv;
  if (!csv) return null;
  const linhas = csv.linhas || [];
  return {
    colunas: ['Data', 'Cupom', 'CPF Cliente', 'Pagamento', 'Alíq.', 'Imposto Est.', 'Valor Total'],
    alinhamentos: ['left', 'left', 'center', 'center', 'right', 'right', 'right'],
    linhas: linhas.map((l: any) => [
      { texto: String(l.DATA) },
      { texto: String(l.NUMERO_CUPOM), bold: true },
      { texto: String(l.CPF_CLIENTE || '—'), align: 'center' },
      { texto: String(l.FORMA_PAGAMENTO || '—'), align: 'center' },
      { texto: `${l['ALIQUOTA_ESTIMADA(%)']}%`, align: 'right' },
      { texto: fmt(l.IMPOSTO_ESTIMADO), align: 'right', bold: true, cor: AMBAR },
      { texto: fmt(l.VALOR_TOTAL), align: 'right', bold: true }
    ]),
    rodape: [
      { texto: `TOTAL · ${linhas.length} vendas`, bold: true },
      { texto: '', align: 'left' },
      { texto: '', align: 'center' },
      { texto: '', align: 'center' },
      { texto: '', align: 'right' },
      { texto: fmt(csv.totalImpostos), align: 'right', bold: true, cor: AMBAR },
      { texto: fmt(csv.totalVendas), align: 'right', bold: true, cor: VERDE }
    ],
    vazio: 'Nenhuma venda encontrada para este período.'
  };
};

export const specStockAbc = (report: any): SpecTabela | null => {
  const abc = report?.stockAbc;
  if (!abc) return null;
  const cor = (c: string) => c === 'A' ? VERDE : c === 'B' ? AMBAR : VERMELHO;
  return {
    colunas: ['Produto', 'Qtd Vendida', 'Receita', '% Acum.', 'Estoque', 'Valor (Custo)', 'Classe'],
    alinhamentos: ['left', 'right', 'right', 'right', 'right', 'right', 'center'],
    linhas: (abc.linhas || []).map((l: any) => [
      { texto: String(l.name), bold: true, sub: l.qtdVendida === 0 ? 'Sem giro no período' : undefined },
      { texto: String(l.qtdVendida), align: 'right' },
      { texto: fmt(l.receita), align: 'right', bold: true, cor: VERDE },
      { texto: `${Number(l.acumuladoPct || 0).toFixed(1)}%`, align: 'right' },
      { texto: String(l.estoque), align: 'right' },
      { texto: fmt(l.valorEstoqueCusto), align: 'right' },
      { texto: String(l.classe), align: 'center', bold: true, cor: cor(l.classe) }
    ]),
    rodape: [
      { texto: `TOTAL · ${abc.qtdProdutosTotais} produtos`, bold: true },
      { texto: '', align: 'right' },
      { texto: fmt(abc.totalReceita), align: 'right', bold: true, cor: VERDE },
      { texto: '100%', align: 'right' },
      { texto: '', align: 'right' },
      { texto: fmt(abc.totalValorEstoqueCusto), align: 'right', bold: true },
      { texto: '', align: 'center' }
    ],
    vazio: 'Nenhum produto cadastrado.'
  };
};

export const specTopProducts = (report: any): SpecTabela | null => {
  const tp = report?.topProducts;
  if (!tp) return null;
  const linhas = tp.linhas || [];
  // drift: A4 mostrava Categoria; o preview tinha uma coluna Estoque sem dados
  // (o builder buildTopProducts não expõe estoque). Superset mantém as duas.
  return {
    colunas: ['#', 'Produto', 'Categoria', 'Qtd Vendida', 'Receita', 'Preço Médio', 'Estoque'],
    alinhamentos: ['center', 'left', 'left', 'right', 'right', 'right', 'right'],
    linhas: linhas.map((l: any, idx: number) => [
      { texto: String(idx + 1), align: 'center', bold: true, cor: idx === 0 ? AMBAR : CINZA },
      { texto: String(l.name), bold: true },
      { texto: String(l.categoria || '') },
      { texto: String(l.qtdVendida), align: 'right', bold: true },
      { texto: fmt(l.receita), align: 'right', bold: true, cor: VERDE },
      { texto: fmt(l.precoMedio), align: 'right' },
      { texto: l.estoque != null ? String(l.estoque) : '—', align: 'right' }
    ]),
    rodape: [
      { texto: '', align: 'center' },
      { texto: `TOTAL · ${tp.totalProdutos} produtos`, bold: true },
      { texto: '', align: 'left' },
      { texto: String(tp.totalItens), align: 'right', bold: true },
      { texto: fmt(tp.totalReceita), align: 'right', bold: true, cor: VERDE },
      { texto: '', align: 'right' },
      { texto: '', align: 'right' }
    ],
    vazio: 'Nenhum produto com venda no período.'
  };
};

export const specDailyClosing = (report: any): SpecTabela | null => {
  const dc = report?.dailyClosing;
  if (!dc) return null;
  const rows = dc.paymentRows || [];
  return {
    colunas: ['Forma de Pagamento', 'Nº de Operações', 'Valor', '% do Total'],
    alinhamentos: ['left', 'center', 'right', 'right'],
    linhas: rows.map((r: any) => [
      { texto: String(r.label), bold: true },
      { texto: String(r.count), align: 'center' },
      { texto: fmt(r.amount), align: 'right', bold: true, cor: VERDE },
      { texto: `${dc.totalSales ? (Number(r.amount) / Number(dc.totalSales) * 100).toFixed(1) : '0.0'}%`, align: 'right' }
    ]),
    rodape: [
      { texto: `TOTAL · ${dc.salesCount} venda(s)`, bold: true },
      { texto: '', align: 'center' },
      { texto: fmt(dc.totalSales), align: 'right', bold: true, cor: VERDE },
      { texto: '100%', align: 'right', bold: true }
    ],
    vazio: 'Nenhuma venda neste período.'
  };
};

export const specVendasDiarias = (report: any): SpecTabela | null => {
  const ds = report?.dailySales || report?.collective;
  if (!ds) return null;
  return {
    // drift: A4 já mostrava "Ticket Médio"; o preview não. Superset mantém.
    colunas: ['Data', 'Vendas', 'Itens', 'Faturamento', 'Ticket Médio'],
    alinhamentos: ['left', 'center', 'center', 'right', 'right'],
    linhas: (ds.dias || []).map((d: any) => [
      { texto: String(d.data), bold: true },
      { texto: String(d.vendas), align: 'center' },
      { texto: String(d.items), align: 'center' },
      { texto: fmt(d.total), align: 'right', bold: true, cor: VERDE },
      { texto: fmt(d.vendas > 0 ? d.total / d.vendas : 0), align: 'right' }
    ]),
    rodape: [
      { texto: 'TOTAL', align: 'center', bold: true },
      { texto: String(ds.totalVendas), align: 'center', bold: true },
      { texto: String(ds.totalItens), align: 'center', bold: true },
      { texto: fmt(ds.totalGeral), align: 'right', bold: true, cor: VERDE },
      { texto: fmt(ds.ticketMedio), align: 'right', bold: true }
    ],
    vazio: 'Nenhuma venda neste período.'
  };
};

// Relatórios AGRUPADOS (Detalhe de Vendas por dia, Fiado por faixa de atraso)
// têm um builder POR GRUPO: cada meio desenha o cabeçalho/subtotal do grupo
// (acordeão na tela, seção no A4), então a spec cobre só a tabela do grupo.
export const specDetalheVendasDia = (dia: any): SpecTabela | null => {
  if (!dia) return null;
  const linhas: CelulaSpec[][] = (dia.vendasDetalhe || []).map((v: any) => [
    { texto: fmtHora('2000-01-01T' + (v.hora || '00:00') + ':00'), align: 'center' },
    { texto: String(v.cupom || ''), bold: true },
    { texto: String(v.cliente || 'Consumidor'), sub: v.interno ? String(v.interno) : v.cpf ? `CPF ${String(v.cpf)}` : undefined },
    { texto: (v.items || []).map((i: any) => `${i.qtd}x ${i.nome}${i.sub != null ? ` = ${fmt(i.sub)}` : ''}`).join(' · ') },
    { texto: (v.formas || []).map((f: string) => rotuloPagamento(f)).join(' / '), align: 'center' },
    { texto: String(v.operador || '—'), align: 'center' },
    { texto: fmt(v.total), align: 'right', bold: true, cor: VERDE }
  ]);
  return {
    colunas: ['Hora', 'Cupom', 'Cliente / Interno', 'Itens', 'Pagamento', 'Operador', 'Valor'],
    alinhamentos: ['center', 'left', 'left', 'left', 'center', 'center', 'right'],
    linhas,
    rodape: [
      { texto: `TOTAL DO DIA — ${dia.vendas} venda(s)`, bold: true },
      { texto: '', align: 'center' },
      { texto: '', align: 'left' },
      { texto: '', align: 'left' },
      { texto: '', align: 'center' },
      { texto: '', align: 'center' },
      { texto: fmt(dia.total), align: 'right', bold: true, cor: VERDE }
    ],
    vazio: 'Nenhuma venda neste dia.'
  };
};

export const specSalesByCategory = (report: any): SpecTabela | null => {
  const c = report?.salesByCategory;
  if (!c) return null;
  return {
    colunas: ['Grupo', 'Itens Vendidos', 'Receita', '% do Total'],
    alinhamentos: ['left', 'right', 'right', 'right'],
    linhas: (c.linhas || []).map((l: any) => [
      { texto: String(l.categoria), bold: true },
      { texto: String(l.quantidade), align: 'right' },
      { texto: fmt(l.receita), align: 'right', bold: true, cor: VERDE },
      { texto: `${c.totalReceita ? (Number(l.receita) / Number(c.totalReceita) * 100).toFixed(1) : '0.0'}%`, align: 'right' }
    ]),
    rodape: [
      { texto: 'TOTAL', bold: true },
      { texto: String(c.totalQuantidade), align: 'right', bold: true },
      { texto: fmt(c.totalReceita), align: 'right', bold: true, cor: VERDE },
      { texto: '100%', align: 'right', bold: true }
    ],
    vazio: 'Nenhuma venda neste período.'
  };
};

export const specLowStock = (report: any): SpecTabela | null => {
  const ls = report?.lowStock;
  if (!ls) return null;
  // drift: A4 mostrava Categoria/Código; o preview os havia perdido.
  return {
    colunas: ['Produto', 'Categoria', 'Código', 'Estoque', 'Mínimo', 'Valor (Custo)'],
    alinhamentos: ['left', 'left', 'center', 'center', 'center', 'right'],
    linhas: (ls.linhas || []).map((l: any) => [
      { texto: String(l.name), bold: true, sub: l.semEstoque ? 'SEM ESTOQUE' : 'Estoque crítico' },
      { texto: String(l.category || '') },
      { texto: l.barcode ? String(l.barcode) : '—', align: 'center' },
      { texto: String(l.estoque), align: 'center', bold: true, cor: l.estoque <= 0 ? VERMELHO : AMBAR },
      { texto: String(l.minimo), align: 'center' },
      { texto: fmt(l.valorEstoque), align: 'right' }
    ]),
    rodape: [
      { texto: `TOTAL · ${ls.totalCriticos} item(ns) em reposição`, bold: true },
      { texto: '', align: 'left' },
      { texto: '', align: 'center' },
      { texto: '', align: 'center' },
      { texto: '', align: 'center' },
      { texto: fmt(ls.totalValorEstoque), align: 'right', bold: true }
    ],
    vazio: 'Nenhum produto em estoque baixo. Tudo saudável!'
  };
};

export const specProductsCatalog = (report: any): SpecTabela | null => {
  const pc = report?.productsCatalog;
  if (!pc) return null;
  const linhas = pc.linhas || [];
  // drift: o preview rotulava a última coluna como "Preço"; o A4 como
  // "Preço de Venda" (mantido) e o A4 prefixava a oferta com "Oferta ".
  return {
    colunas: ['Nº', 'Produto', 'Marca', 'Peso', 'Categoria', 'Código', 'Estoque', 'Preço de Venda'],
    alinhamentos: ['center', 'left', 'left', 'left', 'left', 'center', 'right', 'right'],
    linhas: linhas.map((l: any, idx: number) => [
      { texto: String(idx + 1), align: 'center', bold: true, cor: CINZA },
      { texto: String(l.name), bold: true },
      { texto: l.brand || '—' },
      { texto: l.weight || '—' },
      { texto: String(l.category || '') },
      { texto: l.barcode || '—', align: 'center' },
      { texto: String(l.estoque), align: 'right', bold: true, cor: l.estoque <= 0 ? VERMELHO : l.estoque <= 5 ? AMBAR : SLATE },
      { texto: `${l.precoPromocional > 0 ? 'Oferta ' : ''}${fmt(l.precoPromocional > 0 ? l.precoPromocional : l.preco)}`, align: 'right', bold: true, cor: l.precoPromocional > 0 ? VERDE : SLATE }
    ]),
    rodape: [
      { texto: `TOTAL · ${pc.totalProdutos} produtos`, bold: true },
      { texto: '', align: 'left' },
      { texto: '', align: 'left' },
      { texto: '', align: 'left' },
      { texto: '', align: 'left' },
      { texto: '', align: 'center' },
      { texto: String(pc.totalEstoque), align: 'right', bold: true },
      { texto: fmt(pc.totalValorEstoque), align: 'right', bold: true, cor: VERDE }
    ],
    vazio: 'Nenhum produto cadastrado.'
  };
};

export const specUsersCredits = (report: any): SpecTabela | null => {
  const lista = report?.creditsRows || [];
  if (!lista.length) return null;
  const totalSaldo = lista.reduce((s: number, x: any) => s + Number(x.saldo || 0), 0);
  const totalGasto = lista.reduce((s: number, x: any) => s + Number(x.gastoSemanal || 0), 0);
  // drift: o preview mostrava o nome do PUP (sub); o A4 não. Superset mantém.
  return {
    colunas: ['#', 'Familiar', 'CPF', 'Status', 'Saldo Disponível', 'Gasto Semanal'],
    alinhamentos: ['center', 'left', 'center', 'center', 'right', 'right'],
    linhas: lista.map((x: any, idx: number) => [
      { texto: String(idx + 1).padStart(2, '0'), align: 'center' },
      { texto: String(x.name || '—'), bold: true, sub: x.inmateName ? `PUP: ${String(x.inmateName)}` : undefined },
      { texto: String(x.cpf || '—'), align: 'center' },
      { texto: x.status === 'active' ? 'Ativo' : x.status === 'pending' ? 'Pendente' : 'Suspenso', align: 'center', bold: true, cor: x.status === 'active' ? VERDE : x.status === 'pending' ? AMBAR : VERMELHO },
      { texto: fmt(x.saldo), align: 'right', bold: true, cor: Number(x.saldo || 0) > 0 ? VERDE : CINZA },
      { texto: fmt(x.gastoSemanal), align: 'right', cor: AMBAR }
    ]),
    rodape: [
      { texto: `TOTAL · ${lista.length} familiares`, bold: true },
      { texto: '', align: 'left' },
      { texto: '', align: 'center' },
      { texto: '', align: 'center' },
      { texto: fmt(totalSaldo), align: 'right', bold: true, cor: VERDE },
      { texto: fmt(totalGasto), align: 'right', bold: true }
    ],
    vazio: 'Nenhum familiar cadastrado.'
  };
};

export const specRankingClientes = (report: any): SpecTabela | null => {
  const r = report?.rankingClientes;
  if (!r) return null;
  // drift: A4 usava "Ticket"/"%"; o preview "Ticket Médio"/"% do Total"
  // (mais explícitos, mantidos). Cores de posição vêm do A4.
  return {
    colunas: ['#', 'Cliente', 'CPF', 'Compras', 'Itens', 'Faturamento', 'Ticket Médio', '% do Total'],
    alinhamentos: ['center', 'left', 'center', 'center', 'center', 'right', 'right', 'right'],
    linhas: (r.linhas || []).map((l: any) => [
      { texto: String(l.pos), align: 'center', bold: true, cor: l.pos <= 3 ? AMBAR : CINZA },
      { texto: String(l.cliente), bold: true },
      { texto: l.cpf || '—', align: 'center' },
      { texto: String(l.compras), align: 'center' },
      { texto: String(l.itens), align: 'center' },
      { texto: fmt(l.total), align: 'right', bold: true, cor: VERDE },
      { texto: fmt(l.ticket), align: 'right' },
      { texto: `${Number(l.pct || 0).toFixed(1)}%`, align: 'right' }
    ]),
    rodape: [
      { texto: '', align: 'center' },
      { texto: `TOTAL · ${r.totalClientes} cliente(s)`, bold: true },
      { texto: '', align: 'center' },
      { texto: String(r.totalVendas), align: 'center', bold: true },
      { texto: '', align: 'center' },
      { texto: fmt(r.totalGeral), align: 'right', bold: true, cor: VERDE },
      { texto: '', align: 'right' },
      { texto: '100%', align: 'right', bold: true }
    ],
    vazio: 'Nenhuma venda neste período.'
  };
};

export const specVendasOperador = (report: any): SpecTabela | null => {
  const o = report?.vendasOperador;
  if (!o) return null;
  // drift: A4 mostrava "Ticket" e "%"; o preview não tinha Ticket e rotulava
  // "% do Total". Superset mantém a coluna Ticket e usa o rótulo do A4.
  return {
    colunas: ['#', 'Operador', 'Vendas', 'Itens', 'Faturamento', 'Ticket', '%'],
    alinhamentos: ['center', 'left', 'center', 'center', 'right', 'right', 'right'],
    linhas: (o.linhas || []).map((l: any) => [
      { texto: String(l.pos), align: 'center', bold: true, cor: l.pos === 1 ? AMBAR : CINZA },
      { texto: String(l.operador), bold: true },
      { texto: String(l.vendas), align: 'center' },
      { texto: String(l.itens), align: 'center' },
      { texto: fmt(l.total), align: 'right', bold: true, cor: VERDE },
      { texto: fmt(l.ticket), align: 'right' },
      { texto: `${Number(l.pct || 0).toFixed(1)}%`, align: 'right' }
    ]),
    rodape: [
      { texto: '', align: 'center' },
      { texto: `TOTAL · ${o.totalOperadores} operador(es)`, bold: true },
      { texto: String(o.totalVendas), align: 'center', bold: true },
      { texto: '', align: 'center' },
      { texto: fmt(o.totalGeral), align: 'right', bold: true, cor: VERDE },
      { texto: '', align: 'right' },
      { texto: '100%', align: 'right', bold: true }
    ],
    vazio: 'Nenhuma venda neste período.'
  };
};

export const specFiadoVendas = (report: any): SpecTabela | null => {
  const f = report?.fiadoVendas;
  if (!f) return null;
  const vendas = f.vendas || [];
  // drift: A4 deixava a coluna Status vazia; o preview mostrado o rótulo
  // colorido. Superset mantém o Status do preview.
  return {
    colunas: ['Data', 'Cliente', 'CPF', 'Forma', 'Status', 'Itens', 'Valor'],
    alinhamentos: ['left', 'left', 'center', 'center', 'center', 'left', 'right'],
    linhas: vendas.map((v: any) => [
      { texto: String(v.data) },
      { texto: String(v.cliente), bold: true },
      { texto: v.cpf || '—', align: 'center' },
      { texto: String(v.forma || ''), align: 'center' },
      { texto: rotuloStatus(v.status), align: 'center', bold: true, cor: corStatus(v.status) },
      { texto: v.items.map((i: any) => `${i.qtd}x ${i.nome}`).join(' · ') },
      { texto: fmt(v.total), align: 'right', bold: true, cor: AMBAR }
    ]),
    rodape: [
      { texto: `TOTAL · ${f.count} venda(s)`, bold: true },
      { texto: '', align: 'left' },
      { texto: '', align: 'center' },
      { texto: '', align: 'center' },
      { texto: '', align: 'center' },
      { texto: '', align: 'left' },
      { texto: fmt(f.total), align: 'right', bold: true, cor: AMBAR }
    ],
    vazio: 'Nenhuma venda fiada neste período.'
  };
};

export const specFiadoContas = (report: any): SpecTabela | null => {
  const c = report?.fiadoContas;
  if (!c) return null;
  const resumo = c.resumo || {};
  const statusCor = (st: string) => st === 'vencido' ? VERMELHO : st === 'vence_hoje' ? AMBAR : st === 'a_vencer' ? AZUL : CINZA;
  const statusLabel = (conta: any) => conta.status === 'vencido' ? `VENCIDO (${conta.diasAtraso}d)` : conta.status === 'vence_hoje' ? 'VENCE HOJE' : conta.status === 'a_vencer' ? 'A VENCER' : 'SEM VENCIMENTO';
  // drift: A4 mostrava Telefone; o preview mostrava Usado (% do limite).
  // Superset mantém as duas colunas.
  return {
    colunas: ['Cliente', 'CPF', 'Telefone', 'Dívida', 'Limite', 'Disponível', 'Usado', 'Início', 'Vencimento', 'Status'],
    alinhamentos: ['left', 'center', 'center', 'right', 'right', 'right', 'right', 'center', 'center', 'center'],
    linhas: (c.contas || []).map((conta: any) => [
      { texto: String(conta.nome), bold: true },
      { texto: conta.cpf || '—', align: 'center' },
      { texto: conta.telefone || '—', align: 'center' },
      { texto: fmt(conta.divida), align: 'right', bold: true, cor: AMBAR },
      { texto: fmt(conta.limite), align: 'right' },
      { texto: fmt(conta.disponivel), align: 'right' },
      { texto: `${conta.pctLimite}%`, align: 'right' },
      { texto: String(conta.debtStartedAt || '—'), align: 'center' },
      { texto: String(conta.debtDueAt || '—'), align: 'center' },
      { texto: statusLabel(conta), align: 'center', bold: true, cor: statusCor(conta.status) }
    ]),
    rodape: [
      { texto: `TOTAL · ${c.contas.length} conta(s)`, bold: true },
      { texto: '', align: 'center' },
      { texto: '', align: 'center' },
      { texto: fmt(resumo.totalDivida || 0), align: 'right', bold: true, cor: AMBAR },
      { texto: fmt(resumo.totalLimite || 0), align: 'right', bold: true },
      { texto: fmt(resumo.totalDisponivel || 0), align: 'right', bold: true },
      { texto: '', align: 'right' },
      { texto: '', align: 'center' },
      { texto: '', align: 'center' },
      { texto: '', align: 'center' }
    ],
    vazio: 'Nenhum débito de fiado em aberto.'
  };
};

export const specFiadoVencimentosFaixa = (faixa: any): SpecTabela | null => {
  if (!faixa) return null;
  const linhas: CelulaSpec[][] = (faixa.itens || []).map((i: any) => [
    { texto: String(i.nome), bold: true },
    { texto: fmt(i.divida), align: 'right', bold: true, cor: AMBAR },
    { texto: String(i.debtDueAt || '—'), align: 'center' },
    { texto: String(i.diasAtraso) + ' dia(s)', align: 'right' }
  ]);
  return {
    colunas: ['Cliente', 'Dívida', 'Vencimento', 'Dias'],
    alinhamentos: ['left', 'right', 'center', 'right'],
    linhas,
    rodape: [
      { texto: `SUBTOTAL · ${faixa.count} conta(s)`, bold: true },
      { texto: fmt(faixa.totalDivida), align: 'right', bold: true, cor: AMBAR },
      { texto: '', align: 'center' },
      { texto: '', align: 'right' }
    ],
    vazio: 'Nenhum item nesta faixa.'
  };
};
