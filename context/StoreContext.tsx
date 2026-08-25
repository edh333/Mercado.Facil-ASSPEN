import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, ReactNode, useRef } from 'react';
import { User, Product, Order, PrisonUnit, UserRole, CartItem, OrderStatus, AppConfig, Supplier, Expense, AuditLog, InmateLocation, SystemMessage, ThemeOption, Message, Notification, WalletTransaction, toUserRole } from '../types';
import { cleanProductName, normalizeName, stringSimilarity, compressImageFile, fileToBase64, formatarMoeda, getNetworkTime } from '../utils';
import { listarVendasOffline, salvarVendaOffline, removerVendaOffline, marcarErroVendaOffline, VendaOffline } from '../utils/offlineQueue';
import { queuePendingUpload, listPendingUploads, removePendingUpload, attachPendingUploadDoc } from '../services/localStorageService';
import { comprimirImagem } from '../utils/imageCompress';
import { ASSPEN_INFO, INITIAL_UNITS } from '../constants';
import { db, auth, storage } from '../firebase';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import bcrypt from 'bcryptjs';

const functions = getFunctions();
const fnBuscarLoginInfo = httpsCallable(functions, 'buscarLoginInfo');
const fnRegistrarUsuario = httpsCallable(functions, 'registrarUsuario');
const fnCriarPrimeiroAdmin = httpsCallable(functions, 'criarPrimeiroAdmin');
const fnCriarAdmin = httpsCallable(functions, 'criarAdmin');
  const fnAtualizarPermissoesAdmin = httpsCallable(functions, 'atualizarPermissoesAdmin');
const fnAlterarSenha = httpsCallable(functions, 'alterarSenha');
const fnRedefinirSenhaAdmin = httpsCallable(functions, 'redefinirSenhaAdmin');
const fnRedefinirSenhaPublica = httpsCallable(functions, 'redefinirSenhaPublica');
const fnAprovarDeposito = httpsCallable(functions, 'aprovarDeposito');
const fnRejeitarDeposito = httpsCallable(functions, 'rejeitarDeposito');
const fnCreditarSaldo = httpsCallable(functions, 'creditarSaldo');
const fnSacarSaldoAdmin = httpsCallable(functions, 'sacarSaldoAdmin');
const fnSacarSaldoProprio = httpsCallable(functions, 'sacarSaldoProprio');
const fnComprarComCarteira = httpsCallable(functions, 'comprarComCarteira');
const fnRegistrarPedidoPix = httpsCallable(functions, 'registrarPedidoPix');
const fnAprovarPedidoPix = httpsCallable(functions, 'aprovarPedidoPix');
const fnProcessarVendaAdmin = httpsCallable(functions, 'processarVendaAdmin');
const fnEstornarVenda = httpsCallable(functions, 'estornarVenda');
const fnValidarSenhaMestra = httpsCallable(functions, 'validarSenhaMestra');
const fnDefinirSenhaMestra = httpsCallable(functions, 'definirSenhaMestra');
const fnResetarSistemaTotal = httpsCallable(functions, 'resetarSistemaTotal');
const fnListarBackups = httpsCallable(functions, 'listarBackups');
const fnBaixarBackup = httpsCallable(functions, 'baixarBackup');

// Interface para dados da nota fiscal
export interface InvoiceData {
  supplier?: { name: string; cnpj: string; };
  items: {
    name: string;
    costPrice: number;
    quantity: number;
    category: string;
    description: string;
    ean?: string;
    barcode?: string;
    brand?: string;
  }[];
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// MÃ“DULO CONTÃBIL â€” MOTOR DE RELATÃ“RIOS FISCAIS (DRE / CSV / CURVA ABC)
// AlÃ­quota estimada de impostos (Simples Nacional aproximado para consumo interno)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
export const ALIQUOTA_IMPOSTO_ESTIMADA = 0.07; // 7% â€” configuraÃ§Ã£o fiscal estimada

const toDateContabil = (d: any): Date => {
  if (!d) return new Date(0);
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? new Date(0) : dt;
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
  return isNaN(dt.getTime()) ? 'â€”' : dt.toLocaleDateString('pt-BR');
};

/**
 * 1) FECHAMENTO DE CAIXA MENSAL â€” DRE SIMPLIFICADO
 * Consolida o faturamento bruto, subtrai o custo de aquisiÃ§Ã£o das mercadorias
 * (custos importados via NFe/XML â€” campo costPrice) e exibe o Lucro LÃ­quido real.
 */
export const buildMonthlyDre = (orders: any[], expenses: any[], products: any[], startDate: string, endDate: string) => {
  const validOrders = (orders || []).filter(o =>
    String(o.status || '').toUpperCase() !== 'CANCELLED' &&
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
 * 2) ARQUIVO DE MOVIMENTAÃ‡ÃƒO DE VENDAS (CSV/EXCEL PARA CONTADOR)
 * Data, NÃºmero do Cupom, CPF do Cliente (sanitizado), Forma de Pagamento,
 * AlÃ­quota/Imposto Estimado e Valor Total.
 */
export const buildSalesCsv = (orders: any[], users: any[], startDate: string, endDate: string) => {
  const userMap = new Map((users || []).map(u => [String(u.id), u]));
  const cabecalho = ['DATA', 'NUMERO_CUPOM', 'CPF_CLIENTE', 'FORMA_PAGAMENTO', 'ALIQUOTA_ESTIMADA(%)', 'IMPOSTO_ESTIMADO', 'VALOR_TOTAL'];

  const linhas = (orders || [])
    .filter(o => String(o.status || '').toUpperCase() !== 'CANCELLED' && inRangeContabil(o.date || o.createdAt, startDate, endDate))
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
  // BOM UTF-8 para o Excel reconhecer acentuaÃ§Ã£o; separador ';' padrÃ£o pt-BR
  const csv = '\uFEFF' + linhasCSV.map(row => row.join(';')).join('\r\n');

  return { cabecalho, linhas, csv, totalVendas, totalImpostos };
};

/**
 * 3) RELATÃ“RIO DE CURVA ABC DE ESTOQUE
 * Produtos de maior giro (receita) classificados A/B/C por acumulado %.
 * Inclui o valor totalizado do inventÃ¡rio parado (nunca vendido) para balanÃ§o patrimonial.
 */
export const buildStockAbc = (products: any[], orders: any[], startDate: string, endDate: string) => {
  const validOrders = (orders || []).filter(o =>
    String(o.status || '').toUpperCase() !== 'CANCELLED' &&
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

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// PARSER DE NOTA FISCAL ELETRÃ”NICA (NFe XML)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Tolerante a namespaces (notas emitidas com prefixos nfe:/NFe: etc. usam
// getElementsByTagName, que casa pelo nome local ignorando prefixos), com
// fallbacks de quantidade/preÃ§o (vUnCom â†’ vProd/qCom â†’ vUnTrib) e validaÃ§Ã£o
// de GTIN/EAN â€” o cÃ³digo de barras sai pronto para o leitor do PDV.
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const tagPorNome = (el: Document | Element, nome: string): Element | null => {
  const encontrados = el.getElementsByTagName(nome);
  return encontrados && encontrados.length > 0 ? encontrados[0] : null;
};
const textoDe = (el: Document | Element, nome: string): string =>
  (tagPorNome(el, nome)?.textContent || '').replace(/\u00A0/g, ' ').trim();
const numeroNfe = (el: Document | Element, nome: string): number => {
  // âš  CORREÃ‡ÃƒO CRÃTICA: o layout oficial da NFe usa SEMPRE ponto como
  // separador decimal ("<vUnCom>4.99</vUnCom>" = R$ 4,99). O parser antigo
  // removia os pontos como se fossem milhar â†’ preÃ§os 100x mais altos
  // (R$ 4,99 virava R$ 499,00) e quantidades explodidas ("2.0000" â†’ 20000).
  // Agora: sÃ³ ponto â†’ decimal direto (padrÃ£o NFe); sÃ³ vÃ­rgula â†’ BR;
  // os dois â†’ o ÃšLTIMO separador Ã© o decimal (convenÃ§Ã£o universal).
  let s = textoDe(el, nome).replace(/\s/g, '');
  if (!s) return NaN;
  const temVirgula = s.includes(',');
  const temPonto = s.includes('.');
  if (temVirgula && temPonto) {
    s = s.lastIndexOf(',') > s.lastIndexOf('.')
      ? s.replace(/\./g, '').replace(/,/g, '.')
      : s.replace(/,/g, '');
  } else if (temVirgula) {
    s = s.replace(/\./g, '').replace(/,/g, '.');
  }
  const n = parseFloat(s);
  return isNaN(n) ? NaN : n;
};
const ehGtin = (v: string): boolean => /^\d{8,14}$/.test(v);

const parseInvoiceXML = (xml: string): InvoiceData | null => {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'text/xml');

    if (doc.querySelector('parsererror')) {
      console.error('Erro ao analisar XML');
      return null;
    }

    const result: InvoiceData = { items: [] };

    // Extrair fornecedor (emitente) â€” caminhos NFe e NFeProc (autorizaÃ§Ã£o)
    const emit = tagPorNome(doc, 'emit');
    if (emit) {
      const nome = textoDe(emit, 'xNome');
      const cnpj = textoDe(emit, 'CNPJ') || textoDe(emit, 'CPF');
      result.supplier = { name: nome, cnpj };
    }

    // Extrair itens (produtos) â€” namespace-safe
    const products = doc.getElementsByTagName('det');
    for (let i = 0; i < products.length; i++) {
      const prodElement = tagPorNome(products[i], 'prod');
      if (!prodElement) continue;

      const name = textoDe(prodElement, 'xProd');
      if (!name) continue;

      const ean = textoDe(prodElement, 'cEAN') || textoDe(prodElement, 'cEANTrib') || '';
      const eanValido = ehGtin(ean);
      const code = textoDe(prodElement, 'cProd') || '';
      const ncm = textoDe(prodElement, 'NCM');
      const unidade = textoDe(prodElement, 'uCom') || textoDe(prodElement, 'uTrib') || 'UN';

      // Marca: lista conhecida ou primeira palavra em maiÃºsculas
      let brand = '';
      const brandList = [
        'ALBA', 'AVIANCA', 'BIC', 'LOREAL', 'NESTLE', 'NESTLÃ‰', 'DANONE', 'AMBEV', 'HEINEKEN', 'COCA COLA', 'COCA-COLA', 'PEPSI',
        'SKOL', 'BRASEIRO', 'PERNAMBUCANAS', 'HAVAN', 'SAMSUNG', 'LG', 'PHILCO', 'ELECTROLUX', 'BRASTEMP', 'CONSUL', 'XIAOMI',
        'MOTOROLA', 'APPLE', 'POSITIVO', 'MULTILASER', 'ARNO', 'MONDIAL', 'PARATI', 'MARILAN', 'UNILEVER', 'P&G', 'BRF', 'JBS',
        'AURORA', 'MINUANO', 'SADIA', 'PERDIGAO', 'PERDIGÃƒO', 'SEARA', 'KIMBERLY', 'COLGATE', 'PALMOLIVE', 'NIVEA', 'JOHNSON',
        'OAKLEY', 'NIKE', 'ADIDAS', 'PUMA', 'FILA', 'ASICS', 'MIZUNO', 'KAPPA', 'UMBRO', 'PENALTY', 'TOPPER', 'LUPO', 'TRIFIL',
        'HERING', 'MALWEE', 'MARISA', 'C&A', 'REACHUELO', 'RENNER', 'ZARA', 'LEVIS', 'DIESEL', 'CALVIN KLEIN', 'GUESS',
        'TOMMY HILFIGER', 'LACOSTE', 'HUGO BOSS', 'ARMANI', 'ROLEX', 'PANDORA', 'VIVARA', 'CHILLI BEANS', 'RAY-BAN',
        'NATURA', 'AVON', 'BOTICARIO', 'EUDORA', 'JEQUITI', 'PAMPERS', 'HUGGIES', 'TURMA DA MONICA', 'RENOVE', 'VEJA',
        'OMOR', 'IPÃŠ', 'LIMPOL', 'YPÃŠ', 'MINUANO', 'BOMBRIL', 'TIXAN', 'ARIEL', 'BRILHANTE', 'SUFRESH', 'TANG', 'MID',
        'CAMP', 'VALLE', 'KAPO', 'MAGUARY', 'GAROTO', 'LACTA', 'HERSHEY', 'ARCOR', 'M&M', 'FINI', 'DOCILE'
      ];
      const brandRegex = new RegExp(`(?:^|\\s)(${brandList.join('|')})(?:\\s|$)`, 'i');
      const brandMatch = name.match(brandRegex);
      if (brandMatch?.[1]) {
        brand = brandMatch[1].trim().toUpperCase();
      } else {
        const words = name.split(' ');
        if (words[0] && words[0].length > 2 && words[0] === words[0].toUpperCase() && !/^\d+$/.test(words[0]) && !['COM', 'PARA', 'SEM', 'PROD', 'KIT'].includes(words[0])) {
          brand = words[0];
        }
      }

      // Quantidade e preÃ§o com fallbacks: vUnCom â†’ vProd/qCom â†’ vUnTrib
      let quantity = numeroNfe(prodElement, 'qCom');
      if (isNaN(quantity) || quantity <= 0) quantity = numeroNfe(prodElement, 'qTrib');
      if (isNaN(quantity) || quantity <= 0) quantity = 1;

      let costPrice = numeroNfe(prodElement, 'vUnCom');
      if (isNaN(costPrice) || costPrice <= 0) {
        const qtdRef = numeroNfe(prodElement, 'qCom') || quantity;
        const vProd = numeroNfe(prodElement, 'vProd');
        if (!isNaN(vProd) && qtdRef > 0) costPrice = vProd / qtdRef;
        else costPrice = numeroNfe(prodElement, 'vUnTrib');
      }
      if (isNaN(costPrice) || costPrice < 0) costPrice = 0;

      // SANITY: preÃ§o plausÃ­vel de supermercado (R$ 0,01 a R$ 100.000 por unidade).
      // NFe corrompida ("vUnCom=78.434.600.000") â†’ tenta vProd/qCom e vUnTrib;
      // se continuar absurdo, zera para o operador ajustar o preÃ§o na tela.
      const PRECO_PLAUSIVEL = 100000;
      if (costPrice > PRECO_PLAUSIVEL) {
        const qtdRef = numeroNfe(prodElement, 'qCom') || quantity;
        const vProd = numeroNfe(prodElement, 'vProd');
        const tentativa = (!isNaN(vProd) && qtdRef > 0) ? vProd / qtdRef : numeroNfe(prodElement, 'vUnTrib');
        if (!isNaN(tentativa) && tentativa > 0 && tentativa <= PRECO_PLAUSIVEL) costPrice = tentativa;
        else costPrice = 0;
      }

      // Quantidade absurda (> 999.999) indica qCom corrompida na NFe
      if (quantity > 999999) quantity = 1;

      let category = 'Geral';
      if (ncm) {
        if (ncm.startsWith('02') || ncm.startsWith('03')) category = 'Carnes';
        else if (ncm.startsWith('04') || ncm.startsWith('05')) category = 'LaticÃ­nios';
        else if (ncm.startsWith('09')) category = 'Bebidas';
        else if (ncm.startsWith('16') || ncm.startsWith('19')) category = 'Massas';
        else if (ncm.startsWith('17') || ncm.startsWith('20')) category = 'Bebidas';
        else if (ncm.startsWith('21') || ncm.startsWith('22')) category = 'Chocolate';
        else if (ncm.startsWith('23')) category = 'RaÃ§Ãµes';
        else if (ncm.startsWith('24')) category = 'Bebidas AlcoÃ³licas';
        else if (ncm.startsWith('25') || ncm.startsWith('28')) category = 'Cervejas';
        else if (ncm.startsWith('30') || ncm.startsWith('32')) category = 'Condimentos';
        else if (ncm.startsWith('33')) category = 'Sopas';
        else if (ncm.startsWith('34')) category = 'Sal';
        else if (ncm.startsWith('35')) category = 'AÃ§Ãºcar';
        else if (ncm.startsWith('36')) category = 'CafÃ©';
        else if (ncm.startsWith('38')) category = 'SabÃ£o';
        else if (ncm.startsWith('39') || ncm.startsWith('40')) category = 'Sabonetes';
        else if (ncm.startsWith('44')) category = 'Perfumes';
        else if (ncm.startsWith('48')) category = 'Papel';
        else if (ncm.startsWith('49')) category = 'Revistas';
        else if (ncm.startsWith('61')) category = 'Medicamentos';
        else if (ncm.startsWith('62')) category = 'Higiene';
        else if (ncm.startsWith('63')) category = 'Absorventes';
        else if (ncm.startsWith('64') || ncm.startsWith('65')) category = 'Higiene Pessoal';
        else if (ncm.startsWith('70') || ncm.startsWith('73')) category = 'Limpeza';
        else if (ncm.startsWith('84')) category = 'UtensÃ­lios';
        else if (ncm.startsWith('85') || ncm.startsWith('87')) category = 'EletrodomÃ©sticos';
        else if (ncm.startsWith('90')) category = 'Suprimentos';
        else if (ncm.startsWith('94')) category = 'Bebidas';
      }

      // CÃ³digo de barras: GTIN vÃ¡lido da nota, senÃ£o o cÃ³digo do fornecedor
      const codigoBarras = eanValido ? ean : (code || undefined);
      result.items.push({
        name,
        costPrice,
        quantity,
        category,
        description: `${code ? 'CÃ³digo: ' + code + ' | ' : ''}NCM: ${ncm} | Und: ${unidade}`,
        ean: codigoBarras,
        barcode: codigoBarras,
        brand: brand || undefined
      });
    }

    return result.items.length > 0 ? result : null;
  } catch (e) {
    console.error('Erro ao processar XML:', e);
    return null;
  }
};

import {
    collection, doc, setDoc, addDoc, updateDoc, deleteDoc, onSnapshot, query, where, getDocs, getDocsFromServer, orderBy, limit, startAfter, writeBatch, Unsubscribe, getDoc, runTransaction, increment, arrayUnion, Timestamp
} from 'firebase/firestore';
import { getActiveSession } from '../utils/cashSession';

interface StoreContextType {
    currentUser: User | null;
    users: User[];
    products: Product[];
    productsCache: Product[];
    orders: Order[];
    units: PrisonUnit[];
    cart: CartItem[];
    suppliers: Supplier[];
    expenses: Expense[];
    logs: AuditLog[];
    appConfig: AppConfig;
    settings: AppConfig;
    isLoading: boolean;
    authLoading: boolean;
    systemMessages: SystemMessage[];
    messages: Message[];
    notifications: Notification[];
    storageUsage: number;
    serverTime: Date;

    login: (cpf: string, pass: string, targetRole?: UserRole) => Promise<{ success: boolean; message?: string }>;
    loginAdmin: (email: string, pass: string) => Promise<void>;
    loginFamiliar: (cpf: string, pass: string) => Promise<void>;
    logout: () => void;
    registerUser: (userData: Partial<User>, docFile: File | null) => Promise<{ success: boolean; message: string }>;
    recoverPassword: (identifier: string) => Promise<{ success: boolean; message: string }>;
    validateRecovery: (userCpf: string, prisonerCpf: string, nomeCompleto: string) => Promise<User>;
    resetUserPassword: (userCpf: string, prisonerCpf: string, newPass: string, nomeCompleto: string) => Promise<void>;

    addToCart: (product: Product, quantity?: number) => void;
    removeFromCart: (productId: string) => void;
    clearCart: () => void;
    createOrder: (data: Partial<Order> | File | null, location?: InmateLocation, clientToken?: string, items?: CartItem[]) => Promise<boolean>;

    searchOrders: (term: string) => Promise<Order[]>;
    clearOldData: () => Promise<void>;
    archiveOldData: (orderIds: string[], expenseIds: string[]) => Promise<void>;
    activateSystem: (token: string) => Promise<{ success: boolean; message: string }>;
    generateActivationKey: (days: number) => Promise<string>;
    isSystemActive: boolean;


    finalizarVendaComCredito: () => Promise<boolean>;

    updateOrderStatus: (orderId: string, status: string) => void;
    aprovarPedido: (orderId: string, finalizar?: boolean) => Promise<any>;
    markOrderAsPrinted: (orderId: string) => void;
    addProduct: (product: Product) => Promise<void>;
    updateProduct: (product: Product) => Promise<void>;
    deleteProduct: (productId: string) => void;
    deleteExpense: (id: string) => Promise<void>;

    deleteOrder: (orderId: string) => void;
    approveUser: (userId: string) => void;
    suspendUser: (userId: string, status: boolean) => void;
    updateUserStatus: (userId: string, status: 'active' | 'suspended' | 'pending') => void;
    toggleUserCredit: (userId: string, allow: boolean) => Promise<void>;
    deleteUser: (userId: string) => void;
    processInvoiceImport: (data: InvoiceData, profitMargin: number) => Promise<void>;
    importXmlProduct: (file: File, margin: number) => Promise<void>;
    previewXmlImport: (file: File) => Promise<{ name: string; cost: number; qty: number }[]>;
    sanitizeCatalog: () => Promise<number>;
    updateAppConfig: (config: AppConfig) => void;
    updateSettings: (config: AppConfig) => void;
    downloadBackup: () => void;
    backupSystem: () => void;
    resetSystem: (confirm: boolean) => void;
    resetStock: () => Promise<void>;
    resetFinance: () => Promise<void>;

    createAdminUser: (userData: Partial<User>) => Promise<void>;
    updateAdminPermissions: (userId: string, permissions: string[]) => Promise<void>;

    sendSystemMessage: (msg: Partial<SystemMessage>) => Promise<void>;
    sendMessage: (msg: Message) => Promise<void>;
    markMessageRead: (id: string) => void;

    addSupplier: (supplier: Supplier) => void;
    removeSupplier: (id: string) => void;
    addExpense: (expense: Expense) => Promise<void>;
    addWithdrawal: (amount: number, description: string, observation?: string) => Promise<void>;
    toggleFinanceEntries: () => Promise<void>;
    showNotification: (msg: string, type?: 'success' | 'error' | 'info' | 'warning' | string) => void;
    removeNotification: (id: string) => void;

    depositToWallet: (amount: number, proofFile: File) => Promise<void>;
    approveWalletTransaction: (transactionId: string) => Promise<void>;
    rejectWalletTransaction: (transactionId: string) => Promise<void>;
    withdrawWalletCredit: (userId: string, amount: number, reason: string, senhaMestra?: string) => Promise<void>;
    getWalletTransactions: (userId?: string) => Promise<WalletTransaction[]>;
    attachAdminProof: (kind: 'orders' | 'wallet_transactions', docId: string, ownerId: string, file: File) => Promise<string>;
    reenviarComprovante: (kind: 'orders' | 'wallet_transactions', docId: string, file: File) => Promise<string>;

    checkPermission: (permission: string) => boolean;

    // PWA
    isInstallable: boolean;
    installApp: () => Promise<void>;
    validateMasterPassword: (password: string) => Promise<boolean>;
    defineMasterPassword: (password: string) => Promise<boolean>;
    masterPasswordStatus: () => Promise<{ definida: boolean }>;
    updateAdminPassword: (newPassword: string) => Promise<void>;

    preRegisteredInmates: { id: string, name: string, cpf: string, unit?: string, gallery?: string, cell?: string, observations?: string, status?: 'ATIVO' | 'INATIVO' }[];
    addPreRegisteredInmate: (inmate: { name: string, cpf: string, unit?: string, gallery?: string, cell?: string, observations?: string }) => Promise<void>;
    updatePreRegisteredInmate: (id: string, data: { name?: string, cpf?: string, unit?: string, gallery?: string, cell?: string, observations?: string, status?: 'ATIVO' | 'INATIVO' }) => Promise<void>;
    deletePreRegisteredInmate: (id: string) => Promise<void>;

    creditoCliente: number;
    realizarSaque: (valor: number) => Promise<boolean>;
    verificarCredito: (valor: number) => boolean;
    refundOrder: (orderId: string, reason?: string) => Promise<void>;
    resetCredits: () => Promise<void>;
    mergeDuplicateProducts: () => Promise<void>;
    adminDirectSale: (targetUserId: string, items: any[], paymentMethod: 'PIX' | 'WALLET' | 'CASH' | 'CARD' | 'MIXED' | 'FIADO', total: number, payments?: { method: 'PIX' | 'WALLET' | 'CASH' | 'CARD' | 'FIADO'; amount: number }[], change?: number, customerAccountId?: string, clientToken?: string, jointWallet?: { secondUserId: string; secondWalletAmount: number }) => Promise<Order | null>;
    loadMoreOrders: () => void;
    loadMoreExpenses: () => void;
    usersLimit: number;
    cotaCritica: boolean;
    loadMoreUsers: () => void;
    loadMoreProducts: () => void;
    loadMoreSuppliers: () => void;
    loadMoreInmates: () => void;
    productsLimit: number;
    suppliersLimit: number;
    inmatesLimit: number;
    expandUsersLimit: (limite: number) => void;
    importInmatesCsv: (file: File) => Promise<void>;
    addWalletCreditDirectly: (userId: string, amount: number, reason: string, senhaMestra?: string) => Promise<void>;
    registrarVendaOffline: (targetUserId: string, items: any[], paymentMethod: 'PIX' | 'WALLET' | 'CASH' | 'MIXED' | 'FIADO', total: number, payments?: { method: string; amount: number }[], change?: number, customerAccountId?: string) => Promise<Order | null>;
    sincronizarVendasOffline: (incluirErros?: boolean) => Promise<{ ok: boolean; sincronizadas: number; comErro: number; total: number }>;
    vendasOfflinePendentes: number;
    vendasOfflineComErro: number;

}

const StoreContext = createContext<StoreContextType | undefined>(undefined);

const DEFAULT_CONFIG: AppConfig = {
    appName: ASSPEN_INFO.name.split(' - ')[0] || 'MERCADO FÃCIL',
    institutionName: ASSPEN_INFO.name,
    cnpj: ASSPEN_INFO.cnpj,
    primaryColor: '#0ea5e9',
    secondaryColor: '#1e293b',
    backgroundColor: '#f8fafc',
    contactEmail: ASSPEN_INFO.email,
    contactPhone: '(00) 00000-0000',
    contactAddress: 'Peixoto de Azevedo - MT',
    adminPassword: 'admin',
    pixKeys: [ASSPEN_INFO.defaultPix],
    systemName: ASSPEN_INFO.name,
    theme: ThemeOption.MODERN_GREEN,
    developerEmail: ASSPEN_INFO.email,
    developerName: 'Edevaldo de Lima Almeida',
    developerPhone: '',
    footerText: 'MERCADO FÃCIL - Sistema de GestÃ£o Profissional',
    isTrial: true,

    customReceiptDocName: 'CUPOM DE ENTREGA',
    receiptMainTitleOrder: 'RECIBO DE VENDA',
    receiptMainTitleExpense: 'RECIBO DE PAGAMENTO',
    receiptFooter: 'Conferir os itens no ato da entrega. NÃ£o aceitamos reclamaÃ§Ãµes posteriores.',

    fiscalEmission: false,
    fiscalModel: 'NF-E',
    fiscalNumber: '',
    fiscalSeries: '',

    logoUrl: '',
    showUserCredits: true,
    receiptFontSize: 12,
    enablePrisonerWallet: true,
    weeklyWalletLimit: 300,
    activationDate: new Date().toISOString(),
    activationKey: '',
    activationDaysLeft: 0
};


export const StoreProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [isLoading, setIsLoading] = useState(true);
    const [authReady, setAuthReady] = useState(false);
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [serverTime, setServerTime] = useState<Date>(new Date());

    const [users, setUsers] = useState<User[]>([]);
  const CONSUMER_USER: User = { id: 'consumidor_geral', name: 'CONSUMIDOR GERAL', email: 'venda@balcao.com', role: UserRole.FAMILY, status: 'active', approved: true, cpf: '000.000.000-00', inmateName: 'CONSUMIDOR', inmateCpf: '000.000.000-00' };
    const [products, setProducts] = useState<Product[]>([]);
    const productsCache = useMemo(() => products, [products]);
    const [orders, setOrders] = useState<Order[]>([]);
    const [cart, setCart] = useState<CartItem[]>([]);
    const [appConfig, setAppConfig] = useState<AppConfig>(DEFAULT_CONFIG);
    const [expenses, setExpenses] = useState<Expense[]>([]);

    const [logs, setLogs] = useState<AuditLog[]>([]);
    const MAX_LOGS = 200;

    // Armazenamento local com limite (evitar acÃºmulo)
    const LOCAL_STORAGE_KEY = 'mercado_app_data';

    // Limpar dados antigos do localStorage ao iniciar
    useEffect(() => {
        try {
            const existentes = localStorage.getItem(LOCAL_STORAGE_KEY);
            if (existentes) {
                const data = JSON.parse(existentes);
                if (data.timestamp) {
                    const old = new Date(data.timestamp);
                    const now = new Date();
                    const daysDiff = (now.getTime() - old.getTime()) / (1000 * 60 * 60 * 24);
                    if (daysDiff > 7) localStorage.removeItem(LOCAL_STORAGE_KEY);
                }
            }
        } catch { /* silencioso */ }
    }, []);

    // PWA install event capture
    useEffect(() => {
        const handleBeforeInstall = (e: Event) => {
            e.preventDefault();
            setDeferredPrompt(e);
        };
        const handleInstalled = () => { setDeferredPrompt(null); };
        window.addEventListener('beforeinstallprompt', handleBeforeInstall);
        window.addEventListener('appinstalled', handleInstalled);
        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
            window.removeEventListener('appinstalled', handleInstalled);
        };
    }, []);
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [systemMessages, setSystemMessages] = useState<SystemMessage[]>([]);    const [messages, setMessages] = useState<Message[]>([]);
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [storageUsage, setStorageUsage] = useState(0);
    const [walletTransactions, setWalletTransactions] = useState<WalletTransaction[]>([]);
    const [preRegisteredInmates, setPreRegisteredInmates] = useState<{ id: string, name: string, cpf: string }[]>([]);

    const [creditoCliente, setCreditoCliente] = useState<number>(0);

    // --- PWA INSTALL ---
    const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
    const installApp = async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        const result = await deferredPrompt.userChoice;
        if (result.outcome === 'accepted') setDeferredPrompt(null);
    };

    // --- PAGINATION & LIMITS (Phase 2) ---
    const [ordersLimit, setOrdersLimit] = useState(50);
    const [expensesLimit, setExpensesLimit] = useState(50);
    const [productsLimit, setProductsLimit] = useState(500);
    // Escala: com 1.500+ usuÃ¡rios, o stream admin de users nÃ£o pode ficar
    // preso em 500 (busca client-side nÃ£o acharia o resto). Cresce sob demanda.
    const [usersLimit, setUsersLimit] = useState(500);
    // Fornecedores e internos: paginação sob demanda (evita ler tudo de uma vez)
    const [suppliersLimit, setSuppliersLimit] = useState(100);
    const [inmatesLimit, setInmatesLimit] = useState(200);

    // ── Guarda de cota (Firebase Spark/uso): se uma leitura/escrita falhar por
    // cota excedida, o app avisa o admin (banner) em vez de quebrar em silêncio.
    const cotaCriticaRef = useRef(false);
    const [cotaCritica, setCotaCritica] = useState(false);
    const marcaCotaCritica = useCallback(() => {
        if (cotaCriticaRef.current) return;
        cotaCriticaRef.current = true;
        setCotaCritica(true);
    }, []);

    const loadMoreOrders = () => setOrdersLimit((prev: number) => prev + 50);
    const loadMoreExpenses = () => setExpensesLimit((prev: number) => prev + 50);
    const loadMoreProducts = () => setProductsLimit((prev: number) => prev + 500);
    const loadMoreSuppliers = () => setSuppliersLimit((prev: number) => prev + 100);
    const loadMoreInmates = () => setInmatesLimit((prev: number) => prev + 200);
    const loadMoreUsers = () => setUsersLimit((prev: number) => prev + 500);
    const expandUsersLimit = (limite: number) => setUsersLimit((prev: number) => Math.max(prev, limite));

    const logoutTimerRef = useRef<any>(null);
    const unsubscribeRefs = useRef<(() => void)[]>([]);

    const logout = async () => {
        try {
            unsubscribeRefs.current.forEach(unsub => unsub());
            unsubscribeRefs.current = [];
            await signOut(auth);
            setOrders([]);
            setProducts([]);
            setUsers([]);
            setExpenses([]);
            setSuppliers([]);
            setCart([]);
            setCreditoCliente(0);
            setCurrentUser(null);
            setMessages([]);
            setSystemMessages([]);
            setNotifications([]);
            setPreRegisteredInmates([]);
            sessionStorage.clear();
            showNotification('SessÃ£o encerrada com seguranÃ§a.', 'success');
        } catch (error) {
            console.error('Erro ao deslogar:', error);
            setCurrentUser(null);
        }
        if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
    };    // Log de Auditoria centralizado em registrarAuditClient (persistido no Firestore).


    const resetInactivityTimer = () => {
        if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
        if (currentUser) {
            logoutTimerRef.current = setTimeout(() => {
                logout();
                const event = new CustomEvent('session-expired', { detail: { message: "SessÃ£o encerrada por inatividade." } });
                window.dispatchEvent(event);
            }, 15 * 60 * 1000);
        }
    };

    useEffect(() => {
        if (currentUser) {
            window.addEventListener('mousemove', resetInactivityTimer);
            window.addEventListener('keydown', resetInactivityTimer);
            window.addEventListener('click', resetInactivityTimer);
            window.addEventListener('touchstart', resetInactivityTimer);
            window.addEventListener('scroll', resetInactivityTimer);
            resetInactivityTimer();
        } else {
            if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
        }
        return () => {
            if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
            window.removeEventListener('mousemove', resetInactivityTimer);
            window.removeEventListener('keydown', resetInactivityTimer);
            window.removeEventListener('click', resetInactivityTimer);
            window.removeEventListener('touchstart', resetInactivityTimer);
            window.removeEventListener('scroll', resetInactivityTimer);
        };
    }, [currentUser]);

    // --- AUTO-CLEANUP ---
    const performAutoCleanup = async () => {
        if (!currentUser || currentUser.role !== UserRole.ADMIN) return;

        try {
            // Fechamento de caixa abandonado Ã© feito pelo servidor (arquivarDadosAntigos:
            // auto-close de cash_sessions abertas hÃ¡ mais de 20h).

            // 2. Arquivar pedidos cancelados antigos (soft archive â€” preserva trilha de auditoria).
            // A rotina do servidor (arquivarDadosAntigos) Ã© a fonte oficial do arquivamento.
            try {
                const qOrders = query(
                    collection(db, 'orders'),
                    where('status', '==', OrderStatus.CANCELLED),
                    limit(200)
                );
                const snap = await getDocs(qOrders);                if (!snap.empty) {
                    const cutoffMs = Date.now() - 45 * 86400000;
                    const antigos = snap.docs.filter(d => {
                        const createdAt = d.data().createdAt ? new Date(d.data().createdAt).getTime() : 0;
                        return createdAt > 0 && createdAt < cutoffMs;
                    });
                    if (antigos.length > 0) {
                        const batch = writeBatch(db);
                        antigos.forEach(d => batch.update(d.ref, { deleted: true, archivedAt: new Date().toISOString() }));
                        await batch.commit();
                        console.log(`[AutoCleanup] ${antigos.length} pedidos cancelados antigos arquivados.`);
                    }
                }
            } catch (e) {
                console.warn('[AutoCleanup] Pedidos cancelados:', e);
            }

            // 3. Reset de Limite Semanal
            await checkWeeklyReset();

        } catch (e) {
            console.warn('[AutoCleanup Error]', e);
        }
    };

    const checkWeeklyReset = async () => {
        if (!currentUser || currentUser.role !== UserRole.ADMIN) return;
        try {
            const now = new Date();
            const day = now.getDay();
            const diff = now.getDate() - day + (day === 0 ? -6 : 1);
            const monday = new Date(now.setDate(diff));
            monday.setHours(0, 0, 0, 0);
            const mondayStr = monday.toISOString().split('T')[0];

            const settingsSnap = await getDoc(doc(db, 'settings', 'maintenance'));
            const lastReset = settingsSnap.exists() ? settingsSnap.data()?.lastWeeklyReset : '';

            if (lastReset !== mondayStr) {
                console.log('[WeeklyReset] Iniciando reset semanal...');
                // Pagina além do limite de 500: com mais de 500 usuários tendo
                // gasto na semana, os seguintes ficavam com o limite da semana
                // anterior travados por mais uma semana (silencioso).
                let lastDoc: import('firebase/firestore').QueryDocumentSnapshot | null = null;
                while (true) {
                    const qUsers = lastDoc
                        ? query(collection(db, 'users'), where('weeklySpent', '>', 0), startAfter(lastDoc), limit(500))
                        : query(collection(db, 'users'), where('weeklySpent', '>', 0), limit(500));
                    const userSnaps = await getDocs(qUsers);
                    if (userSnaps.empty) break;
                    const batch = writeBatch(db);
                    userSnaps.docs.forEach(d => batch.update(d.ref, { weeklySpent: 0 }));
                    await batch.commit();
                    if (userSnaps.docs.length < 500) break;
                    lastDoc = userSnaps.docs[userSnaps.docs.length - 1];
                }

                await setDoc(doc(db, 'settings', 'maintenance'), { lastWeeklyReset: mondayStr }, { merge: true });
                console.log('[WeeklyReset] Reset concluÃ­do.');
            }
        } catch (e) {
            console.error('[WeeklyReset Error]', e);
        }
    };

    useEffect(() => {
        if (currentUser) {
            checkWeeklyReset(); // Backstop do reset semanal (servidor executa via rotina agendada)
            if (currentUser.role === UserRole.ADMIN) {
                performAutoCleanup();
            }
        }
    }, [currentUser]);

    const verificarCredito = (valor: number): boolean => {
        if (creditoCliente <= 0) return false;
        if (valor > creditoCliente) return false;
        return true;
    };

    const realizarSaque = async (valor: number): Promise<boolean> => {
        if (!currentUser) {
            showNotification('UsuÃ¡rio nÃ£o autenticado', 'error');
            return false;
        }

        if (valor <= 0) {
            showNotification('Valor invÃ¡lido para saque', 'error');
            return false;
        }

        try {
            const res = await fnSacarSaldoProprio({ valor });
            const data = res.data as any;
            const novoSaldo = data?.novoSaldo !== undefined ? Number(data.novoSaldo) : (currentUser.walletBalance ?? 0);
            setCreditoCliente(novoSaldo);
            setCurrentUser(prev => prev ? ({ ...prev, walletBalance: novoSaldo }) : prev);
            showNotification(`Saque de R$ ${formatarMoeda(valor)} realizado com sucesso! Saldo: R$ ${formatarMoeda(novoSaldo)}`, 'success');
            return true;
        } catch (error: any) {
            console.error('Erro ao realizar saque:', error);
            showNotification(error?.message || 'Erro ao processar saque', 'error');
            return false;
        }
    };

    const finalizarVendaComCredito = async (): Promise<boolean> => {
        if (cart.length === 0) {
            showNotification('âŒ Carrinho vazio!', 'error');
            return false;
        }

        try {
            const res = await fnComprarComCarteira({
                items: cart.map(item => ({ productId: item.productId, quantity: item.quantity }))
            });
            const data = res.data as any;
            const novoSaldo = data?.order?.walletBalanceAfter !== undefined ? Number(data.order.walletBalanceAfter) : (currentUser.walletBalance ?? 0);

            setCreditoCliente(novoSaldo);
            setCurrentUser(prev => prev ? ({ ...prev, walletBalance: novoSaldo }) : prev);
            setCart([]);

            showNotification(`Venda realizada! Total: R$ ${formatarMoeda(data?.order?.total || 0)}\nCrÃ©dito restante: R$ ${formatarMoeda(novoSaldo)}`, 'success');
            return true;
} catch (error: any) {
console.error('Erro ao finalizar venda:', error);
const msg = error?.message || 'Erro ao processar venda';
showNotification('âŒ ' + msg, 'error');
return false;
}
    };

    const uploadFile = async (file: File, path: string, meta?: { kind?: string; docId?: string }): Promise<string> => {
        if (!file || file.size === 0) {
            throw new Error("Arquivo vazio. Selecione um arquivo vÃ¡lido.");
        }

        const MAX_FILE_SIZE = 8 * 1024 * 1024;
        const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.pdf', '.heic', '.heif'];

        if (file.size > MAX_FILE_SIZE) {
            throw new Error('Arquivo muito grande (mÃ¡x. 8 MB).');
        }

        const ext = '.' + (file.name.split('.').pop() || '').toLowerCase();
        if (!ALLOWED_EXTENSIONS.includes(ext)) {
            throw new Error('Tipo de arquivo nÃ£o permitido (JPG, PNG, HEIC ou PDF).');
        }

        // Comprime fotos antes do envio (menos Storage, uploads mais rÃ¡pidos);
        // nunca lanÃ§a erro â€” em qualquer falha devolve o arquivo original.
        const arquivoFinal = await comprimirImagem(file);

        try {
            const uid = auth.currentUser?.uid || currentUser?.authUid || currentUser?.id || 'anonimo';
            const folder = (path || 'uploads').replace(/^\/+|\/+$/g, '');
            const fileName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
            const fileRef = storageRef(storage, `${folder}/${uid}/${fileName}`);
            await uploadBytes(fileRef, arquivoFinal);
            return await getDownloadURL(fileRef);
        } catch (error: any) {
            console.warn("[uploadFile] Falha no upload para Storage:", error?.message || error);
            try {
                const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                await queuePendingUpload({
                    id,
                    folder: (path || 'uploads').replace(/^\/+|\/+$/g, ''),
                    fileName: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`,
                    kind: meta?.kind,
                    docId: meta?.docId,
                    blob: arquivoFinal,
                });
                showNotification('ConexÃ£o instÃ¡vel: o comprovante foi guardado e serÃ¡ enviado automaticamente quando a internet voltar.', 'info');
            } catch (e2) {
                showNotification('Falha ao enviar o arquivo. Tente novamente.', 'error');
            }
            return "PENDENTE_UPLOAD_LOCAL_CACHE";
        }
    };

    // Campo do documento que guarda a URL da prova, por tipo de documento.
    const CAMPO_PROVA: Record<string, string> = {
        orders: 'paymentProofUrl',
        users: 'documentUrl',
        wallet_transactions: 'proofUrl',
    };

    // Familiar reenvia o comprovante de UM pedido/depÃ³sito especÃ­fico que ficou
    // preso no cache local (upload offline falhou). Se o upload seguir falhando,
    // fica na fila e o retry automÃ¡tico conclui quando a conexÃ£o voltar.
    const reenviarComprovante = async (kind: 'orders' | 'wallet_transactions', docId: string, file: File): Promise<string> => {
        if (!currentUser) throw new Error('UsuÃ¡rio nÃ£o autenticado');
        const pasta = kind === 'orders' ? 'comprovantes_pix' : 'wallet_proofs';
        const url = await uploadFile(file, pasta, { kind, docId });
        if (url === 'PENDENTE_UPLOAD_LOCAL_CACHE') {
            await attachPendingUploadDoc(pasta, docId, kind);
            showNotification('ConexÃ£o instÃ¡vel: o comprovante serÃ¡ enviado automaticamente.', 'info');
            return url;
        }
        await updateDoc(doc(db, kind, docId), { [CAMPO_PROVA[kind]]: url });
        showNotification('Comprovante reenviado com sucesso!', 'success');
        return url;
    };

    // Admin anexa manualmente um comprovante que chegou por outro canal (WhatsApp,
    // balcÃ£o...) em um pedido/depÃ³sito que ficou com upload pendente/cache local.
    // O arquivo vai para a pasta privada do DONO do registro, entÃ£o o servidor
    // continua validando a URL como pertencente ao usuÃ¡rio correto.
    const attachAdminProof = async (kind: 'orders' | 'wallet_transactions', docId: string, ownerId: string, file: File): Promise<string> => {
        if (!file || file.size === 0) throw new Error("Arquivo vazio.");
        if (file.size > 8 * 1024 * 1024) throw new Error('Arquivo muito grande (mÃ¡x. 8 MB).');
        const pasta = kind === 'orders' ? 'comprovantes_pix' : 'wallet_proofs';
        const ext = '.' + (file.name.split('.').pop() || 'jpg').toLowerCase();
        const fileName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
        const arquivoFinal = await comprimirImagem(file);
        const fileRef = storageRef(storage, `${pasta}/${ownerId}/${fileName}`);
        await uploadBytes(fileRef, arquivoFinal);
        const url = await getDownloadURL(fileRef);
        await updateDoc(doc(db, kind, docId), { [CAMPO_PROVA[kind]]: url });
        await registrarAuditClient('ANEXAR_COMPROVANTE_ADMIN', { kind, docId }, { url });
        return url;
    };

    const retryPendingProofs = async (): Promise<void> => {
        try {
            const pendentes = await listPendingUploads();
            if (!pendentes.length) return;
            const uid = auth.currentUser?.uid || currentUser?.authUid || currentUser?.id || 'anonimo';
            let reenviados = 0;
            for (const p of pendentes) {
                try {
                    const file = new File([p.blob], p.fileName, { type: p.blob.type });
                    const fileRef = storageRef(storage, `${p.folder}/${uid}/${p.fileName}`);
                    await uploadBytes(fileRef, file);
                    const url = await getDownloadURL(fileRef);
                    if (p.kind && p.docId) {
                        // SÃ³ atualiza o documento se ele existir (evita fila-zumbi
                        // reenviando blobs para docs que nunca foram criados).
                        const docRef = doc(db, p.kind, p.docId);
                        const snap = await getDoc(docRef);
                        if (snap.exists()) {
                            const campo = CAMPO_PROVA[p.kind] || 'proofUrl';
                            await updateDoc(docRef, { [campo]: url });
                            await removePendingUpload(p.id);
                            reenviados += 1;
                            continue;
                        }
                        console.warn('[retryPendingProofs] doc nÃ£o existe, mantendo na fila:', p.kind, p.docId);
                        continue;
                    }
                    if (p.docId) {
                        await removePendingUpload(p.id);
                        reenviados += 1;
                    } else {
                        // Ainda sem vÃ­nculo (o pedido/cadastro ainda nÃ£o foi criado):
                        // guarda a URL na fila e NÃƒO remove â€” o attach vai vincular depois.
                        await queuePendingUpload({ ...p, uploadedUrl: url });
                    }
                } catch (e: any) {
                    console.warn("[retryPendingProofs] item falhou:", e?.message || e);
                }
            }
            if (reenviados > 0) {
                showNotification(`Comprovante${reenviados > 1 ? 's' : ''} enviado${reenviados > 1 ? 's' : ''} automaticamente!`, 'success');
            }
        } catch (e: any) {
            console.warn("[retryPendingProofs]", e?.message || e);
        }
    };

    useEffect(() => {
        if (!currentUser?.id) return;
        retryPendingProofs();
        const onOnline = () => retryPendingProofs();
        window.addEventListener('online', onOnline);
        return () => window.removeEventListener('online', onOnline);
    }, [currentUser?.id]);

    const login = async (identifier: string, pass: string, expectedRole?: UserRole) => {
        const cleanPass = pass.trim();
        if (!cleanPass) return { success: false, message: 'Informe a senha.' };

        try {
            const res = await fnBuscarLoginInfo({ identificador: identifier.trim() });
            const info = res.data as any;
            if (!info?.encontrado) return { success: false, message: 'UsuÃ¡rio nÃ£o encontrado.' };

            if (expectedRole === UserRole.FAMILY && toUserRole(info.role) === UserRole.ADMIN) {
                return { success: false, message: 'Acesso Administrativo detectado. Por favor, utilize a aba Ãrea Administrativa para entrar.' };
            }
            if (info.status === 'pending') return { success: false, message: 'Cadastro em anÃ¡lise.' };
            if (info.status === 'suspended') return { success: false, message: 'Conta suspensa.' };

            // MigraÃ§Ã£o: usuÃ¡rio legado sem conta vinculada â†’ provisiona (valida a senha atual no servidor)
            if (!info.jaVinculado) {
                try {
                    await fnRegistrarUsuario({
                        dados: { cpf: info.cpf || identifier, email: info.email, name: info.nome },
                        senha: cleanPass,
                        provisionar: true
                    });
                } catch (e: any) {
                    const msg = e?.message || '';
                    if (msg.includes('incorreta')) return { success: false, message: 'Senha incorreta.' };
                    return { success: false, message: msg || 'Erro de conexÃ£o.' };
                }
            }

            try {
                await signInWithEmailAndPassword(auth, info.authEmail, cleanPass);
            } catch (e: any) {
                return { success: false, message: 'Senha incorreta.' };
            }

            return { success: true };
        } catch (e: any) { return { success: false, message: 'Erro de conexÃ£o.' }; }
    };

    const loginAdmin = async (email: string, pass: string) => {
        try {
            const res = await fnBuscarLoginInfo({ identificador: email.trim() });
            const info = res.data as any;

            if (!info?.encontrado) {
                if (!info?.existemAdmins) {
                    throw new Error("Primeiro acesso do sistema: crie o administrador inicial na Ã¡rea administrativa.");
                }
                throw new Error("E-mail ou senha de administrador incorretos.");
            }
            if (toUserRole(info.role) !== UserRole.ADMIN) {
                throw new Error("Este e-mail nÃ£o pertence a um administrador.");
            }
            if (info.status === 'suspended') throw new Error("Conta suspensa.");

            // MigraÃ§Ã£o: admin legado sem conta vinculada â†’ provisiona (valida a senha atual no servidor)
            if (!info.jaVinculado) {
                try {
                    await fnRegistrarUsuario({
                        dados: { cpf: info.cpf || '', email: info.email, name: info.nome },
                        senha: pass,
                        provisionar: true
                    });
                } catch (e: any) {
                    const msg = e?.message || '';
                    if (msg.includes('incorreta')) throw new Error("E-mail ou senha de administrador incorretos.");
                    throw new Error("Falha ao vincular a conta administrativa: " + msg);
                }
            }

            try {
                await signInWithEmailAndPassword(auth, info.authEmail, pass);
            } catch (e: any) {
                throw new Error("E-mail ou senha de administrador incorretos.");
            }
        } catch (e: any) {
            throw new Error(e.message || "Erro ao tentar login administrativo.");
        }
    };

    const loginFamiliar = async (cpf: string, pass: string) => {
        const res = await login(cpf, pass, UserRole.FAMILY);
        if (!res.success) throw new Error(res.message);
    };

    const recoverPassword = async (identifier: string) => {
        try {
            const res = await fnBuscarLoginInfo({ identificador: identifier.trim() });
            const info = res.data as any;
            if (info?.encontrado) return { success: true, message: 'Utilize a opÃ§Ã£o "Redefinir Senha" com seu CPF e o CPF do interno para criar uma nova senha.' };
            return { success: false, message: 'UsuÃ¡rio nÃ£o encontrado.' };
        } catch (e: any) {
            return { success: false, message: 'Erro de conexÃ£o.' };
        }
    };

    const addToCart = (product: Product, quantity = 1) => {
        const estoque = Number(product.stock) || 0;
        setCart(prevCart => {
            const cartArray = prevCart || [];
            const itemExistente = cartArray.find(item => String(item.productId) === String(product.id));
            const qtdAtual = itemExistente ? itemExistente.quantity : 0;
            const novaQtd = Math.min(qtdAtual + quantity, estoque);
            if (novaQtd <= 0) return cartArray;

            if (itemExistente) {
                return cartArray.map(item =>
                    String(item.productId) === String(product.id)
                        ? { ...item, quantity: novaQtd }
                        : item
                );
            }

            // PreÃ§o anunciado Ã© o cobrado: promoPrice quando ativo, senÃ£o price.
            const precoEfetivo = (Number(product.promoPrice) > 0) ? Number(product.promoPrice) : (Number(product.price) || 0);
            return [...cartArray, { ...product, productId: product.id, quantity: novaQtd, priceAtPurchase: precoEfetivo } as CartItem];
        });
    };

    const removeFromCart = (pid: string) => setCart(prev => prev.filter(p => String(p.productId) !== String(pid)));
    const clearCart = () => setCart([]);

    const createOrder = async (arg1: Partial<Order> | File | null, arg2?: InmateLocation, clientToken?: string, argItems?: CartItem[]) => {
        if (!currentUser) return false;
        // Fonte da verdade: itens EXPLÃCITOS (carrinho local da tela). O cart do
        // contexto Ã© usado apenas pelo PDV admin e NUNCA estÃ¡ populado aqui.
        const carrinhoFonte = argItems || cart;
        const totalCarrinho = (carrinhoFonte || []).reduce((acc, i) => acc + ((Number(i.priceAtPurchase) || 0) * (Number(i.quantity) || 0)), 0);
        if ((carrinhoFonte || []).length === 0) throw new Error("Carrinho vazio.");
        // Token de idempotÃªncia: o MESMO token em reenvios devolve o pedido jÃ¡
        // criado no servidor (sem debitar estoque/saldo 2x). Reutilize o token
        // ao reenviar a MESMA tentativa de venda.
        const token = clientToken || crypto.randomUUID();
        try {
            let orderData: Partial<Order>;
            let proofUrl = '';
            if (arg1 instanceof File || arg1 === null) {
                proofUrl = (arg1 instanceof File) ? await uploadFile(arg1, 'comprovantes_pix', { kind: 'orders' }) : '';
                orderData = { items: [...carrinhoFonte], total: totalCarrinho, paymentProofUrl: proofUrl, inmateLocation: arg2, deliveryLocation: arg2, paymentMethod: 'PIX' };
            } else { orderData = arg1; }

            const items = (orderData.items || []).map(i => ({ productId: i.productId, quantity: i.quantity }));
            if (!items.length) throw new Error("Carrinho vazio.");

            if (orderData.paymentMethod === 'WALLET') {
                // Compra com carteira processada NO SERVIDOR (saldo, limite semanal e estoque validados)
                const res = await fnComprarComCarteira({
                    items,
                    clientToken: token,
                    inmateLocation: orderData.inmateLocation || undefined,
                    deliveryLocation: orderData.deliveryLocation || undefined
                });
                const data = res.data as any;
                const novoSaldo = data?.order?.walletBalanceAfter !== undefined ? Number(data.order.walletBalanceAfter) : (currentUser.walletBalance ?? 0);
                setCurrentUser(prev => ({ ...(prev || currentUser), walletBalance: novoSaldo }));
                setCreditoCliente(novoSaldo);
            } else {
                // Pedido PIX processado NO SERVIDOR (preÃ§os e estoque validados)
                const resPix = await fnRegistrarPedidoPix({
                    items,
                    clientToken: token,
                    paymentProofUrl: proofUrl || orderData.paymentProofUrl || '',
                    inmateLocation: orderData.inmateLocation || undefined,
                    deliveryLocation: orderData.deliveryLocation || undefined
                });
                // Replay de tentativa anterior: o pedido jÃ¡ existia â€” atualiza o
                // comprovante pendente sem duplicar nada no servidor.
                if ((resPix?.data as any)?.replay && proofUrl && proofUrl !== "PENDENTE_UPLOAD_LOCAL_CACHE") {
                    const orderId = (resPix?.data as any)?.order?.id;
                    if (orderId) {
                        await updateDoc(doc(db, 'orders', orderId), { paymentProofUrl: proofUrl }).catch(() => {});
                    }
                }
                // Comprovante em cache local (upload offline): vincula ao pedido criado para reenvio automÃ¡tico
                if (proofUrl === "PENDENTE_UPLOAD_LOCAL_CACHE") {
                    const orderId = (resPix?.data as any)?.order?.id;
                    if (orderId) {
                        const vinculo = await attachPendingUploadDoc('comprovantes_pix', orderId, 'orders');
                        // Se um retry jÃ¡ tinha enviado o arquivo ao Storage antes do
                        // pedido existir, grava a URL real imediatamente no pedido.
                        if (typeof vinculo === 'string') {
                            await updateDoc(doc(db, 'orders', orderId), { paymentProofUrl: vinculo }).catch(() => {});
                        }
                    }
                }
            }

            setCart([]);
            return true;
        } catch (e) {
            console.error(e);
            throw e;
        }
    };

    const refundOrder = async (orderId: string, reason: string = 'DevoluÃ§Ã£o administrativa') => {
        if (!currentUser) return;
        const order = orders.find(o => o.id === orderId);
        if (!order) throw new Error("Pedido nÃ£o encontrado.");
        if (order.status === OrderStatus.CANCELLED) throw new Error("Este pedido jÃ¡ foi cancelado/devolvido.");

        try {
            // Estorno processado NO SERVIDOR (restaura estoque + carteira + status)
            await fnEstornarVenda({ orderId, motivo: reason });
            setOrders(prev => prev.map(o =>
                o.id === orderId ? { ...o, status: OrderStatus.CANCELLED, refundReason: reason } : o
            ));
            showNotification(`Pedido #${order.id.slice(0,6)} devolvido com sucesso!`, 'success');
        } catch (e: any) {
            console.error(e);
            throw new Error("Erro ao processar devoluÃ§Ã£o: " + e.message);
        }
    };

    const STATUS_VALIDOS = ['pending', 'paid', 'preparing', 'delivered', 'cancelled', 'rejected', 'refunded', 'pago', 'separacao', 'entregue', 'cancelado', 'rejeitado'];
    const updateOrderStatus = async (oid: string, status: string) => {
        const alvo = String(status || '').toLowerCase();
        if (!STATUS_VALIDOS.includes(alvo)) { showNotification("Status invÃ¡lido.", "error"); return; }
        try { await updateDoc(doc(db, 'orders', oid), { status }); } catch (e: any) { showNotification("Erro ao atualizar status: " + e.message, "error"); throw e; }
    };
    const aprovarPedido = async (orderId: string, finalizar: boolean = true) => {
        try {
            const res = await fnAprovarPedidoPix({ orderId, finalizar });
            const data = res.data as any;
            if (!data?.ok) throw new Error(data?.error || 'Falha ao aprovar o pedido.');
            return data;
        } catch (e: any) {
            throw new Error(e?.message || 'Erro ao aprovar o pedido. Tente novamente.');
        }
    };
    const markOrderAsPrinted = async (oid: string) => { try { await updateDoc(doc(db, 'orders', oid), { printCount: increment(1), status: OrderStatus.PREPARING }); } catch (e: any) { console.warn("[markOrderAsPrinted]", e.message); } };
    const deleteOrder = async (oid: string) => {
        try {
            const order = orders.find(o => o.id === oid);
            const estornado = order ? ['refunded', 'devolvido', 'reembolsado', 'estornado', 'cancelled', 'cancelado'].includes(String(order.status || '').toLowerCase()) : false;
            if (order && !estornado) {
                // Pedido pago com carteira: o dinheiro PRECISA voltar ao usuÃ¡rio â€”
                // exclusÃ£o direta deixaria o saldo retido para sempre. Rota obrigatÃ³ria
                // pelo estorno (servidor devolve saldo + estoque de forma atÃ´mica).
                const usouCarteira = String(order.paymentMethod || '').toUpperCase() === 'WALLET' ||
                    (Array.isArray(order.payments) && order.payments.some((p: any) => String(p.method || '').toUpperCase() === 'WALLET'));
                if (usouCarteira) {
                    await fnEstornarVenda({ orderId: oid, motivo: 'ExclusÃ£o administrativa (restituiÃ§Ã£o da carteira)' });
                    await updateDoc(doc(db, 'orders', oid), { deleted: true });
                } else {
                    await runTransaction(db, async (transaction) => {
                        for (const item of order.items) {
                            const productRef = doc(db, 'products', item.productId);
                            const prodSnap = await transaction.get(productRef);
                            if (prodSnap.exists()) {
                                const freshStock = prodSnap.data().stock || 0;
                                transaction.update(productRef, { stock: freshStock + item.quantity });
                            }
                        }
                        transaction.update(doc(db, 'orders', oid), { deleted: true });
                    });
                }
            } else {
                await updateDoc(doc(db, 'orders', oid), { deleted: true });
            }
            showNotification(estornado ? "Pedido estornado movido para a lixeira (estoque jÃ¡ devolvido)" : "Pedido excluÃ­do e valores restituÃ­dos", "success");
        } catch (e: any) {
            showNotification("Erro ao excluir pedido: " + (e?.message || 'tente novamente'), "error");
        }
    };

    const addProduct = async (product: Product) => {
        try {
            const id = product.id || crypto.randomUUID();
            await setDoc(doc(db, 'products', id), { ...product, id });
        } catch (e: any) {
            showNotification("Erro ao adicionar produto: " + e.message, "error");
        }
    };

    const updateProduct = async (product: Product) => {
        try {
            // merge: true — o formulário de edição não conhece todos os campos do doc
            // (promoPrice, lastSoldAt etc.). Sobrescrever o doc inteiro APAGAVA
            // promoções ativas e histórico de vendas a cada edição manual.
            await setDoc(doc(db, 'products', product.id), product, { merge: true });
            showNotification("Produto atualizado!", "success");
        } catch (e: any) {
            showNotification("Erro ao atualizar produto: " + e.message, "error");
        }
    };

    const deleteProduct = async (id: string) => {
        if (!id) return;
        try {
            await updateDoc(doc(db, 'products', id), { deleted: true });
            showNotification("Produto removido com sucesso (Arquivado)", "success");
        } catch (e: any) {
            showNotification("Erro ao excluir: " + e.message, "error");
        }
    };

    const isAdminAllowed = (perm: string): boolean => {
        const u = currentUser;
        if (!u || u.role !== UserRole.ADMIN) return false;
        if ((u as any).mainAdmin === true || u.id === 'master' || u.id === 'admin' || u.email === 'admin@mercado.com') return true;
        const perms = u.permissions;
        if (perms === undefined) return true; // admin legado sem o campo = acesso total
        return perms.includes('all') || perms.includes(perm);
    };

    const requirePermission = (perm: string): boolean => {
        if (isAdminAllowed(perm)) return true;
        showNotification('Seu acesso foi restringido pelo administrador principal.', 'error');
        return false;
    };

    const approveUser = async (uid: string) => {
        if (!currentUser || currentUser.role !== UserRole.ADMIN || !requirePermission('users')) return;
        try { await updateDoc(doc(db, 'users', uid), { status: 'active', approved: true }); } catch (e: any) { showNotification("Erro ao aprovar usuÃ¡rio", "error"); }
    };
    const suspendUser = async (uid: string, status: boolean) => {
        if (!currentUser || currentUser.role !== UserRole.ADMIN || !requirePermission('users')) return;
        try { await updateDoc(doc(db, 'users', uid), { status: status ? 'suspended' : 'active', suspended: status }); } catch (e: any) { showNotification("Erro ao suspender usuÃ¡rio", "error"); }
    };
    const toggleUserCredit = async (uid: string, allow: boolean) => {
        if (!currentUser || currentUser.role !== UserRole.ADMIN || !requirePermission('wallet')) return;
        try { await updateDoc(doc(db, 'users', uid), { allowCredit: allow }); } catch (e: any) { showNotification("Erro ao alterar crÃ©dito", "error"); }
    };
    const deleteUser = async (uid: string) => {
        if (!currentUser || currentUser.role !== UserRole.ADMIN || !requirePermission('users')) return;
        try {
            const alvo = users.find(u => u.id === uid);
            const roleAlvo = String(alvo?.role || '').toLowerCase();
            await updateDoc(doc(db, 'users', uid), { deleted: true, status: 'suspended' });
            if (alvo && (roleAlvo === 'admin' || roleAlvo === 'master')) {
                await registrarAuditClient('EXCLUIR_ADMIN', { usuarioId: uid, nome: alvo.name, email: alvo.email, permissao: alvo.permissions }, { status: 'ok' });
            }
        } catch (e: any) { showNotification("Erro ao excluir usuÃ¡rio", "error"); }
    };
    const updateUserStatus = async (uid: string, s: any) => {
        if (!currentUser || currentUser.role !== UserRole.ADMIN || !requirePermission('users')) return;
        try { await updateDoc(doc(db, 'users', uid), { status: s }); } catch (e: any) { showNotification("Erro ao atualizar status", "error"); }
    };

    const processInvoiceImport = async (data: InvoiceData, profitMargin: number) => {
        setIsLoading(true);
        try {
            const batch = writeBatch(db);
            let supplierId = '';

            // Nome normalizado SEM unidade de venda no final (CX, UN, KG...) â€”
            // "LEITE 1L (CX)" e "LEITE 1L UN" sÃ£o o MESMO produto.
            const normSemUnidade = (nome: string) => {
                return normalizeName(nome).replace(/(UN|CX|PCT|PCTE|FD|FDO|DSP|UNID|CART|LT|GR|KG|ML|L|G|M|CM|MM)$/g, '');
            };
            // Pesos/volumes embutidos no nome devem ser compatÃ­veis para fundir:
            // "ARROZ TIO JOAO 5KG" NUNCA funde com "ARROZ TIO JOAO 1KG".
            const pesosCompativeis = (a: string, b: string) => {
                const pesos = (s: string) => (s.match(/\d+[.,]?\d*\s*(?:KG|G|ML|L|M|GR|LT|CM|MM)/gi) || []).map(m => m.replace(/\s/g, ''));
                const pa = pesos(a), pb = pesos(b);
                if (pa.length === 0 || pb.length === 0) return true;
                return pa[0] === pb[0];
            };
            // Predicado de duplicidade (testado em dedup_test): EANs divergentes
            // NUNCA fundem; sem EAN, exige nome equivalente (sem unidade) ou
            // similaridade alta + peso/volume compatÃ­vel.
            const ehDuplicado = (p: Product, item: InvoiceData['items'][number]) => {
                const eanItem = String(item.ean || item.barcode || '').replace(/^0+/, '').trim();
                const eanProd = String(p.ean || p.barcode || '').replace(/^0+/, '').trim();
                if (eanItem && eanProd) return eanItem === eanProd;
                const nI = normSemUnidade(item.name);
                const nP = normSemUnidade(p.name || '');
                if (nI && nP && nI === nP) return true;
                if ((p.name || '').trim().toUpperCase() === (item.name || '').trim().toUpperCase()) return true;
                return stringSimilarity(nI, nP) >= 0.9 && pesosCompativeis(item.name, p.name || '');
            };

            // 1. Fornecedor
            if (data.supplier?.name) {
                const exSupplier = suppliers.find(s => (s.name || '').toLowerCase() === (data.supplier?.name || '').toLowerCase());
                if (exSupplier) {
                    supplierId = exSupplier.id;
                } else {
                    supplierId = crypto.randomUUID();
                    batch.set(doc(db, 'suppliers', supplierId), {
                        id: supplierId,
                        name: data.supplier?.name || 'Fornecedor',
                        cnpjOrCpf: data.supplier.cnpj || '',
                        contact: '',
                        description: 'ImportaÃ§Ã£o AutomÃ¡tica'
                    });
                }
            }

            let loadedCount = 0;
            let updatedCount = 0;
            let newCount = 0;
            const totalInXml = data.items.length;

            // Busca COMPLETA dos produtos existentes (o state `products` Ã© limitado a ~100)
            const allProducts: Product[] = [];
            {
                let lastDoc: any = null;
                for (;;) {
                    const q = lastDoc
                        ? query(collection(db, 'products'), orderBy('name', 'asc'), startAfter(lastDoc), limit(1000))
                        : query(collection(db, 'products'), orderBy('name', 'asc'), limit(1000));
                    const snap = await getDocs(q);
                    if (snap.empty) break;
                    snap.docs.forEach(d => allProducts.push({ ...d.data(), id: d.id } as Product));
                    if (snap.size < 1000) break;
                    lastDoc = snap.docs[snap.docs.length - 1];
                }
            }
            const localProducts = allProducts.filter(p => (p as any).deleted !== true);

            showNotification(`Iniciando processamento de ${totalInXml} itens do XML...`, 'info');

            // Commits em chunks de 400 (limite de 500 por batch)
            let pendingBatch: any = writeBatch(db);
            let pendingCount = 0;
            const flush = async () => {
                if (pendingCount === 0) return;
                await pendingBatch.commit();
                pendingBatch = writeBatch(db);
                pendingCount = 0;
            };

            for (const item of data.items) {
                const clean = cleanProductName(item.name);
                if (!clean) {
                    console.warn("Item ignorado (nome vazio apÃ³s limpeza):", item.name);
                    continue;
                }

                // Margem sanitizada: NaN/negativa cairia para 30% e preÃ§o viraria NaN.
                const margemSegura = Number.isFinite(Number(profitMargin)) && Number(profitMargin) >= 0 ? Number(profitMargin) : 30;
                // Defesa contra custo corrompido no XML (> R$ 100k/un):
                // zera para o operador cadastrar o custo correto.
                const costRaw = Math.max(Number(item.costPrice) || 0, 0);
                const cost = costRaw > 100000 ? 0 : costRaw;
                const qtyRaw = Math.max(Number(item.quantity) || 0, 0);
                const qty = qtyRaw > 999999 ? 1 : qtyRaw;
                const price = cost + (cost * (margemSegura / 100));

                // Busca exaustiva no cache local atualizado
                let exIndex = localProducts.findIndex(p => ehDuplicado(p, item));

                if (exIndex > -1) {
                    const ex = localProducts[exIndex];
                    const updatedProduct = {
                        ...ex,
                        stock: (ex.stock || 0) + qty,
                        costPrice: cost,
                        // A margem digitada MANDA: preço recalculado substitui o
                        // antigo (antes o Math.max impedia o preço de CAIR quando
                        // a nova margem era menor — valor não acompanhava a %).
                        price: parseFloat(price.toFixed(2)),
                        supplierId: supplierId || ex.supplierId,
                        ean: item.ean || ex.ean || item.barcode || ex.barcode || '',
                        barcode: item.barcode || item.ean || ex.barcode || ex.ean || '',
                        brand: item.brand || ex.brand || ''
                    };
                    pendingBatch.update(doc(db, 'products', ex.id), updatedProduct);
                    pendingCount++;
                    localProducts[exIndex] = updatedProduct;
                    updatedCount++;
                } else {
                    const id = crypto.randomUUID();
                    const newProduct: Product = {
                        id,
                        name: clean,
                        description: item.description || '',
                        category: item.category || 'Geral',
                        price: parseFloat(price.toFixed(2)),
                        costPrice: cost,
                        margin: profitMargin,
                        stock: qty,
                        imageUrl: '',
                        available: true,
                        restricted: false,
                        supplierId,
                        weight: 'UN',
                        ean: item.ean || item.barcode || '',
                        barcode: item.barcode || item.ean || '',
                        brand: item.brand || ''
                    };
                    pendingBatch.set(doc(db, 'products', id), newProduct);
                    pendingCount++;
                    localProducts.push(newProduct);
                    newCount++;
                }
                loadedCount++;
                if (pendingCount >= 400) await flush();
            }

            await flush();
            await batch.commit();
            showNotification(`ImportaÃ§Ã£o concluÃ­da! Detectados: ${totalInXml} | Adicionados: ${newCount} | Atualizados: ${updatedCount}`, 'success');
            if (newCount + updatedCount < totalInXml) {
                showNotification(`${totalInXml - (newCount + updatedCount)} itens foram ignorados ou fundidos por duplicidade EAN.`, 'warning');
            }
        } catch (e: any) {
            console.error("Erro na importaÃ§Ã£o:", e);
            showNotification('Erro ao processar XML: ' + e.message, 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const importXmlProduct = async (file: File, margin: number) => { const text = await file.text(); const data = parseInvoiceXML(text); if (data) await processInvoiceImport(data, margin); else throw new Error("Erro no XML"); };

    // Pré-visualização da NFe antes de importar: mostra custo unitário detectado
    // de cada item para o operador conferir e definir a margem com segurança.
    const previewXmlImport = async (file: File) => {
        const text = await file.text();
        const data = parseInvoiceXML(text);
        if (!data) return [];
        return data.items.map(i => ({
            name: i.name,
            cost: Number(i.costPrice) || 0,
            qty: Number(i.quantity) || 0,
        }));
    };

    // Varre o catÃ¡logo inteiro e zera preÃ§o/custo absurdos (> R$ 100.000/un),
    // recuperando produtos corrompidos por NFe defeituosa (ex: margarina a R$ 78 bilhÃµes).
    const sanitizeCatalog = async () => {
        const PLACAO = 100000;
        let corrigidos = 0;
        let lastDoc: any = null;
        for (;;) {
            const q = lastDoc
                ? query(collection(db, 'products'), orderBy('name', 'asc'), startAfter(lastDoc), limit(1000))
                : query(collection(db, 'products'), orderBy('name', 'asc'), limit(1000));
            const snap = await getDocs(q);
            if (snap.empty) break;
            const batch = writeBatch(db);
            let batchCount = 0;
            for (const d of snap.docs) {
                const p = d.data() as any;
                const preco = Number(p.price);
                const custo = Number(p.costPrice);
                const novoPreco = preco > PLACAO ? 0 : preco;
                const novoCusto = custo > PLACAO ? 0 : custo;
                if (novoPreco !== preco || novoCusto !== custo) {
                    batch.set(doc(db, 'products', d.id), { price: novoPreco, costPrice: novoCusto }, { merge: true });
                    batchCount++;
                }
            }
            if (batchCount > 0) {
                await batch.commit();
                corrigidos += batchCount;
            }
            if (snap.size < 1000) break;
            lastDoc = snap.docs[snap.docs.length - 1];
        }
        if (corrigidos > 0) {
            setProducts(prev => prev.map(p => ({
                ...p,
                price: Number(p.price) > PLACAO ? 0 : Number(p.price),
                costPrice: Number(p.costPrice) > PLACAO ? 0 : Number(p.costPrice)
            })));
            showNotification(`SanitizaÃ§Ã£o: ${corrigidos} produto(s) com preÃ§o/custo corrompido zerado(s).`, 'success');
        } else {
            showNotification('CatÃ¡logo Ã­ntegro â€” nenhum preÃ§o absurdo encontrado.', 'info');
        }
        return corrigidos;
    };
    const updateSettings = async (c: AppConfig) => {
        try {
            const synced = { ...c };
            if ('allow_balance_purchases' in synced) {
                synced.enablePrisonerWallet = !!synced.allow_balance_purchases;
            }
            if ('enablePrisonerWallet' in synced && !('allow_balance_purchases' in synced)) {
                synced.allow_balance_purchases = !!synced.enablePrisonerWallet;
            }
            const { secondaryPassword, adminPassword, ...seguro } = synced as any;
            await setDoc(doc(db, 'settings', 'general'), seguro, { merge: true });
            setAppConfig(seguro);
            showNotification('ConfiguraÃ§Ãµes salvas!', 'success');
        } catch (e: any) {
            showNotification("Erro ao salvar configuraÃ§Ãµes: " + e.message, "error");
        }
    };

    // FunÃ§Ã£o de ativaÃ§Ã£o do sistema (TOKEN-BASED)
    const generateActivationKey = async (days: number): Promise<string> => {
        const hex = (Math.random().toString(16).slice(2, 6) + Math.random().toString(16).slice(2, 6) + Math.random().toString(16).slice(2, 6) + Math.random().toString(16).slice(2, 6)).toUpperCase();
        const token = hex.match(/.{1,4}/g)?.join('-') || hex;
        const clean = token.replace(/-/g, '').toLowerCase();
        try {
            await setDoc(doc(db, 'system_licenses', clean), {
                status: 'active',
                expiresAt: new Date(Date.now() + days * 86400000).toISOString(),
                createdAt: new Date().toISOString(),
            });
        } catch (e: any) {
            console.warn('[generateActivationKey]', e.message);
        }
        return token;
    };

    const activateSystem = async (token: string): Promise<{ success: boolean; message: string }> => {
        setIsLoading(true);
        try {
            const cleanToken = token.trim().toUpperCase();
            // Regex para validar formato XXXX-XXXX-XXXX-XXXX
            const tokenRegex = /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
            
            if (!tokenRegex.test(cleanToken)) {
                return { success: false, message: 'Formato de token invÃ¡lido. Use XXXX-XXXX-XXXX-XXXX' };
            }

            // Busca o token na coleÃ§Ã£o system_licenses
            const licenseRef = doc(db, 'system_licenses', cleanToken);
            const licenseSnap = await getDoc(licenseRef);

            if (!licenseSnap.exists()) {
                return { success: false, message: 'Token de ativaÃ§Ã£o nÃ£o encontrado ou jÃ¡ utilizado.' };
            }

            const licenseData = licenseSnap.data();
            
            if (licenseData.status !== 'active') {
                return { success: false, message: 'Este token estÃ¡ desativado ou jÃ¡ expirou.' };
            }

            const expiresAt = new Date(licenseData.expiresAt);
            if (expiresAt < serverTime) {
                return { success: false, message: 'Token expirado. Entre em contato com o suporte.' };
            }

            // Ativa o sistema atualizando a config global
            const newConfig = {
                ...appConfig,
                activationKey: cleanToken,
                activationDate: new Date().toISOString(),
                expirationDate: licenseData.expiresAt,
                isTrial: false
            };
            
            await updateSettings(newConfig);
            
            // Marca o token como utilizado para impedir reuso
            await updateDoc(licenseRef, { status: 'used', usedAt: new Date().toISOString() });

            return { success: true, message: 'Sistema ativado com sucesso!' };
        } catch (e: any) {
            console.error('Erro na ativaÃ§Ã£o:', e);
            return { success: false, message: 'Erro ao validar token: ' + e.message };
        } finally {
            setIsLoading(false);
        }
    };

    // Verificar se sistema estÃ¡ ativo (baseado na data de expiraÃ§Ã£o da licenÃ§a)
    const isSystemActive = useMemo(() => {
        if (!appConfig.expirationDate) return true;
        const expDate = new Date(appConfig.expirationDate);
        return expDate > serverTime;
    }, [appConfig.expirationDate, serverTime]);

    // NormalizaÃ§Ã£o automÃ¡tica de dados legados (Adiciona deleted: false onde falta)
    const normalizeLegacyDocuments = async () => {
        if (currentUser?.role !== UserRole.ADMIN) return;
        try {
            const allRefs: import('firebase/firestore').DocumentReference[] = [];
            
            const pSnap = await getDocs(collection(db, 'products'));
            pSnap.docs.forEach(d => {
                if (d.data().deleted === undefined) allRefs.push(d.ref);
            });

            const uSnap = await getDocs(collection(db, 'users'));
            uSnap.docs.forEach(d => {
                if (d.data().deleted === undefined) allRefs.push(d.ref);
            });

            let count = 0;
            for (let i = 0; i < allRefs.length; i += 500) {
                const batch = writeBatch(db);
                const chunk = allRefs.slice(i, i + 500);
                chunk.forEach(ref => batch.update(ref, { deleted: false }));
                await batch.commit();
                count += chunk.length;
            }

            if (count > 0) {
                console.log(`[NORMALIZE] ${count} registros legados atualizados.`);
            }
        } catch (e) { console.error('Erro na normalizaÃ§Ã£o:', e); }
    };
    const updateAppConfig = updateSettings;
    const downloadBackup = async () => {
        // 1) Tenta baixar o BACKUP COMPLETO do servidor (diÃ¡rio/manual gerado
        //    pela Cloud Function â€” o export local abaixo Ã© sÃ³ um recorte parcial).
        try {
            const listaRes: any = await fnListarBackups({});
            const backups = (listaRes?.data?.backups || []) as { nome: string; tamanho: number }[];
            if (backups.length > 0) {
                const baixarRes: any = await fnBaixarBackup({ nome: backups[0].nome });
                const url = baixarRes?.data?.url;
                if (url) {
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = backups[0].nome.split('/').pop() || 'backup-mercado-facil.json';
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    return;
                }
            }
        } catch (e: any) {
            console.warn('[backup] Servidor indisponÃ­vel, usando export local parcial:', e?.message);
        }
        // 2) Fallback: export local dos dados em memÃ³ria (parcial)
        const sanitizeUsers = (users || []).map((u: any) => {
            const { password, secondaryPassword, adminPassword, ...limpo } = u || {};
            return limpo;
        });
        const { adminPassword, secondaryPassword, ...configSeguro } = appConfig || {};
        const data = { users: sanitizeUsers, products, orders, suppliers, expenses, logs, appConfig: configSeguro, timestamp: new Date().toISOString() };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `backup-mercado-facil-parcial-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };
    const backupSystem = downloadBackup;
    const registrarAuditClient = async (acaoTipo: string, payloadAntes: any = null, payloadDepois: any = null) => {
        if (!currentUser) return;
        try {
            await addDoc(collection(db, 'audit_logs'), {
                operadorUid: currentUser.id,
                timestamp: new Date().toISOString(),
                acaoTipo,
                payloadAntes,
                payloadDepois,
            });
        } catch (e: any) {
            console.warn('[audit]', e.message);
        }
    };
    const resetSystem = async (confirm: boolean) => {
        if (!confirm || currentUser?.role !== UserRole.ADMIN) return;
        setIsLoading(true);
        try {
            // Reset agora roda NO SERVIDOR, sÃ³ para admin principal, com
            // rate limit â€” nÃ£o Ã© mais possÃ­vel apagar o banco do cliente.
            await fnResetarSistemaTotal({ confirmar: true });
            showNotification("Sistema resetado com sucesso!", "success");
            window.location.reload();
        } catch (e: any) {
            showNotification("Erro ao resetar: " + e.message, "error");
        } finally {
            setIsLoading(false);
        }
    };
    const resetStock = async () => {
        if (!currentUser || currentUser.role !== UserRole.ADMIN) return;
        setIsLoading(true);
        try {
            const snapshot = await getDocs(query(collection(db, 'products')));
            const ativos = snapshot.docs.map(d => ({ id: d.id, ...(d.data() as any) })).filter(p => (p as any).deleted !== true);
            const antes = ativos.map(p => ({ id: p.id, nome: p.name, estoque: p.stock }));
            for (let i = 0; i < ativos.length; i += 500) {
                const batch = writeBatch(db);
                const chunk = ativos.slice(i, i + 500);
                chunk.forEach(p => batch.update(doc(db, 'products', p.id), { stock: 0 }));
                await batch.commit();
            }
            await registrarAuditClient('ZERAR_ESTOQUE', { produtos: antes }, { status: 'ok', produtosZerados: ativos.length });
            showNotification('Estoque zerado', 'success');
        } catch (e: any) {
            showNotification("Erro ao zerar estoque", "error");
        } finally {
            setIsLoading(false);
        }
    };
    const registerUser = async (d: Partial<User>, f: File | null) => {
        setIsLoading(true);
        try {
            const cleanInmateCpf = (d.prisonerCpf || d.inmateCpf || '').replace(/\D/g, '');
            const preRegistered = preRegisteredInmates.find(inmate => (inmate?.cpf || '').replace(/\D/g, '') === cleanInmateCpf);
            const inmateName = preRegistered ? preRegistered.name : (d.inmateName || d.prisonerName);
            // ValidaÃ§Ãµes de prÃ©-cadastro e limite de familiares sÃ£o feitas no servidor
            // (registrarUsuario), pois o cliente ainda nÃ£o estÃ¡ autenticado no momento do cadastro.

            // Cria a conta no Firebase Auth + documento do usuÃ¡rio (via Cloud Function)
            const res = await fnRegistrarUsuario({
                dados: {
                    name: d.name || '',
                    cpf: d.cpf || '',
                    email: d.email || '',
                    phone: d.phone || '',
                    inmateCpf: cleanInmateCpf,
                    inmateName: inmateName,
                    prisonerCpf: cleanInmateCpf,
                    prisonerName: inmateName,
                    role: d.role || UserRole.FAMILY
                },
                senha: (d as any).password || ''
            });
            const data = res.data as any;

            // Entra automaticamente para permitir upload do documento de identidade
            // (exceto contas administrativas â€” criaAdminUser/fluxo admin nÃ£o usa auto-login)
            if (data?.userId && (d.role || UserRole.FAMILY) !== UserRole.ADMIN) {
                try {
                    const loginInfo = await fnBuscarLoginInfo({ identificador: d.cpf || '' });
                    const info = loginInfo.data as any;
                    await signInWithEmailAndPassword(auth, info.authEmail, (d as any).password || '');
                } catch (e) {
                    console.warn('[registerUser] Auto-login falhou:', e);
                }
                if (f) {
                    try {
                        const docUrl = await uploadFile(f, 'docs', { kind: 'users', docId: data.userId });
                        await updateDoc(doc(db, 'users', data.userId), { documentUrl: docUrl }).catch(() => {});
                    } catch (e) {
                        console.warn('[registerUser] Upload do documento falhou:', e);
                    }
                }
            }

            return { success: true, message: 'Cadastro enviado com sucesso! Aguarde a aprovaÃ§Ã£o.' };
        } catch (e: any) {
            throw new Error(e.message);
        } finally {
            setIsLoading(false);
        }
    };

    const createAdminUser = async (d: Partial<User>) => {
        try {
            await fnCriarAdmin({
                nome: d.name || '',
                email: d.email || '',
                cpf: d.cpf || '',
                senha: (d as any).password || '',
                permissions: Array.isArray((d as any).permissions) && (d as any).permissions.length
                    ? (d as any).permissions
                    : ['all']
            });
            showNotification('Admin criado', 'success');
        } catch (e: any) {
            showNotification('Erro ao criar admin: ' + e.message, 'error');
        }
    };
    const updateAdminPermissions = async (userId: string, permissions: string[]) => {
        try {
            await fnAtualizarPermissoesAdmin({ userId, permissions: Array.isArray(permissions) ? permissions : [] });
            showNotification('PermissÃµes atualizadas', 'success');
        } catch (e: any) {
            showNotification('Erro ao atualizar permissÃµes: ' + e.message, 'error');
        }
    };
    const validateRecovery = async (userCpf: string, prisonerCpf: string, nomeCompleto: string): Promise<User> => {
        setIsLoading(true);
        try {
            // Valida no servidor (CPF do usuÃ¡rio + CPF do interno + nome completo cadastrado)
            await fnRedefinirSenhaPublica({ cpf: userCpf, cpfInterno: prisonerCpf, nomeCompleto, novaSenha: '__VALIDACAO__' });
            return { id: 'validated', cpf: userCpf, name: 'Validado' } as User;
        } finally { setIsLoading(false); }
    };

    const resetUserPassword = async (cpf: string, pCpf: string, pass: string, nomeCompleto: string) => {
        setIsLoading(true); try {
            await fnRedefinirSenhaPublica({ cpf, cpfInterno: pCpf, nomeCompleto, novaSenha: pass });
            showNotification("Senha alterada com sucesso!", "success");
        } catch (e: any) { throw new Error(e.message); } finally { setIsLoading(false); }
    };

    const sendSystemMessage = async (msg: Partial<SystemMessage>) => { try { await addDoc(collection(db, 'systemMessages'), { id: crypto.randomUUID(), createdAt: new Date().toISOString(), type: 'info', ...msg }); } catch (e: any) { console.warn("[sendSystemMessage]", e.message); } };
    const sendMessage = async (m: Message) => {
        // PROPAGA o erro: engolir aqui fazia a tela apagar o texto como se tivesse
        // enviado — comunicado oficial para familiar era perdido em silêncio.
        const { id: _id, ...rest } = m;
        const now = new Date().toISOString();
        await addDoc(collection(db, 'messages'), {
            ...rest,
            date: rest.date || now,
            createdAt: (rest as any).createdAt || rest.date || now,
            read: !!rest.read,
            fromAdmin: !!rest.fromAdmin
        });
    };
    const markMessageRead = async (id: string) => { try { const msg = messages.find(m => m.id === id); if (msg) await updateDoc(doc(db, 'messages', id), { read: true }); } catch (e: any) { console.warn("[markMessageRead]", e.message); } };

    const searchOrders = async (term: string): Promise<Order[]> => {
        if (!term) return [];
        try {
            const docRef = doc(db, 'orders', term);
            const docSnap = await getDoc(docRef);
            if (docSnap?.exists()) return [docSnap.data() as Order];
        } catch (e) { console.warn('[searchOrders] ID lookup failed:', e); }

        // Search by user CPF (sanitized)
        const cleanTerm = term.replace(/\D/g, '');
        if (cleanTerm.length >= 3) {
            const qCpf = query(collection(db, 'orders'), where('userCpf', '==', cleanTerm), orderBy('createdAt', 'desc'), limit(50));
            const snapCpf = await getDocs(qCpf);
            if (!snapCpf.empty) return snapCpf.docs.map(d => d.data() as Order);
        }

        return [];
    };
    const resetFinance = async () => {
        if (!currentUser || currentUser.role !== UserRole.ADMIN) return;
        try {
            const [expSnap, cashSnap, cashSessionsSnap] = await Promise.all([
                getDocs(collection(db, 'expenses')),
                getDocs(collection(db, 'cashier')),
                getDocs(collection(db, 'cash_sessions'))
            ]);
            const antes = { despesas: expSnap.size, sessoesCaixa: cashSnap.size, sessoesCaixaNovas: cashSessionsSnap.size };
            const allRefs = [...expSnap.docs, ...cashSnap.docs, ...cashSessionsSnap.docs].map(d => d.ref);
            for (let i = 0; i < allRefs.length; i += 500) {
                const batch = writeBatch(db);
                const chunk = allRefs.slice(i, i + 500);
                chunk.forEach(ref => batch.delete(ref));
                await batch.commit();
            }
            await registrarAuditClient('ZERAR_FINANCEIRO', antes, { status: 'ok' });
            showNotification("Financeiro zerado com sucesso.", "success");
        } catch (e: any) {
            showNotification("Erro ao zerar financeiro: " + e.message, "error");
        }
    };

    const resetCredits = async () => {
        if (!currentUser || currentUser.role !== UserRole.ADMIN) return;
        try {
            const snapshot = await getDocs(collection(db, 'users'));
            const antes = snapshot.docs.map(d => ({ id: d.id, nome: d.data().name || '', saldo: Number(d.data().walletBalance || 0) })).filter(u => u.saldo > 0);
            const agora = new Date().toISOString();
            for (let i = 0; i < snapshot.docs.length; i += 500) {
                const batch = writeBatch(db);
                const chunk = snapshot.docs.slice(i, i + 500);
                chunk.forEach(d => {
                    const saldo = Number(d.data().walletBalance || 0);
                    if (saldo > 0) {
                        // Trilha no extrato: cada carteira zerada vira uma correÃ§Ã£o visÃ­vel,
                        // mantendo o extrato coerente com o saldo (antes sumia sem registro).
                        const txRef = doc(collection(db, 'wallet_transactions'));
                        batch.set(txRef, {
                            userId: d.id,
                            amount: -saldo,
                            type: 'correction',
                            status: 'approved',
                            description: 'Zeragem de crÃ©ditos (reset manual)',
                            createdAt: agora,
                            proofUrl: '',
                            payerName: currentUser.name || '',
                            payerId: currentUser.id,
                        });
                    }
                    batch.update(d.ref, { walletBalance: 0 });
                });
                await batch.commit();
            }
            await registrarAuditClient('ZERAR_CREDITOS', { usuariosComSaldo: antes }, { status: 'ok' });
            showNotification("Todos os crÃ©ditos foram zerados.", "success");
        } catch (e: any) {
            showNotification("Erro ao zerar crÃ©ditos: " + e.message, "error");
        }
    };

    const archiveData = async (orderIds: string[], expenseIds: string[]) => {
        setIsLoading(true);
        try {
            const batch = writeBatch(db);
            orderIds.forEach(id => batch.update(doc(db, 'orders', id), { deleted: true }));
            expenseIds.forEach(id => batch.update(doc(db, 'expenses', id), { deleted: true }));
            await batch.commit();
            showNotification(`${orderIds.length} pedidos e ${expenseIds.length} despesas arquivados e removidos.`, 'success');
        } catch (e: any) {
            showNotification('Erro ao limpar dados: ' + e.message, 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const depositToWallet = async (amount: number, proofFile: File) => {
        if (!currentUser) throw new Error('UsuÃ¡rio nÃ£o autenticado');
        const valorDeposito = Math.round((Number(amount) || 0) * 100) / 100;
        if (!(valorDeposito > 0)) throw new Error('Valor do depÃ³sito deve ser maior que zero.');
        try {
            const transaction: WalletTransaction = {
                id: crypto.randomUUID(),
                userId: currentUser.id,
                inmateCpf: currentUser.inmateCpf || currentUser.prisonerCpf || '',
                amount: valorDeposito,
                proofUrl: '',
                status: 'pending',
                createdAt: new Date().toISOString(),
                type: 'deposit',
                description: `DepÃ³sito via PIX por ${currentUser?.name || 'UsuÃ¡rio'}`,
                payerName: currentUser?.name || '',
                payerId: currentUser?.id || ''
            };
            const proofUrl = await uploadFile(proofFile, 'wallet_proofs', { kind: 'wallet_transactions', docId: transaction.id });
            transaction.proofUrl = proofUrl;
            if (proofUrl === "PENDENTE_UPLOAD_LOCAL_CACHE") {
                showNotification('ConexÃ£o instÃ¡vel: seu comprovante foi guardado e serÃ¡ enviado automaticamente quando a internet voltar.', 'info');
            }
            await setDoc(doc(db, 'wallet_transactions', transaction.id), transaction);
        } catch (e: any) {
            showNotification("Erro ao enviar comprovante: " + e.message, "error");
            throw e;
        }
    };

    const approveWalletTransaction = async (tid: string) => {
        try {
            const res = await fnAprovarDeposito({ transacaoId: tid });
            const data = res.data as any;
            if (data?.novoSaldo !== undefined && data?.novoSaldo !== null && currentUser?.role === UserRole.ADMIN) {
                const targetUser = users.find(u => u.id === data?.userId);
                if (targetUser && targetUser.id === currentUser.id) {
                    setCreditoCliente(Number(data.novoSaldo));
                    setCurrentUser(prev => prev ? ({ ...prev, walletBalance: Number(data.novoSaldo) }) : prev);
                }
            }
            showNotification("DepÃ³sito aprovado e crÃ©dito adicionado!", "success");
        } catch (e: any) {
            showNotification("Erro ao aprovar depÃ³sito: " + e.message, "error");
        }
    };

    const rejectWalletTransaction = async (tid: string) => {
        try {
            await fnRejeitarDeposito({ transacaoId: tid });
            showNotification("DepÃ³sito recusado.", "info");
        } catch (e: any) {
            showNotification("Erro ao recusar depÃ³sito: " + e.message, "error");
        }
    };

    const withdrawWalletCredit = async (uid: string, amount: number, reason: string, senhaMestra?: string) => {
        try {
            if (!currentUser || currentUser.role !== UserRole.ADMIN) throw new Error("Acesso negado.");
            const res = await fnSacarSaldoAdmin({ userId: uid, valor: amount, motivo: reason, senhaMestra });
            const data = res.data as any;
            if (currentUser.id === uid && data?.novoSaldo !== undefined) {
                setCreditoCliente(data.novoSaldo);
                setCurrentUser(prev => prev ? ({ ...prev, walletBalance: data.novoSaldo }) : prev);
            }
            showNotification("Retirada de crÃ©dito realizada.", "success");
        } catch (e: any) {
            showNotification(mensagemErroChamada(e), "error");
        }
    };

    const getWalletTransactions = async (userId?: string): Promise<WalletTransaction[]> => {
        try {
            let s;
            try {
                if (userId) {
                    const qUser = query(collection(db, 'wallet_transactions'), where('userId', '==', userId), orderBy('createdAt', 'desc'), limit(100));
                    s = await getDocs(qUser);
                } else {
                    const qAll = query(collection(db, 'wallet_transactions'), orderBy('createdAt', 'desc'), limit(100));
                    s = await getDocs(qAll);
                }
            } catch (queryError) {
                console.warn('[getWalletTransactions] Fallback preventivo acionado por falta de Ã­ndice ou erro de query:', queryError);
                // FALLBACK: Query simplificada sem orderBy (evita quebra por falta de Ã­ndice composto)
                if (userId) {
                    const qUserFallback = query(collection(db, 'wallet_transactions'), where('userId', '==', userId), limit(300));
                    s = await getDocs(qUserFallback);
                } else {
                    const qAllFallback = query(collection(db, 'wallet_transactions'), limit(300));
                    s = await getDocs(qAllFallback);
                }
            }

            const transactions = s.docs.map(d => ({ ...d.data(), id: d.id } as WalletTransaction));
            
            // OrdenaÃ§Ã£o manual via JS garante que o usuÃ¡rio sempre veja o mais recente primeiro
            return transactions.sort((a, b) => {
                const dateA = new Date(a.createdAt || 0).getTime();
                const dateB = new Date(b.createdAt || 0).getTime();
                return dateB - dateA;
            });
        } catch (e: any) {
            console.error('[getWalletTransactions] Erro fatal:', e);
            return [];
        }
    };

    const addSupplier = async (s: Supplier) => {
        if (!currentUser || currentUser.role !== UserRole.ADMIN) return;
        try { await setDoc(doc(db, 'suppliers', s.id), s); } catch (e: any) { showNotification("Erro ao adicionar fornecedor", "error"); }
    };
    const removeSupplier = async (id: string) => {
        if (!currentUser || currentUser.role !== UserRole.ADMIN) return;
        try { await deleteDoc(doc(db, 'suppliers', id)); } catch (e: any) { showNotification("Erro ao remover fornecedor", "error"); }
    };

    const deleteExpense = async (id: string) => {
        try {
            await updateDoc(doc(db, 'expenses', id), { deleted: true });
            showNotification("Despesa movida para a lixeira", "success");
        } catch (err) {
            showNotification("Erro ao excluir despesa", "error");
        }
    };

    const addExpense = async (e: Expense) => {
        try {
            const id = e.id || crypto.randomUUID();
            const expenseRef = doc(db, 'expenses', id);
            const valor = Math.round((Number(e.amount) || 0) * 100) / 100;

            // Despesa debitada do CAIXA FÃSICO: grava a despesa E a sangria na MESMA
            // transaÃ§Ã£o (atÃ´mico) â€” nunca uma fica sem a outra. Exige sessÃ£o aberta.
            if (e.debitAccount === 'CAIXA' && currentUser) {
                const sessao = await getActiveSession(currentUser.id);
                if (!sessao) {
                    throw new Error('Nenhuma sessÃ£o de caixa aberta para este operador. Abra o caixa antes de lanÃ§ar despesa debitada no caixa fÃ­sico.');
                }
                const sessaoRef = doc(db, 'cash_sessions', sessao.id);
                await runTransaction(db, async (tx) => {
                    const sessaoSnap = await tx.get(sessaoRef);
                    if (!sessaoSnap.exists() || String(sessaoSnap.data()?.status || '').toUpperCase() !== 'OPEN') {
                        throw new Error('A sessÃ£o de caixa foi fechada. Reabra o caixa antes de lanÃ§ar a despesa.');
                    }
                    tx.set(expenseRef, { ...e, id, amount: valor });
                    tx.update(sessaoRef, {
                        currentBalance: increment(-valor),
                        withdrawals: arrayUnion({
                            amount: valor,
                            reason: `Despesa: ${e.description || 'LanÃ§amento'}`,
                            timestamp: Timestamp.now(),
                        }),
                    });
                });
            } else {
                await setDoc(expenseRef, { ...e, id, amount: valor });
            }
        } catch (err: any) {
            console.error('[ADD_EXPENSE_ERROR]', err);
            throw err;
        }
    };

    const addWithdrawal = async (amount: number, description: string, observation?: string) => {
        try {
            if (!currentUser) return;
            const withdrawal: Expense = {
                id: crypto.randomUUID(),
                description: `[RETIRADA] ${description}`,
                amount,
                date: new Date().toISOString(),
                recipientName: currentUser?.name || '',
                recipientDoc: currentUser?.cpf || '',
                status: 'PAID',
                category: 'Retirada',
                type: 'OPERATIONAL' as any,
                observation: observation || 'Retirada de caixa manual',
                debitAccount: 'CAIXA'
            };
            await addExpense(withdrawal);
        } catch (e: any) {
            showNotification(e.message || "Erro ao registrar retirada.", "error");
        }
    };

    const toggleFinanceEntries = async () => {
        try {
            if (!currentUser) return;
            const newValue = !currentUser.showFinanceEntries;
            await updateDoc(doc(db, 'users', currentUser.id), { showFinanceEntries: newValue });
            setCurrentUser({ ...currentUser, showFinanceEntries: newValue });
        } catch (e: any) {
            console.warn("[toggleFinanceEntries]", e.message);
        }
    };

    const checkPermission = (permission: string): boolean => {
        const u = currentUser;
        if (!u) return false;
        if (u.role === UserRole.ADMIN || (u as any).role === 'master') return true;
        const perms = (u as any).permissions;
        return Array.isArray(perms) && (perms.includes('all') || perms.includes(permission));
    };

    const showNotification = (message: string, type: any = 'info') => {
        // HABILITADO PARA TODOS OS TIPOS - CorreÃ§Ã£o cirÃºrgica de lÃ³gica restritiva anterior
        const id = Math.random().toString(36).substring(2, 9);
        setNotifications(prev => {
            // Filtra notificaÃ§Ãµes idÃªnticas para evitar poluiÃ§Ã£o visual
            const filtered = prev.filter(n => n.message !== message);
            return [...filtered.slice(-3), { id, message, type }];
        });
    };

    const removeNotification = React.useCallback((id: string) => {
        setNotifications(prev => prev.filter(n => n.id !== id));
    }, []);

    // Converte erros de chamadas (httpsCallable) na mensagem REAL do servidor.
    // Antes o erro era mascarado com "Falha ao processar crÃ©dito." â€” o usuÃ¡rio
    // nunca sabia o motivo (senha nÃ£o configurada, senha errada, limite de
    // tentativas etc.). Agora a mensagem do HttpsError chega ao cliente e Ã©
    // traduzida para um texto acionÃ¡vel.
    const mensagemErroChamada = (e: any): string => {
        if (!e) return "Falha ao processar a operaÃ§Ã£o. Tente novamente.";
        const message = String(e?.message || '').replace(/^\(.*?\)\s*/, '').trim();
        const code = String(e?.code || e?.details?.code || '').toLowerCase().replace(/functions\//, '');
        if (/unauthenticated/i.test(code)) return "SessÃ£o expirada. Saia e entre novamente.";
        if (/unavailable|cancelled|deadline/i.test(code) || /unavailable|deadline|network/i.test(message)) {
            return "Servidor sem resposta. Verifique sua internet e tente novamente.";
        }
        if (/resource-exhausted|rate/i.test(code)) return "Muitas tentativas em pouco tempo. Aguarde 1 minuto e tente novamente.";
        if (message) return message;
        return "Falha ao processar a operaÃ§Ã£o. Tente novamente.";
    };

    const validateMasterPassword = async (pass: string) => {
        try {
            const res = await fnValidarSenhaMestra({ senha: pass || '' }) as any;
            return !!res.data?.ok;
        } catch (e) {
            console.warn('[validateMasterPassword]', e);
            return false;
        }
    };

    const defineMasterPassword = async (pass: string) => {
        try {
            const res = await fnDefinirSenhaMestra({ senha: pass || '' }) as any;
            return !!res.data?.ok;
        } catch (e: any) {
            console.warn('[defineMasterPassword]', e);
            showNotification("Erro ao salvar senha mestra: " + (e?.message || 'erro'), "error");
            return false;
        }
    };

    const masterPasswordStatus = async () => {
        try {
            const res = await fnValidarSenhaMestra({ senha: '' }) as any;
            return { definida: !!res.data?.definida, erro: false };
        } catch (e) {
            console.warn('[masterPasswordStatus]', e);
            return { definida: false, erro: true };
        }
    };

    const updateAdminPassword = async (newPass: string) => { newPass = newPass.trim();
        if (!currentUser || currentUser.role !== UserRole.ADMIN) { showNotification("Acesso negado.", "error"); return; }
        if (newPass.length < 6) { showNotification("A senha deve ter no mÃ­nimo 6 caracteres.", "error"); return; }
        try {
            await fnAlterarSenha({ novaSenha: newPass });
            showNotification("Senha de administrador atualizada com sucesso!", "success");
        } catch (e: any) {
            showNotification("Erro ao atualizar senha: " + (e?.message || 'erro'), "error");
        }
    };

    const addPreRegisteredInmate = async (inmate: { name: string, cpf: string, unit?: string, gallery?: string, cell?: string, observations?: string }) => {
        if (!currentUser || currentUser.role !== UserRole.ADMIN) return;
        try {
            const cleanCpf = (inmate.cpf || '').replace(/\D/g, '');
            if (cleanCpf.length !== 11) {
                showNotification("CPF invÃ¡lido para prÃ©-cadastro.", "error");
                return;
            }
            // Impede duplicidade: CPF jÃ¡ prÃ©-cadastrado (ou importado) nÃ£o entra de novo.
            if ((preRegisteredInmates || []).some(i => String(i.cpf || '').replace(/\D/g, '') === cleanCpf)) {
                showNotification("Este CPF jÃ¡ estÃ¡ prÃ©-cadastrado no sistema.", "error");
                return;
            }
            const id = crypto.randomUUID();
            await setDoc(doc(db, 'pre_registered_inmates', id), {
                name: (inmate.name || '').trim().toUpperCase(),
                cpf: cleanCpf,
                unit: (inmate.unit || '').trim().toUpperCase() || undefined,
                gallery: (inmate.gallery || '').trim().toUpperCase() || undefined,
                cell: (inmate.cell || '').trim().toUpperCase() || undefined,
                observations: (inmate.observations || '').trim() || undefined,
                status: 'ATIVO',
                id
            });
            showNotification("Interno prÃ©-cadastrado com sucesso!", "success");
        } catch (e: any) {
            showNotification("Erro ao prÃ©-cadastrar interno: " + e.message, "error");
        }
    };

    const updatePreRegisteredInmate = async (id: string, data: { name?: string, cpf?: string, unit?: string, gallery?: string, cell?: string, observations?: string, status?: 'ATIVO' | 'INATIVO' }) => {
        if (!currentUser || currentUser.role !== UserRole.ADMIN) return;
        try {
            const patch: Record<string, any> = {};
            if (data.name !== undefined) patch.name = (data.name || '').trim().toUpperCase();
            if (data.cpf !== undefined) {
                const cleanCpf = (data.cpf || '').replace(/\D/g, '');
                if (cleanCpf.length !== 11) { showNotification("CPF invÃ¡lido.", "error"); return; }
                if ((preRegisteredInmates || []).some(i => i.id !== id && String(i.cpf || '').replace(/\D/g, '') === cleanCpf)) {
                    showNotification("Este CPF jÃ¡ pertence a outro interno.", "error");
                    return;
                }
                patch.cpf = cleanCpf;
            }
            if (data.unit !== undefined) patch.unit = (data.unit || '').trim().toUpperCase();
            if (data.gallery !== undefined) patch.gallery = (data.gallery || '').trim().toUpperCase();
            if (data.cell !== undefined) patch.cell = (data.cell || '').trim().toUpperCase();
            if (data.observations !== undefined) patch.observations = (data.observations || '').trim();
            if (data.status !== undefined) patch.status = data.status;
            await setDoc(doc(db, 'pre_registered_inmates', id), patch, { merge: true });
            showNotification("Dados do interno atualizados!", "success");
        } catch (e: any) {
            showNotification("Erro ao atualizar interno: " + e.message, "error");
        }
    };

    const importInmatesCsv = async (file: File) => {
        if (!currentUser || currentUser.role !== UserRole.ADMIN) return;
        setIsLoading(true);
        try {
            const text = await file.text();
            const lines = text.split('\n');
            const entries: { id: string; name: string; cpf: string }[] = [];
            const seenCpfs = new Set<string>();
            // Deduplica também contra o banco: reimportar a planilha (ou importar
            // CPF já cadastrado à mão) NÃO cria o interno em duplicidade.
            const existingCpfs = new Set((preRegisteredInmates || []).map(i => String(i.cpf || '').replace(/\D/g, '')));
            let skippedExisting = 0;

            for (let line of lines) {
                const [name, cpf] = line.split(',').map(s => (s || '').trim());
                if (name && cpf) {
                    const cleanCpf = (cpf || '').replace(/\D/g, '');
                    if (cleanCpf.length !== 11 || seenCpfs.has(cleanCpf)) continue;
                    if (existingCpfs.has(cleanCpf)) { skippedExisting++; continue; }
                    seenCpfs.add(cleanCpf);
                    entries.push({ id: crypto.randomUUID(), name: name.toUpperCase(), cpf: cleanCpf });
                }
            }

            if (entries.length === 0) {
                showNotification("Nenhum dado vÃ¡lido encontrado no CSV. Use o formato: NOME,CPF", "warning");
                return;
            }

            for (let i = 0; i < entries.length; i += 500) {
                const batch = writeBatch(db);
                const chunk = entries.slice(i, i + 500);
                chunk.forEach(e => batch.set(doc(db, 'pre_registered_inmates', e.id), e));
                await batch.commit();
            }
            showNotification(`${entries.length} internos importados com sucesso!${skippedExisting > 0 ? ` (${skippedExisting} jÃ¡ existentes foram ignorados)` : ''}`, 'success');
        } catch (e: any) {
            showNotification("Erro na importaÃ§Ã£o: " + e.message, "error");
        } finally {
            setIsLoading(false);
        }
    };

    const deletePreRegisteredInmate = async (id: string) => {
        if (!currentUser || currentUser.role !== UserRole.ADMIN) return;
        try {
            await deleteDoc(doc(db, 'pre_registered_inmates', id));
            showNotification("Interno removido da lista.", "info");
        } catch (e: any) {
            showNotification("Erro ao remover interno: " + e.message, "error");
        }
    };



    // â”€â”€ ESTADO DE AUTENTICAÃ‡ÃƒO (Firebase Auth) â”€â”€
    // Carrega o usuÃ¡rio pelo authUid e sÃ³ entÃ£o libera os listeners de dados.
    useEffect(() => {
        let ativo = true;
        const unsub = onAuthStateChanged(auth, async (fbUser) => {
            if (!fbUser) {
                if (ativo) {
                    setCurrentUser(null);
                    setCreditoCliente(0);
                    setUsers([]);
                    setOrders([]);
                    setProducts([]);
                    setExpenses([]);
                    setSuppliers([]);
                    setMessages([]);
                    setPreRegisteredInmates([]);
                    setAppConfig(DEFAULT_CONFIG);
                    setAuthReady(true);
                    setIsLoading(false);
                }
                return;
            }
            try {
                const q = query(collection(db, 'users'), where('authUid', '==', fbUser.uid), limit(1));
                const snap = await getDocs(q);
                if (snap.empty) {
                    await signOut(auth).catch(() => {});
                    return;
                }
                const u = { id: snap.docs[0].id, ...snap.docs[0].data(), role: toUserRole(snap.docs[0].data().role) } as User;
                if (u.status === 'suspended' || u.status === 'pending') {
                    await signOut(auth).catch(() => {});
                    showNotification(u.status === 'suspended' ? 'Conta suspensa.' : 'Cadastro em anÃ¡lise.', 'error');
                    return;
                }
                if (ativo) {
                    setCurrentUser(u);
                    setCreditoCliente(u.walletBalance || 0);
                }
            } catch (e) {
                console.warn('[AUTH LOADER]', e);
            } finally {
                if (ativo) { setAuthReady(true); setIsLoading(false); }
            }
        });
        return () => { ativo = false; unsub(); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // â”€â”€ PDV OFFLINE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Vendas registradas sem internet ficam nesta fila local e sincronizam
    // sozinhas quando a rede volta (o id da venda Ã© o clientToken â†’ o
    // servidor nunca cria duplicata ao repetir a sincronizaÃ§Ã£o).
    const [vendasOffline, setVendasOffline] = useState<VendaOffline[]>(() => listarVendasOffline());

    const registrarVendaOffline = useCallback(async (
        targetUserId: string,
        items: any[],
        paymentMethod: 'PIX' | 'WALLET' | 'CASH' | 'MIXED' | 'FIADO',
        total: number,
        payments?: { method: string; amount: number }[],
        change?: number,
        customerAccountId?: string,
    ): Promise<Order | null> => {
        if (!currentUser || currentUser.role !== UserRole.ADMIN) {
            throw new Error('Acesso restrito a administradores.');
        }
        const agora = new Date().toISOString();
        const venda: VendaOffline = {
            id: `OFFLINE_${Date.now()}_${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
            createdAt: agora,
            targetUserId,
            items: (items || []).map((i: any) => ({
                productId: String(i?.productId || ''),
                name: String(i?.name || i?.productName || 'Produto'),
                price: Number(i?.price) || 0,
                quantity: Number(i?.quantity) || 1,
            })),
            paymentMethod,
            payments: payments || undefined,
            change: change ?? undefined,
            customerAccountId: customerAccountId || undefined,
            total: Number(total) || 0,
            status: 'pending',
            tryCount: 0,
        };
        salvarVendaOffline(venda);
        setVendasOffline((prev) => [...prev, venda]);
        const alvo = users.find((u) => u.id === targetUserId);
        return {
            id: venda.id,
            userId: targetUserId,
            userName: alvo?.name || 'BalcÃ£o',
            userCpf: alvo?.cpf,
            unitId: currentUser.unitId || '',
            items: venda.items.map((i) => ({ productId: i.productId, name: i.name, priceAtPurchase: i.price, quantity: i.quantity })),
            total: venda.total,
            status: 'offline_pending',
            createdAt: agora,
            date: agora,
            paymentMethod: venda.paymentMethod,
            payments: venda.payments,
            change: venda.change,
            offlinePending: true,
        } as unknown as Order;
    }, [currentUser, users]);

    const sincronizarVendasOffline = useCallback(async (incluirErros = false): Promise<{ ok: boolean; sincronizadas: number; comErro: number; total: number }> => {
        const fila = listarVendasOffline();
        const pendentes = incluirErros ? fila : fila.filter((v) => v.status === 'pending');
        if (!pendentes.length) return { ok: true, sincronizadas: 0, comErro: fila.filter((v) => v.status === 'error').length, total: fila.length };

        let sincronizadas = 0;
        let comErro = 0;
        for (const v of pendentes) {
            try {
                const res = await fnProcessarVendaAdmin({
                    targetUserId: v.targetUserId,
                    items: v.items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
                    clientToken: v.id,
                    paymentMethod: v.paymentMethod,
                    total: v.total,
                    payments: v.payments || undefined,
                    change: v.change ?? undefined,
                    customerAccountId: v.customerAccountId || undefined,
                });
                if (!(res.data as any)?.order) throw new Error('Servidor nÃ£o confirmou a venda.');
                removerVendaOffline(v.id);
                sincronizadas += 1;
            } catch (e: any) {
                marcarErroVendaOffline(v.id, e?.message || 'Falha ao sincronizar');
                comErro += 1;
            }
        }
        setVendasOffline(listarVendasOffline());
        return { ok: true, sincronizadas, comErro, total: listarVendasOffline().length };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Auto-sincronizaÃ§Ã£o: ao abrir o app online e quando a conexÃ£o voltar.
    useEffect(() => {
        const rodar = async () => {
            if (!currentUser || currentUser.role !== UserRole.ADMIN) return;
            const fila = listarVendasOffline();
            if (!fila.length) return;
            const r = await sincronizarVendasOffline(false);
            if (r.sincronizadas > 0) {
                showNotification(`Vendas offline sincronizadas: ${r.sincronizadas}.`, 'success');
            } else if (r.comErro > 0) {
                showNotification(`${r.comErro} venda(s) offline aguardando conferÃªncia no painel.`, 'warning');
            }
        };
        rodar();
        const handler = () => setTimeout(rodar, 2500);
        window.addEventListener('online', handler);
        return () => window.removeEventListener('online', handler);
    }, [currentUser, sincronizarVendasOffline, showNotification]);

    useEffect(() => {
        if (!authReady || !currentUser) return;

        let unsubUsers: Unsubscribe | null = null;
        let unsubOrders: Unsubscribe | null = null;
        let unsubProducts: Unsubscribe | null = null;
        let unsubConfig: Unsubscribe | null = null;
        let unsubExpenses: Unsubscribe | null = null;
        let unsubMsg: Unsubscribe | null = null;
        let unsubMsgAll: Unsubscribe | null = null;
        let unsubSup: Unsubscribe | null = null;
        let unsubInmates: Unsubscribe | null = null;
        let unsubSystemMsg: Unsubscribe | null = null;
        let timer: any = null;
        let safetyTimeout: any = null;

        const onErr = (label: string) => (err: Error) => {
            console.warn(`[Firebase:${label}]`, err.message);
            // Erros de cota (quota exceeded / resource-exhausted / usage-quota)
            // â†’ acende o alerta de cota para o admin agir (plano Blaze).
            const codigo = String((err as any)?.code || '');
            const mensagem = String(err?.message || '').toLowerCase();
            if (codigo.includes('resource-exhausted') ||
                mensagem.includes('quota exceeded') ||
                mensagem.includes('usage-quota') ||
                mensagem.includes('excedida') ||
                (codigo === 'permission-denied' && (mensagem.includes('quota') || mensagem.includes('500')))) {
                marcaCotaCritica();
            }
        };

        const semSenhasConfig = (cfg: any) => {
            const { adminPassword, secondaryPassword, ...seguro } = cfg || {};
            return seguro;
        };

        const initConfig = async () => {
            try {
                const configSnap = await getDoc(doc(db, 'settings', 'general'));
                if (!configSnap.exists()) {
                    // CriaÃ§Ã£o do config: apenas admin (regras exigem role admin)
                    if (currentUser?.role === UserRole.ADMIN) {
                        await setDoc(doc(db, 'settings', 'general'), semSenhasConfig(DEFAULT_CONFIG));
                    }
                    setAppConfig(DEFAULT_CONFIG);
                } else {
                    const data = configSnap.data();
                    if ((data.appName || '').toUpperCase().includes('JUMBO') || (data.systemName || '').toUpperCase().includes('JUMBO') || !(data.systemName || '') || (data.systemName || '').includes('FAMÃLIA')) {
                        const fixedData = { ...data, appName: 'MERCADO FÃCIL', systemName: 'MERCADO FÃCIL' };
                        await setDoc(doc(db, 'settings', 'general'), semSenhasConfig(fixedData), { merge: true });
                        setAppConfig({ ...DEFAULT_CONFIG, ...fixedData });
                    } else {
                        setAppConfig({ ...DEFAULT_CONFIG, ...data });
                    }
                }
            } catch (e) { console.warn('[Config Init]', e); }
        };

        const startListeners = async () => {
            unsubConfig = onSnapshot(doc(db, 'settings', 'general'), (docSnap: any) => {
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    setAppConfig({ ...DEFAULT_CONFIG, ...data });
                }
                setIsLoading(false);
            }, (err) => { onErr('config')(err); setIsLoading(false); });

            // Initialize config doc if needed (separate from listener to avoid write loop)
            initConfig();

            // Sync Secure Time
            getNetworkTime().then(t => setServerTime(t)).catch(() => {});
            timer = setInterval(() => getNetworkTime().then(t => setServerTime(t)).catch(() => {}), 1000 * 60 * 10); // Update every 10m

            // Safety timeout
            safetyTimeout = setTimeout(() => setIsLoading(false), 8000);

            unsubProducts = onSnapshot(query(collection(db, 'products'), orderBy('name', 'asc'), limit(productsLimit)), (snapshot) => {
                const items = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as Product));
                const filtered = items.filter(i => (i as any).deleted !== true);
                setProducts(filtered);
            }, onErr('products'));

            unsubSystemMsg = onSnapshot(query(collection(db, 'systemMessages'), orderBy('createdAt', 'desc'), limit(20)), (s) => setSystemMessages(s.docs.map(d => ({ ...d.data(), id: d.id } as SystemMessage))), onErr('systemMessages'));

if (currentUser?.role !== UserRole.ADMIN && currentUser) {
                const mergeMessages = (incoming: Message[]) => setMessages(prev => {
                    const map = new Map<string, Message>();
                    (prev || []).forEach(m => map.set(m.id, m));
                    incoming.forEach(m => map.set(m.id, m));
                    return Array.from(map.values()).sort((a, b) => ((b as any).createdAt || b.date || '').localeCompare((a as any).createdAt || a.date || ''));
                });

                // UNA ÚNICA query com 'in' substitui duas listeners separadas
                // (menor custo de leitura, mesma ordenação)
                unsubMsg = onSnapshot(
                    query(collection(db, 'messages'), where('userId', 'in', [currentUser.id, 'ALL']), orderBy('createdAt', 'desc'), limit(100)),
                    (s) => mergeMessages(s.docs.map(d => ({ ...d.data(), id: d.id } as Message))),
                    onErr('messages-merged')
                );
            }

            if (currentUser?.role === UserRole.ADMIN) {
                performAutoCleanup();
                normalizeLegacyDocuments(); // Iniciar normalizaÃ§Ã£o em background
                // orderBy garante paginação estável ao aumentar usersLimit
                unsubUsers = onSnapshot(query(collection(db, 'users'), orderBy('name', 'asc'), limit(usersLimit)), (snapshot) => {
                    // CONSUMER_USER Ã© sintÃ©tico (venda de balcÃ£o) e NÃƒO pertence Ã 
                    // lista real de usuÃ¡rios â€” se entra, polui contagens de
                    // familiares em relatÃ³rios/painÃ©is (MÃ‰DIA-2).
                    const dbUsers = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as User));
                    setUsers(dbUsers.filter(u => (u as any).deleted !== true && u.id !== 'consumidor_geral' && u.id !== 'balcao_anonimo'));
                }, onErr('users-admin'));
                const ordersQuery = query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(ordersLimit));
                unsubOrders = onSnapshot(ordersQuery, (snapshot) => {
                    const items = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as Order));
                    const filtered = items.filter(o => (o as any).deleted !== true);
                    if (filtered.length === 0 && snapshot.metadata.fromCache) {
                        getDocsFromServer(ordersQuery).then(serverSnap => {
                            const serverItems = serverSnap.docs.map(d => ({ ...d.data(), id: d.id } as Order));
                            setOrders(serverItems.filter(o => (o as any).deleted !== true));
                        }).catch(() => console.warn('[FALLBACK] getDocsFromServer orders-admin falhou'));
                        return;
                    }
                    setOrders(filtered);
                }, onErr('orders-admin'));
            } else if (currentUser) {
                unsubUsers = onSnapshot(doc(db, 'users', currentUser.id), (docSnap) => {
                    if (docSnap.exists()) {
                        const updatedUser = docSnap.data() as User;
                        setCurrentUser(prev => ({ ...prev, ...updatedUser }));
                        setCreditoCliente(updatedUser.walletBalance || 0);
                        if (updatedUser.status === 'suspended') logout();
                    }
                }, onErr('user-self'));
                setOrders([]);
            }

            if (currentUser?.role === UserRole.ADMIN) {
                unsubMsg = onSnapshot(query(collection(db, 'messages'), orderBy('createdAt', 'desc'), limit(100)), (s) => setMessages(s.docs.map(d => ({ ...d.data(), id: d.id } as Message))), onErr('messages'));
                unsubExpenses = onSnapshot(query(collection(db, 'expenses'), orderBy('date', 'desc'), limit(expensesLimit)), (snapshot) => {
                    const items = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as Expense));
                    setExpenses(items.filter(e => (e as any).deleted !== true));
                }, onErr('expenses'));
                unsubSup = onSnapshot(query(collection(db, 'suppliers'), orderBy('name', 'asc'), limit(suppliersLimit)), (snapshot) => setSuppliers(snapshot.docs.map(d => ({ ...d.data(), id: d.id } as Supplier))), onErr('suppliers'));
                unsubInmates = onSnapshot(query(collection(db, 'pre_registered_inmates'), orderBy('name', 'asc'), limit(inmatesLimit)), (snapshot) => setPreRegisteredInmates(snapshot.docs.map(d => ({ ...d.data(), id: d.id } as any))), onErr('pre-inmates'));
            }
        };

        startListeners();

        return () => {
            clearInterval(timer);
            clearTimeout(safetyTimeout);
            if (unsubUsers) unsubUsers();
            if (unsubOrders) unsubOrders();
            if (unsubProducts) unsubProducts();
            if (unsubConfig) unsubConfig();
            if (unsubExpenses) unsubExpenses();
            if (unsubMsg) unsubMsg();
            if (unsubSup) unsubSup();
            if (unsubInmates) unsubInmates();
            if (unsubSystemMsg) unsubSystemMsg();
        };
    }, [authReady, currentUser?.id, currentUser?.role, ordersLimit, expensesLimit, productsLimit, usersLimit]);

    return (
        <StoreContext.Provider value={{
            currentUser, users, products, productsCache, orders, units: INITIAL_UNITS, cart, appConfig, suppliers, expenses, logs, isLoading, authLoading: isLoading, systemMessages, messages, notifications, settings: appConfig, storageUsage, serverTime,
            creditoCliente, realizarSaque, verificarCredito, finalizarVendaComCredito,
            login, loginAdmin, loginFamiliar, logout, registerUser, recoverPassword, validateRecovery, createAdminUser, updateAdminPermissions, resetUserPassword,
            addToCart, removeFromCart, clearCart, createOrder, searchOrders,
            clearOldData: performAutoCleanup,
            archiveOldData: archiveData,
            activateSystem,
            generateActivationKey,
            isSystemActive,
            
            updateOrderStatus, aprovarPedido, markOrderAsPrinted, deleteOrder, addProduct, updateProduct, deleteProduct, deleteExpense,
            loadMoreOrders, loadMoreExpenses, loadMoreProducts, productsLimit, usersLimit, loadMoreUsers, expandUsersLimit, loadMoreSuppliers, loadMoreInmates, suppliersLimit, inmatesLimit, cotaCritica,
            approveUser, updateUserStatus, toggleUserCredit, deleteUser, suspendUser,
            addSupplier, removeSupplier, addExpense, addWithdrawal, toggleFinanceEntries,
            processInvoiceImport, importXmlProduct, previewXmlImport, sanitizeCatalog, updateAppConfig, updateSettings: updateAppConfig,
            downloadBackup, backupSystem: downloadBackup, resetSystem, resetStock, resetFinance, resetCredits, checkPermission, sendSystemMessage, sendMessage, markMessageRead, showNotification, removeNotification,
            depositToWallet, approveWalletTransaction, rejectWalletTransaction, getWalletTransactions, withdrawWalletCredit, attachAdminProof, reenviarComprovante,
            validateMasterPassword, defineMasterPassword, masterPasswordStatus, addPreRegisteredInmate, updatePreRegisteredInmate, deletePreRegisteredInmate, preRegisteredInmates, refundOrder, importInmatesCsv, updateAdminPassword,
            isInstallable: !!deferredPrompt, installApp,
            mergeDuplicateProducts: async () => {
                setIsLoading(true);
                try {
                    const snapshot = await getDocs(query(collection(db, 'products')));
                    const todos = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as Product)).filter(p => (p as any).deleted !== true);
                    const groups: Record<string, Product[]> = {};
                    todos.forEach(p => {
                        let key = p.ean ? String(p.ean).replace(/^0+/, '').trim() : '';
                        if (!key) key = normalizeName(p?.name || '');
                        if (!groups[key]) groups[key] = [];
                        groups[key].push(p);
                    });

                    let mergedCount = 0;
                    for (const key in groups) {
                        const group = groups[key];
                        if (group.length <= 1) continue;

                        // Sort to keep the highest price / most complete product as master
                        group.sort((a, b) => b.price - a.price);
                        const master = group[0];
                        let extraStock = 0;

                        const batch = writeBatch(db);
                        for (let i = 1; i < group.length; i++) {
                            const duplicate = group[i];
                            extraStock += (duplicate.stock || 0);
                            batch.update(doc(db, 'products', duplicate.id), { deleted: true, mergedInto: master.id });
                            mergedCount++;
                        }

                        if (extraStock > 0) {
                            batch.update(doc(db, 'products', master.id), {
                                stock: (master.stock || 0) + extraStock
                            });
                        }
                        await batch.commit();
                    }
                    showNotification(`Limpeza concluÃ­da! ${mergedCount} produtos duplicados foram fundidos.`, 'success');
                } finally {
                    setIsLoading(false);
                }
            },
            adminDirectSale: async (targetUserId, items, paymentMethod, total, payments: { method: 'PIX' | 'WALLET' | 'CASH' | 'CARD' | 'FIADO'; amount: number }[] | undefined, change, customerAccountId?: string, clientToken?: string, jointWallet?: { secondUserId: string; secondWalletAmount: number }) => {
                if (!currentUser || currentUser.role !== UserRole.ADMIN) {
                    throw new Error("Acesso restrito a administradores.");
                }
                const isConsumer = targetUserId === 'consumidor_geral' || targetUserId === 'balcao_anonimo';
                if (!isConsumer && !users.find(u => u.id === targetUserId)) throw new Error("UsuÃ¡rio nÃ£o encontrado.");

                const cleanObject = (obj: any): any => {
                    const newObj: any = {};
                    Object.keys(obj).forEach(key => {
                        if (obj[key] === undefined) return;
                        if (obj[key] !== null && typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
                            newObj[key] = cleanObject(obj[key]);
                        } else if (Array.isArray(obj[key])) {
                            newObj[key] = obj[key].map((item: any) =>
                                (typeof item === 'object' && item !== null) ? cleanObject(item) : item
                            );
                        } else {
                            newObj[key] = obj[key];
                        }
                    });
                    return newObj;
                };

                try {
                    // Venda processada NO SERVIDOR: preÃ§os, estoque, carteira e caixa validados no backend.
                    // clientToken = idempotÃªncia: um clique duplo/replay reenvia o mesmo token e o
                    // servidor devolve o pedido jÃ¡ criado, sem debitar 2x.
                    // O token Ã© gerado UMA vez por venda lÃ³gica no modal do PDV e reutilizado
                    // em reenvios (timeout/retry) â€” nunca um token novo por tentativa.
                    const saleToken = clientToken || crypto.randomUUID();
                    const payloadItems = (items || []).map((i: any) => ({ productId: i?.productId || '', quantity: Number(i?.quantity) || 1 }));
                    const res = await fnProcessarVendaAdmin({
                        targetUserId,
                        items: payloadItems,
                        clientToken: saleToken,
                        paymentMethod,
                        total: Number(total) || 0,
                        payments: payments || undefined,
                        change: change ?? undefined,
                        customerAccountId: customerAccountId || undefined,
                        jointWallet: jointWallet || undefined
                    });
                    const data = res.data as any;
                    const createdOrder = cleanObject(data?.order || null);

                    if (!createdOrder) {
                        throw new Error("Venda nÃ£o confirmada pelo servidor. Tente novamente.");
                    }

                    // Sincroniza saldo se a venda usou carteira do prÃ³prio admin logado
                    if (createdOrder?.walletBalanceAfter !== undefined && targetUserId === currentUser?.id) {
                        setCreditoCliente(createdOrder.walletBalanceAfter);
                        setCurrentUser(prev => prev ? ({ ...prev, walletBalance: createdOrder.walletBalanceAfter }) : prev);
                    }

                    showNotification("Venda realizada com sucesso!", "success");
                    return createdOrder;
                } catch (e: any) {
                    console.error("Erro na Venda Direta:", e);
                    showNotification(e.message || "Erro ao processar venda.", "error");
                    return null;
                }
            },
            registrarVendaOffline,
            sincronizarVendasOffline,
            vendasOfflinePendentes: vendasOffline.filter((v) => v.status === 'pending').length,
            vendasOfflineComErro: vendasOffline.filter((v) => v.status === 'error').length,
            addWalletCreditDirectly: async (userId: string, amount: number, reason: string, senhaMestra?: string) => {
                if (!currentUser || currentUser.role !== UserRole.ADMIN) throw new Error("Acesso restrito a administradores.");
                if (!(Number(amount) > 0)) throw new Error("Valor de crÃ©dito invÃ¡lido.");

        try {
            const res = await fnCreditarSaldo({ userId, valor: amount, motivo: `CrÃ©dito Adicionado (Admin): ${reason}`, senhaMestra });
            const data = res.data as any;
            if (currentUser.id === userId && data?.novoSaldo !== undefined) {
                setCreditoCliente(data.novoSaldo);
                setCurrentUser(prev => prev ? ({ ...prev, walletBalance: data.novoSaldo }) : prev);
            }
            showNotification(`CrÃ©dito de R$ ${formatarMoeda(amount)} adicionado com sucesso!`, 'success');
                } catch (error) {
                    console.error('Erro ao adicionar crÃ©dito:', error);
                    throw new Error(mensagemErroChamada(error));
                }
            },

        }}>
            {children}
        </StoreContext.Provider>
    );
};

export const useApp = () => {
    const context = useContext(StoreContext);
    if (!context) throw new Error("useApp must be used within StoreProvider");
    return context;
};
