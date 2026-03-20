import React, { createContext, useContext, useState, useEffect, ReactNode, useRef } from 'react';
import { User, Product, Order, PrisonUnit, UserRole, CartItem, OrderStatus, AppConfig, Supplier, Expense, AuditLog, InmateLocation, SystemMessage, ThemeOption, Message, Notification, CashierSession, WalletTransaction } from '../types';
import { cleanProductName, normalizeName, compressImageFile, fileToBase64 } from '../utils';
import { InvoiceData, parseInvoiceXML } from '../services/geminiService';
import { ASSPEN_INFO, INITIAL_UNITS } from '../constants';
import { db, storage } from '../firebase';
import {
    collection, doc, setDoc, addDoc, updateDoc, deleteDoc, onSnapshot, query, where, getDocs, orderBy, limit, writeBatch, Unsubscribe, getDoc
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

interface StoreContextType {
    currentUser: User | null;
    users: User[];
    products: Product[];
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
    cashierSessions: CashierSession[];
    currentCashier: CashierSession | null;

    // Funções principais corrigidas
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

    updateOrderStatus: (orderId: string, status: string) => void;
    markOrderAsPrinted: (orderId: string) => void;
    addProduct: (product: Product) => Promise<void>;
    updateProduct: (product: Product) => Promise<void>;
    deleteProduct: (productId: string) => void;
    
    archiveData: (orderIds: string[], expenseIds: string[]) => Promise<void>;
    deleteOrder: (orderId: string) => void;
    approveUser: (userId: string) => void;
    suspendUser: (userId: string, status: boolean) => void;
    updateUserStatus: (userId: string, status: 'active' | 'suspended' | 'pending') => void;
    deleteUser: (userId: string) => void;
    processInvoiceImport: (data: InvoiceData, profitMargin: number) => Promise<void>;
    importXmlProduct: (file: File, margin: number) => Promise<void>;
    importLegacyData: (users: User[], orders: Order[]) => void;
    updateAppConfig: (config: AppConfig) => void;
    updateSettings: (config: AppConfig) => void;
    downloadBackup: () => void;
    backupSystem: () => void;
    resetSystem: (confirm: boolean) => void;
    resetStock: () => Promise<void>;
    resetFinance: () => Promise<void>;
    clearOldData: () => void;
    createAdminUser: (userData: Partial<User>) => Promise<void>;

    sendSystemMessage: (msg: Partial<SystemMessage>) => Promise<void>;
    sendMessage: (msg: Message) => Promise<void>;
    markMessageRead: (id: string) => void;

    addSupplier: (supplier: Supplier) => void;
    removeSupplier: (id: string) => void;
    addExpense: (expense: Expense) => Promise<void>;
    addWithdrawal: (amount: number, description: string, observation?: string) => Promise<void>;
    openCashier: (initialBalance: number) => Promise<void>;
    closeCashier: (sessionId: string) => Promise<void>;
    toggleFinanceEntries: () => Promise<void>;
    navigateTo: (path: string) => void;
    compressImage: (file: File) => Promise<string>;
    showNotification: (msg: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
    removeNotification: (id: string) => void;

    depositToWallet: (amount: number, proofFile: File) => Promise<void>;
    approveWalletTransaction: (transactionId: string) => Promise<void>;
    rejectWalletTransaction: (transactionId: string) => Promise<void>;
    withdrawWalletCredit: (userId: string, amount: number, reason: string) => Promise<void>;
    getWalletTransactions: (userId?: string) => Promise<WalletTransaction[]>;

    checkPermission: (permission: string) => boolean;
    validateMasterPassword: (password: string) => Promise<boolean>;
    
    preRegisteredInmates: { id: string, name: string, cpf: string }[];
    addPreRegisteredInmate: (inmate: { name: string, cpf: string }) => Promise<void>;
    deletePreRegisteredInmate: (id: string) => Promise<void>;
    
    // ========== NOVAS FUNÇÕES CORRIGIDAS ==========
    creditoCliente: number;
    realizarSaque: (valor: number) => Promise<boolean>;
    verificarCredito: (valor: number) => boolean;
    finalizarVendaComCredito: () => Promise<boolean>;
}

const StoreContext = createContext<StoreContextType | undefined>(undefined);const DEFAULT_CONFIG: AppConfig = {
    appName: 'JUMBO FÁCIL',
    institutionName: 'ASSOCIAÇÃO DOS SERVIDORES DO SISTEMA PENAL DE PEIXOTO DE AZEVEDO / MT - ASSPEN',
    cnpj: '00.000.000/0001-00',
    primaryColor: '#0ea5e9',
    secondaryColor: '#f59e0b',
    backgroundColor: '#082f49',
    footerText: 'Sistema oficial de gestão de entregas.',
    contactPhone: '(66) 99999-9999',
    contactEmail: 'contato@asspen.org.br',
    contactAddress: 'Peixoto de Azevedo - MT',
    adminPassword: 'admin',
    pixKeys: ['00000000000'],
    systemName: 'JUMBO FÁCIL',
    theme: ThemeOption.MODERN_GREEN,

    customReceiptDocName: 'CUPOM DE ENTREGA',
    loginBgUrl: '',
    loginBgType: 'none',
    userDashboardBgUrl: '',
    userDashboardBgType: 'none',
    receiptMainTitleOrder: 'RECIBO DE VENDA',
    receiptMainTitleExpense: 'RECIBO DE PAGAMENTO',
    receiptLabelValue: 'Valor Líquido',
    receiptLabelPayer: 'Pagador',
    receiptLabelBeneficiary: 'Beneficiário',
    receiptLabelHistory: 'Histórico / Discriminação',
    receiptLabelObservations: 'Observações Adicionais:',
    receiptLabelItems: 'Itens do Pedido:',
    receiptDeclaration: 'Declaramos para os devidos fins que recebemos a importância supra, dando plena, rasa e geral quitação.',
    receiptSignatureLabel: 'Assinatura do Recebedor',
    
    enablePrisonerWallet: true,
    weeklyWalletLimit: 300
};


export const StoreProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [isLoading, setIsLoading] = useState(true);
    const [currentUser, setCurrentUser] = useState<User | null>(null);

    const [users, setUsers] = useState<User[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [orders, setOrders] = useState<Order[]>([]);
    const [cart, setCart] = useState<CartItem[]>([]);
    const [appConfig, setAppConfig] = useState<AppConfig>(DEFAULT_CONFIG);
    const [expenses, setExpenses] = useState<Expense[]>([]);

    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [systemMessages, setSystemMessages] = useState<SystemMessage[]>([]);
    const [messages, setMessages] = useState<Message[]>([]);
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [storageUsage, setStorageUsage] = useState(0);
    const [cashierSessions, setCashierSessions] = useState<CashierSession[]>([]);
    const [currentCashier, setCurrentCashier] = useState<CashierSession | null>(null);
    const [walletTransactions, setWalletTransactions] = useState<WalletTransaction[]>([]);
    const [preRegisteredInmates, setPreRegisteredInmates] = useState<{ id: string, name: string, cpf: string }[]>([]);
    
    // ========== NOVOS STATES PARA CRÉDITO ==========
    const [creditoCliente, setCreditoCliente] = useState<number>(0);

    // --- AUTO LOGOUT TIMER ---
    const logoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const logout = () => {
        setCurrentUser(null);
        setCart([]);
        if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
    };

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
    
    // ========== FUNÇÃO PARA ATUALIZAR CRÉDITO DO CLIENTE ==========
    const atualizarCreditoCliente = async () => {
        if (currentUser) {
            const walletBalance = currentUser.walletBalance || 0;
            setCreditoCliente(walletBalance);
        }
    };

    useEffect(() => {
        atualizarCreditoCliente();
    }, [currentUser?.walletBalance]);

    // ========== FUNÇÃO PARA VERIFICAR CRÉDITO ==========
    const verificarCredito = (valor: number): boolean => {
        if (creditoCliente <= 0) {
            return false;
        }
        if (valor > creditoCliente) {
            return false;
        }
        return true;
    };

    // ========== FUNÇÃO PARA REALIZAR SAQUE ==========
    const realizarSaque = async (valor: number): Promise<boolean> => {
        if (!currentUser) {
            showNotification('Usuário não autenticado', 'error');
            return false;
        }
        
        if (valor <= 0) {
            showNotification('Valor inválido para saque', 'error');
            return false;
        }
        
        if (!verificarCredito(valor)) {
            showNotification(`Saldo insuficiente! Disponível: R$ ${creditoCliente.toFixed(2)}`, 'error');
            return false;
        }
        
        try {
            const novoCredito = creditoCliente - valor;
            
            // Atualizar no Firebase (walletBalance)
            const userRef = doc(db, 'users', currentUser.id);
            await updateDoc(userRef, {
                walletBalance: novoCredito
            });
            
            // Registrar transação de saque
            const transaction: WalletTransaction = {
                id: crypto.randomUUID(),
                userId: currentUser.id,
                inmateCpf: currentUser.inmateCpf || currentUser.prisonerCpf || '',
                amount: -valor,
                proofUrl: '',
                status: 'approved',
                createdAt: new Date().toISOString(),
                type: 'withdrawal',
                description: `Saque realizado pelo usuário`,
                payerName: currentUser.name,
                payerId: currentUser.id
            };
            await setDoc(doc(db, 'wallet_transactions', transaction.id), transaction);
            
            // Atualizar estado local
            setCreditoCliente(novoCredito);
            setCurrentUser({ ...currentUser, walletBalance: novoCredito });
            
            showNotification(`✅ Saque de R$ ${valor.toFixed(2)} realizado com sucesso! Saldo: R$ ${novoCredito.toFixed(2)}`, 'success');
            return true;
            
        } catch (error) {
            console.error('Erro ao realizar saque:', error);
            showNotification('❌ Erro ao processar saque', 'error');
            return false;
        }
    };

    // ========== FUNÇÃO PARA FINALIZAR VENDA COM CRÉDITO ==========
    const finalizarVendaComCredito = async (): Promise<boolean> => {
        if (cart.length === 0) {
            showNotification('❌ Carrinho vazio!', 'error');
            return false;
        }
        
        const total = cart.reduce((sum, item) => sum + (item.priceAtPurchase * item.quantity), 0);
        
        if (!verificarCredito(total)) {
            showNotification(`❌ Crédito insuficiente! Disponível: R$ ${creditoCliente.toFixed(2)}`, 'error');
            return false;
        }
        
        try {
            // Verificar estoque de todos os itens
            for (const item of cart) {
                const produto = products.find(p => p.id === item.productId);
                if (!produto) {
                    showNotification(`❌ Produto não encontrado: ${item.name}`, 'error');
                    return false;
                }
                if ((produto.stock || 0) < item.quantity) {
                    showNotification(`❌ Estoque insuficiente para ${item.name}. Disponível: ${produto.stock}`, 'error');
                    return false;
                }
            }
            
            // Atualizar estoque
            for (const item of cart) {
                const produto = products.find(p => p.id === item.productId);
                if (produto) {
                    const productRef = doc(db, 'products', item.productId);
                    await updateDoc(productRef, {
                        stock: Math.max(0, (produto.stock || 0) - item.quantity)
                    });
                }
            }
            
            // Atualizar crédito do cliente
            const novoCredito = creditoCliente - total;
            const userRef = doc(db, 'users', currentUser!.id);
            await updateDoc(userRef, {
                walletBalance: novoCredito
            });
            
            // Registrar venda
            const newOrder: Order = {
                id: Date.now().toString(),
                userId: currentUser!.id,
                userName: currentUser!.name,
                userCpf: currentUser!.cpf,
                unitId: currentUser!.selectedUnitId || '1',
                unitName: 'Unidade Prisional',
                status: OrderStatus.PAID,
                createdAt: new Date().toISOString(),
                date: new Date().toISOString(),
                items: cart.map(item => ({ ...item, productId: item.productId, name: item.name, priceAtPurchase: item.priceAtPurchase, quantity: item.quantity })),
                total: total,
                paymentMethod: 'WALLET',
                inmateName: currentUser!.inmateName || currentUser!.prisonerName,
                inmateCpf: currentUser!.inmateCpf || currentUser!.prisonerCpf,
                walletBalanceAfter: novoCredito
            };
            await setDoc(doc(db, 'orders', newOrder.id), newOrder);
            
            // Atualizar estado local
            setCreditoCliente(novoCredito);
            setCurrentUser({ ...currentUser!, walletBalance: novoCredito });
            setCart([]);
            
            showNotification(`✅ Venda realizada! Total: R$ ${total.toFixed(2)}\nCrédito restante: R$ ${novoCredito.toFixed(2)}`, 'success');
            return true;
            
        } catch (error) {
            console.error('Erro ao finalizar venda:', error);
            showNotification('❌ Erro ao processar venda', 'error');
            return false;
        }
    };

    // ========== FUNÇÕES EXISTENTES (MANTIDAS) ==========
    const uploadFile = async (file: File, path: string): Promise<string> => {
        try {
            let fileToUpload: File | Blob = file;
            if (file.type.startsWith('image/')) {
                try {
                    const compressedBlob = await compressImageFile(file, 0.6, 1000);
                    fileToUpload = new File([compressedBlob], file.name.replace(/\.[^/.]+$/, "") + ".jpg", { type: 'image/jpeg' });
                } catch (e) { console.warn("Falha na compressão", e); }
            }
            if (fileToUpload.size < 400 * 1024) {
                try {
                    if (fileToUpload instanceof File) return await fileToBase64(fileToUpload);
                    const reader = new FileReader();
                    return new Promise((resolve) => {
                        reader.onload = () => resolve(reader.result as string);
                        reader.readAsDataURL(fileToUpload as Blob);
                    });
                } catch (e) { console.warn("Falha Base64", e); }
            }
            const storageRef = ref(storage, `${path}/${Date.now()}_${file.name}`);
            const snapshot = await uploadBytes(storageRef, fileToUpload);
            return await getDownloadURL(snapshot.ref);
        } catch (error) { throw new Error("Falha no envio da imagem."); }
    };    const login = async (identifier: string, pass: string, expectedRole?: UserRole) => {
        const cleanId = identifier.replace(/\D/g, '');
        const cleanPass = pass.trim();

        try {
            let q = query(collection(db, 'users'), where('cpf', '==', cleanId));
            let snapshot = await getDocs(q);

            if (snapshot.empty && cleanId.length === 11) {
                const formattedCpf = cleanId.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
                q = query(collection(db, 'users'), where('cpf', '==', formattedCpf));
                snapshot = await getDocs(q);
            }

            if (snapshot.empty && identifier.includes('@')) {
                q = query(collection(db, 'users'), where('email', '==', identifier.trim()));
                snapshot = await getDocs(q);
            }

            if (snapshot.empty) return { success: false, message: 'Usuário não encontrado.' };
            const user = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as User;

            if (expectedRole === UserRole.FAMILY && user.role === UserRole.ADMIN) {
                return {
                    success: false,
                    message: 'Acesso Administrativo detectado. Por favor, utilize a aba Área Administrativa para entrar.'
                };
            }

            if (user.password !== cleanPass) return { success: false, message: 'Senha incorreta.' };
            if (user.status === 'pending') return { success: false, message: 'Cadastro em análise.' };
            if (user.status === 'suspended') return { success: false, message: 'Conta suspensa.' };
            
            setCurrentUser(user);
            setCreditoCliente(user.walletBalance || 0);
            return { success: true };
        } catch (e: any) { return { success: false, message: 'Erro de conexão.' }; }
    };

    const loginAdmin = async (email: string, pass: string) => {
        const qAdmins = query(collection(db, 'users'), where('role', '==', UserRole.ADMIN));
        const snapshotAdmins = await getDocs(qAdmins);

        if (snapshotAdmins.empty) {
            if (email === 'admin@mercado.com' && pass === 'admin123') {
                const newAdminRef = doc(collection(db, 'users'));
                const masterAdmin: User = {
                    id: newAdminRef.id,
                    name: 'Administrador Master',
                    role: UserRole.ADMIN,
                    email: 'admin@mercado.com',
                    cpf: '00000000000',
                    status: 'active',
                    approved: true,
                    password: 'admin123',
                    permissions: ['all']
                };
                await setDoc(newAdminRef, masterAdmin);
                setCurrentUser(masterAdmin);
                return;
            } else {
                throw new Error("Primeiro acesso do sistema: use admin@mercado.com e senha admin123 para entrar.");
            }
        }

        const adminDoc = snapshotAdmins.docs.find(doc => doc.data().email === email && doc.data().password === pass);

        if (adminDoc) {
            setCurrentUser({ id: adminDoc.id, ...adminDoc.data() } as User);
            return;
        }

        const masterExists = snapshotAdmins.docs.some(doc => doc.data().email === 'admin@mercado.com');
        if (!masterExists && email === 'admin@mercado.com' && pass === 'admin123') {
            const legacyAdmin: User = { id: 'master', name: 'Administrador Master', role: UserRole.ADMIN, email: 'admin@mercado.com', cpf: '000.000.000-00', status: 'active', approved: true, password: pass, permissions: ['all'] };
            setCurrentUser(legacyAdmin);
            return;
        }

        throw new Error("E-mail ou senha de administrador incorretos.");
    };

    const loginFamiliar = async (cpf: string, pass: string) => {
        const res = await login(cpf, pass, UserRole.FAMILY);
        if (!res.success) throw new Error(res.message);
    };

    const recoverPassword = async (identifier: string) => {
        const q = query(collection(db, 'users'), where('cpf', '==', identifier.trim()));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) return { success: true, message: `Sua senha é: ${snapshot.docs[0].data().password}` };
        return { success: false, message: 'Usuário não encontrado.' };
    };

    const addToCart = (product: Product, quantity = 1) => {
        setCart(prev => {
            const existing = prev.find(p => p.productId === product.id);
            if (existing) return prev.map(p => p.productId === product.id ? { ...p, quantity: p.quantity + quantity } : p);
            return [...prev, { ...product, productId: product.id, quantity, priceAtPurchase: product.price }];
        });
    };
    
    const removeFromCart = (pid: string) => setCart(prev => prev.filter(p => p.productId !== pid));
    const clearCart = () => setCart([]);

    const createOrder = async (arg1: Partial<Order> | File | null, arg2?: InmateLocation) => {
        if (!currentUser) return false;
        try {
            let orderData: Partial<Order>;
            let proofUrl = '';
            if (arg1 instanceof File || arg1 === null) {
                proofUrl = (arg1 instanceof File) ? await uploadFile(arg1, 'receipts') : '';
                const total = cart.reduce((acc, i) => acc + (i.priceAtPurchase * i.quantity), 0);
                orderData = { items: [...cart], total, paymentProofUrl: proofUrl, inmateLocation: arg2, deliveryLocation: arg2, paymentMethod: 'PIX' };
            } else { orderData = arg1; }

            const totalAmount = orderData.total || cart.reduce((acc, i) => acc + (i.priceAtPurchase * i.quantity), 0);
            
            if (orderData.paymentMethod === 'WALLET') {
                if (!currentUser.walletBalance || currentUser.walletBalance < totalAmount) {
                    throw new Error("Saldo insuficiente na carteira do interno.");
                }
                
                const limit = appConfig.weeklyWalletLimit || 300;
                const spent = currentUser.weeklySpent || 0;
                
                if (appConfig.enablePrisonerWallet && (spent + totalAmount) > limit) {
                    throw new Error(`Limite semanal excedido. Disponível: R$ ${(limit - spent).toFixed(2)}`);
                }

                const userRef = doc(db, 'users', currentUser.id);
                const newBalance = (currentUser.walletBalance || 0) - totalAmount;
                const newWeeklySpent = (currentUser.weeklySpent || 0) + totalAmount;
                
                await updateDoc(userRef, {
                    walletBalance: newBalance,
                    weeklySpent: newWeeklySpent
                });
                setCurrentUser({ ...currentUser, walletBalance: newBalance, weeklySpent: newWeeklySpent });
                setCreditoCliente(newBalance);
                orderData.walletBalanceAfter = newBalance;
            }

            const newOrder: Order = {
                id: Date.now().toString(), userId: currentUser.id, userName: currentUser.name, userCpf: currentUser.cpf,
                unitId: currentUser.selectedUnitId || '1', unitName: 'Unidade Prisional', status: orderData.paymentMethod === 'WALLET' ? OrderStatus.PAID : OrderStatus.PENDING,
                createdAt: new Date().toISOString(), date: new Date().toISOString(),
                inmateName: currentUser.inmateName || currentUser.prisonerName, inmateCpf: currentUser.inmateCpf || currentUser.prisonerCpf,
                ...orderData
            } as Order;
            await setDoc(doc(db, 'orders', newOrder.id), newOrder);
            for (const item of newOrder.items) {
                const productRef = doc(db, 'products', item.productId);
                const productInDb = products.find(p => p.id === item.productId);
                if (productInDb) await updateDoc(productRef, { stock: Math.max(0, productInDb.stock - item.quantity) });
            }
            return true;
        } catch (e) { console.error(e); throw e; }
    };

    const updateOrderStatus = async (oid: string, status: string) => await updateDoc(doc(db, 'orders', oid), { status });
    const markOrderAsPrinted = async (oid: string) => { const order = orders.find(o => o.id === oid); if (order) await updateDoc(doc(db, 'orders', oid), { printCount: (order.printCount || 0) + 1, status: order.status === OrderStatus.PAID ? OrderStatus.PREPARING : order.status }); };
    const deleteOrder = async (oid: string) => {
        const order = orders.find(o => o.id === oid);
        if (order) for (const item of order.items) { const p = products.find(prod => prod.id === item.productId); if (p) await updateDoc(doc(db, 'products', p.id), { stock: p.stock + item.quantity }); }
        await deleteDoc(doc(db, 'orders', oid));
    };

    const addProduct = async (product: Product) => {
        const id = product.id || crypto.randomUUID();
        await setDoc(doc(db, 'products', id), { ...product, id });
        showNotification("Produto adicionado!", "success");
    };

    const updateProduct = async (product: Product) => {
        await setDoc(doc(db, 'products', product.id), product);
        showNotification("Produto atualizado!", "success");
    };

    const deleteProduct = async (id: string) => {
        if (!id) return;
        try {
            await deleteDoc(doc(db, 'products', id));
            showNotification("Produto removido com sucesso", "success");
        } catch (e: any) {
            showNotification("Erro ao excluir: " + e.message, "error");
        }
    };
    
    const approveUser = (uid: string) => updateDoc(doc(db, 'users', uid), { status: 'active', approved: true });
    const suspendUser = (uid: string, status: boolean) => updateDoc(doc(db, 'users', uid), { status: status ? 'suspended' : 'active', suspended: status });
    const deleteUser = async (uid: string) => await deleteDoc(doc(db, 'users', uid));
    const updateUserStatus = (uid: string, s: any) => updateDoc(doc(db, 'users', uid), { status: s });

    const processInvoiceImport = async (data: InvoiceData, profitMargin: number) => {
        setIsLoading(true);
        try {
            let supplierId = '';
            if (data.supplier?.name) {
                const ex = suppliers.find(s => s.name.toLowerCase() === data.supplier!.name.toLowerCase());
                if (ex) {
                    supplierId = ex.id;
                } else {
                    supplierId = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Date.now().toString();
                    await setDoc(doc(db, 'suppliers', supplierId), {
                        id: supplierId,
                        name: data.supplier.name,
                        cnpjOrCpf: data.supplier.cnpj || '',
                        contact: '',
                        description: 'Importação Automática'
                    });
                }
            }

            for (const item of data.items) {
                const clean = cleanProductName(item.name);
                if (!clean) continue;

                const key = normalizeName(clean);
                const cost = Number(item.costPrice) || 0;
                const qty = Number(item.quantity) || 0;
                const price = cost + (cost * (profitMargin / 100));

                const ex = products.find(p => (item.ean && p.ean === item.ean) || normalizeName(p.name) === key);

                if (ex) {
                    await updateDoc(doc(db, 'products', ex.id), {
                        stock: (ex.stock || 0) + qty,
                        costPrice: cost,
                        price: Math.max(parseFloat(price.toFixed(2)), ex.price),
                        supplierId,
                        ean: item.ean || ex.ean || ''
                    });
                } else {
                    const id = crypto.randomUUID();
                    await setDoc(doc(db, 'products', id), {
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
                        ean: item.ean || ''
                    });
                }
            }
            showNotification('Importação concluída com sucesso!', 'success');
        } catch (e: any) {
            showNotification('Falha ao processar importação: ' + e.message, 'error');
        } finally {
            setIsLoading(false);
        }
    };
    
    const importXmlProduct = async (file: File, margin: number) => { const text = await file.text(); const data = parseInvoiceXML(text); if (data) await processInvoiceImport(data, margin); else throw new Error("Erro no XML"); };
    const importLegacyData = async (nu: User[], no: Order[]) => { };
    const updateAppConfig = async (c: AppConfig) => { await setDoc(doc(db, 'settings', 'general'), c, { merge: true }); setAppConfig(c); };
    const downloadBackup = () => { const data = { users, products, orders, suppliers, expenses, logs, appConfig, timestamp: new Date().toISOString() }; const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'backup.json'; document.body.appendChild(a); a.click(); document.body.removeChild(a); };
    const backupSystem = downloadBackup;
    const resetSystem = () => { };
    const resetStock = async () => { setIsLoading(true); await Promise.all(products.map(p => updateDoc(doc(db, 'products', p.id), { stock: 0 }))); setIsLoading(false); showNotification('Estoque zerado', 'success'); };
    const resetFinance = async () => { setIsLoading(true); await Promise.all(expenses.map(e => deleteDoc(doc(db, 'expenses', e.id)))); setIsLoading(false); showNotification('Financeiro zerado', 'success'); };
    const clearOldData = async () => { };
    const registerUser = async (d: Partial<User>, f: File | null) => {
        setIsLoading(true);
        try {
            const cleanInmateCpf = (d.prisonerCpf || d.inmateCpf || '').replace(/\D/g, '');
            const isPreRegistered = preRegisteredInmates.some(inmate => inmate.cpf.replace(/\D/g, '') === cleanInmateCpf);
            
            if (!isPreRegistered && preRegisteredInmates.length > 0) {
                throw new Error("O interno informado não está pré-cadastrado no sistema. Por favor, entre em contato com a administração.");
            }

            const u = { ...d, id: crypto.randomUUID(), createdAt: new Date().toISOString(), status: 'pending', approved: false, documentUrl: f ? await uploadFile(f, 'docs') : '', role: UserRole.FAMILY };
            if (d.inmateCpf || d.prisonerCpf) { 
                const q = query(collection(db, 'users'), where('inmateCpf', '==', cleanInmateCpf), where('role', '==', 'FAMILY')); 
                const s = await getDocs(q); 
                if (s.size >= 3) throw new Error("Limite de familiares excedido para este interno."); 
            }
            await setDoc(doc(db, 'users', u.id), u); return { success: true, message: 'Cadastrado' };
        } catch (e: any) { throw new Error(e.message); } finally { setIsLoading(false); }
    };
    
    const createAdminUser = async (d: Partial<User>) => { const u = { ...d, id: crypto.randomUUID(), role: UserRole.ADMIN, status: 'active', approved: true, createdAt: new Date().toISOString() }; await setDoc(doc(db, 'users', u.id), u); showNotification('Admin criado', 'success'); };
    const validateRecovery = async (userCpf: string, prisonerCpf: string): Promise<User> => {
        setIsLoading(true);
        try {
            const cleanUserCpf = userCpf.replace(/\D/g, '');
            const cleanPrisonerCpf = prisonerCpf.replace(/\D/g, '');
            const q = query(collection(db, 'users'), where('cpf', '==', cleanUserCpf));
            const s = await getDocs(q);
            if (s.empty) throw new Error("Usuário não encontrado.");
            const u = s.docs[0].data() as User;
            const uPrisonerCpf = (u.inmateCpf || (u as any).prisonerCpf || '').replace(/\D/g, '');
            if (uPrisonerCpf !== cleanPrisonerCpf) throw new Error("CPF do interno não coincide com o cadastro.");
            return { ...u, id: s.docs[0].id };
        } finally { setIsLoading(false); }
    };

    const resetUserPassword = async (cpf: string, pCpf: string, pass: string) => {
        setIsLoading(true); try {
            const u = await validateRecovery(cpf, pCpf);
            await updateDoc(doc(db, 'users', u.id), { password: pass });
            showNotification("Senha alterada com sucesso!", "success");
        } catch (e: any) { throw new Error(e.message); } finally { setIsLoading(false); }
    };
    
    const sendSystemMessage = async (msg: Partial<SystemMessage>) => { await addDoc(collection(db, 'systemMessages'), { id: crypto.randomUUID(), createdAt: new Date().toISOString(), type: 'info', ...msg }); };
    const sendMessage = async (m: Message) => { await addDoc(collection(db, 'messages'), m); };
    const markMessageRead = (id: string) => { };
    const searchOrders = async (term: string): Promise<Order[]> => { return []; };
    const archiveData = async (orderIds: string[], expenseIds: string[]) => { };

    const depositToWallet = async (amount: number, proofFile: File) => {
        if (!currentUser) return;
        const proofUrl = await uploadFile(proofFile, 'wallet_proofs');
        const transaction: WalletTransaction = {
            id: crypto.randomUUID(),
            userId: currentUser.id,
            inmateCpf: currentUser.inmateCpf || currentUser.prisonerCpf || '',
            amount,
            proofUrl,
            status: 'pending',
            createdAt: new Date().toISOString(),
            type: 'deposit',
            description: `Depósito via PIX por ${currentUser.name}`,
            payerName: currentUser.name,
            payerId: currentUser.id
        };
        await setDoc(doc(db, 'wallet_transactions', transaction.id), transaction);
        showNotification("Comprovante enviado! Aguarde a aprovação do crédito.", "success");
    };

    const approveWalletTransaction = async (tid: string) => {
        const tSnap = await getDoc(doc(db, 'wallet_transactions', tid));
        if (!tSnap.exists()) return;
        const t = tSnap.data() as WalletTransaction;
        if (t.status !== 'pending') return;

        await updateDoc(doc(db, 'wallet_transactions', tid), { status: 'approved' });

        const userRef = doc(db, 'users', t.userId);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
            const userData = userSnap.data() as User;
            await updateDoc(userRef, {
                walletBalance: (userData.walletBalance || 0) + t.amount
            });
        }
        showNotification("Depósito aprovado e crédito adicionado!", "success");
    };

    const rejectWalletTransaction = async (tid: string) => {
        await updateDoc(doc(db, 'wallet_transactions', tid), { status: 'rejected' });
        showNotification("Depósito recusado.", "info");
    };
    
    const withdrawWalletCredit = async (uid: string, amount: number, reason: string) => {
        if (!currentUser || currentUser.role !== UserRole.ADMIN) throw new Error("Acesso negado.");
        const userRef = doc(db, 'users', uid);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) throw new Error("Usuário não encontrado.");
        
        const userData = userSnap.data() as User;
        const currentBalance = userData.walletBalance || 0;
        
        if (currentBalance < amount) throw new Error("Saldo insuficiente para retirada.");
        
        const newBalance = currentBalance - amount;
        await updateDoc(userRef, { walletBalance: newBalance });
        
        const transaction: WalletTransaction = {
            id: crypto.randomUUID(),
            userId: uid,
            inmateCpf: userData.inmateCpf || userData.prisonerCpf || userData.cpf || '',
            amount: -amount,
            proofUrl: '',
            status: 'approved',
            createdAt: new Date().toISOString(),
            type: 'withdrawal',
            description: `Retirada de Crédito: ${reason}`,
            payerName: currentUser.name,
            payerId: currentUser.id
        };
        await setDoc(doc(db, 'wallet_transactions', transaction.id), transaction);
        showNotification(`Retirada de R$ ${amount.toFixed(2)} realizada com sucesso.`, "success");
    };

    const getWalletTransactions = async (userId?: string): Promise<WalletTransaction[]> => {
        let q = collection(db, 'wallet_transactions');
        if (userId) {
            const qUser = query(q, where('userId', '==', userId), orderBy('createdAt', 'desc'));
            const s = await getDocs(qUser);
            return s.docs.map(d => d.data() as WalletTransaction);
        } else {
            const qAll = query(q, orderBy('createdAt', 'desc'), limit(100));
            const s = await getDocs(qAll);
            return s.docs.map(d => d.data() as WalletTransaction);
        }
    };

    const addSupplier = async (s: Supplier) => setDoc(doc(db, 'suppliers', s.id), s);
    const removeSupplier = (id: string) => deleteDoc(doc(db, 'suppliers', id));
    
    const addExpense = async (e: Expense) => {
        const id = crypto.randomUUID();
        await setDoc(doc(db, 'expenses', id), { ...e, id });
        
        if (currentCashier) {
            const cashierRef = doc(db, 'cashier', currentCashier.id);
            await updateDoc(cashierRef, {
                totalExits: (currentCashier.totalExits || 0) + Number(e.amount)
            });
        }
    };

    const addWithdrawal = async (amount: number, description: string, observation?: string) => {
        if (!currentUser) return;
        const withdrawal: Expense = {
            id: crypto.randomUUID(),
            description: `[RETIRADA] ${description}`,
            amount,
            date: new Date().toISOString(),
            recipientName: currentUser.name,
            recipientDoc: currentUser.cpf || '',
            status: 'PAID',
            category: 'Retirada',
            type: 'OPERATIONAL' as any,
            observation: observation || 'Retirada de caixa manual'
        };
        await addExpense(withdrawal);
        
        if (currentCashier) {
            const cashierRef = doc(db, 'cashier', currentCashier.id);
            await updateDoc(cashierRef, {
                totalWithdrawals: (currentCashier.totalWithdrawals || 0) + amount
            });
        }
        showNotification("Retirada registrada com sucesso!", "success");
    };

    const openCashier = async (initialBalance: number) => {
        if (!currentUser) return;
        const today = new Date().toISOString().split('T')[0];
        
        const openSessions = cashierSessions.filter(s => s.status === 'OPEN' && s.date !== today);
        if (openSessions.length > 0) {
            const batch = writeBatch(db);
            openSessions.forEach(s => {
                batch.update(doc(db, 'cashier', s.id), { status: 'AUTO_CLOSED', closedAt: new Date().toISOString() });
            });
            await batch.commit();
        }

        const newSession: CashierSession = {
            id: today,
            date: today,
            openedAt: new Date().toISOString(),
            openedBy: currentUser.id,
            status: 'OPEN',
            initialBalance,
            totalEntries: 0,
            totalExits: 0,
            totalWithdrawals: 0
        };
        await setDoc(doc(db, 'cashier', today), newSession);
        showNotification("Caixa do dia aberto com sucesso!", "success");
    };

    const closeCashier = async (sessionId: string) => {
        if (!currentUser) return;
        const session = cashierSessions.find(s => s.id === sessionId);
        if (!session) return;

        const finalBalance = session.initialBalance + session.totalEntries - session.totalExits;
        await updateDoc(doc(db, 'cashier', sessionId), {
            status: 'CLOSED',
            closedAt: new Date().toISOString(),
            closedBy: currentUser.id,
            finalBalance
        });
        showNotification("Caixa fechado com sucesso!", "success");
    };

    const toggleFinanceEntries = async () => {
        if (!currentUser) return;
        const newValue = !currentUser.showFinanceEntries;
        await updateDoc(doc(db, 'users', currentUser.id), { showFinanceEntries: newValue });
        setCurrentUser({ ...currentUser, showFinanceEntries: newValue });
        showNotification(newValue ? "Entradas visíveis" : "Entradas ocultas", "info");
    };

    const checkPermission = () => true;
    const navigateTo = () => { };
    
    const showNotification = (message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info') => {
        const id = Math.random().toString(36).substring(2, 9);
        setNotifications(prev => [...prev.slice(-4), { id, message, type }]);
    };

    const removeNotification = (id: string) => {
        setNotifications(prev => prev.filter(n => n.id !== id));
    };

    const compressImage = async (file: File): Promise<string> => {
        return uploadFile(file, 'temp');
    };

    const validateMasterPassword = async (pass: string) => {
        const q = query(collection(db, 'users'), where('email', '==', 'admin@mercado.com'), where('role', '==', UserRole.ADMIN));
        const snap = await getDocs(q);
        if (!snap.empty) {
            return snap.docs[0].data().password === pass;
        }
        return pass === 'admin123';
    };

    const addPreRegisteredInmate = async (inmate: { name: string, cpf: string }) => {
        const id = crypto.randomUUID();
        await setDoc(doc(db, 'pre_registered_inmates', id), { ...inmate, id });
        showNotification("Interno pré-cadastrado com sucesso!", "success");
    };

    const deletePreRegisteredInmate = async (id: string) => {
        await deleteDoc(doc(db, 'pre_registered_inmates', id));
        showNotification("Interno removido da lista.", "info");
    };

    // ========== LISTENERS ==========
    useEffect(() => {
        let unsubUsers: Unsubscribe | null = null;
        let unsubOrders: Unsubscribe | null = null;
        let unsubProducts: Unsubscribe | null = null;
        let unsubConfig: Unsubscribe | null = null;
        let unsubExpenses: Unsubscribe | null = null;
        let unsubMsg: Unsubscribe | null = null;
        let unsubSup: Unsubscribe | null = null;
        let unsubCashier: Unsubscribe | null = null;

        const onErr = (label: string) => (err: Error) => console.warn(`[Firebase:${label}]`, err.message);

        const startListeners = async () => {
            unsubConfig = onSnapshot(
                doc(db, 'settings', 'general'),
                (docSnap: any) => {
                    if (docSnap.exists()) {
                        const data = docSnap.data();
                        setAppConfig({ ...DEFAULT_CONFIG, ...data });
                    } else {
                        setDoc(docSnap.ref, DEFAULT_CONFIG);
                    }
                },
                onErr('config')
            );

            unsubProducts = onSnapshot(
                collection(db, 'products'),
                (snapshot) => setProducts(snapshot.docs.map(d => ({ ...d.data(), id: d.id } as Product))),
                onErr('products')
            );

            if (currentUser?.role === UserRole.ADMIN) {
                unsubUsers = onSnapshot(
                    query(collection(db, 'users')),
                    (snapshot) => setUsers(snapshot.docs.map(d => ({ ...d.data(), id: d.id } as User))),
                    onErr('users-admin')
                );

                unsubOrders = onSnapshot(
                    query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(300)),
                    (snapshot) => setOrders(snapshot.docs.map(d => ({ ...d.data(), id: d.id } as Order))),
                    onErr('orders-admin')
                );
            } else if (currentUser) {
                unsubUsers = onSnapshot(
                    doc(db, 'users', currentUser.id),
                    (docSnap) => {
                        if (docSnap.exists()) {
                            const updatedUser = docSnap.data() as User;
                            setCurrentUser(prev => ({ ...prev, ...updatedUser }));
                            setCreditoCliente(updatedUser.walletBalance || 0);
                            if (updatedUser.status === 'suspended') logout();
                        }
                    },
                    onErr('user-self')
                );
                setOrders([]);
            }

            unsubExpenses = onSnapshot(
                query(collection(db, 'expenses'), orderBy('date', 'desc'), limit(200)),
                (snapshot) => setExpenses(snapshot.docs.map(d => ({ ...d.data(), id: d.id } as Expense))),
                onErr('expenses')
            );
            unsubMsg = onSnapshot(
                collection(db, 'messages'),
                (s) => setMessages(s.docs.map(d => ({ ...d.data(), id: d.id } as Message))),
                onErr('messages')
            );
            unsubSup = onSnapshot(
                collection(db, 'suppliers'),
                (snapshot) => setSuppliers(snapshot.docs.map(d => ({ ...d.data(), id: d.id } as Supplier))),
                onErr('suppliers')
            );

            unsubCashier = onSnapshot(
                collection(db, 'cashier'),
                (snapshot) => {
                    const sessions = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as CashierSession));
                    setCashierSessions(sessions);
                    const today = new Date().toISOString().split('T')[0];
                    const active = sessions.find(s => s.date === today && s.status === 'OPEN');
                    setCurrentCashier(active || null);
                },
                onErr('cashier')
            );

            setIsLoading(false);
        };

        startListeners();

        const unsubInmates = onSnapshot(
            collection(db, 'pre_registered_inmates'),
            (snapshot) => setPreRegisteredInmates(snapshot.docs.map(d => ({ ...d.data(), id: d.id } as any))),
            onErr('pre-inmates')
        );

        return () => {
            if (unsubUsers) unsubUsers();
            if (unsubOrders) unsubOrders();
            if (unsubProducts) unsubProducts();
            if (unsubConfig) unsubConfig();
            if (unsubExpenses) unsubExpenses();
            if (unsubMsg) unsubMsg();
            if (unsubSup) unsubSup();
            if (unsubCashier) unsubCashier();
            if (unsubInmates) unsubInmates();
        };
    }, [currentUser?.id, currentUser?.role]);

    return (
        <StoreContext.Provider value={{
            currentUser, users, products, orders, units: INITIAL_UNITS, cart, appConfig, suppliers, expenses, logs, isLoading, authLoading: isLoading, systemMessages, messages, notifications, settings: appConfig, storageUsage,
            cashierSessions, currentCashier,
            creditoCliente,
            realizarSaque,
            verificarCredito,
            finalizarVendaComCredito,
            login, loginAdmin, loginFamiliar, logout, registerUser, recoverPassword, validateRecovery, createAdminUser, resetUserPassword,
            addToCart, removeFromCart, clearCart, createOrder, searchOrders,
            updateOrderStatus, markOrderAsPrinted, deleteOrder, addProduct, updateProduct, deleteProduct,
            approveUser, updateUserStatus, deleteUser, suspendUser,
            addSupplier, removeSupplier, addExpense, addWithdrawal, openCashier, closeCashier, toggleFinanceEntries,
            processInvoiceImport, importXmlProduct, importLegacyData, updateAppConfig, updateSettings: updateAppConfig, navigateTo, compressImage,
            downloadBackup, backupSystem: downloadBackup, resetSystem, resetStock, resetFinance, clearOldData, archiveData, checkPermission, sendSystemMessage, sendMessage, markMessageRead, showNotification, removeNotification,
            depositToWallet, approveWalletTransaction, rejectWalletTransaction, getWalletTransactions, withdrawWalletCredit,
            validateMasterPassword, addPreRegisteredInmate, deletePreRegisteredInmate, preRegisteredInmates
        }}>
            {children}
        </StoreContext.Provider>
    );
};

export const useApp = () => {
    const context = useContext(StoreContext);
    if (!context) throw new Error("useApp must be used within StoreProvider");
    return context;
};import React, { useState, useEffect } from 'react';
import { useApp } from '../context/StoreContext';
import Layout from '../components/Layout';
import CupomEntrega from '../components/CupomEntrega';
import { CartItem, OrderStatus } from '../types';

const UserDashboard: React.FC = () => {
  const { 
    currentUser, 
    products, 
    cart, 
    addToCart, 
    removeFromCart, 
    clearCart, 
    createOrder,
    showNotification,
    creditoCliente,
    realizarSaque,
    verificarCredito
  } = useApp();
  
  const [mostrarCupom, setMostrarCupom] = useState(false);
  const [vendaFinalizada, setVendaFinalizada] = useState<any>(null);
  const [valorSaque, setValorSaque] = useState('');
  const [mostrarModalSaque, setMostrarModalSaque] = useState(false);
  const [busca, setBusca] = useState('');
  const [categoriaSelecionada, setCategoriaSelecionada] = useState('todos');
  const [carregando, setCarregando] = useState(false);

  // Produtos filtrados
  const produtosFiltrados = products?.filter(produto => {
    const matchCategoria = categoriaSelecionada === 'todos' || produto.categoria === categoriaSelecionada;
    const matchBusca = produto.name?.toLowerCase().includes(busca.toLowerCase()) || 
                       produto.description?.toLowerCase().includes(busca.toLowerCase());
    return matchCategoria && matchBusca;
  }) || [];

  // Calcular total do carrinho
  const totalCarrinho = cart?.reduce((sum, item) => sum + (item.priceAtPurchase * item.quantity), 0) || 0;

  // Finalizar venda
  const handleFinalizarVenda = async () => {
    if (cart.length === 0) {
      showNotification('Carrinho vazio!', 'error');
      return;
    }

    if (!verificarCredito(totalCarrinho)) {
      showNotification(`Crédito insuficiente! Disponível: R$ ${creditoCliente.toFixed(2)}`, 'error');
      return;
    }

    setCarregando(true);
    try {
      const resultado = await createOrder(null, undefined);
      
      if (resultado) {
        setVendaFinalizada({
          itens: cart,
          total: totalCarrinho,
          data: new Date(),
          creditoRestante: creditoCliente - totalCarrinho
        });
        setMostrarCupom(true);
        showNotification('Venda realizada com sucesso!', 'success');
      } else {
        showNotification('Erro ao realizar venda', 'error');
      }
    } catch (error: any) {
      showNotification(error.message || 'Erro ao finalizar venda', 'error');
    } finally {
      setCarregando(false);
    }
  };

  // Realizar saque
  const handleSaque = async () => {
    const valor = parseFloat(valorSaque);
    if (isNaN(valor) || valor <= 0) {
      showNotification('Digite um valor válido', 'error');
      return;
    }
    
    const resultado = await realizarSaque(valor);
    if (resultado) {
      setMostrarModalSaque(false);
      setValorSaque('');
    }
  };

  // Adicionar ao carrinho
  const handleAddToCart = (product: any) => {
    if (product.stock <= 0) {
      showNotification(`Produto ${product.name} sem estoque!`, 'error');
      return;
    }
    addToCart(product, 1);
    showNotification(`${product.name} adicionado ao carrinho!`, 'success');
  };

  // Remover do carrinho
  const handleRemoveFromCart = (productId: string, productName: string) => {
    removeFromCart(productId);
    showNotification(`${productName} removido do carrinho`, 'info');
  };

  if (!currentUser) {
    return (
      <Layout>
        <div className="flex justify-center items-center h-64">
          <p>Faça login para continuar</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8">
        {/* Header com Crédito */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-800 rounded-lg shadow-lg p-6 mb-8 text-white">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold">Bem-vindo, {currentUser.name}</h1>
              <p className="text-blue-100 mt-1">Compre com crédito e tenha controle total</p>
            </div>
            <div className="text-right">
              <p className="text-sm opacity-90">Crédito Disponível</p>
              <p className="text-3xl font-bold">R$ {creditoCliente?.toFixed(2) || '0,00'}</p>
              <button
                onClick={() => setMostrarModalSaque(true)}
                className="mt-2 bg-green-500 hover:bg-green-600 text-white px-4 py-1 rounded text-sm transition"
              >
                💰 Sacar Crédito
              </button>
            </div>
          </div>
        </div>

        {/* Barra de Busca */}
        <div className="mb-6 flex flex-col md:flex-row gap-4">
          <input
            type="text"
            placeholder="🔍 Buscar produtos..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select
            value={categoriaSelecionada}
            onChange={(e) => setCategoriaSelecionada(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="todos">Todas categorias</option>
            <option value="Alimentos">Alimentos</option>
            <option value="Bebidas">Bebidas</option>
            <option value="Limpeza">Limpeza</option>
            <option value="Higiene">Higiene</option>
          </select>
        </div>

        {/* Lista de Produtos */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6 mb-8">
          {produtosFiltrados.length > 0 ? (
            produtosFiltrados.map(produto => (
              <div key={produto.id} className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition">
                {produto.imageUrl && (
                  <img src={produto.imageUrl} alt={produto.name} className="w-full h-32 object-cover" />
                )}
                <div className="p-4">
                  <h3 className="font-semibold text-lg">{produto.name}</h3>
                  <p className="text-gray-600 text-sm mt-1">{produto.description || 'Sem descrição'}</p>
                  <div className="mt-3 flex justify-between items-center">
                    <div>
                      <span className="text-2xl font-bold text-green-600">
                        R$ {produto.price?.toFixed(2) || '0,00'}
                      </span>
                      <p className="text-xs text-gray-500">
                        Estoque: {produto.stock || 0} unidades
                      </p>
                    </div>
                    <button
                      onClick={() => handleAddToCart(produto)}
                      disabled={produto.stock <= 0}
                      className={`px-3 py-1 rounded text-sm transition ${
                        produto.stock > 0
                          ? 'bg-blue-600 hover:bg-blue-700 text-white'
                          : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      }`}
                    >
                      {produto.stock > 0 ? '➕ Adicionar' : '❌ Sem Estoque'}
                    </button>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="col-span-full text-center py-12">
              <p className="text-gray-500">Nenhum produto encontrado</p>
            </div>
          )}
        </div>

        {/* Carrinho de Compras */}
        {cart && cart.length > 0 && (
          <div className="bg-white rounded-lg shadow-lg p-6 mt-8">
            <h2 className="text-xl font-bold mb-4">🛒 Carrinho de Compras</h2>
            <div className="space-y-3">
              {cart.map((item, index) => (
                <div key={index} className="flex justify-between items-center border-b pb-2">
                  <div>
                    <span className="font-medium">{item.name}</span>
                    <span className="text-gray-600 text-sm ml-2">x{item.quantity}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold">
                      R$ {(item.priceAtPurchase * item.quantity).toFixed(2)}
                    </span>
                    <button
                      onClick={() => handleRemoveFromCart(item.productId, item.name)}
                      className="text-red-500 hover:text-red-700 text-sm"
                    >
                      Remover
                    </button>
                  </div>
                </div>
              ))}
              <div className="flex justify-between items-center pt-3 border-t-2">
                <span className="text-lg font-bold">Total:</span>
                <span className="text-2xl font-bold text-green-600">
                  R$ {totalCarrinho.toFixed(2)}
                </span>
              </div>
              <button
                onClick={handleFinalizarVenda}
                disabled={totalCarrinho > creditoCliente || carregando}
                className={`w-full mt-4 py-3 rounded-lg font-semibold transition ${
                  totalCarrinho <= creditoCliente && !carregando
                    ? 'bg-green-600 hover:bg-green-700 text-white'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
              >
                {carregando 
                  ? 'Processando...' 
                  : totalCarrinho <= creditoCliente 
                    ? '✅ Finalizar Compra' 
                    : `❌ Crédito Insuficiente (Faltam R$ ${(totalCarrinho - creditoCliente).toFixed(2)})`}
              </button>
              <button
                onClick={clearCart}
                className="w-full mt-2 py-2 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold transition"
              >
                🗑️ Limpar Carrinho
              </button>
            </div>
          </div>
        )}

        {/* Modal de Saque */}
        {mostrarModalSaque && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-96">
              <h3 className="text-xl font-bold mb-4">Realizar Saque</h3>
              <p className="text-gray-600 mb-2">
                Saldo disponível: R$ {creditoCliente?.toFixed(2)}
              </p>
              <input
                type="number"
                value={valorSaque}
                onChange={(e) => setValorSaque(e.target.value)}
                placeholder="Valor do saque"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-4"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleSaque}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg"
                >
                  Confirmar
                </button>
                <button
                  onClick={() => setMostrarModalSaque(false)}
                  className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-800 py-2 rounded-lg"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Cupom de Entrega */}
        {mostrarCupom && vendaFinalizada && (
          <CupomEntrega
            venda={vendaFinalizada}
            onClose={() => setMostrarCupom(false)}
          />
        )}
      </div>
    </Layout>
  );
};

export default UserDashboard;