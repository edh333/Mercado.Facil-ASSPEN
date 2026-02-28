import React, { createContext, useContext, useState, useEffect, ReactNode, useRef } from 'react';
import { User, Product, Order, PrisonUnit, UserRole, CartItem, OrderStatus, AppConfig, Supplier, Expense, AuditLog, InmateLocation, SystemMessage, ThemeOption, Message, Notification } from '../types';
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
  orders: Order[]; // Admin view (recent orders)
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
  
  login: (cpf: string, pass: string) => Promise<{ success: boolean; message?: string }>;
  loginAdmin: (pass: string) => Promise<void>;
  loginFamiliar: (cpf: string, pass: string) => Promise<void>;
  logout: () => void;
  registerUser: (userData: Partial<User>, docFile: File | null) => Promise<{ success: boolean; message: string }>;
  recoverPassword: (identifier: string) => Promise<{ success: boolean; message: string }>;
  resetUserPassword: (userCpf: string, prisonerCpf: string, newPass: string) => Promise<void>;

  addToCart: (product: Product, quantity?: number) => void;
  removeFromCart: (productId: string) => void;
  clearCart: () => void;
  createOrder: (data: Partial<Order> | File | null, location?: InmateLocation) => Promise<boolean>;
  
  // New: Server-side search for admin
  searchOrders: (term: string) => Promise<Order[]>;

  updateOrderStatus: (orderId: string, status: string) => void;
  markOrderAsPrinted: (orderId: string) => void;
  addProduct: (product: Product) => Promise<void>;
  updateProduct: (product: Product) => Promise<void>;
  deleteProduct: (productId: string) => void;
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
  navigateTo: (path: string) => void;
  compressImage: (file: File) => Promise<string>;
  showNotification: (msg: string, type: 'success'|'error'|'info') => void;
  removeNotification: (id: string) => void;
  
  checkPermission: (permission: string) => boolean;
}

const StoreContext = createContext<StoreContextType | undefined>(undefined);

const DEFAULT_CONFIG: AppConfig = {
  appName: 'Mercado Fácil',
  institutionName: ASSPEN_INFO.name,
  cnpj: ASSPEN_INFO.cnpj,
  primaryColor: '#0ea5e9',
  secondaryColor: '#f59e0b',
  backgroundColor: '#082f49',
  footerText: 'Sistema oficial de gestão de entregas.',
  contactPhone: '(66) 99999-9999',
  contactEmail: ASSPEN_INFO.email,
  contactAddress: 'Peixoto de Azevedo - MT',
  adminPassword: 'admin',
  pixKeys: [ASSPEN_INFO.defaultPix],
  systemName: 'MERCADO FÁCIL',
  theme: ThemeOption.MODERN_GREEN,
  customReceiptText: 'Conferir os itens no ato da entrega. Não aceitamos reclamações posteriores.',
  customReceiptTitle: 'ASSPEN - Gestão',
  customReceiptSubtitle: 'CDP Peixoto de Azevedo - MT',
  customReceiptDocName: 'CUPOM DE ENTREGA'
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
          // 15 minutos = 15 * 60 * 1000 ms
          logoutTimerRef.current = setTimeout(() => {
              logout();
              alert("Sessão encerrada por inatividade.");
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
      if (currentUser?.role !== UserRole.ADMIN) return;
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      const isoDate = ninetyDaysAgo.toISOString();
      try {
          const oldOrdersQuery = query(collection(db, 'orders'), where('createdAt', '<', isoDate), limit(50));
          const snapshot = await getDocs(oldOrdersQuery);
          if (!snapshot.empty) {
              const batch = writeBatch(db);
              snapshot.docs.forEach(doc => batch.delete(doc.ref));
              await batch.commit();
              console.log(`[Auto-Cleanup] ${snapshot.size} pedidos antigos removidos.`);
          }
      } catch (e) { console.warn("[Auto-Cleanup] Falha:", e); }
  };

  // --- LISTENERS ---
  useEffect(() => {
    let unsubUsers: Unsubscribe | null = null;
    let unsubOrders: Unsubscribe | null = null;
    let unsubProducts: Unsubscribe | null = null;
    let unsubConfig: Unsubscribe | null = null;
    let unsubExpenses: Unsubscribe | null = null;
    let unsubMsg: Unsubscribe | null = null;
    let unsubSup: Unsubscribe | null = null;

    const startListeners = async () => {
        unsubConfig = onSnapshot(doc(db, 'settings', 'general'), (docSnap: any) => {
            if (docSnap.exists()) setAppConfig({ ...DEFAULT_CONFIG, ...docSnap.data() as AppConfig });
            else setDoc(docSnap.ref, DEFAULT_CONFIG);
        });

        unsubProducts = onSnapshot(collection(db, 'products'), (snapshot) => {
            setProducts(snapshot.docs.map(d => d.data() as Product));
        });

        // USERS: Admin loads all, Family loads self only.
        if (currentUser?.role === UserRole.ADMIN) {
            unsubUsers = onSnapshot(query(collection(db, 'users')), (snapshot) => {
                setUsers(snapshot.docs.map(d => d.data() as User));
            });
            performAutoCleanup();
            
            // ORDERS: Admin loads recent 300 globally
            unsubOrders = onSnapshot(query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(300)), (snapshot) => {
                setOrders(snapshot.docs.map(d => d.data() as Order));
            });

        } else if (currentUser) {
            unsubUsers = onSnapshot(doc(db, 'users', currentUser.id), (doc) => {
                if (doc.exists()) {
                    const updatedUser = doc.data() as User;
                    setCurrentUser(prev => ({...prev, ...updatedUser}));
                    if (updatedUser.status === 'suspended') logout();
                }
            });
            
            // NOTE: Family orders are NOT loaded globally here to save bandwidth.
            // They are loaded in UserDashboard via a specific query.
            setOrders([]); // Clear global orders for family to save memory
        }

        unsubExpenses = onSnapshot(query(collection(db, 'expenses'), orderBy('date', 'desc'), limit(100)), (s) => setExpenses(s.docs.map(d => d.data() as Expense)));
        unsubMsg = onSnapshot(collection(db, 'messages'), s => setMessages(s.docs.map(d => d.data() as Message)));
        unsubSup = onSnapshot(collection(db, 'suppliers'), s => setSuppliers(s.docs.map(d => d.data() as Supplier)));

        setIsLoading(false);
    };

    startListeners();

    return () => {
        if(unsubUsers) unsubUsers();
        if(unsubOrders) unsubOrders();
        if(unsubProducts) unsubProducts();
        if(unsubConfig) unsubConfig();
        if(unsubExpenses) unsubExpenses();
        if(unsubMsg) unsubMsg();
        if(unsubSup) unsubSup();
    };
  }, [currentUser?.id, currentUser?.role]);

  // --- ACTIONS ---

  // Enhanced Search for Admin (Server-side)
  const searchOrders = async (term: string): Promise<Order[]> => {
      if (!term) return [];
      
      // Try by ID
      try {
          const docRef = doc(db, 'orders', term);
          const docSnap = await getDoc(docRef); // Requires getDoc import
          if (docSnap.exists()) return [docSnap.data() as Order];
      } catch (e) {}

      // Try by CPF or Name (Requires exact match or dedicated search service like Algolia, but simple 'where' works for exact)
      // Firestore doesn't support native "LIKE %term%" queries easily.
      // We'll try finding by CPF exact match.
      const qCpf = query(collection(db, 'orders'), where('userCpf', '==', term), orderBy('createdAt', 'desc'), limit(50));
      const snapCpf = await getDocs(qCpf);
      if(!snapCpf.empty) return snapCpf.docs.map(d => d.data() as Order);

      // Try by Inmate Name (approximate not possible, so we try exact or rely on client side if loaded)
      // This function allows the AdminDashboard to request more data if local filter is insufficient.
      
      return [];
  };

  // ... (Rest of the functions: login, uploadFile, etc. keep identical to previous optimized version) ...
  // [Re-including essential functions for context validity]
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
  };

  const login = async (identifier: string, pass: string) => {
    const cleanId = identifier.replace(/\D/g, ''); // Remove tudo que não for número
    const cleanPass = pass.trim();
    
    try {
        // Tenta buscar pelo CPF limpo (apenas números)
        let q = query(collection(db, 'users'), where('cpf', '==', cleanId));
        let snapshot = await getDocs(q);
        
        // Fallback: Tenta buscar pelo CPF formatado (XXX.XXX.XXX-XX) caso o banco tenha dados antigos
        if (snapshot.empty && cleanId.length === 11) {
            const formattedCpf = cleanId.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
            q = query(collection(db, 'users'), where('cpf', '==', formattedCpf));
            snapshot = await getDocs(q);
        }
        
        // Se não achar e tiver @, tenta por email
        if (snapshot.empty && identifier.includes('@')) { 
            q = query(collection(db, 'users'), where('email', '==', identifier.trim())); 
            snapshot = await getDocs(q); 
        }
        
        if (snapshot.empty) return { success: false, message: 'Usuário não encontrado.' };
        const user = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as User;
        if (user.password !== cleanPass) return { success: false, message: 'Senha incorreta.' };
        if (user.status === 'pending') return { success: false, message: 'Cadastro em análise.' };
        if (user.status === 'suspended') return { success: false, message: 'Conta suspensa.' };
        setCurrentUser(user);
        return { success: true };
    } catch (e: any) { return { success: false, message: 'Erro de conexão.' }; }
  };

  const loginAdmin = async (email: string, pass: string) => {
      const qAdmins = query(collection(db, 'users'), where('role', '==', UserRole.ADMIN));
      const snapshotAdmins = await getDocs(qAdmins);

      if (snapshotAdmins.empty) {
          // First access: no admins in DB. Allow default admin login and save it.
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

      // Admins exist. Check if email and password match any admin.
      const adminDoc = snapshotAdmins.docs.find(doc => doc.data().email === email && doc.data().password === pass);
      
      if (adminDoc) {
          setCurrentUser({ id: adminDoc.id, ...adminDoc.data() } as User);
          return;
      }
      
      // Fallback for legacy hardcoded password if needed, but ONLY if the admin@mercado.com user doesn't exist in DB yet
      const masterExists = snapshotAdmins.docs.some(doc => doc.data().email === 'admin@mercado.com');
      if (!masterExists && email === 'admin@mercado.com' && pass === 'admin123') {
          const legacyAdmin: User = { id: 'master', name: 'Administrador Master', role: UserRole.ADMIN, email: 'admin@mercado.com', cpf: '000.000.000-00', status: 'active', approved: true, password: pass, permissions: ['all'] };
          setCurrentUser(legacyAdmin);
          return;
      }

      throw new Error("E-mail ou senha de administrador incorretos.");
  };

  const updateAdminPassword = async (newPass: string) => {
      if (!currentUser || currentUser.role !== UserRole.ADMIN) throw new Error("Acesso negado.");
      
      // Update existing admin
      const adminRef = doc(db, 'users', currentUser.id);
      await updateDoc(adminRef, { password: newPass });
      setCurrentUser({ ...currentUser, password: newPass });
      showNotification("Senha de administrador atualizada com sucesso!", "success");
  };
  
  const loginFamiliar = async (cpf: string, pass: string) => { const res = await login(cpf, pass); if(!res.success) throw new Error(res.message); };
  
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
      if(!currentUser) return false;
      try {
        let orderData: Partial<Order>;
        let proofUrl = '';
        if (arg1 instanceof File || arg1 === null) {
            proofUrl = (arg1 instanceof File) ? await uploadFile(arg1, 'receipts') : '';
            const total = cart.reduce((acc, i) => acc + (i.priceAtPurchase * i.quantity), 0);
            orderData = { items: [...cart], total, paymentProofUrl: proofUrl, inmateLocation: arg2, deliveryLocation: arg2 };
        } else { orderData = arg1; }
        const newOrder: Order = {
            id: Date.now().toString(), userId: currentUser.id, userName: currentUser.name, userCpf: currentUser.cpf,
            unitId: currentUser.selectedUnitId || '1', unitName: 'Unidade Prisional', status: OrderStatus.PENDING,
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
      if(order) for (const item of order.items) { const p = products.find(prod => prod.id === item.productId); if (p) await updateDoc(doc(db, 'products', p.id), { stock: p.stock + item.quantity }); }
      await deleteDoc(doc(db, 'orders', oid));
  };

  const addProduct = async (p: Product) => await setDoc(doc(db, 'products', p.id), { ...p, weight: 'UN', margin: p.margin || 30 });
  const updateProduct = async (p: Product) => await setDoc(doc(db, 'products', p.id), p);
  const deleteProduct = async (id: string) => await deleteDoc(doc(db, 'products', id));
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
              if(ex) supplierId = ex.id;
              else { supplierId = crypto.randomUUID(); await setDoc(doc(db, 'suppliers', supplierId), {id: supplierId, name: data.supplier.name, cnpjOrCpf: data.supplier.cnpj || '', contact: '', description: 'XML Import'}); }
          }
          for (const item of data.items) {
              const clean = cleanProductName(item.name); if(!clean) continue;
              const key = normalizeName(clean);
              const ex = products.find(p => normalizeName(p.name) === key);
              const cost = Number(item.costPrice)||0; const qty = Number(item.quantity)||0;
              const price = cost + (cost * (profitMargin/100));
              if(ex) await updateDoc(doc(db, 'products', ex.id), { stock: (ex.stock||0)+qty, costPrice: cost, price: Math.max(price, ex.price), supplierId });
              else await setDoc(doc(db, 'products', crypto.randomUUID()), { id: crypto.randomUUID(), name: clean, description: item.description||'', category: item.category||'Geral', price: parseFloat(price.toFixed(2)), costPrice: cost, margin: profitMargin, stock: qty, imageUrl: '', available: true, restricted: false, supplierId, weight: 'UN' });
          }
          showNotification('Importação concluída.', 'success');
      } catch (e:any) { showNotification(e.message, 'error'); } finally { setIsLoading(false); }
  };
  const importXmlProduct = async (file: File, margin: number) => { const text = await file.text(); const data = parseInvoiceXML(text); if(data) await processInvoiceImport(data, margin); else throw new Error("Erro no XML"); };
  const importLegacyData = async (nu: User[], no: Order[]) => {}; 
  const updateAppConfig = async (c: AppConfig) => { await setDoc(doc(db, 'settings', 'general'), c, { merge: true }); setAppConfig(c); };
  const downloadBackup = () => { const data = { users, products, orders, suppliers, expenses, logs, appConfig, timestamp: new Date().toISOString() }; const blob = new Blob([JSON.stringify(data,null,2)],{type:'application/json'}); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'backup.json'; document.body.appendChild(a); a.click(); document.body.removeChild(a); };
  const backupSystem = downloadBackup;
  const resetSystem = () => {};
  const resetStock = async () => { setIsLoading(true); await Promise.all(products.map(p => updateDoc(doc(db,'products',p.id),{stock:0}))); setIsLoading(false); showNotification('Estoque zerado','success'); };
  const resetFinance = async () => { setIsLoading(true); await Promise.all(expenses.map(e => deleteDoc(doc(db,'expenses',e.id)))); setIsLoading(false); showNotification('Financeiro zerado','success'); };
  const clearOldData = async () => { await performAutoCleanup(); showNotification('Limpeza concluída','success'); };
  const registerUser = async (d: Partial<User>, f: File|null) => {
      setIsLoading(true);
      try {
        const u = { ...d, id: crypto.randomUUID(), createdAt: new Date().toISOString(), status: 'pending', approved: false, documentUrl: f ? await uploadFile(f, 'docs') : '', role: UserRole.FAMILY };
        if(d.inmateCpf) { const q = query(collection(db,'users'), where('inmateCpf','==',d.inmateCpf), where('role','==','FAMILY')); const s = await getDocs(q); if(s.size >= 3) throw new Error("Limite de familiares excedido."); }
        await setDoc(doc(db,'users',u.id), u); return { success: true, message: 'Cadastrado' };
      } catch(e:any) { throw new Error(e.message); } finally { setIsLoading(false); }
  };
  const createAdminUser = async (d: Partial<User>) => { const u = { ...d, id: crypto.randomUUID(), role: UserRole.ADMIN, status: 'active', approved: true, createdAt: new Date().toISOString() }; await setDoc(doc(db,'users',u.id), u); showNotification('Admin criado','success'); };
  const resetUserPassword = async (cpf: string, pCpf: string, pass: string) => { 
      setIsLoading(true); try {
      const q = query(collection(db,'users'), where('cpf','==',cpf.replace(/\D/g,''))); const s = await getDocs(q);
      if(s.empty) throw new Error("Usuário não encontrado.");
      const u = s.docs[0].data() as User;
      if(u.inmateCpf !== pCpf.replace(/\D/g,'') && (u as any).prisonerCpf !== pCpf.replace(/\D/g,'')) throw new Error("Dados do preso não conferem.");
      await updateDoc(doc(db,'users',u.id), { password: pass }); showNotification("Senha alterada","success");
      } catch(e:any){ throw new Error(e.message); } finally { setIsLoading(false); }
  };
  const sendSystemMessage = async (msg: Partial<SystemMessage>) => { await addDoc(collection(db,'systemMessages'), { id: crypto.randomUUID(), createdAt: new Date().toISOString(), type: 'info', ...msg }); };
  const sendMessage = async (m: Message) => { await addDoc(collection(db,'messages'), m); };
  const markMessageRead = (id: string) => {}; 
  const addSupplier = async (s: Supplier) => setDoc(doc(db,'suppliers',s.id), s);
  const removeSupplier = (id: string) => deleteDoc(doc(db,'suppliers',id));
  const addExpense = async (e: Expense) => setDoc(doc(db,'expenses',crypto.randomUUID()), {...e, id: crypto.randomUUID()});
  const checkPermission = () => true;
  const navigateTo = () => {};
  const showNotification = (m: string, t: any) => { const id = Date.now().toString(); setNotifications(p => [...p, {id, message:m, type:t}]); setTimeout(()=>setNotifications(p=>p.filter(n=>n.id!==id)), 5000); };
  const removeNotification = (id: string) => setNotifications(p=>p.filter(n=>n.id!==id));

  return (
    <StoreContext.Provider value={{
      currentUser, users, products, orders, units: INITIAL_UNITS, cart, appConfig, suppliers, expenses, logs, isLoading, authLoading: isLoading, systemMessages, messages, notifications, settings: appConfig, storageUsage,
      login, loginAdmin, loginFamiliar, logout, registerUser, recoverPassword, createAdminUser, resetUserPassword,
      addToCart, removeFromCart, clearCart, createOrder, searchOrders,
      updateOrderStatus, markOrderAsPrinted, deleteOrder, addProduct, updateProduct, deleteProduct,
      approveUser, updateUserStatus, deleteUser, suspendUser,
      addSupplier, removeSupplier, addExpense,
      processInvoiceImport, importXmlProduct, importLegacyData, updateAppConfig, updateSettings: updateAppConfig, navigateTo, compressImage: uploadFile,
      downloadBackup, backupSystem: downloadBackup, resetSystem, resetStock, resetFinance, clearOldData, checkPermission, sendSystemMessage, sendMessage, markMessageRead, showNotification, removeNotification
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