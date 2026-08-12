import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode, useRef } from 'react';
import { User, Product, Order, PrisonUnit, UserRole, CartItem, OrderStatus, AppConfig, Supplier, Expense, AuditLog, InmateLocation, SystemMessage, ThemeOption, Message, Notification, WalletTransaction, toUserRole } from '../types';
import { cleanProductName, normalizeName, stringSimilarity, compressImageFile, fileToBase64, formatarMoeda, getNetworkTime } from '../utils';
import { queuePendingUpload, listPendingUploads, removePendingUpload, attachPendingUploadDoc } from '../services/localStorageService';
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
const fnProcessarVendaAdmin = httpsCallable(functions, 'processarVendaAdmin');
const fnEstornarVenda = httpsCallable(functions, 'estornarVenda');
const fnValidarSenhaMestra = httpsCallable(functions, 'validarSenhaMestra');
const fnDefinirSenhaMestra = httpsCallable(functions, 'definirSenhaMestra');

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

// ═══════════════════════════════════════════════════════════════════════════
// MÓDULO CONTÁBIL — MOTOR DE RELATÓRIOS FISCAIS (DRE / CSV / CURVA ABC)
// Alíquota estimada de impostos (Simples Nacional aproximado para consumo interno)
// ═══════════════════════════════════════════════════════════════════════════
export const ALIQUOTA_IMPOSTO_ESTIMADA = 0.07; // 7% — configuração fiscal estimada

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
  return isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString('pt-BR');
};

/**
 * 1) FECHAMENTO DE CAIXA MENSAL — DRE SIMPLIFICADO
 * Consolida o faturamento bruto, subtrai o custo de aquisição das mercadorias
 * (custos importados via NFe/XML — campo costPrice) e exibe o Lucro Líquido real.
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
 * 2) ARQUIVO DE MOVIMENTAÇÃO DE VENDAS (CSV/EXCEL PARA CONTADOR)
 * Data, Número do Cupom, CPF do Cliente (sanitizado), Forma de Pagamento,
 * Alíquota/Imposto Estimado e Valor Total.
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

// Parser para XML de nota fiscal eletrônica (NFe)
const parseInvoiceXML = (xml: string): InvoiceData | null => {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'text/xml');

    if (doc.querySelector('parsererror')) {
      console.error('Erro ao analisar XML');
      return null;
    }

    const result: InvoiceData = { items: [] };

    // Extrair fornecedor (emitente)
    const emit = doc.querySelector('emit');
    if (emit) {
      const nameEl = emit.querySelector('xNome');
      const cnpjEl = emit.querySelector('CNPJ');
      const cpfEl = emit.querySelector('CPF');

      result.supplier = {
        name: nameEl?.textContent?.trim() || '',
        cnpj: cnpjEl?.textContent?.trim() || cpfEl?.textContent?.trim() || ''
      };
    }

    // Se não encontrou emitente, tentar outro caminho (NFeProc)
    if (!result.supplier?.name) {
      const infNFe = doc.querySelector('infNFe');
      const emitAlt = infNFe?.querySelector('emit');
      if (emitAlt) {
        const nameEl = emitAlt.querySelector('xNome');
        const cnpjEl = emitAlt.querySelector('CNPJ');
        const cpfEl = emitAlt.querySelector('CPF');

        result.supplier = {
          name: nameEl?.textContent?.trim() || '',
          cnpj: cnpjEl?.textContent?.trim() || cpfEl?.textContent?.trim() || ''
        };
      }
    }

    // Extrair itens (produtos)
    const products = doc.querySelectorAll('det');
    products.forEach((prod) => {
      const prodElement = prod.querySelector('prod');
      if (!prodElement) return;

      const nameEl = prodElement.querySelector('xProd');
      const eanEl = prodElement.querySelector('cEAN');
      const eanTribEl = prodElement.querySelector('cEANTrib');
      const codeEl = prodElement.querySelector('cProd');
      const qtdEl = prodElement.querySelector('qCom');
      const qtdTribEl = prodElement.querySelector('qTrib');
      const unitEl = prodElement.querySelector('uCom');
      const unitTribEl = prodElement.querySelector('uTrib');
      const priceEl = prodElement.querySelector('vUnCom');
      const priceTribEl = prodElement.querySelector('vUnTrib');

      // Tentar obter marca do produto
      const name = nameEl?.textContent?.trim() || '';
      const ean = eanEl?.textContent?.trim() || eanTribEl?.textContent?.trim() || '';
      const code = codeEl?.textContent?.trim() || '';

      let brand = '';
      const brandList = [
        'ALBA', 'AVIANCA', 'BIC', 'LOREAL', 'NESTLE', 'NESTLÉ', 'DANONE', 'AMBEV', 'HEINEKEN', 'COCA COLA', 'COCA-COLA', 'PEPSI',
        'SKOL', 'BRASEIRO', 'PERNAMBUCANAS', 'HAVAN', 'SAMSUNG', 'LG', 'PHILCO', 'ELECTROLUX', 'BRASTEMP', 'CONSUL', 'XIAOMI',
        'MOTOROLA', 'APPLE', 'POSITIVO', 'MULTILASER', 'ARNO', 'MONDIAL', 'PARATI', 'MARILAN', 'UNILEVER', 'P&G', 'BRF', 'JBS',
        'AURORA', 'MINUANO', 'SADIA', 'PERDIGAO', 'PERDIGÃO', 'SEARA', 'KIMBERLY', 'COLGATE', 'PALMOLIVE', 'NIVEA', 'JOHNSON',
        'OAKLEY', 'NIKE', 'ADIDAS', 'PUMA', 'FILA', 'ASICS', 'MIZUNO', 'KAPPA', 'UMBRO', 'PENALTY', 'TOPPER', 'LUPO', 'TRIFIL',
        'HERING', 'MALWEE', 'MARISA', 'C&A', 'REACHUELO', 'RENNER', 'ZARA', 'LEVIS', 'DIESEL', 'CALVIN KLEIN', 'GUESS',
        'TOMMY HILFIGER', 'LACOSTE', 'HUGO BOSS', 'ARMANI', 'ROLEX', 'PANDORA', 'VIVARA', 'CHILLI BEANS', 'RAY-BAN',
        'NATURA', 'AVON', 'BOTICARIO', 'EUDORA', 'JEQUITI', 'PAMPERS', 'HUGGIES', 'TURMA DA MONICA', 'RENOVE', 'VEJA',
        'OMOR', 'IPÊ', 'LIMPOL', 'YPÊ', 'MINUANO', 'BOMBRIL', 'TIXAN', 'ARIEL', 'BRILHANTE', 'SUFRESH', 'TANG', 'MID',
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

      // Obter quantidade e preço com segurança (optional chaining + default names)
      const qStr = qtdEl?.textContent || qtdTribEl?.textContent || '1';
      const pStr = priceEl?.textContent || priceTribEl?.textContent || '0';
      
      let quantity = parseFloat(qStr.replace(',', '.'));
      let costPrice = parseFloat(pStr.replace(',', '.'));

      if (isNaN(quantity) || quantity <= 0) quantity = 1;
      if (isNaN(costPrice)) costPrice = 0;

      let category = 'Geral';
      const ncmEl = prodElement.querySelector('NCM');
      const ncm = ncmEl?.textContent?.trim() || '';
      if (ncm) {
        if (ncm.startsWith('02') || ncm.startsWith('03')) category = 'Carnes';
        else if (ncm.startsWith('04') || ncm.startsWith('05')) category = 'Laticínios';
        else if (ncm.startsWith('09')) category = 'Bebidas';
        else if (ncm.startsWith('16') || ncm.startsWith('19')) category = 'Massas';
        else if (ncm.startsWith('17') || ncm.startsWith('20')) category = 'Bebidas';
        else if (ncm.startsWith('21') || ncm.startsWith('22')) category = 'Chocolate';
        else if (ncm.startsWith('23')) category = 'Rações';
        else if (ncm.startsWith('24')) category = 'Bebidas Alcoólicas';
        else if (ncm.startsWith('25') || ncm.startsWith('28')) category = 'Cervejas';
        else if (ncm.startsWith('30') || ncm.startsWith('32')) category = 'Condimentos';
        else if (ncm.startsWith('33')) category = 'Sopas';
        else if (ncm.startsWith('34')) category = 'Sal';
        else if (ncm.startsWith('35')) category = 'Açúcar';
        else if (ncm.startsWith('36')) category = 'Café';
        else if (ncm.startsWith('38')) category = 'Sabão';
        else if (ncm.startsWith('39') || ncm.startsWith('40')) category = 'Sabonetes';
        else if (ncm.startsWith('44')) category = 'Perfumes';
        else if (ncm.startsWith('48')) category = 'Papel';
        else if (ncm.startsWith('49')) category = 'Revistas';
        else if (ncm.startsWith('61')) category = 'Medicamentos';
        else if (ncm.startsWith('62')) category = 'Higiene';
        else if (ncm.startsWith('63')) category = 'Absorventes';
        else if (ncm.startsWith('64') || ncm.startsWith('65')) category = 'Higiene Pessoal';
        else if (ncm.startsWith('70') || ncm.startsWith('73')) category = 'Limpeza';
        else if (ncm.startsWith('84')) category = 'Utensílios';
        else if (ncm.startsWith('85') || ncm.startsWith('87')) category = 'Eletrodomésticos';
        else if (ncm.startsWith('90')) category = 'Suprimentos';
        else if (ncm.startsWith('94')) category = 'Bebidas';
      }

      if (name && costPrice >= 0) {
        result.items.push({
          name,
          costPrice,
          quantity,
          category,
          description: `${code ? 'Código: ' + code + ' | ' : ''}NCM: ${ncm}`,
          ean: ean && ean !== 'SEM GTIN' ? ean : (code || undefined),
          barcode: ean && ean !== 'SEM GTIN' ? ean : (code || undefined),
          brand: brand || undefined
        });
      }
    });

    return result.items.length > 0 ? result : null;
  } catch (e) {
    console.error('Erro ao processar XML:', e);
    return null;
  }
};

import {
    collection, doc, setDoc, addDoc, updateDoc, deleteDoc, onSnapshot, query, where, getDocs, getDocsFromServer, orderBy, limit, startAfter, writeBatch, Unsubscribe, getDoc, runTransaction, increment, arrayUnion, Timestamp
} from 'firebase/firestore';
import { getActiveSession, addWithdrawal as addCashWithdrawal } from '../utils/cashSession';

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
    validateRecovery: (userCpf: string, prisonerCpf: string) => Promise<User>;
    resetUserPassword: (userCpf: string, prisonerCpf: string, newPass: string) => Promise<void>;

    addToCart: (product: Product, quantity?: number) => void;
    removeFromCart: (productId: string) => void;
    clearCart: () => void;
    createOrder: (data: Partial<Order> | File | null, location?: InmateLocation) => Promise<boolean>;

    searchOrders: (term: string) => Promise<Order[]>;
    clearOldData: () => Promise<void>;
    archiveOldData: (orderIds: string[], expenseIds: string[]) => Promise<void>;
    activateSystem: (token: string) => Promise<{ success: boolean; message: string }>;
    generateActivationKey: (days: number) => Promise<string>;
    isSystemActive: boolean;


    finalizarVendaComCredito: () => Promise<boolean>;

    updateOrderStatus: (orderId: string, status: string) => void;
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
    updateAppConfig: (config: AppConfig) => void;
    updateSettings: (config: AppConfig) => void;
    downloadBackup: () => void;
    backupSystem: () => void;
    resetSystem: (confirm: boolean) => void;
    resetStock: () => Promise<void>;
    resetFinance: () => Promise<void>;

    createAdminUser: (userData: Partial<User>) => Promise<void>;

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
    withdrawWalletCredit: (userId: string, amount: number, reason: string) => Promise<void>;
    getWalletTransactions: (userId?: string) => Promise<WalletTransaction[]>;

    checkPermission: (permission: string) => boolean;

    // PWA
    isInstallable: boolean;
    installApp: () => Promise<void>;
    validateMasterPassword: (password: string) => Promise<boolean>;
    defineMasterPassword: (password: string) => Promise<boolean>;
    masterPasswordStatus: () => Promise<{ definida: boolean }>;
    updateAdminPassword: (newPassword: string) => Promise<void>;

    preRegisteredInmates: { id: string, name: string, cpf: string }[];
    addPreRegisteredInmate: (inmate: { name: string, cpf: string }) => Promise<void>;
    deletePreRegisteredInmate: (id: string) => Promise<void>;

    creditoCliente: number;
    realizarSaque: (valor: number) => Promise<boolean>;
    verificarCredito: (valor: number) => boolean;
    refundOrder: (orderId: string, reason?: string) => Promise<void>;
    resetCredits: () => Promise<void>;
    mergeDuplicateProducts: () => Promise<void>;
    adminDirectSale: (targetUserId: string, items: any[], paymentMethod: 'PIX' | 'WALLET' | 'CASH' | 'CARD' | 'MIXED' | 'FIADO', total: number, payments?: { method: 'PIX' | 'WALLET' | 'CASH' | 'CARD' | 'FIADO'; amount: number }[], change?: number, customerAccountId?: string) => Promise<Order | null>;
    loadMoreOrders: () => void;
    loadMoreExpenses: () => void;
    loadMoreProducts: () => void;
    importInmatesCsv: (file: File) => Promise<void>;
    addWalletCreditDirectly: (userId: string, amount: number, reason: string) => Promise<void>;

}

const StoreContext = createContext<StoreContextType | undefined>(undefined);

const DEFAULT_CONFIG: AppConfig = {
    appName: ASSPEN_INFO.name.split(' - ')[0] || 'MERCADO FÁCIL',
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
    footerText: 'MERCADO FÁCIL - Sistema de Gestão Profissional',
    isTrial: true,

    customReceiptDocName: 'CUPOM DE ENTREGA',
    receiptMainTitleOrder: 'RECIBO DE VENDA',
    receiptMainTitleExpense: 'RECIBO DE PAGAMENTO',
    receiptFooter: 'Conferir os itens no ato da entrega. Não aceitamos reclamações posteriores.',

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

    // Armazenamento local com limite (evitar acúmulo)
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

    const loadMoreOrders = () => setOrdersLimit((prev: number) => prev + 50);
    const loadMoreExpenses = () => setExpensesLimit((prev: number) => prev + 50);
    const loadMoreProducts = () => setProductsLimit((prev: number) => prev + 500);

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
            showNotification('Sessão encerrada com segurança.', 'success');
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
                const event = new CustomEvent('session-expired', { detail: { message: "Sessão encerrada por inatividade." } });
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
            // Fechamento de caixa abandonado é feito pelo servidor (arquivarDadosAntigos:
            // auto-close de cash_sessions abertas há mais de 20h).

            // 2. Arquivar pedidos cancelados antigos (soft archive — preserva trilha de auditoria).
            // A rotina do servidor (arquivarDadosAntigos) é a fonte oficial do arquivamento.
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
                const qUsers = query(collection(db, 'users'), where('weeklySpent', '>', 0), limit(500));
                let userSnaps = await getDocs(qUsers);

                if (!userSnaps.empty) {
                    const batch = writeBatch(db);
                    userSnaps.docs.forEach(d => batch.update(d.ref, { weeklySpent: 0 }));
                    await batch.commit();
                }

                await setDoc(doc(db, 'settings', 'maintenance'), { lastWeeklyReset: mondayStr }, { merge: true });
                console.log('[WeeklyReset] Reset concluído.');
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
            showNotification('Usuário não autenticado', 'error');
            return false;
        }

        if (valor <= 0) {
            showNotification('Valor inválido para saque', 'error');
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
            showNotification('❌ Carrinho vazio!', 'error');
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

            showNotification(`Venda realizada! Total: R$ ${formatarMoeda(data?.order?.total || 0)}\nCrédito restante: R$ ${formatarMoeda(novoSaldo)}`, 'success');
            return true;
        } catch (error: any) {
            console.error('Erro ao finalizar venda:', error);
            const msg = error?.message || 'Erro ao processar venda';
            showNotification('❌ ' + (msg.includes('insuficiente') ? msg : 'Erro ao processar venda'), 'error');
            return false;
        }
    };

    const uploadFile = async (file: File, path: string, meta?: { kind?: string; docId?: string }): Promise<string> => {
        if (!file || file.size === 0) {
            throw new Error("Arquivo vazio. Selecione um arquivo válido.");
        }

        const MAX_FILE_SIZE = 8 * 1024 * 1024;
        const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.pdf', '.heic', '.heif'];

        if (file.size > MAX_FILE_SIZE) {
            throw new Error('Arquivo muito grande (máx. 8 MB).');
        }

        const ext = '.' + (file.name.split('.').pop() || '').toLowerCase();
        if (!ALLOWED_EXTENSIONS.includes(ext)) {
            throw new Error('Tipo de arquivo não permitido (JPG, PNG, HEIC ou PDF).');
        }

        try {
            const uid = currentUser?.id || 'anonimo';
            const folder = (path || 'uploads').replace(/^\/+|\/+$/g, '');
            const fileName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
            const fileRef = storageRef(storage, `${folder}/${uid}/${fileName}`);
            await uploadBytes(fileRef, file);
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
                    blob: file,
                });
                showNotification('Conexão instável: o comprovante foi guardado e será enviado automaticamente quando a internet voltar.', 'info');
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

    const retryPendingProofs = async (): Promise<void> => {
        try {
            const pendentes = await listPendingUploads();
            if (!pendentes.length) return;
            const uid = currentUser?.id || 'anonimo';
            let reenviados = 0;
            for (const p of pendentes) {
                try {
                    const file = new File([p.blob], p.fileName, { type: p.blob.type });
                    const fileRef = storageRef(storage, `${p.folder}/${uid}/${p.fileName}`);
                    await uploadBytes(fileRef, file);
                    const url = await getDownloadURL(fileRef);
                    if (p.kind && p.docId) {
                        // Só atualiza o documento se ele existir (evita fila-zumbi
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
                        console.warn('[retryPendingProofs] doc não existe, mantendo na fila:', p.kind, p.docId);
                        continue;
                    }
                    if (p.docId) {
                        await removePendingUpload(p.id);
                        reenviados += 1;
                    } else {
                        // Ainda sem vínculo (o pedido/cadastro ainda não foi criado):
                        // guarda a URL na fila e NÃO remove — o attach vai vincular depois.
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
            if (!info?.encontrado) return { success: false, message: 'Usuário não encontrado.' };

            if (expectedRole === UserRole.FAMILY && toUserRole(info.role) === UserRole.ADMIN) {
                return { success: false, message: 'Acesso Administrativo detectado. Por favor, utilize a aba Área Administrativa para entrar.' };
            }
            if (info.status === 'pending') return { success: false, message: 'Cadastro em análise.' };
            if (info.status === 'suspended') return { success: false, message: 'Conta suspensa.' };

            // Migração: usuário legado sem conta vinculada → provisiona (valida a senha atual no servidor)
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
                    return { success: false, message: msg || 'Erro de conexão.' };
                }
            }

            try {
                await signInWithEmailAndPassword(auth, info.authEmail, cleanPass);
            } catch (e: any) {
                return { success: false, message: 'Senha incorreta.' };
            }

            return { success: true };
        } catch (e: any) { return { success: false, message: 'Erro de conexão.' }; }
    };

    const loginAdmin = async (email: string, pass: string) => {
        try {
            const res = await fnBuscarLoginInfo({ identificador: email.trim() });
            const info = res.data as any;

            if (!info?.encontrado) {
                if (!info?.existemAdmins) {
                    throw new Error("Primeiro acesso do sistema: crie o administrador inicial na área administrativa.");
                }
                throw new Error("E-mail ou senha de administrador incorretos.");
            }
            if (toUserRole(info.role) !== UserRole.ADMIN) {
                throw new Error("Este e-mail não pertence a um administrador.");
            }
            if (info.status === 'suspended') throw new Error("Conta suspensa.");

            // Migração: admin legado sem conta vinculada → provisiona (valida a senha atual no servidor)
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
            if (info?.encontrado) return { success: true, message: 'Utilize a opção "Redefinir Senha" com seu CPF e o CPF do interno para criar uma nova senha.' };
            return { success: false, message: 'Usuário não encontrado.' };
        } catch (e: any) {
            return { success: false, message: 'Erro de conexão.' };
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

            // Preço anunciado é o cobrado: promoPrice quando ativo, senão price.
            const precoEfetivo = (Number(product.promoPrice) > 0) ? Number(product.promoPrice) : (Number(product.price) || 0);
            return [...cartArray, { ...product, productId: product.id, quantity: novaQtd, priceAtPurchase: precoEfetivo } as CartItem];
        });
    };

    const removeFromCart = (pid: string) => setCart(prev => prev.filter(p => String(p.productId) !== String(pid)));
    const clearCart = () => setCart([]);

    const createOrder = async (arg1: Partial<Order> | File | null, arg2?: InmateLocation) => {
        if (!currentUser) return false;
        const totalCarrinho = (cart || []).reduce((acc, i) => acc + ((Number(i.priceAtPurchase) || 0) * (Number(i.quantity) || 0)), 0);
        if ((cart || []).length === 0) throw new Error("Carrinho vazio.");
        try {
            let orderData: Partial<Order>;
            let proofUrl = '';
            if (arg1 instanceof File || arg1 === null) {
                proofUrl = (arg1 instanceof File) ? await uploadFile(arg1, 'comprovantes_pix', { kind: 'orders' }) : '';
                orderData = { items: [...cart], total: totalCarrinho, paymentProofUrl: proofUrl, inmateLocation: arg2, deliveryLocation: arg2, paymentMethod: 'PIX' };
            } else { orderData = arg1; }

            const items = (orderData.items || []).map(i => ({ productId: i.productId, quantity: i.quantity }));
            if (!items.length) throw new Error("Carrinho vazio.");

            if (orderData.paymentMethod === 'WALLET') {
                // Compra com carteira processada NO SERVIDOR (saldo, limite semanal e estoque validados)
                const res = await fnComprarComCarteira({
                    items,
                    inmateLocation: orderData.inmateLocation || undefined,
                    deliveryLocation: orderData.deliveryLocation || undefined
                });
                const data = res.data as any;
                const novoSaldo = data?.order?.walletBalanceAfter !== undefined ? Number(data.order.walletBalanceAfter) : (currentUser.walletBalance ?? 0);
                setCurrentUser(prev => ({ ...(prev || currentUser), walletBalance: novoSaldo }));
                setCreditoCliente(novoSaldo);
            } else {
                // Pedido PIX processado NO SERVIDOR (preços e estoque validados)
                const resPix = await fnRegistrarPedidoPix({
                    items,
                    paymentProofUrl: proofUrl || orderData.paymentProofUrl || '',
                    inmateLocation: orderData.inmateLocation || undefined,
                    deliveryLocation: orderData.deliveryLocation || undefined
                });
                // Comprovante em cache local (upload offline): vincula ao pedido criado para reenvio automático
                if (proofUrl === "PENDENTE_UPLOAD_LOCAL_CACHE") {
                    const orderId = (resPix?.data as any)?.order?.id;
                    if (orderId) {
                        const vinculo = await attachPendingUploadDoc('comprovantes_pix', orderId, 'orders');
                        // Se um retry já tinha enviado o arquivo ao Storage antes do
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

    const refundOrder = async (orderId: string, reason: string = 'Devolução administrativa') => {
        if (!currentUser) return;
        const order = orders.find(o => o.id === orderId);
        if (!order) throw new Error("Pedido não encontrado.");
        if (order.status === OrderStatus.CANCELLED) throw new Error("Este pedido já foi cancelado/devolvido.");

        try {
            // Estorno processado NO SERVIDOR (restaura estoque + carteira + status)
            await fnEstornarVenda({ orderId, motivo: reason });
            setOrders(prev => prev.map(o =>
                o.id === orderId ? { ...o, status: OrderStatus.CANCELLED, refundReason: reason } : o
            ));
            showNotification(`Pedido #${order.id.slice(0,6)} devolvido com sucesso!`, 'success');
        } catch (e: any) {
            console.error(e);
            throw new Error("Erro ao processar devolução: " + e.message);
        }
    };

    const STATUS_VALIDOS = ['pending', 'paid', 'preparing', 'delivered', 'cancelled', 'rejected', 'refunded', 'pago', 'separacao', 'entregue', 'cancelado', 'rejeitado'];
    const updateOrderStatus = async (oid: string, status: string) => {
        const alvo = String(status || '').toLowerCase();
        if (!STATUS_VALIDOS.includes(alvo)) { showNotification("Status inválido.", "error"); return; }
        try { await updateDoc(doc(db, 'orders', oid), { status }); } catch (e: any) { showNotification("Erro ao atualizar status: " + e.message, "error"); }
    };
    const markOrderAsPrinted = async (oid: string) => { try { await updateDoc(doc(db, 'orders', oid), { printCount: increment(1), status: OrderStatus.PREPARING }); } catch (e: any) { console.warn("[markOrderAsPrinted]", e.message); } };
    const deleteOrder = async (oid: string) => {
        try {
            const order = orders.find(o => o.id === oid);
            const estornado = order ? ['refunded', 'devolvido', 'reembolsado', 'estornado', 'cancelled', 'cancelado'].includes(String(order.status || '').toLowerCase()) : false;
            if (order && !estornado) {
                // Pedido pago com carteira: o dinheiro PRECISA voltar ao usuário —
                // exclusão direta deixaria o saldo retido para sempre. Rota obrigatória
                // pelo estorno (servidor devolve saldo + estoque de forma atômica).
                const usouCarteira = String(order.paymentMethod || '').toUpperCase() === 'WALLET' ||
                    (Array.isArray(order.payments) && order.payments.some((p: any) => String(p.method || '').toUpperCase() === 'WALLET'));
                if (usouCarteira) {
                    await fnEstornarVenda({ orderId: oid, motivo: 'Exclusão administrativa (restituição da carteira)' });
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
            showNotification(estornado ? "Pedido estornado movido para a lixeira (estoque já devolvido)" : "Pedido excluído e valores restituídos", "success");
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
            await setDoc(doc(db, 'products', product.id), product);
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

    const approveUser = async (uid: string) => {
        if (!currentUser || currentUser.role !== UserRole.ADMIN) return;
        try { await updateDoc(doc(db, 'users', uid), { status: 'active', approved: true }); } catch (e: any) { showNotification("Erro ao aprovar usuário", "error"); }
    };
    const suspendUser = async (uid: string, status: boolean) => {
        if (!currentUser || currentUser.role !== UserRole.ADMIN) return;
        try { await updateDoc(doc(db, 'users', uid), { status: status ? 'suspended' : 'active', suspended: status }); } catch (e: any) { showNotification("Erro ao suspender usuário", "error"); }
    };
    const toggleUserCredit = async (uid: string, allow: boolean) => {
        if (!currentUser || currentUser.role !== UserRole.ADMIN) return;
        try { await updateDoc(doc(db, 'users', uid), { allowCredit: allow }); } catch (e: any) { showNotification("Erro ao alterar crédito", "error"); }
    };
    const deleteUser = async (uid: string) => {
        if (!currentUser || currentUser.role !== UserRole.ADMIN) return;
        try { await updateDoc(doc(db, 'users', uid), { deleted: true, status: 'suspended' }); } catch (e: any) { showNotification("Erro ao excluir usuário", "error"); }
    };
    const updateUserStatus = async (uid: string, s: any) => {
        if (!currentUser || currentUser.role !== UserRole.ADMIN) return;
        try { await updateDoc(doc(db, 'users', uid), { status: s }); } catch (e: any) { showNotification("Erro ao atualizar status", "error"); }
    };

    const processInvoiceImport = async (data: InvoiceData, profitMargin: number) => {
        setIsLoading(true);
        try {
            const batch = writeBatch(db);
            let supplierId = '';

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
                        description: 'Importação Automática'
                    });
                }
            }

            let loadedCount = 0;
            let updatedCount = 0;
            let newCount = 0;
            const totalInXml = data.items.length;

            // Busca COMPLETA dos produtos existentes (o state `products` é limitado a ~100)
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
                    console.warn("Item ignorado (nome vazio após limpeza):", item.name);
                    continue;
                }

                const cost = Number(item.costPrice) || 0;
                const qty = Number(item.quantity) || 0;
                const price = cost + (cost * (profitMargin / 100));
                const itemKey = normalizeName(item.name);
                const cleanItemEan = item.ean ? String(item.ean).replace(/^0+/, '').trim() : '';

                // Busca exaustiva no cache local atualizado
                let exIndex = localProducts.findIndex(p => {
                    const cleanPEan = String(p.ean || p.barcode || '').replace(/^0+/, '').trim();
                    if (cleanItemEan && cleanPEan && cleanItemEan === cleanPEan) return true;
                    if (!cleanItemEan && !cleanPEan && normalizeName(p.name || '') === itemKey) return true;
                    if ((p.name || '').trim().toUpperCase() === (item.name || '').trim().toUpperCase()) return true;
                    if (stringSimilarity(normalizeName(p.name || ''), normalizeName(item.name || '')) >= 0.9) return true;
                    return false;
                });

                if (exIndex > -1) {
                    const ex = localProducts[exIndex];
                    const updatedProduct = {
                        ...ex,
                        stock: (ex.stock || 0) + qty,
                        costPrice: cost,
                        price: Math.max(parseFloat(price.toFixed(2)), ex.price),
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
            showNotification(`Importação concluída! Detectados: ${totalInXml} | Adicionados: ${newCount} | Atualizados: ${updatedCount}`, 'success');
            if (newCount + updatedCount < totalInXml) {
                showNotification(`${totalInXml - (newCount + updatedCount)} itens foram ignorados ou fundidos por duplicidade EAN.`, 'warning');
            }
        } catch (e: any) {
            console.error("Erro na importação:", e);
            showNotification('Erro ao processar XML: ' + e.message, 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const importXmlProduct = async (file: File, margin: number) => { const text = await file.text(); const data = parseInvoiceXML(text); if (data) await processInvoiceImport(data, margin); else throw new Error("Erro no XML"); };
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
            showNotification('Configurações salvas!', 'success');
        } catch (e: any) {
            showNotification("Erro ao salvar configurações: " + e.message, "error");
        }
    };

    // Função de ativação do sistema (TOKEN-BASED)
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
                return { success: false, message: 'Formato de token inválido. Use XXXX-XXXX-XXXX-XXXX' };
            }

            // Busca o token na coleção system_licenses
            const licenseRef = doc(db, 'system_licenses', cleanToken);
            const licenseSnap = await getDoc(licenseRef);

            if (!licenseSnap.exists()) {
                return { success: false, message: 'Token de ativação não encontrado ou já utilizado.' };
            }

            const licenseData = licenseSnap.data();
            
            if (licenseData.status !== 'active') {
                return { success: false, message: 'Este token está desativado ou já expirou.' };
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
            console.error('Erro na ativação:', e);
            return { success: false, message: 'Erro ao validar token: ' + e.message };
        } finally {
            setIsLoading(false);
        }
    };

    // Verificar se sistema está ativo (baseado na data de expiração da licença)
    const isSystemActive = useMemo(() => {
        if (!appConfig.expirationDate) return true;
        const expDate = new Date(appConfig.expirationDate);
        return expDate > serverTime;
    }, [appConfig.expirationDate, serverTime]);

    // Normalização automática de dados legados (Adiciona deleted: false onde falta)
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
        } catch (e) { console.error('Erro na normalização:', e); }
    };
    const updateAppConfig = updateSettings;
    const downloadBackup = () => {
        const sanitizeUsers = (users || []).map((u: any) => {
            const { password, secondaryPassword, adminPassword, ...limpo } = u || {};
            return limpo;
        });
        const { adminPassword, secondaryPassword, ...configSeguro } = appConfig || {};
        const data = { users: sanitizeUsers, products, orders, suppliers, expenses, logs, appConfig: configSeguro, timestamp: new Date().toISOString() };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `backup-mercado-facil-${new Date().toISOString().slice(0, 10)}.json`;
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
        const inicio = new Date().toISOString();
        try {
            const collections = ['products', 'orders', 'expenses', 'wallet_transactions', 'messages', 'audit_logs', 'cashier', 'cash_sessions', 'pre_registered_inmates', 'historico_geral'];
            const totais: Record<string, number> = {};
            for (const coll of collections) {
                const snap = await getDocs(collection(db, coll));
                totais[coll] = snap.docs.length;
                for (let i = 0; i < snap.docs.length; i += 500) {
                    const batch = writeBatch(db);
                    const chunk = snap.docs.slice(i, i + 500);
                    chunk.forEach(d => batch.delete(d.ref));
                    await batch.commit();
                }
            }
            await registrarAuditClient('RESET_SISTEMA_TOTAL', { totais, inicio }, { status: 'ok' });
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
            // Validações de pré-cadastro e limite de familiares são feitas no servidor
            // (registrarUsuario), pois o cliente ainda não está autenticado no momento do cadastro.

            // Cria a conta no Firebase Auth + documento do usuário (via Cloud Function)
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
            // (exceto contas administrativas — criaAdminUser/fluxo admin não usa auto-login)
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

            return { success: true, message: 'Cadastro enviado com sucesso! Aguarde a aprovação.' };
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
                senha: (d as any).password || ''
            });
            showNotification('Admin criado', 'success');
        } catch (e: any) {
            showNotification('Erro ao criar admin: ' + e.message, 'error');
        }
    };
    const validateRecovery = async (userCpf: string, prisonerCpf: string): Promise<User> => {
        setIsLoading(true);
        try {
            // Valida no servidor (CPF do usuário + CPF do interno)
            await fnRedefinirSenhaPublica({ cpf: userCpf, cpfInterno: prisonerCpf, novaSenha: '__VALIDACAO__' });
            return { id: 'validated', cpf: userCpf, name: 'Validado' } as User;
        } finally { setIsLoading(false); }
    };

    const resetUserPassword = async (cpf: string, pCpf: string, pass: string) => {
        setIsLoading(true); try {
            await fnRedefinirSenhaPublica({ cpf, cpfInterno: pCpf, novaSenha: pass });
            showNotification("Senha alterada com sucesso!", "success");
        } catch (e: any) { throw new Error(e.message); } finally { setIsLoading(false); }
    };

    const sendSystemMessage = async (msg: Partial<SystemMessage>) => { try { await addDoc(collection(db, 'systemMessages'), { id: crypto.randomUUID(), createdAt: new Date().toISOString(), type: 'info', ...msg }); } catch (e: any) { console.warn("[sendSystemMessage]", e.message); } };    const sendMessage = async (m: Message) => { try { await addDoc(collection(db, 'messages'), m); } catch (e: any) { console.warn("[sendMessage]", e.message); } };
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
            for (let i = 0; i < snapshot.docs.length; i += 500) {
                const batch = writeBatch(db);
                const chunk = snapshot.docs.slice(i, i + 500);
                chunk.forEach(d => batch.update(d.ref, { walletBalance: 0 }));
                await batch.commit();
            }
            await registrarAuditClient('ZERAR_CREDITOS', { usuariosComSaldo: antes }, { status: 'ok' });
            showNotification("Todos os créditos foram zerados.", "success");
        } catch (e: any) {
            showNotification("Erro ao zerar créditos: " + e.message, "error");
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
        if (!currentUser) throw new Error('Usuário não autenticado');
        if (!(Number(amount) > 0)) throw new Error('Valor do depósito deve ser maior que zero.');
        try {
            const transaction: WalletTransaction = {
                id: crypto.randomUUID(),
                userId: currentUser.id,
                inmateCpf: currentUser.inmateCpf || currentUser.prisonerCpf || '',
                amount,
                proofUrl: '',
                status: 'pending',
                createdAt: new Date().toISOString(),
                type: 'deposit',
                description: `Depósito via PIX por ${currentUser?.name || 'Usuário'}`,
                payerName: currentUser?.name || '',
                payerId: currentUser?.id || ''
            };
            const proofUrl = await uploadFile(proofFile, 'wallet_proofs', { kind: 'wallet_transactions', docId: transaction.id });
            transaction.proofUrl = proofUrl;
            if (proofUrl === "PENDENTE_UPLOAD_LOCAL_CACHE") {
                showNotification('Conexão instável: seu comprovante foi guardado e será enviado automaticamente quando a internet voltar.', 'info');
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
            showNotification("Depósito aprovado e crédito adicionado!", "success");
        } catch (e: any) {
            showNotification("Erro ao aprovar depósito: " + e.message, "error");
        }
    };

    const rejectWalletTransaction = async (tid: string) => {
        try {
            await fnRejeitarDeposito({ transacaoId: tid });
            showNotification("Depósito recusado.", "info");
        } catch (e: any) {
            showNotification("Erro ao recusar depósito: " + e.message, "error");
        }
    };

    const withdrawWalletCredit = async (uid: string, amount: number, reason: string) => {
        try {
            if (!currentUser || currentUser.role !== UserRole.ADMIN) throw new Error("Acesso negado.");
            const res = await fnSacarSaldoAdmin({ userId: uid, valor: amount, motivo: reason });
            const data = res.data as any;
            if (currentUser.id === uid && data?.novoSaldo !== undefined) {
                setCreditoCliente(data.novoSaldo);
                setCurrentUser(prev => prev ? ({ ...prev, walletBalance: data.novoSaldo }) : prev);
            }
            showNotification("Retirada de crédito realizada.", "success");
        } catch (e: any) {
            showNotification(e.message || "Erro ao processar retirada.", "error");
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
                console.warn('[getWalletTransactions] Fallback preventivo acionado por falta de índice ou erro de query:', queryError);
                // FALLBACK: Query simplificada sem orderBy (evita quebra por falta de índice composto)
                if (userId) {
                    const qUserFallback = query(collection(db, 'wallet_transactions'), where('userId', '==', userId), limit(300));
                    s = await getDocs(qUserFallback);
                } else {
                    const qAllFallback = query(collection(db, 'wallet_transactions'), limit(300));
                    s = await getDocs(qAllFallback);
                }
            }

            const transactions = s.docs.map(d => ({ ...d.data(), id: d.id } as WalletTransaction));
            
            // Ordenação manual via JS garante que o usuário sempre veja o mais recente primeiro
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
            await setDoc(expenseRef, { ...e, id });

            // Despesa debitada do CAIXA FÍSICO: registra a sangria na sessão de caixa
            // aberta do operador (fonte única de verdade: cash_sessions).
            if (e.debitAccount === 'CAIXA' && currentUser) {
                try {
                    const sessao = await getActiveSession(currentUser.id);
                    if (sessao) {
                        await addCashWithdrawal(sessao.id, Number(e.amount), `Despesa: ${e.description || 'Lançamento'}`);
                    }
                } catch (err) {
                    console.warn('[addExpense] Falha ao debitar do caixa físico:', err);
                }
            }
        } catch (err) {
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
        // HABILITADO PARA TODOS OS TIPOS - Correção cirúrgica de lógica restritiva anterior
        const id = Math.random().toString(36).substring(2, 9);
        setNotifications(prev => {
            // Filtra notificações idênticas para evitar poluição visual
            const filtered = prev.filter(n => n.message !== message);
            return [...filtered.slice(-3), { id, message, type }];
        });
    };

    const removeNotification = React.useCallback((id: string) => {
        setNotifications(prev => prev.filter(n => n.id !== id));
    }, []);

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
        if (newPass.length < 6) { showNotification("A senha deve ter no mínimo 6 caracteres.", "error"); return; }
        try {
            await fnAlterarSenha({ novaSenha: newPass });
            showNotification("Senha de administrador atualizada com sucesso!", "success");
        } catch (e: any) {
            showNotification("Erro ao atualizar senha: " + (e?.message || 'erro'), "error");
        }
    };

    const addPreRegisteredInmate = async (inmate: { name: string, cpf: string }) => {
        if (!currentUser || currentUser.role !== UserRole.ADMIN) return;
        try {
            const cleanCpf = (inmate.cpf || '').replace(/\D/g, '');
            if (cleanCpf.length !== 11) {
                showNotification("CPF inválido para pré-cadastro.", "error");
                return;
            }
            const id = crypto.randomUUID();
            await setDoc(doc(db, 'pre_registered_inmates', id), { name: (inmate.name || '').trim().toUpperCase(), cpf: cleanCpf, id });
            showNotification("Interno pré-cadastrado com sucesso!", "success");
        } catch (e: any) {
            showNotification("Erro ao pré-cadastrar interno: " + e.message, "error");
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

            for (let line of lines) {
                const [name, cpf] = line.split(',').map(s => (s || '').trim());
                if (name && cpf) {
                    const cleanCpf = (cpf || '').replace(/\D/g, '');
                    if (cleanCpf.length === 11 && !seenCpfs.has(cleanCpf)) {
                        seenCpfs.add(cleanCpf);
                        entries.push({ id: crypto.randomUUID(), name: name.toUpperCase(), cpf: cleanCpf });
                    }
                }
            }

            if (entries.length === 0) {
                showNotification("Nenhum dado válido encontrado no CSV. Use o formato: NOME,CPF", "warning");
                return;
            }

            for (let i = 0; i < entries.length; i += 500) {
                const batch = writeBatch(db);
                const chunk = entries.slice(i, i + 500);
                chunk.forEach(e => batch.set(doc(db, 'pre_registered_inmates', e.id), e));
                await batch.commit();
            }
            showNotification(`${entries.length} internos importados com sucesso!`, 'success');
        } catch (e: any) {
            showNotification("Erro na importação: " + e.message, "error");
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



    // ── ESTADO DE AUTENTICAÇÃO (Firebase Auth) ──
    // Carrega o usuário pelo authUid e só então libera os listeners de dados.
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
                    showNotification(u.status === 'suspended' ? 'Conta suspensa.' : 'Cadastro em análise.', 'error');
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

    useEffect(() => {
        if (!authReady || !currentUser) return;

        let unsubUsers: Unsubscribe | null = null;
        let unsubOrders: Unsubscribe | null = null;
        let unsubProducts: Unsubscribe | null = null;
        let unsubConfig: Unsubscribe | null = null;
        let unsubExpenses: Unsubscribe | null = null;
        let unsubMsg: Unsubscribe | null = null;
        let unsubSup: Unsubscribe | null = null;
        let unsubInmates: Unsubscribe | null = null;
        let unsubSystemMsg: Unsubscribe | null = null;
        let timer: any = null;
        let safetyTimeout: any = null;

        const onErr = (label: string) => (err: Error) => console.warn(`[Firebase:${label}]`, err.message);

        const semSenhasConfig = (cfg: any) => {
            const { adminPassword, secondaryPassword, ...seguro } = cfg || {};
            return seguro;
        };

        const initConfig = async () => {
            try {
                const configSnap = await getDoc(doc(db, 'settings', 'general'));
                if (!configSnap.exists()) {
                    // Criação do config: apenas admin (regras exigem role admin)
                    if (currentUser?.role === UserRole.ADMIN) {
                        await setDoc(doc(db, 'settings', 'general'), semSenhasConfig(DEFAULT_CONFIG));
                    }
                    setAppConfig(DEFAULT_CONFIG);
                } else {
                    const data = configSnap.data();
                    if ((data.appName || '').toUpperCase().includes('JUMBO') || (data.systemName || '').toUpperCase().includes('JUMBO') || !(data.systemName || '') || (data.systemName || '').includes('FAMÍLIA')) {
                        const fixedData = { ...data, appName: 'MERCADO FÁCIL', systemName: 'MERCADO FÁCIL' };
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
                unsubMsg = onSnapshot(query(collection(db, 'messages'), where('userId', '==', currentUser.id), orderBy('createdAt', 'desc'), limit(200)), (s) => setMessages(s.docs.map(d => ({ ...d.data(), id: d.id } as Message))), onErr('messages-user'));
            }

            if (currentUser?.role === UserRole.ADMIN) {
                performAutoCleanup();
                normalizeLegacyDocuments(); // Iniciar normalização em background
                unsubUsers = onSnapshot(query(collection(db, 'users'), limit(500)), (snapshot) => {
                    const dbUsers = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as User));
                    setUsers([CONSUMER_USER, ...dbUsers.filter(u => (u as any).deleted !== true)]);
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
                unsubMsg = onSnapshot(query(collection(db, 'messages'), orderBy('createdAt', 'desc'), limit(200)), (s) => setMessages(s.docs.map(d => ({ ...d.data(), id: d.id } as Message))), onErr('messages'));
                unsubExpenses = onSnapshot(query(collection(db, 'expenses'), orderBy('date', 'desc'), limit(expensesLimit)), (snapshot) => {
                    const items = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as Expense));
                    setExpenses(items.filter(e => (e as any).deleted !== true));
                }, onErr('expenses'));
                unsubSup = onSnapshot(query(collection(db, 'suppliers'), orderBy('name', 'asc'), limit(500)), (snapshot) => setSuppliers(snapshot.docs.map(d => ({ ...d.data(), id: d.id } as Supplier))), onErr('suppliers'));
                unsubInmates = onSnapshot(query(collection(db, 'pre_registered_inmates'), orderBy('name', 'asc'), limit(2000)), (snapshot) => setPreRegisteredInmates(snapshot.docs.map(d => ({ ...d.data(), id: d.id } as any))), onErr('pre-inmates'));
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
    }, [authReady, currentUser?.id, currentUser?.role, ordersLimit, expensesLimit, productsLimit]);

    return (
        <StoreContext.Provider value={{
            currentUser, users, products, productsCache, orders, units: INITIAL_UNITS, cart, appConfig, suppliers, expenses, logs, isLoading, authLoading: isLoading, systemMessages, messages, notifications, settings: appConfig, storageUsage, serverTime,
            creditoCliente, realizarSaque, verificarCredito, finalizarVendaComCredito,
            login, loginAdmin, loginFamiliar, logout, registerUser, recoverPassword, validateRecovery, createAdminUser, resetUserPassword,
            addToCart, removeFromCart, clearCart, createOrder, searchOrders,
            clearOldData: performAutoCleanup,
            archiveOldData: archiveData,
            activateSystem,
            generateActivationKey,
            isSystemActive,
            
            updateOrderStatus, markOrderAsPrinted, deleteOrder, addProduct, updateProduct, deleteProduct, deleteExpense,
            loadMoreOrders, loadMoreExpenses, loadMoreProducts,
            approveUser, updateUserStatus, toggleUserCredit, deleteUser, suspendUser,
            addSupplier, removeSupplier, addExpense, addWithdrawal, toggleFinanceEntries,
            processInvoiceImport, importXmlProduct, updateAppConfig, updateSettings: updateAppConfig,
            downloadBackup, backupSystem: downloadBackup, resetSystem, resetStock, resetFinance, resetCredits, checkPermission, sendSystemMessage, sendMessage, markMessageRead, showNotification, removeNotification,
            depositToWallet, approveWalletTransaction, rejectWalletTransaction, getWalletTransactions, withdrawWalletCredit,
            validateMasterPassword, defineMasterPassword, masterPasswordStatus, addPreRegisteredInmate, deletePreRegisteredInmate, preRegisteredInmates, refundOrder, importInmatesCsv, updateAdminPassword,
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
                    showNotification(`Limpeza concluída! ${mergedCount} produtos duplicados foram fundidos.`, 'success');
                } finally {
                    setIsLoading(false);
                }
            },
            adminDirectSale: async (targetUserId, items, paymentMethod, total, payments: { method: 'PIX' | 'WALLET' | 'CASH' | 'CARD' | 'FIADO'; amount: number }[] | undefined, change, customerAccountId?: string) => {
                if (!currentUser || currentUser.role !== UserRole.ADMIN) {
                    throw new Error("Acesso restrito a administradores.");
                }
                const isConsumer = targetUserId === 'consumidor_geral' || targetUserId === 'balcao_anonimo';
                if (!isConsumer && !users.find(u => u.id === targetUserId)) throw new Error("Usuário não encontrado.");

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
                    // Venda processada NO SERVIDOR: preços, estoque, carteira e caixa validados no backend.
                    const payloadItems = (items || []).map((i: any) => ({ productId: i?.productId || '', quantity: Number(i?.quantity) || 1 }));
                    const res = await fnProcessarVendaAdmin({
                        targetUserId,
                        items: payloadItems,
                        paymentMethod,
                        total: Number(total) || 0,
                        payments: payments || undefined,
                        change: change ?? undefined,
                        customerAccountId: customerAccountId || undefined
                    });
                    const data = res.data as any;
                    const createdOrder = cleanObject(data?.order || null);

                    if (!createdOrder) {
                        throw new Error("Venda não confirmada pelo servidor. Tente novamente.");
                    }

                    // Sincroniza saldo se a venda usou carteira do próprio admin logado
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
            addWalletCreditDirectly: async (userId: string, amount: number, reason: string) => {
                if (!currentUser || currentUser.role !== UserRole.ADMIN) throw new Error("Acesso restrito a administradores.");
                if (!(Number(amount) > 0)) throw new Error("Valor de crédito inválido.");

        try {
            const res = await fnCreditarSaldo({ userId, valor: amount, motivo: `Crédito Adicionado (Admin): ${reason}` });
            const data = res.data as any;
            if (currentUser.id === userId && data?.novoSaldo !== undefined) {
                setCreditoCliente(data.novoSaldo);
                setCurrentUser(prev => prev ? ({ ...prev, walletBalance: data.novoSaldo }) : prev);
            }
            showNotification(`Crédito de R$ ${formatarMoeda(amount)} adicionado com sucesso!`, 'success');
                } catch (error) {
                    console.error('Erro ao adicionar crédito:', error);
                    throw new Error("Falha ao processar crédito.");
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
