import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, ReactNode, useRef } from 'react';
import { User, Product, Order, PrisonUnit, UserRole, CartItem, OrderStatus, AppConfig, Supplier, Expense, AuditLog, InmateLocation, SystemMessage, ThemeOption, Message, Notification, WalletTransaction, toUserRole } from '../types';
import { cleanProductName, normalizeName, stringSimilarity, compressImageFile, fileToBase64, formatarMoeda, getNetworkTime } from '../utils';
import { listarVendasOffline, salvarVendaOffline, removerVendaOffline, marcarErroVendaOffline, VendaOffline } from '../utils/offlineQueue';
import {
    setOfflineCredential as salvarCredencialOffline,
    verifyOfflinePassword as verificarSenhaOffline,
    getOfflineCredential as obterCredencialOffline,
    startOfflineSession as iniciarSessaoOffline,
    hasActiveOfflineSession as temSessaoOfflineAtiva,
    getOfflineSession as obterSessaoOffline,
    clearOfflineSession as limparSessaoOffline,
} from '../utils/offlineUnlock';
import { queuePendingUpload, listPendingUploads, removePendingUpload, attachPendingUploadDoc } from '../services/localStorageService';
import { comprimirImagem } from '../utils/imageCompress';
import { computeProofMeta, ProofMeta, isProofSuspiciouslySmall } from '../utils/fileHash';
import { toDate } from '../utils/dateUtils';
import { ASSPEN_INFO, INITIAL_UNITS } from '../constants';
import { db, auth, storage, FIREBASE_API_KEY } from '../firebase';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';


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
const fnBuscarPedidosParaEstorno = httpsCallable(functions, 'buscarPedidosParaEstorno');
const fnValidarSenhaMestra = httpsCallable(functions, 'validarSenhaMestra');
const fnValidarDuplaSenhaMestra = httpsCallable(functions, 'validarDuplaSenhaMestra');
const fnValidarSenhaMestraUnica = httpsCallable(functions, 'validarSenhaMestraUnica');
const fnDefinirSenhaMestra = httpsCallable(functions, 'definirSenhaMestra');
const fnResetarSistemaTotal = httpsCallable(functions, 'resetarSistemaTotal');
const fnZerarCarteiras = httpsCallable(functions, 'zerarCarteiras');
const fnListarBackups = httpsCallable(functions, 'listarBackups');
const fnBaixarBackup = httpsCallable(functions, 'baixarBackup');

// NOTE: o módulo contábil (DRE/CSV/ABC/extrato) foi migrado para
// utils/contabil.ts e o parser de NFe (nota fiscal XML) para utils/invoiceParser.ts.
// Os exports são re-exportados aqui para não quebrar imports existentes.
export {
  ALIQUOTA_IMPOSTO_ESTIMADA,
  sanitizarCpf,
  formatarDataContabil,
  buildMonthlyDre,
  buildSalesCsv,
  buildStockAbc,
  buildTopProducts,
  buildDailySales,
  buildSalesByCategory,
  buildLowStock,
  buildProductsCatalog,
  buildExtratoIndividual
} from '../utils/contabil';
import { InvoiceData, parseInvoiceXML } from '../utils/invoiceParser';
export type { InvoiceData } from '../utils/invoiceParser';

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
    logout: () => Promise<void>;
    isLoggingOut: boolean;
    tryOfflineUnlock: (pass: string) => Promise<boolean>;
    isOfflineUnlocked: boolean;
    logoutOffline: () => void;
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
    previewXmlImport: (file: File) => Promise<{ name: string; cost: number; qty: number; ean: string; brand: string }[]>;
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
    validateDualMasterPassword: (senhaPrimaria: string, senhaSecundaria: string) => Promise<boolean>;
    validateAnyMasterPassword: (senha: string) => Promise<boolean>;
    defineMasterPassword: (password: string) => Promise<boolean>;
    masterPasswordStatus: () => Promise<{ definida: boolean }>;
    updateAdminPassword: (newPassword: string) => Promise<void>;
    buscarPedidosParaEstorno: (opts?: { term?: string; startAfter?: string }) => Promise<{ results: Order[]; hasMore: boolean; last: string }>;

    preRegisteredInmates: { id: string, name: string, cpf: string, unit?: string, gallery?: string, cell?: string, observations?: string, status?: 'ATIVO' | 'INATIVO' }[];
    addPreRegisteredInmate: (inmate: { name: string, cpf: string, unit?: string, gallery?: string, cell?: string, observations?: string }) => Promise<void>;
    updatePreRegisteredInmate: (id: string, data: { name?: string, cpf?: string, unit?: string, gallery?: string, cell?: string, observations?: string, status?: 'ATIVO' | 'INATIVO' }) => Promise<void>;
    deletePreRegisteredInmate: (id: string) => Promise<void>;

    creditoCliente: number;
    realizarSaque: (valor: number) => Promise<boolean>;
    verificarCredito: (valor: number) => boolean;
    refundOrder: (orderId: string, reason?: string) => Promise<void>;
    estornarPedido: (orderId: string, motivo: string) => Promise<void>;
    resetCredits: () => Promise<void>;
    mergeDuplicateProducts: () => Promise<void>;
    adminDirectSale: (targetUserId: string, items: any[], paymentMethod: 'PIX' | 'WALLET' | 'CASH' | 'CARD' | 'MIXED' | 'FIADO' | 'FIADO_30', total: number, payments?: { method: 'PIX' | 'WALLET' | 'CASH' | 'CARD' | 'FIADO' | 'FIADO_30'; amount: number }[], change?: number, customerAccountId?: string, clientToken?: string, jointWallet?: { secondUserId: string; secondWalletAmount: number }, cardBrand?: string, fiado30UserId?: string, senhaPrimaria?: string, senhaSecundaria?: string) => Promise<Order | null>;
    loadMoreOrders: () => void;
    loadMoreExpenses: () => void;
    ordersLimit: number;
    expensesLimit: number;
    aumentarCapacidade: (novos: { users?: number; products?: number; orders?: number; expenses?: number; suppliers?: number; inmates?: number }) => void;
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
    registrarVendaOffline: (targetUserId: string, items: any[], paymentMethod: 'PIX' | 'WALLET' | 'CASH' | 'CARD' | 'MIXED' | 'FIADO' | 'FIADO_30', total: number, payments?: { method: string; amount: number }[], change?: number, customerAccountId?: string, cardBrand?: string) => Promise<Order | null>;
    sincronizarVendasOffline: (incluirErros?: boolean) => Promise<{ ok: boolean; sincronizadas: number; comErro: number; total: number; offline?: boolean }>;
    vendasOfflinePendentes: number;
    vendasOfflineComErro: number;

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
    const [offlineUnlocked, setOfflineUnlocked] = useState(false);
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
    // Configuráveis: o admin pode aumentar a capacidade pelo Painel de
    // Capacidade (botão "Aumentar Capacidade"), e o aumento persiste no
    // localStorage — sobrevive a reloads e reinícios sem mexer em código.
    const CHAVE_CAPACIDADE = 'mf_capacidade_limites';
    const limitesSalvos = (): { users: number; products: number; orders: number; expenses: number; suppliers: number; inmates: number } => {
        const padrao = { users: 2000, products: 500, orders: 50, expenses: 50, suppliers: 100, inmates: 200 };
        try {
            const bruto = localStorage.getItem(CHAVE_CAPACIDADE);
            if (!bruto) return padrao;
            const p = JSON.parse(bruto);
            return {
                users: Math.max(Number(p.users) || 0, padrao.users),
                products: Math.max(Number(p.products) || 0, padrao.products),
                orders: Math.max(Number(p.orders) || 0, padrao.orders),
                expenses: Math.max(Number(p.expenses) || 0, padrao.expenses),
                suppliers: Math.max(Number(p.suppliers) || 0, padrao.suppliers),
                inmates: Math.max(Number(p.inmates) || 0, padrao.inmates),
            };
        } catch {
            return padrao;
        }
    };
    const [capacidadeInicial] = useState(limitesSalvos);
    const [ordersLimit, setOrdersLimit] = useState(capacidadeInicial.orders);
    const [expensesLimit, setExpensesLimit] = useState(capacidadeInicial.expenses);
    const [productsLimit, setProductsLimit] = useState(capacidadeInicial.products);
    // Escala: com 1.500+ usuários, o stream admin de users não pode ficar
    // preso em 500 (busca client-side não acharia o resto). Cresce sob demanda.
    const [usersLimit, setUsersLimit] = useState(capacidadeInicial.users);
    // Fornecedores e internos: paginação sob demanda (evita ler tudo de uma vez)
    const [suppliersLimit, setSuppliersLimit] = useState(capacidadeInicial.suppliers);
    const [inmatesLimit, setInmatesLimit] = useState(capacidadeInicial.inmates);

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

    // Botão "Aumentar Capacidade" (Painel de Capacidade): sobe os limites de
    // carga/sincronização do app e persiste no localStorage. Não reduz nunca.
    const aumentarCapacidade = (novos: { users?: number; products?: number; orders?: number; expenses?: number; suppliers?: number; inmates?: number }) => {
        const calculado = {
            users: Math.max(usersLimit, novos.users ?? 0),
            products: Math.max(productsLimit, novos.products ?? 0),
            orders: Math.max(ordersLimit, novos.orders ?? 0),
            expenses: Math.max(expensesLimit, novos.expenses ?? 0),
            suppliers: Math.max(suppliersLimit, novos.suppliers ?? 0),
            inmates: Math.max(inmatesLimit, novos.inmates ?? 0),
        };
        setUsersLimit(calculado.users);
        setProductsLimit(calculado.products);
        setOrdersLimit(calculado.orders);
        setExpensesLimit(calculado.expenses);
        setSuppliersLimit(calculado.suppliers);
        setInmatesLimit(calculado.inmates);
        try {
            localStorage.setItem(CHAVE_CAPACIDADE, JSON.stringify(calculado));
        } catch {
            // storage cheio/indisponível: os limites valem só para a sessão atual
        }
        cotaCriticaRef.current = false;
        setCotaCritica(false);
    };

const [isLoggingOut, setIsLoggingOut] = useState(false);

    const logoutTimerRef = useRef<any>(null);
    const unsubscribeRefs = useRef<(() => void)[]>([]);

    const logout = async () => {
        setIsLoggingOut(true);
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
            limparSessaoOffline();
            setOfflineUnlocked(false);
            showNotification('Sessão encerrada com segurança.', 'success');
        } catch (error) {
            console.error('Erro ao deslogar:', error);
            setCurrentUser(null);
        } finally {
            setIsLoggingOut(false);
        }
        if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
    };

    // ── DESBLOQUEIO OFFLINE DE EMERGÊNCIA ─────────────────────────────────
    // Sessão sintética de ADMIN usada quando a internet caiu e o Firebase não
    // pode autenticar: o operador já fez login nesta máquina antes (a senha de
    // login ficou guardada como hash bcrypt) e desbloqueia o painel com ela.
    // Vendas caem na fila local (registrarVendaOffline) e sincronizam quando
    // a rede voltar. Tudo o que exige o servidor simplesmente falha offline.
    const montarAdminOffline = useCallback((nome: string): User => ({
        id: 'offline_admin',
        authUid: 'offline_admin',
        name: nome || 'Administrador (Offline)',
        email: '',
        cpf: '',
        role: UserRole.ADMIN,
        status: 'active',
        approved: true,
        walletBalance: 0,
        weeklySpent: 0,
        permissions: ['all'],
        offlineBypass: true,
    }), []);

    const tryOfflineUnlock = async (pass: string): Promise<boolean> => {
        const ok = await verificarSenhaOffline(pass || '');
        if (!ok) return false;
        const cred = obterCredencialOffline();
        const nome = cred?.name || 'Administrador (Offline)';
        iniciarSessaoOffline(nome);
        setOfflineUnlocked(true);
        setCreditoCliente(0);
        setCurrentUser(montarAdminOffline(nome));
        return true;
    };

    const logoutOffline = () => {
        limparSessaoOffline();
        setOfflineUnlocked(false);
        setCreditoCliente(0);
        setCurrentUser(null);
    };

    const resetInactivityTimer = () => {
        if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
        if (currentUser) {
            logoutTimerRef.current = setTimeout(() => {
                logout();
                const event = new CustomEvent('session-expired', { detail: { message: "Sessão encerrada por inatividade (20 min)." } });
                window.dispatchEvent(event);
            }, 20 * 60 * 1000);
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentUser?.id, currentUser?.role]);

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
                        const createdAt = toDate(d.data().createdAt)?.getTime() || 0;
                        return createdAt > 0 && createdAt < cutoffMs;
                    });
                    if (antigos.length > 0) {
                        const batch = writeBatch(db);
                        antigos.forEach(d => batch.update(d.ref, { deleted: true, archivedAt: new Date().toISOString() }));
                        await batch.commit();
                        console.info(`[AutoCleanup] ${antigos.length} pedidos cancelados antigos arquivados.`);
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
            const monday = new Date(now);
            monday.setDate(diff);
            monday.setHours(0, 0, 0, 0);
            const mondayStr = monday.toISOString().split('T')[0];

            const settingsSnap = await getDoc(doc(db, 'settings', 'maintenance'));
            const lastReset = settingsSnap.exists() ? settingsSnap.data()?.lastWeeklyReset : '';

            if (lastReset !== mondayStr) {
                // O reset real é server-side (rotina agendada executarResetSemanal).
                // Antes, este backstop tentava escrever weeklySpent pelo cliente —
                // as regras bloqueiam esse campo por design e o write falhava no
                // console a cada login de admin. Só reporta a defasagem agora.
                console.warn('[WeeklyReset] Servidor ainda não executou o reset desta semana. (lastWeeklyReset=' + lastReset + ')');
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
            // Token de idempotência: um timeout + retry não pode debitar a
            // carteira/estoque duas vezes (o servidor deduplica pelo clientToken).
            const res = await fnComprarComCarteira({
                items: cart.map(item => ({ productId: item.productId, quantity: item.quantity })),
                clientToken: crypto.randomUUID()
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
showNotification('❌ ' + msg, 'error');
return false;
}
    };

    const uploadFile = async (file: File, path: string, meta?: { kind?: string; docId?: string }, onProofMeta?: (m: ProofMeta) => void): Promise<string> => {
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

        // Comprime fotos antes do envio (menos Storage, uploads mais rápidos);
        // nunca lança erro — em qualquer falha devolve o arquivo original.
        const arquivoFinal = await comprimirImagem(file);

        // Identidade anti-fraude: hash dos bytes REALMENTE enviados ao Storage.
        // O mesmo arquivo reutilizado (mesma foto/print/PDF) gera o MESMO hash.
        let proofMetaCapturado: ProofMeta | null = null;
        if (onProofMeta) {
            try { proofMetaCapturado = await computeProofMeta(arquivoFinal); } catch {/* noop */}
        }

        try {
            const uid = auth.currentUser?.uid || currentUser?.authUid || currentUser?.id || 'anonimo';
            const folder = (path || 'uploads').replace(/^\/+|\/+$/g, '');
            const fileName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
            const fileRef = storageRef(storage, `${folder}/${uid}/${fileName}`);
            await uploadBytes(fileRef, arquivoFinal);
            const url = await getDownloadURL(fileRef);
            if (onProofMeta && proofMetaCapturado) onProofMeta(proofMetaCapturado);
            return url;
        } catch (error: any) {
            console.warn("[uploadFile] Falha no upload para Storage:", error?.message || error);
            try {
                const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                await queuePendingUpload({
                    id,
                    uid: auth.currentUser?.uid || currentUser?.authUid || currentUser?.id || 'anonimo',
                    folder: (path || 'uploads').replace(/^\/+|\/+$/g, ''),
                    fileName: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`,
                    kind: meta?.kind,
                    docId: meta?.docId,
                    blob: arquivoFinal,
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

    // Familiar reenvia o comprovante de UM pedido/depósito específico que ficou
    // preso no cache local (upload offline falhou). Se o upload seguir falhando,
    // fica na fila e o retry automático conclui quando a conexão voltar.
    const reenviarComprovante = async (kind: 'orders' | 'wallet_transactions', docId: string, file: File): Promise<string> => {
        if (!currentUser) throw new Error('Usuário não autenticado');
        const pasta = kind === 'orders' ? 'comprovantes_pix' : 'wallet_proofs';
        let meta: ProofMeta | null = null;
        const url = await uploadFile(file, pasta, { kind, docId }, (m) => { meta = m; });
        if (url === 'PENDENTE_UPLOAD_LOCAL_CACHE') {
            await attachPendingUploadDoc(pasta, docId, kind);
            showNotification('Conexão instável: o comprovante será enviado automaticamente.', 'info');
            return url;
        }
        await updateDoc(doc(db, kind, docId), {
            [CAMPO_PROVA[kind]]: url,
            ...(meta ? { proofHash: meta.hash, proofSize: meta.size, proofMime: meta.mime } : {}),
        });
        showNotification('Comprovante reenviado com sucesso!', 'success');
        return url;
    };

    // Admin anexa manualmente um comprovante que chegou por outro canal (WhatsApp,
    // balcão...) em um pedido/depósito que ficou com upload pendente/cache local.
    // O arquivo vai para a pasta privada do DONO do registro, então o servidor
    // continua validando a URL como pertencente ao usuário correto.
    const attachAdminProof = async (kind: 'orders' | 'wallet_transactions', docId: string, ownerId: string, file: File): Promise<string> => {
        if (!file || file.size === 0) throw new Error("Arquivo vazio.");
        if (file.size > 8 * 1024 * 1024) throw new Error('Arquivo muito grande (máx. 8 MB).');
        const pasta = kind === 'orders' ? 'comprovantes_pix' : 'wallet_proofs';
        const ext = '.' + (file.name.split('.').pop() || 'jpg').toLowerCase();
        const fileName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
        const arquivoFinal = await comprimirImagem(file);
        const fileRef = storageRef(storage, `${pasta}/${ownerId}/${fileName}`);
        await uploadBytes(fileRef, arquivoFinal);
        const url = await getDownloadURL(fileRef);
        let meta: ProofMeta | null = null;
        try { meta = await computeProofMeta(arquivoFinal); } catch { /* noop */ }
        await updateDoc(doc(db, kind, docId), {
            [CAMPO_PROVA[kind]]: url,
            ...(meta ? { proofHash: meta.hash, proofSize: meta.size, proofMime: meta.mime } : {}),
        });
        await registrarAuditClient('ANEXAR_COMPROVANTE_ADMIN', { kind, docId }, { url });
        return url;
    };

    const retryPendingProofs = async (): Promise<void> => {
        try {
            const pendentes = await listPendingUploads();
            if (!pendentes.length) return;
            let reenviados = 0;
            for (const p of pendentes) {
                try {
                    // uid ORIGINAL de quem fez o upload: evita que um admin
                    // reenvie o comprovante para o pasta errada se outro
                    // usuário estiver logado no momento do retry.
                    const uid = p.uid || auth.currentUser?.uid || currentUser?.authUid || currentUser?.id || 'anonimo';
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
                            let metaOffline: ProofMeta | null = null;
                            try { metaOffline = await computeProofMeta(p.blob); } catch { /* noop */ }
                            await updateDoc(docRef, {
                                [campo]: url,
                                ...(metaOffline ? { proofHash: metaOffline.hash, proofSize: metaOffline.size, proofMime: metaOffline.mime } : {}),
                            });
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
                    } else if (p.uploadedUrl) {
                        // Já enviado ao Storage por um retry anterior, MAS sem vínculo
                        // (o pedido/cadastro nunca foi criado): NÃO reenvia — aguarda o
                        // attach vincular a URL quando o documento existir. Sem isso, a
                        // fila-zumbi reenvia o mesmo blob a cada reconexão, para sempre.
                        console.warn('[retryPendingProofs] upload sem vínculo aguardando attach:', p.folder);
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

            // Migração: usuário legado sem conta vinculada â†’ provisiona (valida a senha atual no servidor)
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

            // Migração: admin legado sem conta vinculada â†’ provisiona (valida a senha atual no servidor)
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

            // Desbloqueio offline de emergência: guarda um hash bcrypt da senha
            // de LOGIN do admin nesta máquina (nunca a senha em texto). Se a
            // internet cair depois, o operador entra em modo de emergência.
            try {
                await salvarCredencialOffline(info.nome || 'Administrador', pass);
            } catch (e) { /* sem cache local: segue o login normal */ }
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

    const createOrder = async (arg1: Partial<Order> | File | null, arg2?: InmateLocation, clientToken?: string, argItems?: CartItem[]) => {
        if (!currentUser) return false;
        // Fonte da verdade: itens EXPLÍCITOS (carrinho local da tela). O cart do
        // contexto é usado apenas pelo PDV admin e NUNCA está populado aqui.
        const carrinhoFonte = argItems || cart;
        const totalCarrinho = (carrinhoFonte || []).reduce((acc, i) => acc + ((Number(i.priceAtPurchase) || 0) * (Number(i.quantity) || 0)), 0);
        if ((carrinhoFonte || []).length === 0) throw new Error("Carrinho vazio.");
        // Token de idempotência: o MESMO token em reenvios devolve o pedido já
        // criado no servidor (sem debitar estoque/saldo 2x). Reutilize o token
        // ao reenviar a MESMA tentativa de venda.
        const token = clientToken || crypto.randomUUID();
        try {
            let orderData: Partial<Order>;
            let proofUrl = '';
            let proofMeta: ProofMeta | null = null;
            if (arg1 instanceof File || arg1 === null) {
                // ANTI-FRAUDE: arquivo abaixo do tamanho mínimo de um comprovante real.
                // (3 KB) — print vazio, foto em branco ou arquivo corrompido são bloqueados
                // logo no dispositivo, evitando enviar "comprovante" inválido ao servidor.
                if (arg1 instanceof File && isProofSuspiciouslySmall(arg1.size)) {
                    throw new Error("Arquivo muito pequeno para ser um comprovante válido. Verifique se o comprovante foi gerado corretamente e tente novamente.");
                }
                proofUrl = (arg1 instanceof File) ? await uploadFile(arg1, 'comprovantes_pix', { kind: 'orders' }, (m) => { proofMeta = m; }) : '';
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
                // Pedido PIX processado NO SERVIDOR (preços e estoque validados)
                const resPix = await fnRegistrarPedidoPix({
                    items,
                    clientToken: token,
                    paymentProofUrl: proofUrl || orderData.paymentProofUrl || '',
                    proofHash: proofMeta?.hash || '',
                    proofSize: proofMeta?.size || 0,
                    proofMime: proofMeta?.mime || '',
                    inmateLocation: orderData.inmateLocation || undefined,
                    deliveryLocation: orderData.deliveryLocation || undefined
                });
                // Replay de tentativa anterior: o pedido já existia — atualiza o
                // comprovante pendente sem duplicar nada no servidor.
                if ((resPix?.data as any)?.replay && proofUrl && proofUrl !== "PENDENTE_UPLOAD_LOCAL_CACHE") {
                    const orderId = (resPix?.data as any)?.order?.id;
                    if (orderId) {
                        await updateDoc(doc(db, 'orders', orderId), { paymentProofUrl: proofUrl }).catch(() => {});
                    }
                }
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
            // 'internal'/unavailable é resposta genérica do runtime (ex.: functions
            // sem deploy ou exceção não mapeada) — mostra algo útil em vez de "internal".
            const msg = String(e?.message || '');
            if (!msg || msg === 'internal' || msg === 'INTERNAL' || msg.includes('unavailable') || msg.includes('UNAVAILABLE')) {
                throw new Error('Falha ao processar a devolução. Verifique se as Cloud Functions estão atualizadas (deploy) e tente novamente.');
            }
            throw new Error("Erro ao processar devolução: " + msg);
        }
    };

    const estornarPedido = async (orderId: string, motivo: string = 'Devolução administrativa') => {
        await fnEstornarVenda({ orderId, motivo });
        setOrders(prev => prev.map(o =>
            o.id === orderId ? { ...o, status: OrderStatus.CANCELLED, refundReason: motivo } : o
        ));
        showNotification(`Pedido #${orderId.slice(0, 6)} devolvido com sucesso!`, 'success');
    };

    const buscarPedidosParaEstorno = async (opts?: { term?: string; startAfter?: string }) => {
        try {
            const res = await fnBuscarPedidosParaEstorno({ term: opts?.term || '', startAfter: opts?.startAfter || '' }) as any;
            const data = res.data || {};
            return {
                results: (data.results || []) as Order[],
                hasMore: !!data.hasMore,
                last: String(data.last || ''),
            };
        } catch (e: any) {
            console.warn('[buscarPedidosParaEstorno]', e);
            throw new Error("Falha ao buscar pedidos. Verifique sua conexão e tente novamente.");
        }
    };

    const STATUS_VALIDOS = ['pending', 'pendente', 'pending_payment', 'paid', 'preparing', 'out_for_delivery', 'delivered', 'cancelled', 'rejected', 'refunded', 'pago', 'separacao', 'entregue', 'cancelado', 'rejeitado', 'devolvido', 'estornado', 'reembolsado'];
    // Status que EXIGEM processamento server-side (restauração financeira/estoque):
    const STATUS_TERMINAIS_SERVER = ['cancelled', 'cancelado', 'refunded', 'devolvido', 'estornado', 'reembolsado', 'rejected', 'rejeitado'];
    // Status operacionais que podem ser direto no client (sem impacto financeiro):
    const STATUS_OPERACIONAIS = ['preparing', 'separacao', 'out_for_delivery', 'delivered', 'entregue', 'paid', 'pago'];

    const updateOrderStatus = async (oid: string, status: string) => {
        const alvo = String(status || '').toLowerCase();
        if (!STATUS_VALIDOS.includes(alvo)) { showNotification("Status inválido.", "error"); return; }

        // Status terminais (cancelamento/devolução) → SEMPRE via server (refundOrder/estornarVenda)
        // Garante restauração atômica: estoque + carteira + fiado + caixa + auditoria.
        if (STATUS_TERMINAIS_SERVER.includes(alvo)) {
            const reason = alvo.startsWith('cancel') ? 'Cancelado pelo administrador' :
                           alvo.startsWith('rejeit') ? 'Rejeitado pelo administrador' :
                           'Devolução administrativa';
            await refundOrder(oid, reason);
            return;
        }

        // Status operacionais → write direto (sem impacto financeiro/estoque)
        if (STATUS_OPERACIONAIS.includes(alvo)) {
            try { await updateDoc(doc(db, 'orders', oid), { status }); }
            catch (e: any) { showNotification("Erro ao atualizar status: " + e.message, "error"); throw e; }
            return;
        }

        // Fallback (status não mapeado) — tenta direto, mas loga warning
        console.warn(`[updateOrderStatus] status não mapeado: ${alvo} — write direto`);
        try { await updateDoc(doc(db, 'orders', oid), { status }); }
        catch (e: any) { showNotification("Erro ao atualizar status: " + e.message, "error"); throw e; }
    };
    const aprovarPedido = async (orderId: string, finalizar: boolean = true) => {
        try {
            const res = await fnAprovarPedidoPix({ orderId, finalizar });
            const data = res.data as any;
            if (!data?.ok) throw new Error(data?.error || 'Falha ao aprovar o pedido.');
            return data;
        } catch (e: any) {
            // Erros HttpsError do servidor já trazem a mensagem amigável.
            // 'internal' é resposta genérica do runtime (ex.: função sem deploy
            // ou exceção não mapeada) — mostra algo útil em vez de "internal".
            const msg = String(e?.message || '');
            if (!msg || msg === 'internal' || msg === 'INTERNAL' || msg.includes('UNAVAILABLE') || msg.includes('unavailable')) {
                throw new Error('Falha ao se comunicar com o servidor (functions desatualizadas ou indisponíveis). Verifique se o deploy das Cloud Functions foi feito e tente novamente.');
            }
            throw new Error(msg);
        }
    };
    const markOrderAsPrinted = async (oid: string) => { try { await updateDoc(doc(db, 'orders', oid), { printCount: increment(1), status: OrderStatus.PREPARING }); } catch (e: any) { console.warn("[markOrderAsPrinted]", e.message); } };
    const deleteOrder = async (oid: string) => {
        try {
            // Lê o pedido FRESCO no servidor (não do cache local) para evitar race condition
            const orderSnap = await getDoc(doc(db, 'orders', oid));
            if (!orderSnap.exists()) { showNotification("Pedido não encontrado.", "error"); return; }
            const order = orderSnap.data();
            const statusLower = String(order.status || '').toLowerCase();
            const JA_ESTORNADO = ['refunded', 'devolvido', 'reembolsado', 'estornado', 'cancelled', 'cancelado', 'rejected', 'rejeitado'].includes(statusLower);
            if (order.deleted) { showNotification("Pedido já está na lixeira.", "info"); return; }

            const usouCarteira = String(order.paymentMethod || '').toUpperCase() === 'WALLET' ||
                (Array.isArray(order.payments) && order.payments.some((p: any) => String(p.method || '').toUpperCase() === 'WALLET'));

            if (usouCarteira && !JA_ESTORNADO) {
                // Carteira: estorno server-side (restaura saldo + estoque + fiado + caixa atômico)
                await fnEstornarVenda({ orderId: oid, motivo: 'Exclusão administrativa (restituição da carteira)' });
                await updateDoc(doc(db, 'orders', oid), { deleted: true });
                showNotification("Pedido excluído — estorno processado (saldo + estoque restaurados).", "success");
            } else if (!usouCarteira && !JA_ESTORNADO) {
                // Sem carteira (PIX/CASH/FIADO): transação local para restaurar estoque + marcar deleted
                await runTransaction(db, async (transaction) => {
                    const freshOrderSnap = await transaction.get(doc(db, 'orders', oid));
                    if (!freshOrderSnap.exists()) throw new Error("Pedido não encontrado.");
                    const freshOrder = freshOrderSnap.data();
                    const freshStatus = String(freshOrder.status || '').toLowerCase();
                    const FRESH_ESTORNADO = ['refunded', 'devolvido', 'reembolsado', 'estornado', 'cancelled', 'cancelado', 'rejected', 'rejeitado'].includes(freshStatus);
                    if (freshOrder.deleted || FRESH_ESTORNADO) throw new Error("Pedido já processado/excluído.");

                    for (const item of freshOrder.items) {
                        const productRef = doc(db, 'products', item.productId);
                        const prodSnap = await transaction.get(productRef);
                        if (prodSnap.exists()) {
                            const freshStock = prodSnap.data().stock || 0;
                            transaction.update(productRef, { stock: freshStock + item.quantity });
                        }
                    }
                    transaction.update(doc(db, 'orders', oid), { deleted: true });
                });
                showNotification("Pedido excluído e estoque restituído.", "success");
            } else {
                // Já estornado/cancelado: só marca deleted
                await updateDoc(doc(db, 'orders', oid), { deleted: true });
                showNotification("Pedido estornado movido para a lixeira (estoque/saldo já devolvidos).", "success");
            }
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
        try { await updateDoc(doc(db, 'users', uid), { status: 'active', approved: true }); } catch (e: any) { showNotification("Erro ao aprovar usuário", "error"); }
    };
    const suspendUser = async (uid: string, status: boolean) => {
        if (!currentUser || currentUser.role !== UserRole.ADMIN || !requirePermission('users')) return;
        try { await updateDoc(doc(db, 'users', uid), { status: status ? 'suspended' : 'active', suspended: status }); } catch (e: any) { showNotification("Erro ao suspender usuário", "error"); }
    };
    const toggleUserCredit = async (uid: string, allow: boolean) => {
        if (!currentUser || currentUser.role !== UserRole.ADMIN || !requirePermission('wallet')) return;
        try { await updateDoc(doc(db, 'users', uid), { allowCredit: allow }); } catch (e: any) { showNotification("Erro ao alterar crédito", "error"); }
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
        } catch (e: any) { showNotification("Erro ao excluir usuário", "error"); }
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

            // Nome normalizado SEM unidade de venda no final (CX, UN, KG...) —
            // "LEITE 1L (CX)" e "LEITE 1L UN" são o MESMO produto.
            const normSemUnidade = (nome: string) => {
                return normalizeName(nome).replace(/(UN|CX|PCT|PCTE|FD|FDO|DSP|UNID|CART|LT|GR|KG|ML|L|G|M|CM|MM)$/g, '');
            };
            // Pesos/volumes embutidos no nome devem ser compatíveis para fundir:
            // "ARROZ TIO JOAO 5KG" NUNCA funde com "ARROZ TIO JOAO 1KG".
            const pesosCompativeis = (a: string, b: string) => {
                const pesos = (s: string) => (s.match(/\d+[.,]?\d*\s*(?:KG|G|ML|L|M|GR|LT|CM|MM)/gi) || []).map(m => m.replace(/\s/g, ''));
                const pa = pesos(a), pb = pesos(b);
                if (pa.length === 0 || pb.length === 0) return true;
                return pa[0] === pb[0];
            };
            // Predicado de duplicidade (testado em dedup_test): EANs divergentes
            // NUNCA fundem; sem EAN, exige nome equivalente (sem unidade) ou
            // similaridade alta + peso/volume compatível.
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

            // Índices de duplicidade (catálogo pode ter milhares de itens):
            // 1. EAN normalizado (sem zeros à esquerda) — o mesmo produto re-importado
            //    é resolvido em O(1), sem varrer o catálogo inteiro item a item.
            // 2. Nome canônico SEM unidade de venda no fim (UN/CX/KG...) — dedup barato.
            // 3. Nome exato (sem normalização) — mantém a regra original.
            // 4. Similaridade (Levenshtein) fica restrita a um BALDE de prefixo de 2 letras:
            //    nomes com ≥ 0.9 de similaridade necessariamente compartilham o início,
            //    então candidatos que começam diferente não precisam ser medidos.
            const indiceEan = new Map<string, number>();
            const indiceNome = new Map<string, number>();
            const indiceUpper = new Map<string, number>();
            const baldesPrefixo = new Map<string, number[]>();
            localProducts.forEach((p, i) => {
                const eanKey = String(p.ean || p.barcode || '').replace(/^0+/, '').trim();
                if (eanKey && !indiceEan.has(eanKey)) indiceEan.set(eanKey, i);
                const nomeKey = normSemUnidade(p.name || '');
                if (nomeKey && !indiceNome.has(nomeKey)) indiceNome.set(nomeKey, i);
                const upperKey = (p.name || '').trim().toUpperCase();
                if (upperKey && !indiceUpper.has(upperKey)) indiceUpper.set(upperKey, i);
                const pref = normalizeName(p.name || '').slice(0, 2);
                if (pref) {
                    if (!baldesPrefixo.has(pref)) baldesPrefixo.set(pref, []);
                    baldesPrefixo.get(pref)!.push(i);
                }
            });
            // Mantém os índices apontando para a versão fundida do slot após um merge.
            const reindex = (idx: number, p: Product) => {
                const e = String(p.ean || p.barcode || '').replace(/^0+/, '').trim();
                if (e) indiceEan.set(e, idx);
                const n = normSemUnidade(p.name || '');
                if (n) indiceNome.set(n, idx);
                const u = (p.name || '').trim().toUpperCase();
                if (u) indiceUpper.set(u, idx);
                const pr = normalizeName(p.name || '').slice(0, 2);
                if (pr) {
                    const b = baldesPrefixo.get(pr);
                    if (b && !b.includes(idx)) b.push(idx);
                }
            };

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

                // Margem sanitizada: NaN/negativa cairia para 30% e preço viraria NaN.
                const margemSegura = Number.isFinite(Number(profitMargin)) && Number(profitMargin) >= 0 ? Number(profitMargin) : 30;
                // Defesa contra custo corrompido no XML (> R$ 100k/un):
                // zera para o operador cadastrar o custo correto.
                const costRaw = Math.max(Number(item.costPrice) || 0, 0);
                const cost = costRaw > 100000 ? 0 : costRaw;
                const qtyRaw = Math.max(Number(item.quantity) || 0, 0);
                const qty = qtyRaw > 999999 ? 1 : qtyRaw;
                const price = cost + (cost * (margemSegura / 100));

                // Busca exaustiva no cache local atualizado, via índices O(1) primeiro
                let exIndex = -1;
                const eanItem = String(item.ean || item.barcode || '').replace(/^0+/, '').trim();
                if (eanItem) exIndex = indiceEan.get(eanItem) ?? -1;
                if (exIndex < 0) {
                    const nItem = normSemUnidade(item.name);
                    if (nItem) exIndex = indiceNome.get(nItem) ?? -1;
                }
                if (exIndex < 0) {
                    exIndex = indiceUpper.get((item.name || '').trim().toUpperCase()) ?? -1;
                }
                if (exIndex < 0) {
                    const pref = normalizeName(item.name).slice(0, 2);
                    const candidatos = (pref && baldesPrefixo.get(pref)) || [];
                    const achado = candidatos.find(i => ehDuplicado(localProducts[i], item));
                    if (achado !== undefined) exIndex = achado;
                }

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
                    reindex(exIndex, updatedProduct);
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

    const importXmlProduct = async (file: File, margin: number) => {
        const text = await file.text();
        const data = parseInvoiceXML(text);
        if (data) await processInvoiceImport(data, margin);
        else {
            // Erro rico: revela POR QUE o XML não pôde ser interpretado.
            let detalhe = 'o arquivo não parece ser uma NF-e válida';
            try {
                const doc2 = new DOMParser().parseFromString(text, 'text/xml');
                const perr = doc2.querySelector('parsererror');
                if (perr && perr.textContent) {
                    detalhe = perr.textContent.slice(0, 200);
                } else if (!/NFe|NFeProc|nf-e|NFE/i.test(text.slice(0, 2000))) {
                    detalhe = 'o XML não contém uma NF-e (nó <NFe> ou <NFeProc>)';
                } else {
                    detalhe = 'nenhum <det>/<prod> com nome válido foi encontrado na NFe';
                }
            } catch { /* ignora: mantém a mensagem padrão */ }
            throw new Error(`Falha ao interpretar o XML — ${detalhe}.`);
        }
    };

    // Pré-visualização da NFe antes de importar: mostra custo unitário detectado
    // de cada item para o operador conferir e definir a margem com segurança.
    const previewXmlImport = async (file: File) => {
        const text = await file.text();
        const data = parseInvoiceXML(text);
        if (!data) return [];
        // Aplica as MESMAS sanções da gravação (processInvoiceImport): custo
        // acima de R$ 100k/un vira 0 e qtd acima de 999.999 vira 1 — o que o
        // operador vê na prévia é exatamente o que será persistido.
        return data.items.map(i => {
            const custoRaw = Number(i.costPrice) || 0;
            const qtdRaw = Number(i.quantity) || 0;
            return {
                name: i.name,
                cost: custoRaw > 100000 ? 0 : custoRaw,
                qty: qtdRaw > 999999 ? 1 : Math.max(0, qtdRaw),
                ean: i.ean || i.barcode || '',
                brand: i.brand || '',
            };
        });
    };

    // Varre o catálogo inteiro e zera preço/custo absurdos (> R$ 100.000/un),
    // recuperando produtos corrompidos por NFe defeituosa (ex: margarina a R$ 78 bilhões).
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
            showNotification(`Sanitização: ${corrigidos} produto(s) com preço/custo corrompido zerado(s).`, 'success');
        } else {
            showNotification('Catálogo íntegro — nenhum preço absurdo encontrado.', 'info');
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
            showNotification('Configurações salvas!', 'success');
        } catch (e: any) {
            showNotification("Erro ao salvar configurações: " + e.message, "error");
        }
    };

    // Função de ativação do sistema (TOKEN-BASED)
    const generateActivationKey = async (days: number): Promise<string> => {
        const hex = (Math.random().toString(16).slice(2, 6) + Math.random().toString(16).slice(2, 6) + Math.random().toString(16).slice(2, 6) + Math.random().toString(16).slice(2, 6)).toUpperCase();
        const token = hex.match(/.{1,4}/g)?.join('-') || hex;
        try {
            // Doc ID = token com hífens, idêntico ao que activateSystem() busca
            // (antes era gravado sem hífens e a ativação nunca encontrava a chave).
            await setDoc(doc(db, 'system_licenses', token), {
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

            // Varredura PAGINADA (500 por página por __name__): evita o erro de
            // leitura gigante em coleções grandes — mesmo comportamento, sem OOM.
            const scanCollection = async (col: import('firebase/firestore').CollectionReference) => {
                let cursor: any = null;
                for (;;) {
                    const q = cursor
                        ? query(col, orderBy('__name__'), startAfter(cursor), limit(500))
                        : query(col, orderBy('__name__'), limit(500));
                    const snap = await getDocs(q);
                    if (snap.empty) break;
                    snap.docs.forEach(d => {
                        if (d.data().deleted === undefined) allRefs.push(d.ref);
                    });
                    if (snap.size < 500) break;
                    cursor = snap.docs[snap.docs.length - 1];
                }
            };

            await scanCollection(collection(db, 'products'));
            await scanCollection(collection(db, 'users'));

            let count = 0;
            for (let i = 0; i < allRefs.length; i += 500) {
                const batch = writeBatch(db);
                const chunk = allRefs.slice(i, i + 500);
                chunk.forEach(ref => batch.update(ref, { deleted: false }));
                await batch.commit();
                count += chunk.length;
            }

            if (count > 0) {
                console.info(`[NORMALIZE] ${count} registros legados atualizados.`);
            }
        } catch (e) { console.error('Erro na normalização:', e); }
    };
    const updateAppConfig = updateSettings;
    const downloadBackup = async () => {
        // 1) Tenta baixar o BACKUP COMPLETO do servidor (diário/manual gerado
        //    pela Cloud Function — o export local abaixo é só um recorte parcial).
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
            console.warn('[backup] Servidor indisponível, usando export local parcial:', e?.message);
        }
        // 2) Fallback: export local dos dados em memória (parcial)
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
            // Reset agora roda NO SERVIDOR, só para admin principal, com
            // rate limit — não é mais possível apagar o banco do cliente.
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
            showNotification('Permissões atualizadas', 'success');
        } catch (e: any) {
            showNotification('Erro ao atualizar permissões: ' + e.message, 'error');
        }
    };
    const validateRecovery = async (userCpf: string, prisonerCpf: string, nomeCompleto: string): Promise<User> => {
        setIsLoading(true);
        try {
            // Valida no servidor (CPF do usuário + CPF do interno + nome completo cadastrado)
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
            // GUARDA DE CAIXA VIVO: zerar com sessão ABERTA apagaria o dinheiro
            // do balcão em operação (e o saldo de outros operadores). Exige
            // fechamento de todas as sessões antes da limpeza.
            const abertasSnap = await getDocs(query(collection(db, 'cash_sessions'), where('status', '==', 'open'), limit(1)));
            if (!abertasSnap.empty) {
                showNotification("Não é possível zerar o financeiro com sessão de caixa ABERTA. Feche todos os caixas antes de limpar.", "error");
                return;
            }
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
            // Server-side (admin SDK): as regras bloqueiam edição de walletBalance
            // no cliente por design — antes, esta tela falhava silenciosamente.
            const res = await fnZerarCarteiras({});
            const total = Number((res as any).data?.totalZeradas || 0);
            showNotification(total > 0 ? `${total} carteira(s) zerada(s).` : "Nenhum crédito para zerar.", "success");
        } catch (e: any) {
            showNotification("Erro ao zerar créditos: " + (e?.message || e), "error");
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
        const valorDeposito = Math.round((Number(amount) || 0) * 100) / 100;
        if (!(valorDeposito > 0)) throw new Error('Valor do depósito deve ser maior que zero.');
        if (isProofSuspiciouslySmall(proofFile.size)) {
            throw new Error('Comprovante inválido: arquivo muito pequeno. Anexe a imagem ou PDF completo do comprovante PIX.');
        }
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
                description: `Depósito via PIX por ${currentUser?.name || 'Usuário'}`,
                payerName: currentUser?.name || '',
                payerId: currentUser?.id || ''
            };
            const proofUrl = await uploadFile(proofFile, 'wallet_proofs', { kind: 'wallet_transactions', docId: transaction.id }, (m) => {
                transaction.proofHash = m.hash;
                transaction.proofSize = m.size;
                transaction.proofMime = m.mime;
            });
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

    const withdrawWalletCredit = async (uid: string, amount: number, reason: string, senhaMestra?: string) => {
        try {
            if (!currentUser || currentUser.role !== UserRole.ADMIN) throw new Error("Acesso negado.");
            const res = await fnSacarSaldoAdmin({ userId: uid, valor: amount, motivo: reason, senhaMestra });
            const data = res.data as any;
            if (currentUser.id === uid && data?.novoSaldo !== undefined) {
                setCreditoCliente(data.novoSaldo);
                setCurrentUser(prev => prev ? ({ ...prev, walletBalance: data.novoSaldo }) : prev);
            }
            showNotification("Retirada de crédito realizada.", "success");
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
                const dateA = toDate(a.createdAt)?.getTime() || 0;
                const dateB = toDate(b.createdAt)?.getTime() || 0;
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

            // Despesa debitada do CAIXA FÍSICO: grava a despesa E a sangria na MESMA
            // transação (atômico) — nunca uma fica sem a outra. Exige sessão aberta.
            if (e.debitAccount === 'CAIXA' && currentUser) {
                const sessao = await getActiveSession(currentUser.id);
                if (!sessao) {
                    throw new Error('Nenhuma sessão de caixa aberta para este operador. Abra o caixa antes de lançar despesa debitada no caixa físico.');
                }
                const sessaoRef = doc(db, 'cash_sessions', sessao.id);
                await runTransaction(db, async (tx) => {
                    const sessaoSnap = await tx.get(sessaoRef);
                    if (!sessaoSnap.exists() || String(sessaoSnap.data()?.status || '').toUpperCase() !== 'OPEN') {
                        throw new Error('A sessão de caixa foi fechada. Reabra o caixa antes de lançar a despesa.');
                    }
                    const saldoAtual = Number(sessaoSnap.data()?.currentBalance || 0);
                    if (!(saldoAtual >= valor)) {
                        throw new Error(`Saldo em caixa insuficiente para despesa de R$ ${valor.toFixed(2).replace('.', ',')} — disponível: R$ ${saldoAtual.toFixed(2).replace('.', ',')}.`);
                    }
                    tx.set(expenseRef, { ...e, id, amount: valor });
                    tx.update(sessaoRef, {
                        currentBalance: increment(-valor),
                        withdrawals: arrayUnion({
                            amount: valor,
                            reason: `Despesa: ${e.description || 'Lançamento'}`,
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

    // Converte erros de chamadas (httpsCallable) na mensagem REAL do servidor.
    // Antes o erro era mascarado com "Falha ao processar crédito." — o usuário
    // nunca sabia o motivo (senha não configurada, senha errada, limite de
    // tentativas etc.). Agora a mensagem do HttpsError chega ao cliente e é
    // traduzida para um texto acionável.
    const mensagemErroChamada = (e: any): string => {
        if (!e) return "Falha ao processar a operação. Tente novamente.";
        const message = String(e?.message || '').replace(/^\(.*?\)\s*/, '').trim();
        const code = String(e?.code || e?.details?.code || '').toLowerCase().replace(/functions\//, '');
        if (/unauthenticated/i.test(code)) return "Sessão expirada. Saia e entre novamente.";
        if (/unavailable|cancelled|deadline/i.test(code) || /unavailable|deadline|network/i.test(message)) {
            return "Servidor sem resposta. Verifique sua internet e tente novamente.";
        }
        if (/resource-exhausted|rate/i.test(code)) return "Muitas tentativas em pouco tempo. Aguarde 1 minuto e tente novamente.";
        if (message) return message;
        return "Falha ao processar a operação. Tente novamente.";
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

    const validateDualMasterPassword = async (senhaPrimaria: string, senhaSecundaria: string) => {
        try {
            const res = await fnValidarDuplaSenhaMestra({ senhaPrimaria: senhaPrimaria || '', senhaSecundaria: senhaSecundaria || '', apiKey: FIREBASE_API_KEY || '' }) as any;
            return !!res.data?.ok;
        } catch (e) {
            console.warn('[validateDualMasterPassword]', e);
            return false;
        }
    };

    const validateAnyMasterPassword = async (senha: string) => {
        try {
            const res = await fnValidarSenhaMestraUnica({ senha: senha || '', apiKey: FIREBASE_API_KEY || '' }) as any;
            return !!res.data?.ok;
        } catch (e) {
            console.warn('[validateAnyMasterPassword]', e);
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

    const addPreRegisteredInmate = async (inmate: { name: string, cpf: string, unit?: string, gallery?: string, cell?: string, observations?: string }) => {
        if (!currentUser || currentUser.role !== UserRole.ADMIN) return;
        try {
            const cleanCpf = (inmate.cpf || '').replace(/\D/g, '');
            if (cleanCpf.length !== 11) {
                showNotification("CPF inválido para pré-cadastro.", "error");
                return;
            }
            // Impede duplicidade: CPF já pré-cadastrado (ou importado) não entra de novo.
            if ((preRegisteredInmates || []).some(i => String(i.cpf || '').replace(/\D/g, '') === cleanCpf)) {
                showNotification("Este CPF já está pré-cadastrado no sistema.", "error");
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
            showNotification("Interno pré-cadastrado com sucesso!", "success");
        } catch (e: any) {
            showNotification("Erro ao pré-cadastrar interno: " + e.message, "error");
        }
    };

    const updatePreRegisteredInmate = async (id: string, data: { name?: string, cpf?: string, unit?: string, gallery?: string, cell?: string, observations?: string, status?: 'ATIVO' | 'INATIVO' }) => {
        if (!currentUser || currentUser.role !== UserRole.ADMIN) return;
        try {
            const patch: Record<string, any> = {};
            if (data.name !== undefined) patch.name = (data.name || '').trim().toUpperCase();
            if (data.cpf !== undefined) {
                const cleanCpf = (data.cpf || '').replace(/\D/g, '');
                if (cleanCpf.length !== 11) { showNotification("CPF inválido.", "error"); return; }
                if ((preRegisteredInmates || []).some(i => i.id !== id && String(i.cpf || '').replace(/\D/g, '') === cleanCpf)) {
                    showNotification("Este CPF já pertence a outro interno.", "error");
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
                showNotification("Nenhum dado válido encontrado no CSV. Use o formato: NOME,CPF", "warning");
                return;
            }

            for (let i = 0; i < entries.length; i += 500) {
                const batch = writeBatch(db);
                const chunk = entries.slice(i, i + 500);
                chunk.forEach(e => batch.set(doc(db, 'pre_registered_inmates', e.id), e));
                await batch.commit();
            }
            showNotification(`${entries.length} internos importados com sucesso!${skippedExisting > 0 ? ` (${skippedExisting} já existentes foram ignorados)` : ''}`, 'success');
        } catch (e: any) {
            showNotification("Erro na importação: " + e.message, "error");
        } finally {
            setIsLoading(false);
        }
    };

    const deletePreRegisteredInmate = async (id: string) => {
        if (!currentUser || currentUser.role !== UserRole.ADMIN) return;
        try {
            const snap = await getDoc(doc(db, 'pre_registered_inmates', id));
            if (!snap.exists()) {
                showNotification("Interno não encontrado.", "error");
                return;
            }
            const cpf = String(snap.data()?.cpf || '').replace(/\D/g, '');
            if (cpf.length !== 11) {
                throw new Error("Cadastro sem CPF válido.");
            }
            // GUARDA DE VÍNCULOS: removendo o pré-cadastro de um interno que já tem
            // familiar cadastrado (prisonerCpf/inmateCpf) ou pedidos em seu nome,
            // a lista de liberação do cadastro deixa de bater com o CPF ativo.
            const [u1, u2, u3] = await Promise.all([
                getDocs(query(collection(db, 'users'), where('prisonerCpf', '==', cpf), limit(1))),
                getDocs(query(collection(db, 'users'), where('inmateCpf', '==', cpf), limit(1))),
                getDocs(query(collection(db, 'orders'), where('inmateCpf', '==', cpf), limit(1))),
            ]);
            const vinculados = u1.size + u2.size + u3.size;
            if (vinculados > 0) {
                showNotification(`Não é possível remover este interno: existem ${vinculados} vínculo(s) ativo(s) (familiares cadastrados ou pedidos). Exclua os vínculos antes de remover o pré-cadastro.`, "error");
                return;
            }
            await deleteDoc(doc(db, 'pre_registered_inmates', id));
            showNotification("Interno removido da lista.", "info");
        } catch (e: any) {
            showNotification("Erro ao remover interno: " + e.message, "error");
        }
    };



    // ── ESTADO DE AUTENTICAÇÃO (Firebase Auth) ──
    // Carrega o usuário pelo authUid e só então libera os listeners de dados.
    // OTIMIZAÇÃO: usa getDoc direto no Firestore (regras permitem ler próprio doc
    // pelo authUid) — elimina o cold-start da Cloud Function 'buscarUsuarioAtual'.
    useEffect(() => {
        let ativo = true;
        const unsub = onAuthStateChanged(auth, async (fbUser) => {
            if (!fbUser) {
                if (ativo) {
                    // Desbloqueio offline de emergência: internet caiu e o
                    // Firebase não tem sessão. Se o operador já desbloqueou o
                    // modo offline nesta máquina (3h), restaura o ADMIN
                    // sintético com os DADOS AINDA EM CACHE (produtos, clientes,
                    // fila de vendas) — o caixa continua vendendo.
                    if (!navigator.onLine && temSessaoOfflineAtiva()) {
                        const sessao = obterSessaoOffline();
                        if (sessao) {
                            setOfflineUnlocked(true);
                            setCreditoCliente(0);
                            setCurrentUser(montarAdminOffline(sessao.name));
                            setAuthReady(true);
                            setIsLoading(false);
                            return;
                        }
                    }
                    setOfflineUnlocked(false);
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
                // Refresh do ID token a cada login/reativação de sessão: sem isso,
                // claims (ex.: papel de admin) só valeriam após a expiração do token
                // antigo (~1h), deixando regras híbridas lentas e suspensões com atraso.
                try { await fbUser.getIdToken(true); } catch (e) { /* noop */ }

                // Roteamento por Custom Claim: só admins podem listar a coleção
                // 'users' (firestore.rules). Para o resto, a query é SEMPRE negada —
                // íamos direto à Cloud Function, que além da busca também valida
                // status pending/suspended (a query direta não cobre isso).
                let ehAdminClaim = false;
                try {
                    const tr = await fbUser.getIdTokenResult();
                    ehAdminClaim = tr.claims?.admin === true;
                } catch (e) { /* noop */ }

                if (ehAdminClaim) {
                    try {
                        const userQuery = query(collection(db, 'users'), where('authUid', '==', fbUser.uid), limit(1));
                        const snap = await getDocs(userQuery);
                        if (snap.empty) {
                            await signOut(auth).catch(() => {});
                            return;
                        }
                        const docSnap = snap.docs[0];
                        const userData = { ...docSnap.data(), id: docSnap.id } as any;
                        const u = { ...userData, role: toUserRole(userData.role) } as User;
                        if (ativo) {
                            setCurrentUser(u);
                            setCreditoCliente(u.walletBalance || 0);
                        }
                        return;
                    } catch (e: any) {
                        console.warn('[AUTH LOADER] Query admin falhou, usando Cloud Function', e);
                    }
                }

                try {
                    const buscarUsuario = httpsCallable(functions, 'buscarUsuarioAtual');
                    const result = await buscarUsuario({});
                    const userData = (result as any).data;
                    if (userData?.id) {
                        const u = { ...userData, role: toUserRole(userData.role) } as User;
                        if (ativo) {
                            setCurrentUser(u);
                            setCreditoCliente(u.walletBalance || 0);
                        }
                    } else {
                        await signOut(auth).catch(() => {});
                    }
                } catch (cfErr: any) {
                    // Cadastro ainda não aprovado: a Cloud Function lança
                    // failed-precondition ("Cadastro em análise"). NÃO desloga —
                    // mantém sessão e deixa o App.tsx mostrar a PendingScreen
                    // ("CADASTRO EM ANÁLISE"). O onSnapshot do próprio doc
                    // (listener 'user-self') atualiza currentUser quando o
                    // admin aprovar, e a tela sai sozinha.
                    const msg = String(cfErr?.message || '');
                    const bloqueioPending =
                        msg.includes('Cadastro em análise') ||
                        msg.includes('Aguarde aprovação') ||
                        cfErr?.code === 'functions/failed-precondition';
                    if (bloqueioPending && ativo) {
                        setCurrentUser({
                            id: fbUser.uid,
                            authUid: fbUser.uid,
                            name: fbUser.displayName || '',
                            cpf: '',
                            email: fbUser.email || '',
                            role: UserRole.FAMILY,
                            status: 'pending',
                            approved: false,
                            walletBalance: 0,
                            weeklySpent: 0,
                            inmateCpf: '',
                            inmateName: '',
                            phone: '',
                        } as User);
                        setCreditoCliente(0);
                        return;
                    }
                    console.error('[AUTH LOADER] Falha total:', cfErr);
                    try { await signOut(auth).catch(() => {}); } catch { /* noop */ }
                }
            } finally {
                if (ativo) { setAuthReady(true); setIsLoading(false); }
            }
        });
        return () => { ativo = false; unsub(); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── PDV OFFLINE ────────────────────────────────────────────────────────
    // Vendas registradas sem internet ficam nesta fila local e sincronizam
    // sozinhas quando a rede volta (o id da venda é o clientToken â†’ o
    // servidor nunca cria duplicata ao repetir a sincronização).
    const [vendasOffline, setVendasOffline] = useState<VendaOffline[]>(() => listarVendasOffline());

    const registrarVendaOffline = useCallback(async (
        targetUserId: string,
        items: any[],
        paymentMethod: 'PIX' | 'WALLET' | 'CASH' | 'CARD' | 'MIXED' | 'FIADO' | 'FIADO_30',
        total: number,
        payments?: { method: string; amount: number }[],
        change?: number,
        customerAccountId?: string,
        cardBrand?: string,
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
            ...(paymentMethod === 'CARD' && cardBrand ? { cardBrand: String(cardBrand).toUpperCase() } : {}),
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
            userName: alvo?.name || 'Balcão',
            userCpf: alvo?.cpf,
            unitId: currentUser.unitId || '',
            items: venda.items.map((i) => ({ productId: i.productId, name: i.name, priceAtPurchase: i.price, quantity: i.quantity })),
            total: venda.total,
            status: 'offline_pending',
            createdAt: agora,
            date: agora,
            paymentMethod: venda.paymentMethod,
            ...(venda.cardBrand ? { cardBrand: venda.cardBrand } : {}),
            payments: venda.payments,
            change: venda.change,
            offlinePending: true,
        } as unknown as Order;
    }, [currentUser, users]);

    const sincronizandoOfflineRef = useRef(false);
    const sincronizarVendasOffline = useCallback(async (incluirErros = false): Promise<{ ok: boolean; sincronizadas: number; comErro: number; total: number; offline?: boolean; }> => {
        // Guard de conectividade: sem internet NÃO marca a fila como erro —
        // apenas informa o chamador (banner mostra "você está offline").
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
            return { ok: false, offline: true, sincronizadas: 0, comErro: 0, total: listarVendasOffline().length };
        }
        // Anti-reentrância: auto-sync ('online') + retry manual no banner nunca
        // rodam em paralelo (evita remoção dupla e erro falso em venda sincronizada).
        if (sincronizandoOfflineRef.current) {
            return { ok: true, sincronizadas: 0, comErro: 0, total: listarVendasOffline().length };
        }

        const fila = listarVendasOffline();
        const pendentes = incluirErros ? fila : fila.filter((v) => v.status === 'pending');
        if (!pendentes.length) return { ok: true, sincronizadas: 0, comErro: fila.filter((v) => v.status === 'error').length, total: fila.length };

        sincronizandoOfflineRef.current = true;
        let sincronizadas = 0;
        let comErro = 0;
        try {
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
                        cardBrand: v.paymentMethod === 'CARD' ? (v.cardBrand || undefined) : undefined,
                        origemOffline: true,
                    });
                    const pedido = (res.data as any)?.order;
                    if (!pedido) throw new Error('Servidor não confirmou a venda.');
                    // Deriva de preço offline→sync: o servidor cobra o preço ATUAL.
                    // Quando o total final difere do registrado, a conferência no painel
                    // (app/admin) avisa o operador a ajustar antes do repasse ao familiar.
                    const totalServidor = Number(pedido?.total) || 0;
                    const totalRegistrado = Number(v.total) || 0;
                    if (Math.abs(totalServidor - totalRegistrado) > 0.009) {
                        marcarErroVendaOffline(v.id, `Preço ajustado no servidor: R$ ${totalServidor.toFixed(2)} (registrado R$ ${totalRegistrado.toFixed(2)}). Reveja antes de repassar.`);
                        comErro += 1;
                        continue;
                    }
                    removerVendaOffline(v.id);
                    sincronizadas += 1;
                } catch (e: any) {
                    marcarErroVendaOffline(v.id, e?.message || 'Falha ao sincronizar');
                    comErro += 1;
                }
            }
        } finally {
            sincronizandoOfflineRef.current = false;
        }
        setVendasOffline(listarVendasOffline());
        return { ok: true, sincronizadas, comErro, total: listarVendasOffline().length };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Auto-sincronização: ao abrir o app online e quando a conexão voltar.
    useEffect(() => {
        const rodar = async () => {
            if (!currentUser || currentUser.role !== UserRole.ADMIN) return;
            const fila = listarVendasOffline();
            if (!fila.length) return;
            const r = await sincronizarVendasOffline(false);
            if (r.sincronizadas > 0) {
                showNotification(`Vendas offline sincronizadas: ${r.sincronizadas}.`, 'success');
            } else if (r.comErro > 0) {
                showNotification(`${r.comErro} venda(s) offline aguardando conferência no painel.`, 'warning');
            }
        };
        rodar();
        const handler = () => setTimeout(rodar, 2500);
        window.addEventListener('online', handler);
        return () => window.removeEventListener('online', handler);
    }, [currentUser, sincronizarVendasOffline, showNotification]);

    // Admin-only one-time cleanup: runs once per session, NOT on every limit change.
    useEffect(() => {
        if (!authReady || !currentUser || currentUser?.role !== UserRole.ADMIN) return;
        performAutoCleanup();
        normalizeLegacyDocuments();
    }, [authReady, currentUser?.id, currentUser?.role]);

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
        let lidarVisibilidadeHora: (() => void) | null = null;
        let ultimaSyncHora = 0;

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

            // Sync Secure Time: o admin usa a hora do servidor para validar
            // licença/expiração. Familiares não consomem serverTime (checado) —
            // pular a chamada evita um cold start de Cloud Function + ida à rede
            // em CADA abertura do app pelo lado do usuário (navegador, PWA, EXE).
            if (currentUser?.role === UserRole.ADMIN) {
                // Sync de hora confiável SEM desperdício: em vez de chamar a Cloud
                // Function a cada 10 min incondicionalmente (~144 calls/dia com o
                // app aberto o dia inteiro), o poll agora é barato (2 min) e o
                // guard decide: só chama com aba VISÍVEL, online, e no máximo uma
                // vez a cada 10 min. Ao voltar para a aba (visibilitychange), a
                // hora é revalidada na hora — a licença/expiração nunca fica velha.
                const atualizarHora = () => {
                    if (document.hidden || typeof navigator !== 'undefined' && !navigator.onLine) return;
                    const agora = Date.now();
                    if (agora - ultimaSyncHora < 10 * 60 * 1000) return;
                    ultimaSyncHora = agora;
                    getNetworkTime().then(t => setServerTime(t)).catch(() => {});
                };
                lidarVisibilidadeHora = () => { if (!document.hidden) atualizarHora(); };
                document.addEventListener('visibilitychange', lidarVisibilidadeHora);
                window.addEventListener('online', lidarVisibilidadeHora);
                atualizarHora();
                timer = setInterval(atualizarHora, 1000 * 60 * 2);
            }

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
                // orderBy garante paginação estável ao aumentar usersLimit
                unsubUsers = onSnapshot(query(collection(db, 'users'), orderBy('name', 'asc'), limit(usersLimit)), (snapshot) => {
                    // CONSUMER_USER é sintético (venda de balcão) e NÃO pertence à
                    // lista real de usuários — se entra, polui contagens de
                    // familiares em relatórios/painéis (MÉDIA-2).
                    const dbUsers = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as User));
                    setUsers(dbUsers.filter(u => (u as any).deleted !== true && u.id !== 'consumidor_geral' && u.id !== 'balcao_anonimo'));
                }, onErr('users-admin'));
                const ordersQuery = query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(ordersLimit));
                unsubOrders = onSnapshot(ordersQuery, (snapshot) => {
                    const items = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as Order));
                    setOrders(items.filter(o => (o as any).deleted !== true));
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
            if (lidarVisibilidadeHora) {
                document.removeEventListener('visibilitychange', lidarVisibilidadeHora);
                window.removeEventListener('online', lidarVisibilidadeHora);
            }
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
    }, [authReady, currentUser?.id, currentUser?.role, ordersLimit, expensesLimit, productsLimit, usersLimit, suppliersLimit, inmatesLimit]);

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
            loadMoreOrders, loadMoreExpenses, loadMoreProducts, productsLimit, ordersLimit, expensesLimit, aumentarCapacidade, usersLimit, loadMoreUsers, expandUsersLimit, loadMoreSuppliers, loadMoreInmates, suppliersLimit, inmatesLimit, cotaCritica,
            approveUser, updateUserStatus, toggleUserCredit, deleteUser, suspendUser,
            addSupplier, removeSupplier, addExpense, addWithdrawal, toggleFinanceEntries,
            processInvoiceImport, importXmlProduct, previewXmlImport, sanitizeCatalog, updateAppConfig, updateSettings: updateAppConfig,
            downloadBackup, backupSystem: downloadBackup, resetSystem, resetStock, resetFinance, resetCredits, checkPermission, sendSystemMessage, sendMessage, markMessageRead, showNotification, removeNotification,
            depositToWallet, approveWalletTransaction, rejectWalletTransaction, getWalletTransactions, withdrawWalletCredit, attachAdminProof, reenviarComprovante,
            validateMasterPassword, validateDualMasterPassword, validateAnyMasterPassword, defineMasterPassword, masterPasswordStatus, addPreRegisteredInmate, updatePreRegisteredInmate, deletePreRegisteredInmate, preRegisteredInmates, refundOrder, estornarPedido, buscarPedidosParaEstorno, importInmatesCsv, updateAdminPassword,
            isInstallable: !!deferredPrompt, installApp,
            isLoggingOut,
            tryOfflineUnlock, isOfflineUnlocked: offlineUnlocked, logoutOffline,
            mergeDuplicateProducts: async () => {
                setIsLoading(true);
                try {
                    // Busca paginada (mesmo padrão da sanitização do catálogo):
                    // nunca lê a coleção inteira de uma vez, mesmo com milhares de itens.
                    const todosBrutos: Product[] = [];
                    let ultimo: any = null;
                    for (;;) {
                        const q = ultimo
                            ? query(collection(db, 'products'), orderBy('name', 'asc'), startAfter(ultimo), limit(1000))
                            : query(collection(db, 'products'), orderBy('name', 'asc'), limit(1000));
                        const snap = await getDocs(q);
                        if (snap.empty) break;
                        snap.docs.forEach(d => todosBrutos.push({ ...d.data(), id: d.id } as Product));
                        if (snap.size < 1000) break;
                        ultimo = snap.docs[snap.docs.length - 1];
                    }
                    const todos = todosBrutos.filter(p => (p as any).deleted !== true);
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
            adminDirectSale: async (targetUserId, items, paymentMethod, total, payments: { method: 'PIX' | 'WALLET' | 'CASH' | 'CARD' | 'FIADO' | 'FIADO_30'; amount: number }[] | undefined, change, customerAccountId?: string, clientToken?: string, jointWallet?: { secondUserId: string; secondWalletAmount: number }, cardBrand?: string, fiado30UserId?: string, senhaPrimaria?: string, senhaSecundaria?: string) => {
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
                    // clientToken = idempotência: um clique duplo/replay reenvia o mesmo token e o
                    // servidor devolve o pedido já criado, sem debitar 2x.
                    // O token é gerado UMA vez por venda lógica no modal do PDV e reutilizado
                    // em reenvios (timeout/retry) — nunca um token novo por tentativa.
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
                        jointWallet: jointWallet || undefined,
                        cardBrand: paymentMethod === 'CARD' ? (cardBrand || '') : undefined,
                        senhaPrimaria: senhaPrimaria || undefined,
                        senhaSecundaria: senhaSecundaria || undefined,
                        apiKey: (paymentMethod === 'FIADO' || paymentMethod === 'FIADO_30') ? (FIREBASE_API_KEY || undefined) : undefined
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
                    // Quando sem internet, o erro de rede é esperado: o caller
                    // oferece o fallback OFFLINE e mostra a mensagem correta.
                    // Exibir o erro aqui também gerava um toast contraditório
                    // ("Erro ao processar venda." seguido de "Venda registrada
                    // OFFLINE") — confundia o operador e incentivava novo clique.
                    // Quando ONLINE, propaga a mensagem REAL do servidor em vez
                    // de retornar null: o modal mostra o motivo exato do erro
                    // (senha incorreta, crédito bloqueado, etc.).
                    if (!(typeof navigator !== 'undefined' && navigator.onLine === false)) {
                        throw new Error(mensagemErroChamada(e));
                    }
                    return null;
                }
            },
            registrarVendaOffline,
            sincronizarVendasOffline,
            vendasOfflinePendentes: vendasOffline.filter((v) => v.status === 'pending').length,
            vendasOfflineComErro: vendasOffline.filter((v) => v.status === 'error').length,
            addWalletCreditDirectly: async (userId: string, amount: number, reason: string, senhaMestra?: string) => {
                if (!currentUser || currentUser.role !== UserRole.ADMIN) throw new Error("Acesso restrito a administradores.");
                if (!(Number(amount) > 0)) throw new Error("Valor de crédito inválido.");

        try {
            const res = await fnCreditarSaldo({ userId, valor: amount, motivo: `Crédito Adicionado (Admin): ${reason}`, senhaMestra });
            const data = res.data as any;
            if (currentUser.id === userId && data?.novoSaldo !== undefined) {
                setCreditoCliente(data.novoSaldo);
                setCurrentUser(prev => prev ? ({ ...prev, walletBalance: data.novoSaldo }) : prev);
            }
            showNotification(`Crédito de R$ ${formatarMoeda(amount)} adicionado com sucesso!`, 'success');
                } catch (error) {
                    console.error('Erro ao adicionar crédito:', error);
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
