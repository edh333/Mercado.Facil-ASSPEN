import { toDate } from './dateUtils';
import { ehReceita } from '../components/admin/adminUtils';

// ═══════════════════════════════════════════════════════════════════════════
// MÓDULO CONTÁBIL — MOTOR DE RELATÓRIOS FISCAIS (DRE / CSV / CURVA ABC)
// Alíquota estimada de impostos (Simples Nacional aproximado para consumo interno)
// ═══════════════════════════════════════════════════════════════════════════
export const ALIQUOTA_IMPOSTO_ESTIMADA = 0.07; // 7% — configuração fiscal estimada

const toDateContabil = (d: any): Date => {
  if (!d) return new Date(0);
  const dt = toDate(d);
  return dt || new Date(0);
};

const inRangeContabil = (d: any, startDate: string, endDate: string): boolean => {
  const dt = toDateContabil(d);
  const s = new Date((startDate || '') + 'T00:00:00');
  const e = new Date((endDate || '') + 'T23:59:59');
  return dt >= s && dt <= e;
};

export const sanitizarCpf = (cpf: string): string => {
  const digits = (cpf || '').replace(/\D/g, '');
  if (digits.length !== 11) return (cpf || 'SEM-CPF').toUpperCase();
  return `***.***.***-${digits.slice(7)}`;
};

export const formatarDataContabil = (d: any): string => {
  const dt = toDateContabil(d);
  if (isNaN(dt.getTime()) || dt.getTime() === 0) return '—';
  return dt.toLocaleDateString('pt-BR');
};

/**
 * 1) FECHAMENTO DE CAIXA MENSAL — DRE SIMPLIFICADO
 * Consolida o faturamento bruto, subtrai o custo de aquisição das mercadorias
 * (custos importados via NFe/XML — campo costPrice) e exibe o Lucro Líquido real.
 */
export const buildMonthlyDre = (orders: any[], expenses: any[], products: any[], startDate: string, endDate: string) => {
  const validOrders = (orders || []).filter(o =>
    ehReceita(o.status) &&
    inRangeContabil(o.date || o.createdAt, startDate, endDate)
  );
  const cancelledOrders = (orders || []).filter(o =>
    String(o.status || '').toUpperCase() === 'CANCELLED' &&
    inRangeContabil(o.date || o.createdAt, startDate, endDate)
  );

  const productMap = new Map((products || []).map(p => [String(p.id), p]));

  let receitaBruta = 0;
  let custoMercadoriasVendidas = 0;
  let qtdItensVendidos = 0;

  for (const o of validOrders) {
    const total = Math.abs(Number(o.total) || 0);
    receitaBruta += total;
    for (const it of (o.items || [])) {
      const qtd = Number(it.quantity) || 0;
      const prod = productMap.get(String(it.productId));
      const custoUnitario = Number(prod?.costPrice || 0);
      custoMercadoriasVendidas += qtd * custoUnitario;
      qtdItensVendidos += qtd;
    }
  }

  const despesasOperacionais = (expenses || [])
    .filter(e => !e.deleted && inRangeContabil(e.date, startDate, endDate))
    .reduce((s, e) => s + (Math.abs(Number(e.amount)) || 0), 0);

  const impostosEstimados = receitaBruta * ALIQUOTA_IMPOSTO_ESTIMADA;
  const lucroBruto = receitaBruta - custoMercadoriasVendidas;
  const lucroLiquido = lucroBruto - despesasOperacionais - impostosEstimados;

  return {
    receitaBruta,
    custoMercadoriasVendidas,
    impostosEstimados,
    aliquotaImposto: ALIQUOTA_IMPOSTO_ESTIMADA,
    despesasOperacionais,
    lucroBruto,
    lucroLiquido,
    qtdPedidos: validOrders.length,
    qtdPedidosCancelados: cancelledOrders.length,
    qtdItensVendidos,
    ticketMedio: validOrders.length > 0 ? receitaBruta / validOrders.length : 0
  };
};

/**
 * 2) ARQUIVO DE MOVIMENTAÇÃO DE VENDAS (CSV/EXCEL PARA CONTADOR)
 * Data, Número do Cupom, CPF do Cliente (sanitizado), Forma de Pagamento,
 * Alíquota/Imposto Estimado e Valor Total.
 */
export const buildSalesCsv = (orders: any[], users: any[], startDate: string, endDate: string) => {
  const userMap = new Map((users || []).map(u => [String(u.id), u]));
  const cabecalho = ['DATA', 'NUMERO_CUPOM', 'CPF_CLIENTE', 'FORMA_PAGAMENTO', 'ALIQUOTA_ESTIMADA(%)', 'IMPOSTO_ESTIMADO', 'VALOR_TOTAL'];

  const linhas = (orders || [])
    .filter(o => ehReceita(o.status) && inRangeContabil(o.date || o.createdAt, startDate, endDate))
    .map(o => {
      const u = userMap.get(String(o.userId));
      const cpf = sanitizarCpf(u?.cpf || o.userCpf || '');
      const total = Math.abs(Number(o.total) || 0);
      return {
        DATA: formatarDataContabil(o.date || o.createdAt),
        NUMERO_CUPOM: `#${String(o.id || '').slice(-8).toUpperCase()}`,
        CPF_CLIENTE: cpf,
        FORMA_PAGAMENTO: (o.paymentMethod || 'PIX').toUpperCase(),
        'ALIQUOTA_ESTIMADA(%)': (ALIQUOTA_IMPOSTO_ESTIMADA * 100).toFixed(2),
        IMPOSTO_ESTIMADO: (total * ALIQUOTA_IMPOSTO_ESTIMADA).toFixed(2),
        VALOR_TOTAL: total.toFixed(2)
      };
    });

  const totalVendas = linhas.reduce((s, l) => s + (parseFloat(String(l.VALOR_TOTAL)) || 0), 0);
  const totalImpostos = linhas.reduce((s, l) => s + (parseFloat(String(l.IMPOSTO_ESTIMADO)) || 0), 0);

  const linhasCSV = [cabecalho, ...linhas.map(l => cabecalho.map(c => String(l[c]).replace(/;/g, ' ')))];
  // BOM UTF-8 para o Excel reconhecer acentuação; separador ';' padrão pt-BR
  const csv = '\uFEFF' + linhasCSV.map(row => row.join(';')).join('\r\n');

  return { cabecalho, linhas, csv, totalVendas, totalImpostos };
};

/**
 * 3) RELATÓRIO DE CURVA ABC DE ESTOQUE
 * Produtos de maior giro (receita) classificados A/B/C por acumulado %.
 * Inclui o valor totalizado do inventário parado (nunca vendido) para balanço patrimonial.
 */
export const buildStockAbc = (products: any[], orders: any[], startDate: string, endDate: string) => {
  const validOrders = (orders || []).filter(o =>
    ehReceita(o.status) &&
    inRangeContabil(o.date || o.createdAt, startDate, endDate)
  );

  const giroMap = new Map<string, { qtd: number; receita: number }>();
  for (const o of validOrders) {
    for (const it of (o.items || [])) {
      const pid = String(it.productId);
      const qtd = Number(it.quantity) || 0;
      const atual = giroMap.get(pid) || { qtd: 0, receita: 0 };
      atual.qtd += qtd;
      atual.receita += qtd * (Number(it.priceAtPurchase || it.price) || 0);
      giroMap.set(pid, atual);
    }
  }

  const linhas = (products || []).map(p => {
    const giro = giroMap.get(String(p.id)) || { qtd: 0, receita: 0 };
    const estoque = Math.max(0, Number(p.stock) || 0);
    const custoUnitario = Math.max(0, Number(p.costPrice) || 0);
    return {
      id: String(p.id),
      name: p.name || 'Produto',
      qtdVendida: giro.qtd,
      receita: giro.receita,
      estoque,
      valorEstoqueCusto: estoque * custoUnitario,
      valorEstoquePreco: estoque * (Math.max(0, Number(p.price) || 0))
    };
  }).sort((a, b) => b.receita - a.receita);

  const totalReceita = linhas.reduce((s, l) => s + l.receita, 0);
  let acumulado = 0;

  const linhasClassificadas = linhas.map(l => {
    acumulado += l.receita;
    const acumuladoPct = totalReceita > 0 ? (acumulado / totalReceita) * 100 : 0;
    const pctIndividual = totalReceita > 0 ? (l.receita / totalReceita) * 100 : 0;
    let classe = 'C';
    if (acumuladoPct <= 80) classe = 'A';
    else if (acumuladoPct <= 95) classe = 'B';
    return { ...l, pctIndividual, acumuladoPct, classe };
  });

  const produtosParados = linhasClassificadas.filter(l => l.qtdVendida === 0);
  const produtosGiroAlto = linhasClassificadas.filter(l => l.classe === 'A');

  return {
    linhas: linhasClassificadas,
    totalReceita,
    totalValorEstoqueCusto: linhas.reduce((s, l) => s + l.valorEstoqueCusto, 0),
    totalValorEstoquePreco: linhas.reduce((s, l) => s + l.valorEstoquePreco, 0),
    valorEstoqueParado: produtosParados.reduce((s, l) => s + l.valorEstoqueCusto, 0),
    qtdProdutosParados: produtosParados.length,
    qtdProdutosGiroAlto: produtosGiroAlto.length,
    qtdProdutosTotais: linhas.length
  };
};

/**
 * 4.5) RELATÓRIO TOP PRODUTOS — RANKING POR ITEM VENDIDO
 * Ranking dos produtos mais vendidos (em quantidade de itens) dentro do período,
 * com receita gerada, participação % e preço médio. Reflete o giro real do item,
 * vindo dos itens dos pedidos (o mesmo insumo da Curva ABC, só que ranqueado
 * por qtd vendida ao invés de por receita).
 * Retorna linhas ordenadas por qtdVendida desc (desempate: receita desc).
 */
export const buildTopProducts = (products: any[], orders: any[], startDate: string, endDate: string) => {
  const validOrders = (orders || [])
    .filter(o => ehReceita(o.status) &&
      inRangeContabil(o.date || o.createdAt, startDate, endDate));

  const giroMap = new Map<string, { qtd: number; receita: number }>();
  for (const o of validOrders) {
    for (const it of (o.items || [])) {
      const pid = String(it.productId);
      const qtd = Number(it.quantity) || 0;
      const atual = giroMap.get(pid) || { qtd: 0, receita: 0 };
      atual.qtd += qtd;
      atual.receita += qtd * (Number(it.price || it.priceAtPurchase) || 0);
      giroMap.set(pid, atual);
    }
  }

  const linhas = (products || [])
    .map((p: any) => {
      const giro = giroMap.get(String(p.id)) || { qtd: 0, receita: 0 };
      return {
        id: String(p.id),
        name: p.name || 'Produto',
        categoria: String(p.category || 'DIVERSOS').toUpperCase(),
        qtdVendida: giro.qtd,
        receita: giro.receita,
        precoMedio: giro.qtd > 0 ? giro.receita / giro.qtd : 0
      };
    })
    .filter(l => l.qtdVendida > 0)
    .sort((a, b) => b.qtdVendida - a.qtdVendida || b.receita - a.receita);

    const totalItens = linhas.reduce((s, l) => s + l.qtdVendida, 0);
    const totalReceita = linhas.reduce((s, l) => s + l.receita, 0);

    return {
        linhas,
    totalItens,
    totalReceita,
    totalProdutos: linhas.length
  };
};

/**
 * 4) RELATÓRIO DE VENDAS DIÁRIAS — detalhado, por dia do período
 * consolida, por data, nº de vendas, itens vendidos, faturamento e ticket médio.
 */
export const buildDailySales = (orders: any[], startDate: string, endDate: string) => {
  const validOrders = (orders || [])
    .filter(o => ehReceita(o.status) && inRangeContabil(o.date || o.createdAt, startDate, endDate));

  const porDia = new Map<string, { data: string; vendas: number; total: number; items: number }>();
  let totalGeral = 0;
  let totalItens = 0;

  for (const o of validOrders) {
    const d = toDateContabil(o.date || o.createdAt);
    if (isNaN(d.getTime())) continue;
    const chave = d.toLocaleDateString('pt-BR');
    const atual = porDia.get(chave) || { data: chave, vendas: 0, total: 0, items: 0 };
    atual.vendas += 1;
    const valor = Math.abs(Number(o.total) || 0);
    atual.total += valor;
    const qtdItens = (o.items || []).reduce((s: number, it: any) => s + (Number(it.quantity) || 0), 0);
    atual.items += qtdItens;
    porDia.set(chave, atual);
    totalGeral += valor;
    totalItens += qtdItens;
  }

  const dias = Array.from(porDia.values()).sort((a, b) => {
    const [da, db2] = [a.data.split('/'), b.data.split('/')];
    return new Date(Number(da[2]), Number(da[1]) - 1, Number(da[0])).getTime() - new Date(Number(db2[2]), Number(db2[1]) - 1, Number(db2[0])).getTime();
  });

  return {
    dias,
    totalVendas: validOrders.length,
    totalGeral,
    totalItens,
    ticketMedio: validOrders.length > 0 ? totalGeral / validOrders.length : 0
  };
};

/**
 * 5) RELATÓRIO DE VENDAS POR GRUPO (categoria) — receita e quantidade por grupo.
 */
export const buildSalesByCategory = (orders: any[], products: any[], startDate: string, endDate: string) => {
  const productMap = new Map((products || []).map(p => [String(p.id), p]));
  const validOrders = (orders || [])
    .filter(o => ehReceita(o.status) && inRangeContabil(o.date || o.createdAt, startDate, endDate));

  const grupos = new Map<string, { categoria: string; quantidade: number; receita: number }>();
  for (const o of validOrders) {
    for (const it of (o.items || [])) {
      const prod = productMap.get(String(it.productId));
      const categoria = ((prod?.category as string) || (o.category as string) || 'DIVERSOS').toUpperCase();
      const qtd = Number(it.quantity) || 0;
      const atual = grupos.get(categoria) || { categoria, quantidade: 0, receita: 0 };
      atual.quantidade += qtd;
      atual.receita += qtd * (Number(it.priceAtPurchase || it.price) || 0);
      grupos.set(categoria, atual);
    }
  }

  const linhas = Array.from(grupos.values()).sort((a, b) => b.receita - a.receita);
  const totalReceita = linhas.reduce((s, l) => s + l.receita, 0);
  const totalQuantidade = linhas.reduce((s, l) => s + l.quantidade, 0);

  return { linhas, totalReceita, totalQuantidade, qtdPedidos: validOrders.length };
};

/**
 * 6) RELATÓRIO DE ESTOQUE BAIXO / INVENTÁRIO — itens críticos e zerados.
 */
export const buildLowStock = (products: any[], startDate: string, endDate: string) => {
  const linhas = (products || [])
    .map(p => {
      const estoque = Math.max(0, Number(p.stock) || 0);
      const minimo = Math.max(0, Number(p.minStock ?? (estoque > 0 ? 5 : 0)) || 0);
      const critico = estoque <= minimo;
      return {
        id: String(p.id),
        name: p.name || 'Produto',
        barcode: p.barcode || '',
        category: p.category || 'Geral',
        estoque,
        minimo,
        critico,
        semEstoque: estoque <= 0,
        valorEstoque: estoque * (Math.max(0, Number(p.costPrice) || 0)),
        preco: Number(p.price) || 0
      };
    })
    .filter(p => p.critico)
    .sort((a, b) => a.estoque - b.estoque);

  const totalCriticos = linhas.length;
  const totalZerados = linhas.filter(l => l.semEstoque).length;
  const totalValorEstoque = linhas.reduce((s, l) => s + l.valorEstoque, 0);

  return { linhas, totalCriticos, totalZerados, totalValorEstoque };
};

/**
 * 7) CATÁLOGO DE PRODUTOS — lista completa com preço, estoque e categoria.
 */
export const buildProductsCatalog = (products: any[]) => {
  const linhas = (products || [])
    .map(p => ({
      id: String(p.id),
      name: p.name || 'Produto',
      barcode: p.barcode || '',
      category: p.category || 'Geral',
      preco: Number(p.price) || 0,
      custo: Number(p.costPrice) || 0,
      estoque: Math.max(0, Number(p.stock) || 0),
      disponivel: p.available !== false
    }))
    .sort((a, b) => (a.category || '').localeCompare(b.category || '') || (a.name || '').localeCompare(b.name || ''));

  const totalProdutos = linhas.length;
  const totalEstoque = linhas.reduce((s, l) => s + l.estoque, 0);
  const totalValorEstoque = linhas.reduce((s, l) => s + l.estoque * l.preco, 0);

  return { linhas, totalProdutos, totalEstoque, totalValorEstoque };
};

/**
 * 8) EXTRATO INDIVIDUAL — movimentações (entradas/saídas) de UM familiar no período,
 * incluindo compras na carteira, depósitos aprovados e estornos.
 */
export const buildExtratoIndividual = (user: any, orders: any[], transactions: any[], startDate: string, endDate: string) => {
  if (!user) return null;

  const movs: { date: any; type: 'ENTRY' | 'EXIT'; description: string; amount: number; doc: string }[] = [];

  (orders || [])
    .filter(o => String(o.userId) === String(user.id) && inRangeContabil(o.date || o.createdAt, startDate, endDate))
    .forEach(o => {
      const total = Math.abs(Number(o.total) || 0);
      const status = String(o.status || '').toUpperCase();
      const cancelado = ['CANCELLED', 'REFUNDED', 'DEVOLVIDO', 'REEMBOLSADO', 'ESTORNADO'].includes(status);
      movs.push({
        date: o.date || o.createdAt,
        type: cancelado ? 'ENTRY' : 'EXIT',
        description: cancelado
          ? `Estorno/Devolução #${String(o.id).slice(0, 6)}`
          : `Compra #${String(o.id).slice(0, 6)} (${o.paymentMethod || 'PIX'})`,
        amount: total,
        doc: String(o.id || '')
      });
    });

  (transactions || [])
    .filter((tx: any) => tx.type === 'deposit' && tx.status === 'approved' && String(tx.userId) === String(user.id) && inRangeContabil(tx.createdAt || tx.date, startDate, endDate))
    .forEach((tx: any) => {
      movs.push({
        date: tx.createdAt || tx.date,
        type: 'ENTRY',
        description: 'Depósito aprovado',
        amount: Number(tx.amount) || 0,
        doc: String(tx.id || '')
      });
    });

  movs.sort((a, b) => (toDateContabil(b.date)?.getTime() || 0) - (toDateContabil(a.date)?.getTime() || 0));

  const totalEntradas = movs.filter(m => m.type === 'ENTRY').reduce((s, m) => s + m.amount, 0);
  const totalSaidas = movs.filter(m => m.type === 'EXIT').reduce((s, m) => s + m.amount, 0);

  return {
    usuario: {
      id: user.id,
      name: user.name || 'Usuário',
      cpf: user.cpf || '',
      inmateName: user.inmateName || user.prisonerName || '',
      saldoAtual: Number(user.walletBalance) || 0
    },
    movs,
    totalEntradas,
    totalSaidas,
    saldoPeriodo: totalEntradas - totalSaidas
  };
};

/**
 * 9) CONTAS A RECEBER — FIADO
 * Lista todos os usuários com currentDebt > 0, com detalhes de dívida,
 * limite, data de início, vencimento e status.
 */
export const buildContasReceberFiado = (users: any[]) => {
  const now = new Date();
  const contas = (users || [])
    .filter(u => Number(u.currentDebt || 0) > 0)
    .map(u => {
      const divida = Number(u.currentDebt || 0);
      const limite = Number(u.creditLimit || 0);
      const debtStartedAt = u.debtStartedAt ? toDateContabil(u.debtStartedAt) : null;
      const debtDueAt = u.debtDueAt ? toDateContabil(u.debtDueAt) : null;
      const diasAtraso = debtDueAt ? Math.ceil((now.getTime() - debtDueAt.getTime()) / (1000 * 60 * 60 * 24)) : 0;
      const vencido = debtDueAt && debtDueAt < now;
      const venceHoje = debtDueAt && debtDueAt.toDateString() === now.toDateString();
      const venceEmDias = debtDueAt ? Math.ceil((debtDueAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null;

      let status: 'vencido' | 'vence_hoje' | 'a_vencer' | 'sem_vencimento' = 'sem_vencimento';
      if (vencido) status = 'vencido';
      else if (venceHoje) status = 'vence_hoje';
      else if (debtDueAt) status = 'a_vencer';

      return {
        usuarioId: u.id,
        nome: u.name || u.inmateName || u.nome || 'Usuário',
        cpf: sanitizarCpf(u.cpf || ''),
        telefone: u.phone || u.telefone || '',
        divida,
        limite,
        disponivel: Math.max(0, limite - divida),
        pctLimite: limite > 0 ? Math.round((divida / limite) * 100) : 0,
        debtStartedAt: debtStartedAt ? formatarDataContabil(debtStartedAt) : '—',
        debtDueAt: debtDueAt ? formatarDataContabil(debtDueAt) : '—',
        diasAtraso: Math.max(0, diasAtraso),
        status,
        venceEmDias,
        allowCredit: u.allowCredit || u.autorizacaoExcepcional,
        blocked: String(u.status || '').toLowerCase() === 'blocked',
      };
    })
    .sort((a, b) => {
      // Ordenar: vencidos primeiro, depois vence hoje, depois a vencer, depois sem vencimento
      const order = { vencido: 0, vence_hoje: 1, a_vencer: 2, sem_vencimento: 3 };
      if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
      return b.divida - a.divida;
    });

  const totalDivida = contas.reduce((s, c) => s + c.divida, 0);
  const totalLimite = contas.reduce((s, c) => s + c.limite, 0);
  const vencidos = contas.filter(c => c.status === 'vencido').length;
  const vencemHoje = contas.filter(c => c.status === 'vence_hoje').length;

  return {
    contas,
    resumo: {
      totalClientes: contas.length,
      totalDivida,
      totalLimite,
      totalDisponivel: totalLimite - totalDivida,
      vencidos,
      vencemHoje,
    }
  };
};

/**
 * 10) VENCIMENTOS DE FIADO — Agrupados por faixa de dias
 * Para visão rápida do que vence esta semana, este mês, etc.
 */
export const buildFiadoVencimentos = (users: any[]) => {
  const now = new Date();
  const faixas = [
    { label: 'Vencidos', min: -Infinity, max: -1, color: 'red' },
    { label: 'Vence hoje', min: 0, max: 0, color: 'amber' },
    { label: '1 a 7 dias', min: 1, max: 7, color: 'amber' },
    { label: '8 a 15 dias', min: 8, max: 15, color: 'blue' },
    { label: '16 a 30 dias', min: 16, max: 30, color: 'blue' },
    { label: '31 a 60 dias', min: 31, max: 60, color: 'green' },
    { label: '60+ dias / Sem vencimento', min: 61, max: Infinity, color: 'green' },
  ];

  const usuariosComDivida = (users || []).filter(u => Number(u.currentDebt || 0) > 0);

  const agrupado = faixas.map(faixa => {
    const itens = usuariosComDivida
      .filter(u => {
        const due = u.debtDueAt ? toDateContabil(u.debtDueAt) : null;
        if (!due) return faixa.label === '60+ dias / Sem vencimento';
        const dias = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        return dias >= faixa.min && dias <= faixa.max;
      })
      .map(u => {
        const due = u.debtDueAt ? toDateContabil(u.debtDueAt) : null;
        return {
          usuarioId: u.id,
          nome: u.name || u.inmateName || u.nome || 'Usuário',
          divida: Number(u.currentDebt || 0),
          debtDueAt: u.debtDueAt ? formatarDataContabil(u.debtDueAt) : '—',
          diasAtraso: due ? Math.ceil((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24)) : 0,
        };
      });

    return {
      faixa: faixa.label,
      color: faixa.color,
      count: itens.length,
      totalDivida: itens.reduce((s, i) => s + i.divida, 0),
      itens,
    };
  });

  return { faixas: agrupado };
};

/**
 * 11) VENDAS FIADO NO PERÍODO
 * Lista todas as vendas com paymentMethod FIADO ou FIADO_30 no período.
 */
export const buildFiadoVendas = (orders: any[], startDate: string, endDate: string) => {
  const vendas = (orders || [])
    .filter(o => {
      const pm = String(o.paymentMethod || '').toUpperCase();
      return (pm === 'FIADO' || pm === 'FIADO_30') &&
        inRangeContabil(o.date || o.createdAt, startDate, endDate);
    })
    .map(o => ({
      id: o.id,
      data: formatarDataContabil(o.date || o.createdAt),
      cliente: o.userName || o.inmateName || 'Consumidor',
      cpf: sanitizarCpf(o.userCpf || o.inmateCpf || ''),
      total: Number(o.total) || 0,
      forma: o.paymentMethod,
      status: o.status,
      items: (o.items || []).map((i: any) => ({
        nome: i.name || i.productName || 'Item',
        qtd: Number(i.quantity) || 1,
        preco: Number(i.priceAtPurchase || i.price) || 0,
      })),
    }))
    .sort((a, b) => (toDateContabil(b.data)?.getTime() || 0) - (toDateContabil(a.data)?.getTime() || 0));

  const total = vendas.reduce((s, v) => s + v.total, 0);
  const count = vendas.length;

  return { vendas, total, count };
};