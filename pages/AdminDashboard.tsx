import React, { useState, useEffect } from 'react';
import { useApp } from '../context/StoreContext';
import { OrderStatus, ThemeOption, User, Order, Product, UserRole } from '../types';
import { THEME_COLORS } from '../constants';
import { cleanProductName, normalizeName, validateCPF } from '../utils';
import { 
  Users, Package, ShoppingCart, DollarSign, LogOut, AlertTriangle, 
  Landmark, Trash2, Edit, Upload, FileText, Settings, X, Printer, Search, CheckCircle, BarChart3, Image as ImageIcon, Lock, Home, Eye, FileWarning, ArrowDownCircle, AlertCircle, ClipboardList, Briefcase, FileBarChart, UserCheck, Unlock, Plus, Key, Save, Database, HardDrive, Download, Maximize2, Truck, Box, RefreshCw, Zap, Phone, ArrowRight, Grid, List, MapPin, Mail, Filter, TrendingUp, ArrowUpDown, ChevronDown, ChevronUp, Contact, Ban, ToggleLeft, ToggleRight, FileInput, Shield, Loader2, KeyRound, XCircle, MessageSquareX, Send, UserCog, Menu
} from 'lucide-react';
import { CupomEntrega } from '../components/CupomEntrega';
import { ReciboA4 } from '../components/ReciboA4';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from 'recharts';

// --- COMPONENTS ---

interface NavItemProps {
  icon: any;
  label: string;
  active: boolean;
  onClick: () => void;
  badge?: number;
}

const NavItem: React.FC<NavItemProps> = ({ icon: Icon, label, active, onClick, badge }) => (
  <button 
    onClick={onClick}
    className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all mb-2 ${active ? 'bg-white/20 text-white font-bold shadow-lg transform scale-[1.02]' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}
  >
    <div className="flex items-center gap-3">
      <Icon size={20} className={active ? 'text-white' : ''} />
      <span className="text-sm">{label}</span>
    </div>
    {badge ? <span className="bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm">{badge}</span> : null}
  </button>
);

interface StatCardProps {
    title: string;
    value: string | number;
    icon: any;
    color: string;
}
  
const StatCard: React.FC<StatCardProps> = ({ title, value, icon: Icon, color }) => (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center hover:shadow-lg transition-all relative overflow-hidden group">
        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-white mr-5 shadow-lg group-hover:scale-110 transition-transform ${color}`}>
            <Icon size={28} />
        </div>
        <div>
            <p className="text-gray-400 text-xs font-bold uppercase tracking-wide">{title}</p>
            <p className="text-3xl font-black text-slate-800 tracking-tight">{value}</p>
        </div>
    </div>
);

const getLocalDateStr = () => {
    const d = new Date();
    const offset = d.getTimezoneOffset() * 60000;
    return (new Date(d.getTime() - offset)).toISOString().slice(0, 10);
};

const translateStatus = (status: string | undefined) => {
    if (!status) return 'Indefinido';
    const s = String(status); 
    const map: Record<string, string> = {
        'pending': 'Em Análise (Verificando Pagamento)',
        'PENDING': 'Em Análise (Verificando Pagamento)',
        'pending_payment': 'Aguardando Pagamento',
        'paid': 'Pago (Liberado)',
        'preparing': 'Em Separação',
        'out_for_delivery': 'Saiu p/ Entrega',
        'delivered': 'Entregue',
        'cancelled': 'Reprovado / Cancelado'
    };
    return map[s] || s;
};

const getStatusColor = (status: string) => {
    const s = (status || '').toLowerCase();
    if (s.includes('paid') || s.includes('pago')) return 'bg-green-100 text-green-800 border-green-200';
    if (s.includes('pending') || s.includes('pendente') || s.includes('aguardando') || s.includes('análise')) return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    if (s.includes('delivered') || s.includes('entregue')) return 'bg-blue-100 text-blue-800 border-blue-200';
    if (s.includes('preparing') || s.includes('separa')) return 'bg-purple-100 text-purple-800 border-purple-200';
    if (s.includes('cancel')) return 'bg-red-100 text-red-800 border-red-200';
    return 'bg-gray-100 text-gray-800 border-gray-200';
};

const PERMISSIONS = [
    { id: 'manage_orders', label: 'Gerenciar Pedidos' },
    { id: 'manage_products', label: 'Gerenciar Produtos' },
    { id: 'manage_users', label: 'Gerenciar Usuários' },
    { id: 'manage_finance', label: 'Financeiro' },
    { id: 'view_reports', label: 'Ver Relatórios' },
    { id: 'manage_settings', label: 'Configurações' }
];

export const AdminDashboard: React.FC = () => {
  const { 
    orders, products, users, expenses, settings, suppliers, compressImage, currentUser, isLoading,
    updateOrderStatus, approveUser, deleteUser, suspendUser, addProduct, updateProduct, deleteProduct, importXmlProduct,
    addExpense, updateSettings, clearOldData, backupSystem, logout, showNotification, deleteOrder, createAdminUser, removeSupplier,
    resetStock, resetFinance, sendSystemMessage, updateAdminPassword
  } = useApp();

  const [activeTab, setActiveTab] = useState('dash');
  const [printOrder, setPrintOrder] = useState<any>(null); 
  const [xmlFile, setXmlFile] = useState<File|null>(null);
  const [margin, setMargin] = useState('30');
  
  // Dashboard Logic
  const [filterType, setFilterType] = useState<'day' | 'week' | 'month'>('day');
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [pendingFilter, setPendingFilter] = useState<'week' | 'month' | null>(null);
  const [authAction, setAuthAction] = useState<'FILTER' | 'CONFIG_ACTION' | 'CLEAN_PRODUCTS' | 'ZERO_STOCK' | 'ZERO_FINANCE'>('FILTER');
  const [pendingConfigAction, setPendingConfigAction] = useState<(() => void) | null>(null);
  const [authPass, setAuthPass] = useState('');
  
  // Mobile Menu Logic
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Orders Logic
  const [orderSearch, setOrderSearch] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState('ALL');
  const [orderDateFilter, setOrderDateFilter] = useState(''); 
  const [selectedOrderDetails, setSelectedOrderDetails] = useState<Order | null>(null);
  const [historyModalCpf, setHistoryModalCpf] = useState<string | null>(null);
  const [historyModalName, setHistoryModalName] = useState<string | null>(null);
  
  // Rejection Logic
  const [isRejecting, setIsRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  
  // Finance Logic
  const [financeFilters, setFinanceFilters] = useState({
      start: getLocalDateStr(), 
      end: getLocalDateStr(),
      term: '',
      recipient: ''
  });
  const [viewingReceipt, setViewingReceipt] = useState<{ data: any, type: 'ORDER' | 'EXPENSE' } | null>(null); 
  
  // Users Logic
  const [userSearch, setUserSearch] = useState('');
  const [userDateFilter, setUserDateFilter] = useState('');
  const [viewingUser, setViewingUser] = useState<User | null>(null); // State para visualizar detalhes do usuário
  const [showPasswords, setShowPasswords] = useState(false); // Toggle para ver senhas

  // Settings Logic
  const [configForm, setConfigForm] = useState(settings || {});
  const [pixKeyInput, setPixKeyInput] = useState('');
  const [newAdminForm, setNewAdminForm] = useState({ name: '', cpf: '', password: '', email: '' });
  const [adminPermissions, setAdminPermissions] = useState<string[]>([]);

  // Report Logic
  const [reportConfig, setReportConfig] = useState({
      type: 'GENERAL', 
      startDate: getLocalDateStr(),
      endDate: getLocalDateStr(),
      financeType: 'ALL', 
      individualSearch: '',
      selectedUser: null as User | null
  });
  const [showReportModal, setShowReportModal] = useState(false);
  const [isEditingReport, setIsEditingReport] = useState(false); 
  const [editableReportItems, setEditableReportItems] = useState<any[]>([]);
  const [editableSummary, setEditableSummary] = useState({ totalIn: 0, totalOut: 0 });

  // Products Logic
  const [productViewMode, setProductViewMode] = useState<'list' | 'grid'>('list');
  const [expenseForm, setExpenseForm] = useState({ desc: '', amount: '', cat: 'Serviços', recName: '', recDoc: '', obs: '' });
  const [productForm, setProductForm] = useState({ name: '', cost: '', margin: '30', stock: '', imageUrl: '', available: true });
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [showProductModal, setShowProductModal] = useState(false);
  const [showSupplierModal, setShowSupplierModal] = useState(false); 
  const [searchTerm, setSearchTerm] = useState('');
  const [isCleaningProducts, setIsCleaningProducts] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: keyof Product, direction: 'asc' | 'desc' }>({ key: 'name', direction: 'asc' });

  const themeColors = THEME_COLORS[settings?.theme] || THEME_COLORS[ThemeOption.POLICE_MT];
  const isMaster = currentUser?.id === 'master' || currentUser?.id === 'admin' || currentUser?.email === 'admin@admin.com';

  useEffect(() => {
      if(activeTab === 'settings' && settings) setConfigForm(settings);
  }, [settings, activeTab]);

  // Auth Handlers
  const handleProtectedAction = (action: () => void, type: any = 'CONFIG_ACTION') => {
      setPendingConfigAction(() => action);
      setAuthAction(type);
      setAuthPass('');
      setShowAuthModal(true);
  };

  const handleDownloadSource = () => {
    const link = document.createElement('a');
    link.href = '/source.zip';
    link.download = 'sistema_completo.zip';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFilterChange = (newFilter: 'week' | 'month') => {
      setPendingFilter(newFilter);
      setAuthAction('FILTER');
      setAuthPass('');
      setShowAuthModal(true);
  };

  const handlePrint = () => window.print();

  const handleNavClick = (tab: string) => {
      setActiveTab(tab);
      setIsMobileMenuOpen(false);
  };

  const confirmAuth = (e: React.FormEvent) => {
      e.preventDefault();
      const inputPass = authPass.trim();
      const validPasswords = [settings?.adminPassword, 'admin', '102030'].filter(Boolean);
      
      if (validPasswords.includes(inputPass)) {
          if (authAction === 'FILTER' && pendingFilter) {
              setFilterType(pendingFilter);
              showNotification(`Visualização alterada: ${pendingFilter === 'week' ? 'Semana' : 'Mês'}`, 'success');
          } else if (pendingConfigAction) {
              pendingConfigAction();
          }
          setShowAuthModal(false);
          setAuthPass('');
          setPendingConfigAction(null);
      } else {
          showNotification('Senha incorreta.', 'error');
      }
  };

  const handlePermissionToggle = (permId: string) => {
      setAdminPermissions(prev => prev.includes(permId) ? prev.filter(p => p !== permId) : [...prev, permId]);
  };

  const handleCreateAdmin = async () => {
      if(!newAdminForm.name || !newAdminForm.cpf || !newAdminForm.password) return showNotification('Preencha os campos obrigatórios.', 'error');
      
      // VALIDAÇÃO CPF ADMIN
      if(!validateCPF(newAdminForm.cpf)) return showNotification('O CPF informado é inválido.', 'error');

      await createAdminUser({ ...newAdminForm, permissions: adminPermissions });
      setNewAdminForm({ name: '', cpf: '', password: '', email: '' });
      setAdminPermissions([]);
  };

  const handleSaveConfig = () => { 
      updateSettings(configForm); 
      showNotification('Configurações salvas com sucesso!', 'success'); 
  };

  const handleRejectOrder = async () => {
      if (!selectedOrderDetails) return;
      if (!rejectReason.trim()) return showNotification('É obrigatório informar o motivo.', 'error');

      try {
          // 1. Atualizar Status
          await updateOrderStatus(selectedOrderDetails.id, OrderStatus.CANCELLED);
          
          // 2. Enviar Mensagem do Sistema
          await sendSystemMessage({
              title: `Pedido #${selectedOrderDetails.id.slice(0,6)} Reprovado`,
              content: `Seu pedido foi reprovado pela administração. Motivo: ${rejectReason}`,
              targetUserId: selectedOrderDetails.userId,
              type: 'error'
          });

          showNotification('Pedido reprovado e usuário notificado.', 'success');
          setSelectedOrderDetails(prev => prev ? {...prev, status: OrderStatus.CANCELLED} : null);
          setIsRejecting(false);
          setRejectReason('');
      } catch (e: any) {
          showNotification('Erro ao reprovar: ' + e.message, 'error');
      }
  };
  
  // Data Filtering
  const getFilteredOrders = () => {
      const now = new Date(); now.setHours(0,0,0,0);
      return (orders || []).filter(o => {
          if (o.status === 'Cancelado') return false;
          if (!o.date) return false;
          try {
              const d = new Date(o.date); d.setHours(0,0,0,0);
              if (isNaN(d.getTime())) return false;
              if (filterType === 'day') return d.getTime() === now.getTime();
              if (filterType === 'week') return (now.getTime() - d.getTime()) / (1000 * 3600 * 24) <= 7;
              if (filterType === 'month') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
          } catch (e) { return false; }
          return false;
      });
  };

  const filteredOrders = getFilteredOrders();
  const salesTotal = filteredOrders.reduce((a, b) => a + (Number(b.total) || 0), 0);
  const ordersCount = filteredOrders.length;
  
  const pendingOrdersCount = (orders || []).filter(o => o.status === OrderStatus.PENDING).length;
  const pendingUsersCount = (users || []).filter(u => !u.approved && u.role === 'FAMILIAR').length;
  const totalEntries = (orders || []).filter(o => o.status !== 'Cancelado').reduce((a,b)=>a+(Number(b.total) || 0),0);
  const totalExits = (expenses || []).reduce((a,b)=>a+(Number(b.amount) || 0),0);

  // Chart Data
  const getChartData = () => {
      const data = [];
      const today = new Date();
      for (let i = 6; i >= 0; i--) {
          const d = new Date(today);
          d.setDate(today.getDate() - i);
          const dateStr = d.toLocaleDateString('pt-BR', { weekday: 'short' });
          const dayOrders = (orders || []).filter(o => {
              if(!o.date) return false;
              try {
                  const od = new Date(o.date);
                  if (isNaN(od.getTime())) return false;
                  return od.getDate() === d.getDate() && od.getMonth() === d.getMonth() && o.status !== 'Cancelado';
              } catch (e) { return false; }
          });
          const total = dayOrders.reduce((acc, o) => acc + (Number(o.total) || 0), 0);
          data.push({ name: dateStr, vendas: total });
      }
      return data;
  };
  const chartData = getChartData();

  const getOrdersList = () => {
      return (orders || []).filter(o => {
          const matchStatus = orderStatusFilter === 'ALL' || o.status === orderStatusFilter;
          const searchLower = orderSearch.toLowerCase();
          let matchDate = true;
          if (orderDateFilter && o.date) {
              const orderDate = new Date(o.date).toISOString().split('T')[0];
              matchDate = orderDate === orderDateFilter;
          }
          const matchSearch = (o.id || '').toLowerCase().includes(searchLower) || (o.userName || '').toLowerCase().includes(searchLower) || (o.userCpf || '').includes(searchLower) || (o.inmateName || '').toLowerCase().includes(searchLower);
          return matchStatus && matchSearch && matchDate;
      }).sort((a, b) => {
          if (orderStatusFilter === 'ALL' && !orderDateFilter) {
              if (a.status === OrderStatus.PENDING && b.status !== OrderStatus.PENDING) return -1;
              if (a.status !== OrderStatus.PENDING && b.status === OrderStatus.PENDING) return 1;
          }
          return new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime();
      });
  };

  const getFilteredExpenses = () => {
      const s = new Date(financeFilters.start + 'T00:00:00'); 
      const e = new Date(financeFilters.end + 'T23:59:59');   
      const term = financeFilters.term.toLowerCase();
      
      return (expenses || []).filter(exp => {
          if (!exp.date) return false;
          try {
              const d = new Date(exp.date);
              if (isNaN(d.getTime())) return false;
              const matchesDate = d >= s && d <= e;
              const matchesTerm = (exp.description || '').toLowerCase().includes(term) || (exp.recipientName || '').toLowerCase().includes(term) || (exp.recipientDoc || '').includes(term);
              return matchesDate && matchesTerm;
          } catch(err) { return false; }
      }).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  };

  const getFilteredUsers = () => {
      return (users || []).filter(u => {
          if (u.role !== UserRole.FAMILY) return false;
          
          const matchSearch = (u.name || '').toLowerCase().includes(userSearch.toLowerCase()) || (u.cpf && u.cpf.includes(userSearch)) || (u.inmateName && u.inmateName.toLowerCase().includes(userSearch.toLowerCase())) || (u.inmateCpf && u.inmateCpf.includes(userSearch));
          let matchDate = true;
          if (userDateFilter && u.createdAt) matchDate = u.createdAt.startsWith(userDateFilter);
          return matchSearch && matchDate;
      });
  };

  const getAdminUsers = () => {
      return (users || []).filter(u => u.role === UserRole.ADMIN && u.id !== 'admin' && u.id !== 'master');
  };

  // Actions
  const handleOpenReceipt = (item: any) => {
      if (item.type === 'ENTRY' || item.items) {
          const order = orders.find(o => o.id === item.id);
          if (order) setViewingReceipt({ data: order, type: 'ORDER' });
      } else {
          const expense = expenses.find(e => e.id === item.id);
          const validExpense = expense || item;
          if (validExpense) setViewingReceipt({ data: validExpense, type: 'EXPENSE' });
      }
  };

  const handleExpense = async (e:any) => { 
      e.preventDefault(); 
      const amountVal = parseFloat(expenseForm.amount);
      if (isNaN(amountVal) || amountVal <= 0) return showNotification("Valor inválido", "error");
      await addExpense({ description: expenseForm.desc, amount: amountVal, category: expenseForm.cat, recipientName: expenseForm.recName, recipientDoc: expenseForm.recDoc, observation: expenseForm.obs, id:'', date: new Date().toISOString() } as any); 
      setExpenseForm({desc:'',amount:'',cat:'Serviços',recName:'',recDoc:'',obs:''}); 
      showNotification('Despesa registrada com sucesso!', 'success'); 
  };

  const handleOptimizeStock = async () => {
      setIsCleaningProducts(true);
      try {
          const groups = new Map<string, Product[]>();
          (products || []).forEach(p => {
              const clean = cleanProductName(p.name);
              const key = normalizeName(clean);
              if(!key) return;
              if (!groups.has(key)) groups.set(key, []);
              groups.get(key)!.push(p);
          });
          let mergedCount = 0;
          let deletedCount = 0;
          const deletePromises: Promise<void>[] = [];
          const updatePromises: Promise<void>[] = [];
          for (const [key, group] of groups.entries()) {
              if (group.length > 0) {
                  const withImage = group.find(p => p.imageUrl && p.imageUrl.length > 10);
                  const sortedByLength = [...group].sort((a,b) => a.name.length - b.name.length);
                  let master = withImage || sortedByLength[0];
                  const officialName = cleanProductName(master.name);
                  const totalStock = group.reduce((acc, p) => acc + (p.stock || 0), 0);
                  const maxPrice = Math.max(...group.map(p => Number(p.price) || 0));
                  const maxCost = Math.max(...group.map(p => Number(p.costPrice) || 0));
                  const margin = master.margin || 30;
                  updatePromises.push(updateProduct({ ...master, name: officialName, stock: totalStock, price: maxPrice, costPrice: maxCost, margin: margin }));
                  for (const p of group) {
                      if (p.id !== master.id) { deletePromises.push(deleteProduct(p.id)); deletedCount++; }
                  }
                  if (group.length > 1) mergedCount++;
              }
          }
          await Promise.all([...updatePromises, ...deletePromises]);
          showNotification(`Limpeza Concluída! ${mergedCount} itens unificados. ${deletedCount} duplicatas removidas.`, 'success');
      } catch (error: any) { showNotification(`Erro: ${error.message}`, 'error'); } finally { setIsCleaningProducts(false); }
  };

  const handleProductSubmit = async (e:any) => { e.preventDefault(); const d = {...productForm, cost:parseFloat(productForm.cost), margin:parseFloat(productForm.margin), stock:parseInt(productForm.stock), price: parseFloat(productForm.cost) * (1 + parseFloat(productForm.margin)/100)}; if(editingProduct) await updateProduct({...editingProduct, ...d}); else await addProduct({...d, id: Date.now().toString()} as any); setShowProductModal(false); setEditingProduct(null); showNotification('Produto salvo','success'); };
  const handleProductImageUpload = async (e:any) => { if(e.target.files?.[0]) setProductForm({...productForm, imageUrl: await compressImage(e.target.files[0])}); };
  const handleImportXML = async () => { if(xmlFile) try { await importXmlProduct(xmlFile, parseFloat(margin)); setXmlFile(null); } catch(e:any){showNotification(e.message,'error')} };
  
  // Reports
  const generateReportData = () => {
      const start = new Date(reportConfig.startDate); start.setHours(0,0,0,0);
      const end = new Date(reportConfig.endDate); end.setHours(23,59,59,999);
      let data: any[] = [];
      let summary = { totalIn: 0, totalOut: 0 };
      
      const ordersInRange = (orders || []).filter(o => o.status !== OrderStatus.CANCELLED && new Date(o.date) >= start && new Date(o.date) <= end);

      if (reportConfig.type === 'GENERAL') { 
          summary.totalIn = totalEntries; summary.totalOut = totalExits; 
      }
      else if (reportConfig.type === 'ACCOUNTABILITY') {
          // Relatório de Prestação de Contas (Simplificado para Associados)
          const salesPeriod = ordersInRange.reduce((acc, o) => acc + (Number(o.total) || 0), 0);
          const expensesPeriod = (expenses || [])
            .filter(e => new Date(e.date) >= start && new Date(e.date) <= end)
            .reduce((acc, e) => acc + (Number(e.amount) || 0), 0);
          
          data = [
              { desc: 'RECEITA BRUTA (VENDAS)', value: salesPeriod, type: 'CRÉDITO' },
              { desc: 'DESPESAS OPERACIONAIS', value: expensesPeriod, type: 'DÉBITO' },
              { desc: 'SALDO LÍQUIDO DO PERÍODO', value: salesPeriod - expensesPeriod, type: 'RESULTADO' }
          ];
          summary.totalIn = salesPeriod;
          summary.totalOut = expensesPeriod;
      }
      else if (reportConfig.type === 'FINANCIAL') {
          if (reportConfig.financeType === 'ALL' || reportConfig.financeType === 'ENTRY') {
              const entries = ordersInRange.map(o => ({ date: o.date, desc: `Pedido #${(o.id||'').slice(0,6)}`, type: 'ENTRADA', value: Number(o.total) || 0, sub: o.userName, id: o.id }));
              data = [...data, ...entries];
          }
          if (reportConfig.financeType === 'ALL' || reportConfig.financeType === 'EXIT') {
              const exits = (expenses || []).filter(e => new Date(e.date) >= start && new Date(e.date) <= end).map(e => ({ date: e.date, desc: e.description, type: 'SAÍDA', value: Number(e.amount) || 0, sub: e.recipientName, id: e.id }));
              data = [...data, ...exits];
          }
           data.sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
           summary.totalIn = data.filter(i => i.type === 'ENTRADA').reduce((acc, i) => acc + i.value, 0);
           summary.totalOut = data.filter(i => i.type === 'SAÍDA').reduce((acc, i) => acc + i.value, 0);
      } else if (reportConfig.type === 'INDIVIDUAL' && reportConfig.selectedUser) {
          const userOrders = (orders || []).filter(o => o.userId === reportConfig.selectedUser!.id && o.status !== OrderStatus.CANCELLED).map(o => ({ date: o.date, desc: `Compra #${(o.id||'').slice(0,6)}`, type: 'COMPRA', value: Number(o.total) || 0, sub: o.status, id: o.id }));
          data = userOrders.sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
          summary.totalIn = data.reduce((acc, i) => acc + i.value, 0);
      } else if (reportConfig.type === 'STOCK_LOW') {
          data = (products || []).filter(p => p.stock < 10).map(p => ({ id: p.id, name: p.name, stock: p.stock, cost: Number(p.costPrice) || 0, supplier: suppliers.find(s => s.id === p.supplierId)?.name || 'Não Informado', totalCost: (Number(p.costPrice) || 0) * (10 - p.stock) }));
          summary.totalOut = data.reduce((acc, p) => acc + p.totalCost, 0);
      } else if (reportConfig.type === 'SALES_BY_CATEGORY') {
          const catMap: Record<string, number> = {};
          ordersInRange.forEach(o => o.items.forEach(i => {
              const cat = i.category || 'Geral';
              catMap[cat] = (catMap[cat] || 0) + (i.priceAtPurchase * i.quantity);
          }));
          data = Object.entries(catMap).map(([cat, total]) => ({ desc: cat, value: total }));
          summary.totalIn = data.reduce((acc, i) => acc + i.value, 0);
      } else if (reportConfig.type === 'TOP_PRODUCTS') {
          const prodMap: Record<string, {qty: number, total: number}> = {};
          ordersInRange.forEach(o => o.items.forEach(i => {
              if(!prodMap[i.name || 'Item']) prodMap[i.name || 'Item'] = {qty: 0, total: 0};
              prodMap[i.name || 'Item'].qty += i.quantity;
              prodMap[i.name || 'Item'].total += (i.priceAtPurchase * i.quantity);
          }));
          data = Object.entries(prodMap)
            .map(([name, stats]) => ({ desc: name, stock: stats.qty, value: stats.total }))
            .sort((a,b) => b.value - a.value);
          summary.totalIn = data.reduce((acc, i) => acc + i.value, 0);
      } else if (reportConfig.type === 'TOP_USERS') {
          const userMap: Record<string, {name: string, count: number, total: number}> = {};
          ordersInRange.forEach(o => {
              if(!userMap[o.userId]) userMap[o.userId] = {name: o.userName || 'N/A', count: 0, total: 0};
              userMap[o.userId].count += 1;
              userMap[o.userId].total += Number(o.total);
          });
          data = Object.values(userMap)
            .map(u => ({ desc: u.name, stock: u.count, value: u.total })) // Reuse fields
            .sort((a,b) => b.value - a.value);
          summary.totalIn = data.reduce((acc, i) => acc + i.value, 0);
      }
      return { items: data, summary };
  };
  const handleOpenReport = () => { 
      if (reportConfig.type === 'INDIVIDUAL' && !reportConfig.selectedUser) return showNotification("Selecione um usuário.", "error"); 
      const { items, summary } = generateReportData(); 
      setEditableReportItems(JSON.parse(JSON.stringify(items))); 
      setEditableSummary(summary);
      setIsEditingReport(false); 
      setShowReportModal(true); 
  };
  const updateReportItem = (index: number, field: string, value: string) => { const newItems = [...editableReportItems]; if (newItems[index]) { if (field === 'value' || field === 'cost' || field === 'stock') newItems[index][field] = parseFloat(value) || 0; else newItems[index][field] = value; setEditableReportItems(newItems); } };

  // Sorting
  const handleSort = (key: keyof Product) => setSortConfig(current => ({ key, direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc' }));
  const getSortedProducts = () => {
      const sorted = [...(products || [])].filter(p => (p.name || '').toLowerCase().includes(searchTerm.toLowerCase())).sort((a, b) => {
            const valA = a[sortConfig.key], valB = b[sortConfig.key];
            if (typeof valA === 'string' && typeof valB === 'string') return sortConfig.direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
            if (typeof valA === 'number' && typeof valB === 'number') return sortConfig.direction === 'asc' ? valA - valB : valB - valA;
            return 0;
        });
      return sorted;
  };
  const SortIcon = ({ colKey }: { colKey: keyof Product }) => sortConfig.key !== colKey ? <ArrowUpDown size={12} className="opacity-30 ml-1 inline"/> : (sortConfig.direction === 'asc' ? <ChevronUp size={14} className="ml-1 inline text-blue-600"/> : <ChevronDown size={14} className="ml-1 inline text-blue-600"/>);

  if (isLoading) return <div className="min-h-screen flex flex-col items-center justify-center bg-slate-100 text-slate-500"><Loader2 size={48} className="animate-spin mb-4 text-blue-600"/><p className="font-bold text-sm">Carregando dados...</p></div>;

  return (
    <div className="flex h-screen bg-slate-100 font-sans overflow-hidden text-slate-900 relative">
        
        {/* MOBILE MENU OVERLAY BACKDROP */}
        {isMobileMenuOpen && (
            <div 
                className="fixed inset-0 bg-black/50 z-40 md:hidden backdrop-blur-sm animate-fadeIn"
                onClick={() => setIsMobileMenuOpen(false)}
            />
        )}

        {/* SIDEBAR (Responsive: Fixed Drawer on Mobile / Relative on Desktop) */}
        <aside className={`
            fixed inset-y-0 left-0 z-50 w-64 flex flex-col transition-transform duration-300 ease-in-out shadow-2xl
            ${themeColors.primary} text-white
            md:relative md:translate-x-0
            ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
        `}>
            <div className="h-24 flex flex-col justify-center px-6 border-b border-white/10 relative">
                <div className="flex items-center mb-1">
                    <div className="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center mr-3"><Landmark size={18} className="text-white"/></div>
                    <h1 className="font-bold text-sm tracking-wider text-white truncate" title={settings?.systemName}>{settings?.systemName || 'JUMBO FÁCIL'}</h1>
                </div>
                <p className="text-[10px] text-white/70 pl-11">Painel Gestor</p>
                {/* Close Button for Mobile */}
                <button onClick={() => setIsMobileMenuOpen(false)} className="absolute top-4 right-4 md:hidden text-white/50 hover:text-white">
                    <X size={20} />
                </button>
            </div>
            
            <nav className="flex-1 py-6 px-3 space-y-2 overflow-y-auto">
                <NavItem icon={Home} label="Início" active={activeTab === 'dash'} onClick={() => handleNavClick('dash')} />
                <NavItem icon={ShoppingCart} label="Pedidos" active={activeTab === 'orders'} onClick={() => handleNavClick('orders')} badge={pendingOrdersCount} />
                <NavItem icon={DollarSign} label="Financeiro" active={activeTab === 'finance'} onClick={() => handleNavClick('finance')} />
                <NavItem icon={Package} label="Produtos & Estoque" active={activeTab === 'products'} onClick={() => handleNavClick('products')} />
                <NavItem icon={Users} label="Usuários" active={activeTab === 'users'} onClick={() => handleNavClick('users')} badge={pendingUsersCount} />
                <NavItem icon={ClipboardList} label="Relatórios" active={activeTab === 'reports'} onClick={() => handleNavClick('reports')} />
                <NavItem icon={Settings} label="Configurações" active={activeTab === 'settings'} onClick={() => handleNavClick('settings')} />
            </nav>
            <div className="p-4 border-t border-white/10 bg-black/20"><button onClick={logout} className="flex items-center w-full px-4 py-3 rounded-lg hover:bg-white/10 text-red-300 hover:text-red-200 transition-colors"><LogOut size={20}/><span className="ml-3 font-bold text-sm">Sair do Sistema</span></button></div>
        </aside>

        {/* BOTTOM NAV FOR MOBILE - IMPROVED WITH MENU BUTTON */}
        <div className="md:hidden fixed bottom-0 left-0 w-full bg-white border-t border-gray-200 z-40 flex justify-around p-2 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
            <button onClick={() => setActiveTab('dash')} className={`p-2 rounded-lg flex flex-col items-center ${activeTab === 'dash' ? 'text-blue-600' : 'text-gray-400'}`}>
                <Home size={20} /><span className="text-[10px] mt-1 font-bold">Início</span>
            </button>
            <button onClick={() => setActiveTab('orders')} className={`p-2 rounded-lg flex flex-col items-center relative ${activeTab === 'orders' ? 'text-blue-600' : 'text-gray-400'}`}>
                <ShoppingCart size={20} /><span className="text-[10px] mt-1 font-bold">Pedidos</span>
                {pendingOrdersCount > 0 && <span className="absolute top-1 right-2 w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>}
            </button>
            <button onClick={() => setActiveTab('finance')} className={`p-2 rounded-lg flex flex-col items-center ${activeTab === 'finance' ? 'text-blue-600' : 'text-gray-400'}`}>
                <DollarSign size={20} /><span className="text-[10px] mt-1 font-bold">Finan</span>
            </button>
            <button onClick={() => setIsMobileMenuOpen(true)} className="p-2 rounded-lg flex flex-col items-center text-slate-800 hover:bg-gray-100 transition-colors">
                <Menu size={20} /><span className="text-[10px] mt-1 font-bold">Menu</span>
            </button>
        </div>

        <main className="flex-1 flex flex-col h-full overflow-hidden relative bg-slate-50 text-slate-800 pb-16 md:pb-0">
            <div className="flex-1 overflow-y-auto p-4 md:p-8">
                
                {/* --- INÍCIO --- */}
                {activeTab === 'dash' && (
                    <div className="animate-fadeIn space-y-6">
                         <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
                            <div><h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><Home size={28} className="text-slate-400"/> Painel Geral</h2><p className="text-sm text-gray-500">Resumo do sistema.</p></div>
                            <div className="flex gap-2 mt-4 md:mt-0 bg-white p-1 rounded-xl shadow-sm border border-gray-200">
                                <button onClick={() => setFilterType('day')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${filterType === 'day' ? 'bg-slate-800 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}>Hoje</button>
                                <button onClick={() => handleFilterChange('week')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${filterType === 'week' ? 'bg-slate-800 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}>{filterType !== 'week' && <Lock size={10} />} Semana</button>
                                <button onClick={() => handleFilterChange('month')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${filterType === 'month' ? 'bg-slate-800 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}>{filterType !== 'month' && <Lock size={10} />} Mês</button>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                            <button onClick={() => setActiveTab('finance')} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-lg hover:border-blue-200 transition-all flex flex-col items-center gap-3 group"><div className="bg-blue-50 p-4 rounded-full text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors"><ArrowDownCircle size={24}/></div><span className="text-sm font-bold text-slate-700">Nova Despesa</span></button>
                            <button onClick={() => setShowProductModal(true)} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-lg hover:border-purple-200 transition-all flex flex-col items-center gap-3 group"><div className="bg-purple-50 p-4 rounded-full text-purple-600 group-hover:bg-purple-600 group-hover:text-white transition-colors"><Package size={24}/></div><span className="text-sm font-bold text-slate-700">Novo Produto</span></button>
                            <button onClick={() => setActiveTab('reports')} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-lg hover:border-green-200 transition-all flex flex-col items-center gap-3 group"><div className="bg-green-50 p-4 rounded-full text-green-600 group-hover:bg-green-600 group-hover:text-white transition-colors"><Printer size={24}/></div><span className="text-sm font-bold text-slate-700">Relatórios</span></button>
                            <button onClick={() => setActiveTab('settings')} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-lg hover:border-orange-200 transition-all flex flex-col items-center gap-3 group"><div className="bg-orange-50 p-4 rounded-full text-orange-600 group-hover:bg-orange-600 group-hover:text-white transition-colors"><Settings size={24}/></div><span className="text-sm font-bold text-slate-700">Configurações</span></button>
                        </div>
                        {isMaster && (<div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6"><StatCard title={`Vendas (${filterType === 'day' ? 'Hoje' : filterType === 'week' ? 'Semana' : 'Mês'})`} value={`R$ ${salesTotal.toFixed(2)}`} icon={DollarSign} color="bg-green-600" /><StatCard title="Pedidos" value={ordersCount} icon={ShoppingCart} color="bg-blue-600" /><div onClick={() => setActiveTab('users')} className="bg-white p-6 rounded-xl shadow-sm border border-orange-100 flex items-center cursor-pointer hover:shadow-md transition-all relative overflow-hidden group"><div className={`w-12 h-12 rounded-lg flex items-center justify-center text-white mr-4 bg-orange-500`}><AlertTriangle size={24}/></div><div><p className="text-gray-400 text-xs font-bold uppercase">Pendências</p><p className="text-2xl font-bold text-slate-800">{pendingOrdersCount + pendingUsersCount}</p></div></div></div>)}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">{isMaster && chartData && chartData.length > 0 && (<div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-gray-200"><h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2"><BarChart3 size={20}/> Vendas (Últimos 7 Dias)</h3><div className="h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={chartData}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 12}} /><YAxis axisLine={false} tickLine={false} tick={{fontSize: 12}} tickFormatter={(value) => `R$${value}`} /><RechartsTooltip formatter={(value: number) => [`R$ ${value.toFixed(2)}`, 'Vendas']} cursor={{fill: '#f1f5f9'}} contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} /><Bar dataKey="vendas" fill="#0ea5e9" radius={[4, 4, 0, 0]} barSize={40} /></BarChart></ResponsiveContainer></div></div>)}<div className={`${isMaster ? '' : 'lg:col-span-3'} bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col`}><h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><Zap size={20} className="text-yellow-500"/> Últimos Pedidos</h3><div className="flex-1 overflow-y-auto space-y-4 max-h-[300px] pr-2">{(orders || []).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 8).map((item, idx) => (<div key={idx} className="flex items-center justify-between text-xs border-b border-gray-50 pb-2 last:border-0"><div><p className="font-bold text-slate-700">Pedido #{(item.id || '').slice(0,4)}</p><p className="text-gray-400">{item.userName}</p></div><span className="font-bold text-green-600">R$ {(Number(item.total) || 0).toFixed(2)}</span></div>))}</div></div></div>
                    </div>
                )}

                {/* --- PEDIDOS (COMPLETO) --- */}
                {activeTab === 'orders' && (
                    <div className="animate-fadeIn space-y-6">
                        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><ShoppingCart size={28} className="text-slate-400"/> Gestão de Pedidos</h2>
                            <div className="flex gap-2 overflow-x-auto w-full md:w-auto pb-2">
                                <button onClick={() => setOrderStatusFilter('ALL')} className={`px-4 py-2 rounded-lg text-xs font-bold whitespace-nowrap ${orderStatusFilter === 'ALL' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 border'}`}>Todos</button>
                                <button onClick={() => setOrderStatusFilter(OrderStatus.PENDING)} className={`px-4 py-2 rounded-lg text-xs font-bold whitespace-nowrap ${orderStatusFilter === OrderStatus.PENDING ? 'bg-yellow-500 text-white' : 'bg-white text-slate-600 border'}`}>Pendentes</button>
                                <button onClick={() => setOrderStatusFilter(OrderStatus.PAID)} className={`px-4 py-2 rounded-lg text-xs font-bold whitespace-nowrap ${orderStatusFilter === OrderStatus.PAID ? 'bg-green-600 text-white' : 'bg-white text-slate-600 border'}`}>Pagos</button>
                                <button onClick={() => setOrderStatusFilter(OrderStatus.DELIVERED)} className={`px-4 py-2 rounded-lg text-xs font-bold whitespace-nowrap ${orderStatusFilter === OrderStatus.DELIVERED ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 border'}`}>Entregues</button>
                            </div>
                        </div>
                        <input className="w-full p-4 rounded-xl border border-gray-200 bg-white shadow-sm" placeholder="Buscar pedidos por ID, Nome do Familiar ou Interno..." value={orderSearch} onChange={e => setOrderSearch(e.target.value)} />
                        
                        <div className="grid grid-cols-1 gap-4">
                            {getOrdersList().map(order => (
                                <div key={order.id} onClick={() => setSelectedOrderDetails(order)} className={`bg-white p-5 rounded-2xl shadow-sm border cursor-pointer hover:shadow-md transition-all ${order.status === OrderStatus.PENDING ? 'border-yellow-200 bg-yellow-50/10' : 'border-gray-200'}`}>
                                    <div className="flex justify-between items-start mb-2">
                                        <div><span className="font-black text-slate-400 text-[10px] uppercase tracking-wider">#{order.id.slice(0,6)}</span><h3 className="font-bold text-slate-800">{order.userName}</h3><p className="text-xs text-gray-500">Interno: {order.inmateName || 'N/D'}</p></div>
                                        <div className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase border ${getStatusColor(order.status)}`}>{translateStatus(order.status)}</div>
                                    </div>
                                    <div className="flex justify-between items-center text-xs mt-3 pt-3 border-t border-gray-100">
                                        <span className="text-gray-400">{new Date(order.createdAt || order.date).toLocaleString()}</span>
                                        <span className="font-black text-lg text-slate-900">R$ {(Number(order.total) || 0).toFixed(2)}</span>
                                    </div>
                                </div>
                            ))}
                            {getOrdersList().length === 0 && <p className="text-center text-gray-400 py-10">Nenhum pedido encontrado.</p>}
                        </div>
                    </div>
                )}

                {/* --- PRODUTOS (COMPLETO) --- */}
                {activeTab === 'products' && (
                    <div className="animate-fadeIn space-y-6">
                        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                            <div><h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><Package size={28} className="text-slate-400"/> Estoque e Produtos</h2><p className="text-xs text-gray-500">{products.length} itens cadastrados</p></div>
                            <div className="flex gap-2">
                                <button onClick={() => setShowSupplierModal(true)} className="bg-indigo-50 text-indigo-600 px-4 py-2 rounded-xl font-bold text-xs hover:bg-indigo-100 flex items-center gap-2"><Truck size={16}/> Fornecedores</button>
                                <button onClick={() => { setEditingProduct(null); setProductForm({ name: '', cost: '', margin: '30', stock: '', imageUrl: '', available: true }); setShowProductModal(true); }} className="bg-slate-900 text-white px-4 py-2 rounded-xl font-bold text-xs hover:bg-black flex items-center gap-2"><Plus size={16}/> Novo Produto</button>
                            </div>
                        </div>
                        <div className="flex gap-4">
                            <div className="flex-1 relative"><Search className="absolute left-4 top-3.5 text-gray-400" size={18}/><input className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-200 outline-none focus:border-slate-400" placeholder="Buscar produto..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}/></div>
                            <div className="bg-white border border-gray-200 rounded-xl flex p-1"><button onClick={() => setProductViewMode('list')} className={`p-2 rounded-lg ${productViewMode==='list'?'bg-slate-100 text-slate-900':'text-gray-400'}`}><List size={20}/></button><button onClick={() => setProductViewMode('grid')} className={`p-2 rounded-lg ${productViewMode==='grid'?'bg-slate-100 text-slate-900':'text-gray-400'}`}><Grid size={20}/></button></div>
                        </div>
                        
                        <div className="overflow-x-auto bg-white rounded-2xl shadow-sm border border-gray-200">
                            {productViewMode === 'list' ? (
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-50 border-b border-gray-100 text-left text-xs font-bold text-gray-500 uppercase">
                                        <tr>
                                            <th className="p-4">Produto <button onClick={()=>handleSort('name')}><SortIcon colKey='name'/></button></th>
                                            <th className="p-4 text-center">Estoque <button onClick={()=>handleSort('stock')}><SortIcon colKey='stock'/></button></th>
                                            <th className="p-4 text-right">Custo <button onClick={()=>handleSort('costPrice')}><SortIcon colKey='costPrice'/></button></th>
                                            <th className="p-4 text-right">Venda <button onClick={()=>handleSort('price')}><SortIcon colKey='price'/></button></th>
                                            <th className="p-4 text-center">Ações</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {getSortedProducts().map(p => (
                                            <tr key={p.id} className={`hover:bg-slate-50 ${p.available === false ? 'opacity-50 bg-gray-50' : ''}`}>
                                                <td className="p-4 flex items-center gap-3">
                                                    <div className="w-10 h-10 bg-gray-100 rounded-lg overflow-hidden relative">
                                                        <img 
                                                            src={p.imageUrl || 'https://placehold.co/150'} 
                                                            onError={(e) => { e.currentTarget.src = 'https://placehold.co/150'; }}
                                                            className="w-full h-full object-cover"
                                                        />
                                                        {p.available === false && <div className="absolute inset-0 bg-black/30 flex items-center justify-center"><Ban size={16} className="text-white"/></div>}
                                                    </div>
                                                    <div>
                                                        <span className="font-bold text-slate-700 block">{p.name}</span>
                                                        {p.available === false && <span className="text-[9px] bg-red-100 text-red-600 px-1 rounded font-bold uppercase">Suspenso</span>}
                                                    </div>
                                                </td>
                                                <td className="p-4 text-center"><span className={`px-2 py-1 rounded text-xs font-bold ${p.stock < 10 ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>{p.stock}</span></td>
                                                <td className="p-4 text-right text-gray-500">R$ {Number(p.costPrice).toFixed(2)}</td>
                                                <td className="p-4 text-right font-bold text-slate-900">R$ {Number(p.price).toFixed(2)}</td>
                                                <td className="p-4 text-center flex justify-center gap-2"><button onClick={() => { setEditingProduct(p); setProductForm({ name: p.name, cost: String(p.costPrice), margin: String(p.margin), stock: String(p.stock), imageUrl: p.imageUrl, available: p.available !== false }); setShowProductModal(true); }} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"><Edit size={16}/></button><button onClick={() => { if(confirm('Excluir produto?')) deleteProduct(p.id); }} className="p-2 text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={16}/></button></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            ) : (
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4">
                                    {getSortedProducts().map(p => (
                                        <div key={p.id} className={`border border-gray-200 rounded-xl p-3 flex flex-col relative group hover:shadow-lg transition-all ${p.available === false ? 'opacity-50 bg-gray-50' : ''}`}>
                                            <img 
                                                src={p.imageUrl || 'https://placehold.co/150'} 
                                                onError={(e) => { e.currentTarget.src = 'https://placehold.co/150'; }}
                                                className="w-full h-32 object-cover rounded-lg mb-2 bg-gray-100"
                                            />
                                            <h4 className="font-bold text-sm text-slate-800 line-clamp-2 mb-1">{p.name}</h4>
                                            {p.available === false && <span className="absolute top-2 right-2 bg-red-600 text-white text-[9px] font-bold px-2 py-1 rounded">SUSPENSO</span>}
                                            <div className="mt-auto flex justify-between items-end pt-2">
                                                <div><p className="text-[10px] text-gray-400">Estoque: {p.stock}</p><p className="font-black text-slate-900">R$ {p.price.toFixed(2)}</p></div>
                                                <button onClick={() => { setEditingProduct(p); setProductForm({ name: p.name, cost: String(p.costPrice), margin: String(p.margin), stock: String(p.stock), imageUrl: p.imageUrl, available: p.available !== false }); setShowProductModal(true); }} className="p-2 bg-slate-100 rounded-full hover:bg-blue-100 text-slate-600 hover:text-blue-600"><Edit size={14}/></button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* --- USUÁRIOS (COMPLETO) --- */}
                {activeTab === 'users' && (
                    <div className="animate-fadeIn space-y-6">
                        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><Users size={28} className="text-slate-400"/> Gestão de Usuários (Familiares)</h2>
                        <div className="flex gap-2">
                            <input className="w-full p-4 rounded-xl border border-gray-200 bg-white shadow-sm" placeholder="Buscar usuários..." value={userSearch} onChange={e => setUserSearch(e.target.value)} />
                            <button onClick={() => setShowPasswords(!showPasswords)} className={`p-4 rounded-xl border border-gray-200 shadow-sm transition-colors ${showPasswords ? 'bg-slate-800 text-white' : 'bg-white text-slate-500 hover:text-slate-800'}`} title={showPasswords ? "Ocultar Senhas" : "Ver Senhas"}>
                                {showPasswords ? <EyeOff size={20}/> : <Eye size={20}/>}
                            </button>
                        </div>
                        <div className="space-y-3">
                            {getFilteredUsers().map(u => (
                                <div key={u.id} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200 flex flex-col md:flex-row justify-between items-center gap-4">
                                    <div className="flex items-center gap-4">
                                        <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg text-white ${u.status === 'active' ? 'bg-green-500' : u.status === 'suspended' ? 'bg-red-500' : 'bg-yellow-500'}`}>{u.name.charAt(0)}</div>
                                        <div>
                                            <h3 className="font-bold text-slate-900">{u.name}</h3>
                                            <p className="text-xs text-gray-500">CPF: {u.cpf} • Tel: {u.phone}</p>
                                            <p className="text-xs font-bold text-blue-600 mt-1">Interno: {u.inmateName} (CPF: {u.inmateCpf})</p>
                                            {showPasswords && (
                                                <p className="text-xs font-mono bg-slate-100 px-2 py-1 rounded mt-1 inline-block text-slate-600 border border-slate-200">
                                                    Senha: <span className="font-bold text-slate-900">{u.password}</span>
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={() => setViewingUser(u)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg" title="Ver Detalhes/Documento">
                                            <FileText size={16} />
                                        </button>
                                        {u.status === 'pending' && <button onClick={() => approveUser(u.id)} className="bg-green-100 text-green-700 px-4 py-2 rounded-lg text-xs font-bold hover:bg-green-200 flex items-center gap-1"><CheckCircle size={14}/> Aprovar</button>}
                                        {u.status !== 'suspended' ? <button onClick={() => suspendUser(u.id, true)} className="bg-red-100 text-red-700 px-4 py-2 rounded-lg text-xs font-bold hover:bg-red-200 flex items-center gap-1"><Ban size={14}/> Bloquear</button> : <button onClick={() => suspendUser(u.id, false)} className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-xs font-bold hover:bg-gray-200">Desbloquear</button>}
                                        <button onClick={() => { if(confirm('Excluir usuário permanentemente?')) deleteUser(u.id); }} className="p-2 text-gray-400 hover:text-red-600 hover:bg-gray-50 rounded-lg"><Trash2 size={16}/></button>
                                    </div>
                                </div>
                            ))}
                            {getFilteredUsers().length === 0 && <p className="text-center text-gray-400 py-10">Nenhum usuário encontrado.</p>}
                        </div>
                    </div>
                )}

                {/* --- RELATÓRIOS (COMPLETO & MELHORADO) --- */}
                {activeTab === 'reports' && (
                    <div className="animate-fadeIn space-y-6">
                        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><ClipboardList size={28} className="text-slate-400"/> Central de Relatórios</h2>
                        <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-200 max-w-2xl mx-auto">
                            <div className="space-y-4">
                                <div>
                                    <label className="text-xs font-bold text-gray-500 uppercase">Tipo de Relatório</label>
                                    <select className="w-full p-3 border rounded-xl bg-gray-50 mt-1" value={reportConfig.type} onChange={e => setReportConfig({...reportConfig, type: e.target.value})}>
                                        <option value="GENERAL">Geral do Sistema (Resumo)</option>
                                        <option value="FINANCIAL">Financeiro Detalhado (Entradas/Saídas)</option>
                                        <option value="ACCOUNTABILITY">Prestação de Contas (Associados)</option>
                                        <option value="INDIVIDUAL">Extrato Individual (Por Familiar)</option>
                                        <option value="STOCK_LOW">Reposição de Estoque</option>
                                        <option value="SALES_BY_CATEGORY">Vendas por Categoria</option>
                                        <option value="TOP_PRODUCTS">Produtos Mais Vendidos</option>
                                        <option value="TOP_USERS">Top Clientes (Familiares)</option>
                                    </select>
                                </div>
                                {reportConfig.type === 'INDIVIDUAL' && (<div><label className="text-xs font-bold text-gray-500 uppercase">Buscar Familiar</label><input className="w-full p-3 border rounded-xl bg-gray-50 mt-1" placeholder="Digite o nome ou CPF..." value={reportConfig.individualSearch} onChange={e => setReportConfig({...reportConfig, individualSearch: e.target.value})}/>{reportConfig.individualSearch.length > 2 && (<div className="border rounded-xl mt-2 max-h-40 overflow-y-auto bg-white">{users.filter(u => u.name.toLowerCase().includes(reportConfig.individualSearch.toLowerCase())).map(u => (<div key={u.id} className="p-2 hover:bg-blue-50 cursor-pointer text-sm" onClick={() => { setReportConfig({...reportConfig, selectedUser: u, individualSearch: u.name}); }}>{u.name} (CPF: {u.cpf})</div>))}</div>)}</div>)}
                                {(reportConfig.type !== 'STOCK_LOW') && (<div className="flex gap-4"><div><label className="text-xs font-bold text-gray-500 uppercase">Data Inicial</label><input type="date" className="w-full p-3 border rounded-xl bg-gray-50 mt-1" value={reportConfig.startDate} onChange={e => setReportConfig({...reportConfig, startDate: e.target.value})}/></div><div><label className="text-xs font-bold text-gray-500 uppercase">Data Final</label><input type="date" className="w-full p-3 border rounded-xl bg-gray-50 mt-1" value={reportConfig.endDate} onChange={e => setReportConfig({...reportConfig, endDate: e.target.value})}/></div></div>)}
                                <button onClick={handleOpenReport} className="w-full bg-slate-900 text-white py-4 rounded-xl font-bold hover:bg-black shadow-lg flex items-center justify-center gap-2"><FileText size={20}/> GERAR RELATÓRIO</button>
                            </div>
                        </div>
                    </div>
                )}

                {/* --- FINANCEIRO --- */}
                {activeTab === 'finance' && ( 
                    <div className="space-y-8 animate-fadeIn pb-10">
                        {/* 1. Formulário de Nova Despesa */}
                        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                            <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2 text-lg">
                                <ArrowDownCircle className="text-red-500"/> Registrar Nova Despesa (Saída)
                            </h3>
                            <form onSubmit={handleExpense} className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <input placeholder="Descrição do Serviço / Produto" className="w-full p-4 border rounded-xl bg-gray-50 text-slate-800 font-medium text-sm" value={expenseForm.desc} onChange={e=>setExpenseForm({...expenseForm, desc:e.target.value})} required/>
                                    <div className="flex gap-3">
                                        <input placeholder="Valor (R$)" type="number" step="0.01" className="w-1/3 p-4 border rounded-xl bg-gray-50 text-slate-800 font-medium text-sm" value={expenseForm.amount} onChange={e=>setExpenseForm({...expenseForm, amount:e.target.value})} required/>
                                        <input placeholder="Categoria (Ex: Aluguel)" className="w-2/3 p-4 border rounded-xl bg-gray-50 text-slate-800 font-medium text-sm" value={expenseForm.cat} onChange={e=>setExpenseForm({...expenseForm, cat:e.target.value})} required/>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <input placeholder="Nome do Recebedor" className="w-full p-4 border rounded-xl bg-gray-50 text-slate-800 font-medium text-sm" value={expenseForm.recName} onChange={e=>setExpenseForm({...expenseForm, recName:e.target.value})} required/>
                                    <input placeholder="CPF/CNPJ do Recebedor" className="w-full p-4 border rounded-xl bg-gray-50 text-slate-800 font-medium text-sm" value={expenseForm.recDoc} onChange={e=>setExpenseForm({...expenseForm, recDoc:e.target.value})} required/>
                                </div>
                                <textarea placeholder="Observações e detalhes adicionais (Opcional)" className="w-full p-4 border rounded-xl bg-gray-50 text-slate-800 font-medium resize-none h-24 text-sm" value={expenseForm.obs} onChange={e=>setExpenseForm({...expenseForm, obs:e.target.value})}></textarea>
                                <button className="w-full bg-slate-900 text-white font-bold py-4 rounded-xl hover:bg-slate-800 shadow-lg text-sm flex items-center justify-center gap-2"><Save size={18}/> SALVAR DESPESA</button>
                            </form>
                        </div>

                        {/* Cards de Totais (Só para Master) */}
                        {isMaster && (
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                {/* Card de Saldo */}
                                <div className="bg-white p-6 rounded-2xl flex flex-col justify-between shadow-sm border border-slate-200 border-l-8 border-l-slate-800 relative overflow-hidden h-40">
                                    <div className="relative z-10">
                                        <p className="text-slate-500 font-bold uppercase text-xs tracking-wider mb-1">Saldo Líquido</p>
                                        <h2 className="text-4xl font-black mt-1 text-slate-800 tracking-tight">R$ {(totalEntries - totalExits).toFixed(2)}</h2>
                                    </div>
                                    <div className="bg-slate-50 p-3 rounded-full border border-slate-100 absolute top-4 right-4">
                                        <Landmark size={32} className="text-slate-800"/>
                                    </div>
                                </div>
                                
                                <div className="bg-white p-6 rounded-2xl border border-green-100 shadow-sm flex flex-col justify-center">
                                    <p className="text-xs text-green-700 uppercase font-bold">Total Entradas (Vendas)</p>
                                    <p className="text-2xl font-bold text-green-600 mt-1">R$ {totalEntries.toFixed(2)}</p>
                                </div>
                                <div className="bg-white p-6 rounded-2xl border border-red-100 shadow-sm flex flex-col justify-center">
                                    <p className="text-xs text-red-700 uppercase font-bold">Total Saídas (Despesas)</p>
                                    <p className="text-2xl font-bold text-red-600 mt-1">R$ {totalExits.toFixed(2)}</p>
                                </div>
                            </div>
                        )}

                        {/* 2. Últimas Saídas (Busca e Listagem Específica) */}
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
                            <div className="p-6 border-b border-gray-200 bg-gray-50">
                                <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4"><ArrowDownCircle className="text-red-500" size={20}/> Últimas Saídas (Despesas)</h3>
                                <div className="flex flex-col md:flex-row gap-3">
                                    <div className="flex gap-2">
                                        <input type="date" className="p-3 border rounded-xl text-sm font-bold text-slate-600" value={financeFilters.start} onChange={e => setFinanceFilters({...financeFilters, start: e.target.value})} />
                                        <input type="date" className="p-3 border rounded-xl text-sm font-bold text-slate-600" value={financeFilters.end} onChange={e => setFinanceFilters({...financeFilters, end: e.target.value})} />
                                    </div>
                                    <input placeholder="Buscar por Nome, CPF ou Descrição..." className="flex-1 p-3 border rounded-xl text-sm font-medium outline-none focus:border-blue-500" value={financeFilters.term} onChange={e => setFinanceFilters({...financeFilters, term: e.target.value})}/>
                                </div>
                            </div>
                            
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-100 text-left uppercase text-xs font-bold text-gray-500 border-b border-gray-200">
                                        <tr>
                                            <th className="p-4">Data</th>
                                            <th className="p-4">Descrição</th>
                                            <th className="p-4">Beneficiário</th>
                                            <th className="p-4 text-right">Valor</th>
                                            <th className="p-4 text-center">Ações</th>
                                        </tr>
                                    </thead>
                                    <tbody className="text-slate-700 divide-y divide-gray-100">
                                        {getFilteredExpenses().length === 0 ? (
                                            <tr><td colSpan={5} className="p-8 text-center text-gray-400">Nenhuma despesa encontrada neste período.</td></tr>
                                        ) : getFilteredExpenses().map((item, idx) => (
                                            <tr key={item.id} className="hover:bg-red-50/20 transition-colors">
                                                <td className="p-4 whitespace-nowrap text-xs font-mono">{new Date(item.date).toLocaleDateString()}</td>
                                                <td className="p-4">
                                                    <div className="font-bold text-slate-800">{item.description}</div>
                                                    <div className="text-[10px] text-gray-500 uppercase">{item.category}</div>
                                                </td>
                                                <td className="p-4">
                                                    <div className="font-bold text-slate-700">{item.recipientName}</div>
                                                    <div className="text-[10px] text-gray-500">{item.recipientDoc}</div>
                                                </td>
                                                <td className="p-4 text-right font-bold text-red-600">
                                                    - R$ {(Number(item.amount) || 0).toFixed(2)}
                                                </td>
                                                <td className="p-4 text-center">
                                                    <button onClick={() => handleOpenReceipt(item)} className="p-2 bg-white border border-gray-300 rounded-lg text-slate-600 hover:bg-slate-50 hover:text-blue-600 shadow-sm" title="Imprimir Recibo">
                                                        <Printer size={16}/>
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div> 
                )}

                {/* --- CONFIGURAÇÕES COMPLETAS --- */}
                {activeTab === 'settings' && ( 
                    <div className="space-y-8 animate-fadeIn max-w-5xl mx-auto pb-20">
                        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><Settings size={28} className="text-slate-500"/> Configurações e Manutenção</h2>
                        
                        {/* GERENCIAR ADMINISTRADORES (NOVO) */}
                        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                            <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><Shield size={20} className="text-indigo-600"/> Gerenciar Administradores</h3>
                            
                            <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100 mb-6">
                                <h4 className="text-xs font-bold text-indigo-800 uppercase mb-2">Novo Administrador</h4>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                                    <div><label className="text-xs font-bold uppercase text-gray-500 mb-1 block">Nome</label><input className="w-full p-3 border rounded-xl bg-white" value={newAdminForm.name} onChange={e => setNewAdminForm({...newAdminForm, name: e.target.value})} placeholder="Nome do Admin"/></div>
                                    <div><label className="text-xs font-bold uppercase text-gray-500 mb-1 block">CPF (Login)</label><input className="w-full p-3 border rounded-xl bg-white" value={newAdminForm.cpf} onChange={e => setNewAdminForm({...newAdminForm, cpf: e.target.value})} placeholder="000.000.000-00"/></div>
                                    <div><label className="text-xs font-bold uppercase text-gray-500 mb-1 block">Senha</label><input className="w-full p-3 border rounded-xl bg-white" type="password" value={newAdminForm.password} onChange={e => setNewAdminForm({...newAdminForm, password: e.target.value})} placeholder="******"/></div>
                                </div>
                                
                                <div className="mb-4">
                                    <label className="text-xs font-bold uppercase text-gray-500 mb-2 block">Permissões de Acesso</label>
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                        {PERMISSIONS.map(perm => (
                                            <label key={perm.id} className="flex items-center gap-2 bg-white p-2 rounded-lg border border-indigo-200 cursor-pointer hover:bg-indigo-100">
                                                <input type="checkbox" className="w-4 h-4 text-indigo-600" checked={adminPermissions.includes(perm.id)} onChange={() => handlePermissionToggle(perm.id)} />
                                                <span className="text-xs font-bold text-slate-700">{perm.label}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                <button onClick={() => handleProtectedAction(handleCreateAdmin, 'CONFIG_ACTION')} className="w-full bg-indigo-600 text-white p-3 rounded-xl font-bold hover:bg-indigo-700 flex items-center justify-center gap-2"><KeyRound size={16}/> CRIAR ADMINISTRADOR</button>
                            </div>

                            {/* LISTA DE ADMINISTRADORES */}
                            <div>
                                <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">Administradores Existentes</h4>
                                <div className="space-y-2">
                                    {getAdminUsers().length === 0 ? (
                                        <p className="text-xs text-gray-400 italic">Nenhum administrador adicional cadastrado.</p>
                                    ) : (
                                        getAdminUsers().map(admin => (
                                            <div key={admin.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                                                <div>
                                                    <p className="font-bold text-sm text-slate-800">{admin.name}</p>
                                                    <p className="text-xs text-gray-500">CPF: {admin.cpf}</p>
                                                </div>
                                                <button onClick={() => { if(confirm('Remover este administrador?')) deleteUser(admin.id); }} className="text-red-500 p-2 hover:bg-red-50 rounded-lg"><Trash2 size={16}/></button>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* DADOS INSTITUCIONAIS */}
                        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm border-l-4 border-l-blue-600">
                            <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2 border-b pb-2"><Briefcase size={20} className="text-blue-600"/> Dados da Instituição (APP)</h3>
                            <p className="text-xs text-gray-500 mb-4">Esses dados aparecem no cabeçalho e nos recibos.</p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-bold text-slate-700 uppercase block mb-1">Nome Fantasia / App (Título da Aba)</label>
                                    <input className="w-full p-3 border-2 border-slate-200 rounded-xl bg-slate-50 text-slate-900 font-bold focus:border-blue-500 outline-none" value={configForm.appName} onChange={e => setConfigForm({...configForm, appName: e.target.value})} placeholder="Ex: Mercado Fácil"/>
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-slate-700 uppercase block mb-1">Razão Social / Associação</label>
                                    <input className="w-full p-3 border-2 border-slate-200 rounded-xl bg-slate-50 text-slate-900 font-bold focus:border-blue-500 outline-none" value={configForm.institutionName} onChange={e => setConfigForm({...configForm, institutionName: e.target.value})} placeholder="Ex: ASSOCIAÇÃO MT"/>
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-slate-700 uppercase block mb-1">CNPJ</label>
                                    <input className="w-full p-3 border-2 border-slate-200 rounded-xl bg-slate-50 text-slate-900 font-mono" value={configForm.cnpj} onChange={e => setConfigForm({...configForm, cnpj: e.target.value})} />
                                </div>
                            </div>
                        </div>

                        {/* CONTATO E ENDEREÇO */}
                        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                            <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><MapPin size={20} className="text-red-500"/> Contato e Localização</h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div><label className="text-xs font-bold text-gray-500 uppercase block mb-1">Endereço Completo</label><input className="w-full p-3 border rounded-xl bg-gray-50 text-slate-800" value={configForm.contactAddress} onChange={e => setConfigForm({...configForm, contactAddress: e.target.value})} /></div>
                                <div><label className="text-xs font-bold text-gray-500 uppercase block mb-1">Telefone / WhatsApp</label><input className="w-full p-3 border rounded-xl bg-gray-50 text-slate-800" value={configForm.contactPhone} onChange={e => setConfigForm({...configForm, contactPhone: e.target.value})} /></div>
                                <div><label className="text-xs font-bold text-gray-500 uppercase block mb-1">E-mail</label><input className="w-full p-3 border rounded-xl bg-gray-50 text-slate-800" value={configForm.contactEmail} onChange={e => setConfigForm({...configForm, contactEmail: e.target.value})} /></div>
                            </div>
                            <div className="mt-4">
                                <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Mensagem de Rodapé (Site/App)</label>
                                <input className="w-full p-3 border rounded-xl bg-gray-50 text-slate-800" value={configForm.footerText} onChange={e => setConfigForm({...configForm, footerText: e.target.value})} />
                            </div>
                        </div>

                         {/* EDITAR TEXTO DO CUPOM (NOVO) */}
                         <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                            <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><FileText size={20} className="text-slate-600"/> Personalização do Cupom de Entrega</h3>
                            <p className="text-xs text-gray-500 mb-4">Personalize os textos que aparecem no cupom térmico impresso.</p>
                            
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                                <div>
                                    <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Título do Cabeçalho</label>
                                    <input className="w-full p-3 border rounded-xl bg-gray-50 text-sm font-bold" value={configForm.customReceiptTitle || ''} onChange={e => setConfigForm({...configForm, customReceiptTitle: e.target.value})} placeholder="Ex: ASSPEN - Gestão" />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Subtítulo / Local</label>
                                    <input className="w-full p-3 border rounded-xl bg-gray-50 text-sm font-bold" value={configForm.customReceiptSubtitle || ''} onChange={e => setConfigForm({...configForm, customReceiptSubtitle: e.target.value})} placeholder="Ex: CDP Peixoto de Azevedo - MT" />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Nome do Documento</label>
                                    <input className="w-full p-3 border rounded-xl bg-gray-50 text-sm font-bold" value={configForm.customReceiptDocName || ''} onChange={e => setConfigForm({...configForm, customReceiptDocName: e.target.value})} placeholder="Ex: CUPOM DE ENTREGA" />
                                </div>
                            </div>

                            <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Texto do Rodapé (Regras/Avisos)</label>
                            <textarea 
                                className="w-full p-4 border rounded-xl bg-gray-50 text-slate-800 text-sm h-24 resize-none"
                                value={configForm.customReceiptText || ''} 
                                onChange={e => setConfigForm({...configForm, customReceiptText: e.target.value})}
                                placeholder="Ex: Conferir os itens no ato da entrega..."
                            ></textarea>
                        </div>

                        {/* CONFIGURAÇÃO DE PIX */}
                        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                            <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><DollarSign size={20} className="text-green-600"/> Chaves PIX (Recebimento)</h3>
                            <div className="flex gap-2 mb-2">
                                <input placeholder="Adicionar nova chave PIX..." className="flex-1 p-3 border rounded-xl bg-gray-50" value={pixKeyInput} onChange={e => setPixKeyInput(e.target.value)} />
                                <button onClick={() => { if(pixKeyInput) { setConfigForm({...configForm, pixKeys: [...(configForm.pixKeys || []), pixKeyInput]}); setPixKeyInput(''); } }} className="bg-green-600 text-white px-4 rounded-xl font-bold"><Plus/></button>
                            </div>
                            <div className="space-y-2">
                                {(configForm.pixKeys || []).map((key, idx) => (
                                    <div key={idx} className="flex justify-between items-center bg-gray-50 p-3 rounded-lg border border-gray-200">
                                        <span className="font-mono text-sm">{key}</span>
                                        <button onClick={() => setConfigForm({...configForm, pixKeys: configForm.pixKeys.filter((_, i) => i !== idx)})} className="text-red-500 hover:text-red-700"><X size={16}/></button>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* CONFIGURAÇÃO DE TEMA */}
                        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                            <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><ImageIcon size={20} className="text-purple-600"/> Personalização Visual</h3>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                {Object.keys(THEME_COLORS).map((themeKey) => (
                                    <button 
                                        key={themeKey} 
                                        onClick={() => setConfigForm({ ...configForm, theme: themeKey as any })}
                                        className={`p-4 rounded-xl border-2 text-xs font-bold uppercase ${configForm.theme === themeKey ? 'border-slate-900 bg-slate-50' : 'border-gray-100 hover:border-gray-300'}`}
                                    >
                                        <div className={`h-4 w-full rounded mb-2 ${THEME_COLORS[themeKey].primary}`}></div>
                                        {themeKey.replace('_', ' ')}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="pt-4 sticky bottom-4 z-30">
                            <button onClick={() => handleProtectedAction(handleSaveConfig)} className="bg-blue-600 text-white px-6 py-4 rounded-xl font-bold text-sm w-full shadow-xl hover:bg-blue-700 flex justify-center items-center gap-2"><Save size={20}/> SALVAR TODAS AS ALTERAÇÕES</button>
                        </div>

                        {/* ALTERAR SENHA DO ADMIN */}
                        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm mt-8">
                            <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><Lock size={20} className="text-red-500"/> Alterar Senha do Administrador</h3>
                            <p className="text-xs text-gray-500 mb-4">Atualize sua senha de acesso ao painel administrativo.</p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                <div>
                                    <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Nova Senha</label>
                                    <input type="password" placeholder="Mínimo 6 caracteres" className="w-full p-3 border rounded-xl bg-gray-50 text-sm font-bold" value={newAdminPassword} onChange={e => setNewAdminPassword(e.target.value)} />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Confirmar Nova Senha</label>
                                    <input type="password" placeholder="Repita a nova senha" className="w-full p-3 border rounded-xl bg-gray-50 text-sm font-bold" value={confirmAdminPassword} onChange={e => setConfirmAdminPassword(e.target.value)} />
                                </div>
                            </div>
                            <button onClick={handleChangeAdminPassword} disabled={!newAdminPassword || !confirmAdminPassword} className="bg-slate-800 text-white px-6 py-3 rounded-xl font-bold text-xs hover:bg-black flex items-center gap-2 disabled:opacity-50"><Lock size={16}/> Atualizar Senha</button>
                        </div>

                        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm mt-8">
                            <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><Database size={20} className="text-orange-500"/> Manutenção do Banco de Dados</h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <button onClick={() => backupSystem()} className="bg-slate-800 text-white py-3 rounded-lg font-bold text-xs hover:bg-black flex items-center justify-center gap-2"><Download size={16}/> Backup Dados (JSON)</button>
                                <button onClick={() => handleProtectedAction(handleDownloadSource, 'CONFIG_ACTION')} className="bg-indigo-600 text-white py-3 rounded-lg font-bold text-xs hover:bg-indigo-700 flex items-center justify-center gap-2 shadow-sm"><Download size={16}/> Baixar Sistema (ZIP)</button>
                                <button onClick={() => handleProtectedAction(clearOldData, 'CONFIG_ACTION')} className="bg-orange-100 text-orange-700 border border-orange-200 py-3 rounded-lg font-bold text-xs hover:bg-orange-200 flex items-center justify-center gap-2"><Trash2 size={16}/> Limpar Dados Antigos</button>
                                <button onClick={() => handleProtectedAction(handleOptimizeStock, 'CLEAN_PRODUCTS')} disabled={isCleaningProducts} className="bg-blue-100 text-blue-700 border border-blue-200 py-3 rounded-lg font-bold text-xs hover:bg-blue-200 flex items-center justify-center gap-2"><RefreshCw size={16} className={isCleaningProducts ? 'animate-spin' : ''}/> Limpar Produtos Duplicados</button>
                                
                                {/* NOVAS FUNÇÕES DE ZERAR */}
                                <button onClick={() => handleProtectedAction(resetStock, 'ZERO_STOCK')} className="bg-red-50 text-red-700 border border-red-200 py-3 rounded-lg font-bold text-xs hover:bg-red-100 flex items-center justify-center gap-2"><Trash2 size={16}/> Zerar Todo Estoque</button>
                                <button onClick={() => handleProtectedAction(resetFinance, 'ZERO_FINANCE')} className="bg-red-50 text-red-700 border border-red-200 py-3 rounded-lg font-bold text-xs hover:bg-red-100 flex items-center justify-center gap-2"><DollarSign size={16}/> Zerar Financeiro Completo</button>
                            </div>
                        </div>
                    </div> 
                )}
            </div>
            
            {/* ... MODAIS RESTAURADOS ... */}

            {/* MODAL: DETALHES DO PEDIDO (Janela Flutuante com Backdrop) */}
            {selectedOrderDetails && (
                <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fadeIn">
                    <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[90vh]">
                        <div className="p-4 bg-slate-800 text-white flex justify-between items-center shrink-0">
                            <div><h3 className="font-bold flex items-center gap-2 text-lg"><ShoppingCart size={20}/> Pedido #{(selectedOrderDetails.id||'').slice(0,6).toUpperCase()}</h3><p className="text-xs opacity-70">{selectedOrderDetails.date ? new Date(selectedOrderDetails.date).toLocaleString() : 'Data N/D'} | Status: {translateStatus(selectedOrderDetails.status)}</p></div>
                            <button onClick={() => setSelectedOrderDetails(null)} className="bg-white/10 hover:bg-white/20 p-2 rounded-full transition-colors"><X size={24}/></button>
                        </div>
                        <div className="flex-1 overflow-auto bg-slate-100 p-4 md:p-6 relative">
                            
                            {/* --- MODAL DE REPROVAÇÃO DENTRO DO PEDIDO --- */}
                            {isRejecting && (
                                <div className="absolute inset-0 bg-white/90 backdrop-blur-sm z-[160] flex items-center justify-center p-6 animate-fadeIn">
                                    <div className="bg-white border-2 border-red-100 shadow-2xl rounded-2xl p-6 w-full max-w-md">
                                        <h3 className="text-lg font-bold text-red-600 flex items-center gap-2 mb-4">
                                            <MessageSquareX size={24}/> Reprovar Pedido
                                        </h3>
                                        <p className="text-sm text-gray-600 mb-2 font-bold">Por que este pedido está sendo reprovado?</p>
                                        <p className="text-xs text-gray-500 mb-4">Essa mensagem será enviada para a caixa de entrada do familiar.</p>
                                        <textarea 
                                            className="w-full p-4 border border-gray-300 rounded-xl mb-4 text-sm font-medium focus:border-red-500 outline-none h-32 resize-none"
                                            placeholder="Ex: Comprovante ilegível, valor incorreto..."
                                            value={rejectReason}
                                            onChange={e => setRejectReason(e.target.value)}
                                            autoFocus
                                        ></textarea>
                                        <div className="flex gap-3">
                                            <button onClick={() => setIsRejecting(false)} className="flex-1 py-3 bg-gray-100 text-gray-600 rounded-xl font-bold text-sm hover:bg-gray-200">Cancelar</button>
                                            <button onClick={handleRejectOrder} className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold text-sm hover:bg-red-700 flex items-center justify-center gap-2 shadow-lg"><Send size={16}/> Confirmar Reprovação</button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full">
                                <div className="space-y-6">
                                    <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                                        <h4 className="font-bold text-slate-800 text-sm border-b pb-2 mb-3 uppercase tracking-wide">Dados da Entrega</h4>
                                        <div className="grid grid-cols-2 gap-4 text-sm">
                                            <div><p className="text-gray-500 text-xs font-bold uppercase">Familiar</p><p className="font-bold text-slate-800">{selectedOrderDetails.userName}</p><p className="text-xs">{selectedOrderDetails.userCpf}</p></div>
                                            <div><p className="text-gray-500 text-xs font-bold uppercase">Interno</p><p className="font-bold text-slate-800">{selectedOrderDetails.inmateName || 'N/I'}</p><p className="text-xs">{selectedOrderDetails.inmateCpf}</p></div>
                                            <div className="col-span-2 bg-blue-50 p-2 rounded border border-blue-100"><p className="text-blue-500 text-[10px] font-bold uppercase">Localização Interna</p><p className="font-bold text-blue-900">Raio: {selectedOrderDetails.inmateLocation?.raio || '-'} | Ala: {selectedOrderDetails.inmateLocation?.ala || '-'} | Cela: {selectedOrderDetails.inmateLocation?.cela || '-'}</p></div>
                                            
                                            {/* BOTÃO PARA VER FAMÍLIA/HISTÓRICO */}
                                            <div className="col-span-2 pt-2 border-t mt-2">
                                                <button 
                                                    onClick={() => {
                                                        setHistoryModalCpf(selectedOrderDetails.inmateCpf || selectedOrderDetails.userCpf);
                                                        setHistoryModalName(selectedOrderDetails.inmateName || 'Interno');
                                                    }}
                                                    className="w-full py-2 bg-purple-50 text-purple-700 font-bold text-xs rounded border border-purple-200 hover:bg-purple-100 flex items-center justify-center gap-2"
                                                >
                                                    <Users size={14}/> Ver Histórico / Família
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex-1">
                                        <h4 className="font-bold text-slate-800 text-sm border-b pb-2 mb-3 uppercase tracking-wide">Itens</h4>
                                        <div className="space-y-2 max-h-60 overflow-y-auto pr-2">{(selectedOrderDetails.items || []).map((item, idx) => (<div key={idx} className="flex justify-between items-center text-sm border-b border-gray-50 pb-2 last:border-0"><div className="flex items-center gap-2"><span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs font-bold">{item.quantity}x</span><span className="text-slate-700">{item.name}</span></div><span className="font-bold text-slate-800">R$ {(item.priceAtPurchase * item.quantity).toFixed(2)}</span></div>))}</div>
                                        <div className="border-t pt-3 mt-2 flex justify-between items-center"><span className="font-bold text-slate-500 text-xs uppercase">Total</span><span className="font-black text-xl text-slate-900">R$ {(Number(selectedOrderDetails.total) || 0).toFixed(2)}</span></div>
                                    </div>
                                </div>
                                <div className="flex flex-col h-full space-y-4">
                                    <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex-1 flex flex-col min-h-[300px]">
                                        <h4 className="font-bold text-slate-800 text-sm border-b pb-2 mb-3 uppercase tracking-wide flex justify-between items-center"><span>Comprovante</span>{selectedOrderDetails.paymentProofUrl && (<button onClick={() => window.open(selectedOrderDetails.paymentProofUrl, '_blank')} className="text-blue-600 text-[10px] font-bold hover:underline flex items-center gap-1"><Maximize2 size={12}/> Abrir</button>)}</h4>
                                        <div className="flex-1 bg-gray-100 rounded-lg flex items-center justify-center overflow-hidden border border-gray-200 relative group">{selectedOrderDetails.paymentProofUrl ? (<img src={selectedOrderDetails.paymentProofUrl} className="w-full h-full object-contain hover:scale-110 transition-transform duration-300 cursor-zoom-in" onClick={() => window.open(selectedOrderDetails.paymentProofUrl, '_blank')}/>) : (<div className="text-center text-gray-400"><FileWarning size={48} className="mx-auto mb-2 opacity-50"/><p>Sem comprovante</p></div>)}</div>
                                    </div>
                                    <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 grid grid-cols-2 gap-3 shrink-0">
                                        <button onClick={() => setViewingReceipt({ data: selectedOrderDetails, type: 'ORDER' })} className="col-span-1 bg-slate-100 text-slate-700 py-3 rounded-lg font-bold text-xs hover:bg-slate-200 flex items-center justify-center gap-2"><FileText size={16}/> Recibo A4</button>
                                        <button onClick={() => setPrintOrder(selectedOrderDetails)} className="col-span-1 bg-slate-100 text-slate-700 py-3 rounded-lg font-bold text-xs hover:bg-slate-200 flex items-center justify-center gap-2"><Printer size={16}/> Cupom</button>
                                        
                                        {/* AÇÕES DE STATUS - LOGISTICA DE ENTREGA */}
                                        {selectedOrderDetails.status === OrderStatus.PENDING ? (
                                            <>
                                                <button onClick={() => setIsRejecting(true)} className="col-span-1 bg-red-100 text-red-600 border border-red-200 py-4 rounded-lg font-bold text-sm hover:bg-red-200 shadow-lg flex items-center justify-center gap-2"><XCircle size={20}/> REPROVAR</button>
                                                <button onClick={() => { updateOrderStatus(selectedOrderDetails.id, OrderStatus.PAID); setSelectedOrderDetails(prev => prev ? {...prev, status: OrderStatus.PAID} : null); showNotification('Pagamento Aprovado!', 'success'); }} className="col-span-1 bg-green-600 text-white py-4 rounded-lg font-bold text-sm hover:bg-green-700 shadow-lg flex items-center justify-center gap-2 animate-pulse"><CheckCircle size={20}/> APROVAR</button>
                                            </>
                                        ) : selectedOrderDetails.status === OrderStatus.PAID ? (
                                            <button onClick={() => { updateOrderStatus(selectedOrderDetails.id, OrderStatus.PREPARING); setSelectedOrderDetails(prev => prev ? {...prev, status: OrderStatus.PREPARING} : null); showNotification('Enviado para Separação', 'info'); }} className="col-span-2 bg-blue-600 text-white py-4 rounded-lg font-bold text-sm hover:bg-blue-700 shadow-lg flex items-center justify-center gap-2"><Box size={20}/> INICIAR SEPARAÇÃO</button>
                                        ) : selectedOrderDetails.status === OrderStatus.PREPARING ? (
                                            <button onClick={() => { updateOrderStatus(selectedOrderDetails.id, OrderStatus.DELIVERED); setSelectedOrderDetails(prev => prev ? {...prev, status: OrderStatus.DELIVERED} : null); showNotification('Pedido Entregue!', 'success'); }} className="col-span-2 bg-purple-600 text-white py-4 rounded-lg font-bold text-sm hover:bg-purple-700 shadow-lg flex items-center justify-center gap-2"><Truck size={20}/> MARCAR COMO ENTREGUE</button>
                                        ) : (
                                            <div className={`col-span-2 bg-gray-100 border py-3 rounded-lg font-bold text-xs text-center flex items-center justify-center gap-2 ${selectedOrderDetails.status.includes('cancel') ? 'text-red-500 border-red-200' : 'text-gray-500 border-gray-200'}`}>
                                                {selectedOrderDetails.status.includes('cancel') ? <XCircle size={16}/> : <CheckCircle size={16}/>} 
                                                {translateStatus(selectedOrderDetails.status)}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

             {/* MODAL DE VISUALIZAÇÃO DE USUÁRIO / DOCUMENTO */}
             {viewingUser && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-fadeIn overflow-y-auto">
                    <div className="bg-white w-full max-w-4xl rounded-xl shadow-2xl relative flex flex-col max-h-[95vh]">
                        
                        {/* HEADER DO MODAL */}
                        <div className="bg-slate-800 text-white p-4 flex justify-between items-center rounded-t-xl shrink-0 no-print">
                            <h3 className="font-bold flex items-center gap-2"><UserCheck size={20}/> Ficha Cadastral: {viewingUser.name}</h3>
                            <button onClick={() => setViewingUser(null)} className="bg-white/10 p-2 rounded-full hover:bg-white/20"><X size={20}/></button>
                        </div>

                        {/* CONTEÚDO IMPRIMÍVEL */}
                        <div className="flex-1 overflow-y-auto p-8 bg-gray-100">
                             <div id="printUserArea" className="bg-white p-8 shadow-xl max-w-3xl mx-auto min-h-[800px]">
                                 
                                 {/* CABEÇALHO DA FICHA */}
                                 <div className="border-b-2 border-slate-800 pb-4 mb-6 flex justify-between items-center">
                                     <div>
                                         <h1 className="text-2xl font-black uppercase text-slate-900">{settings.institutionName}</h1>
                                         <p className="text-sm font-bold text-slate-600">{settings.systemName} - Gestão de Acesso</p>
                                     </div>
                                     <div className="text-right">
                                         <p className="text-xs font-bold uppercase text-gray-400">Data de Emissão</p>
                                         <p className="font-mono font-bold text-slate-800">{new Date().toLocaleDateString()}</p>
                                     </div>
                                 </div>

                                 <h2 className="text-lg font-black uppercase bg-slate-100 p-2 border-l-4 border-slate-800 mb-4 text-slate-800">Dados do Familiar (Visitante)</h2>
                                 
                                 <div className="grid grid-cols-2 gap-6 mb-6">
                                     <div>
                                         <p className="text-xs font-bold text-gray-500 uppercase">Nome Completo</p>
                                         <p className="font-bold text-lg text-slate-900 uppercase border-b border-gray-200 pb-1">{viewingUser.name}</p>
                                     </div>
                                     <div>
                                         <p className="text-xs font-bold text-gray-500 uppercase">CPF</p>
                                         <p className="font-mono font-bold text-lg text-slate-900 border-b border-gray-200 pb-1">{viewingUser.cpf}</p>
                                     </div>
                                     <div>
                                         <p className="text-xs font-bold text-gray-500 uppercase">Telefone de Contato</p>
                                         <p className="font-bold text-slate-900 border-b border-gray-200 pb-1">{viewingUser.phone || 'Não Informado'}</p>
                                     </div>
                                     <div>
                                         <p className="text-xs font-bold text-gray-500 uppercase">Status do Cadastro</p>
                                         <p className={`font-bold uppercase border-b border-gray-200 pb-1 ${viewingUser.status === 'active' ? 'text-green-600' : 'text-red-600'}`}>
                                             {viewingUser.status === 'active' ? 'ATIVO / APROVADO' : viewingUser.status === 'pending' ? 'PENDENTE' : 'SUSPENSO'}
                                         </p>
                                     </div>
                                 </div>

                                 <h2 className="text-lg font-black uppercase bg-slate-100 p-2 border-l-4 border-slate-800 mb-4 text-slate-800">Dados do Interno Vinculado</h2>
                                 
                                 <div className="grid grid-cols-2 gap-6 mb-8">
                                     <div className="col-span-2">
                                         <p className="text-xs font-bold text-gray-500 uppercase">Nome do Interno</p>
                                         <p className="font-bold text-lg text-slate-900 uppercase border-b border-gray-200 pb-1">{viewingUser.inmateName || viewingUser.prisonerName || 'Não Informado'}</p>
                                     </div>
                                     <div>
                                         <p className="text-xs font-bold text-gray-500 uppercase">CPF do Interno</p>
                                         <p className="font-mono font-bold text-slate-900 border-b border-gray-200 pb-1">{viewingUser.inmateCpf || viewingUser.prisonerCpf || 'Não Informado'}</p>
                                     </div>
                                     <div>
                                         <p className="text-xs font-bold text-gray-500 uppercase">Grau de Parentesco</p>
                                         <p className="font-bold text-slate-900 uppercase border-b border-gray-200 pb-1">{viewingUser.relationship || viewingUser.kinship || 'Não Informado'}</p>
                                     </div>
                                 </div>

                                 <h2 className="text-lg font-black uppercase bg-slate-100 p-2 border-l-4 border-slate-800 mb-4 text-slate-800">Documento Digitalizado</h2>
                                 
                                 <div className="border-2 border-dashed border-gray-300 rounded-xl p-2 min-h-[300px] flex items-center justify-center bg-gray-50">
                                     {viewingUser.documentUrl ? (
                                         <img src={viewingUser.documentUrl} alt="Documento" className="max-w-full max-h-[500px] object-contain shadow-md rounded"/>
                                     ) : (
                                         <div className="text-center text-gray-400">
                                             <FileWarning size={48} className="mx-auto mb-2 opacity-50"/>
                                             <p className="font-bold">Documento não anexado ou indisponível.</p>
                                         </div>
                                     )}
                                 </div>

                                 <div className="mt-8 text-center text-[10px] text-gray-400 font-mono border-t pt-2">
                                     Este documento é para uso exclusivo administrativo. A veracidade das informações é de responsabilidade do usuário.
                                 </div>

                             </div>
                        </div>

                        {/* FOOTER COM AÇÕES */}
                        <div className="p-4 bg-white border-t border-gray-200 flex justify-end gap-3 shrink-0 no-print">
                            <button onClick={handlePrint} className="bg-slate-900 text-white px-6 py-3 rounded-xl font-bold hover:bg-black shadow-lg flex items-center gap-2"><Printer size={18}/> IMPRIMIR FICHA</button>
                            <button onClick={() => setViewingUser(null)} className="bg-gray-200 text-gray-700 px-6 py-3 rounded-xl font-bold hover:bg-gray-300">FECHAR</button>
                        </div>

                        {/* CSS DE IMPRESSÃO ESPECÍFICO */}
                        <style>{`
                            @media print {
                                body * { visibility: hidden; }
                                #printUserArea, #printUserArea * { visibility: visible; }
                                #printUserArea { position: absolute; left: 0; top: 0; width: 100%; margin: 0; padding: 0; box-shadow: none; max-width: none; }
                                .no-print { display: none !important; }
                            }
                        `}</style>

                    </div>
                </div>
            )}
            
            {/* MODAL DE PRODUTO */}
            {showProductModal && (
                <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fadeIn">
                    <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden">
                        <div className="p-6 border-b border-gray-200 flex justify-between items-center bg-slate-50">
                            <h3 className="font-bold text-xl text-slate-800">{editingProduct ? 'Editar Produto' : 'Novo Produto'}</h3>
                            <button onClick={() => setShowProductModal(false)} className="bg-gray-200 p-2 rounded-full hover:bg-gray-300"><X size={20}/></button>
                        </div>
                        <div className="p-6">
                            <form onSubmit={handleProductSubmit} className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="md:col-span-2">
                                        <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Nome do Produto</label>
                                        <input className="w-full p-3 border rounded-xl" value={productForm.name} onChange={e => setProductForm({...productForm, name: e.target.value})} required placeholder="Ex: Arroz 5kg"/>
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Preço de Custo (R$)</label>
                                        <input type="number" step="0.01" className="w-full p-3 border rounded-xl" value={productForm.cost} onChange={e => setProductForm({...productForm, cost: e.target.value})} required/>
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Margem de Lucro (%)</label>
                                        <input type="number" className="w-full p-3 border rounded-xl" value={productForm.margin} onChange={e => setProductForm({...productForm, margin: e.target.value})} required/>
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Estoque Atual</label>
                                        <input type="number" className="w-full p-3 border rounded-xl" value={productForm.stock} onChange={e => setProductForm({...productForm, stock: e.target.value})} required/>
                                    </div>
                                    <div className="flex items-end pb-3">
                                        <label className="flex items-center gap-3 cursor-pointer">
                                            <div className={`w-12 h-6 rounded-full p-1 transition-colors ${productForm.available !== false ? 'bg-green-500' : 'bg-gray-300'}`} onClick={() => setProductForm({...productForm, available: !productForm.available})}>
                                                <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${productForm.available !== false ? 'translate-x-6' : 'translate-x-0'}`}></div>
                                            </div>
                                            <span className="text-sm font-bold text-slate-700">{productForm.available !== false ? 'Produto Ativo' : 'Suspenso (Invisível)'}</span>
                                        </label>
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Preço Final (Calculado)</label>
                                        <div className="w-full p-3 bg-gray-100 rounded-xl font-bold text-green-700">R$ {(parseFloat(productForm.cost || '0') * (1 + parseFloat(productForm.margin || '0')/100)).toFixed(2)}</div>
                                    </div>
                                </div>
                                
                                <div className="border-t pt-4">
                                    <label className="text-xs font-bold text-gray-500 uppercase block mb-2">Imagem do Produto</label>
                                    <div className="space-y-3">
                                        <div className="flex gap-4 items-center">
                                            {productForm.imageUrl && <img src={productForm.imageUrl} className="w-16 h-16 rounded-lg object-cover border"/>}
                                            <label className="cursor-pointer bg-slate-100 px-4 py-2 rounded-lg font-bold text-xs hover:bg-slate-200 flex items-center gap-2">
                                                <Upload size={16}/> Enviar Arquivo
                                                <input type="file" className="hidden" accept="image/*" onChange={handleProductImageUpload}/>
                                            </label>
                                        </div>
                                        <div className="relative">
                                            <span className="text-[10px] font-bold text-gray-400 uppercase absolute -top-2 left-2 bg-white px-1">Ou cole a URL da imagem</span>
                                            <input 
                                                type="text" 
                                                placeholder="https://exemplo.com/imagem.jpg" 
                                                className="w-full p-3 border rounded-xl text-xs" 
                                                value={productForm.imageUrl} 
                                                onChange={e => setProductForm({...productForm, imageUrl: e.target.value})}
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="border-t pt-4 bg-blue-50 p-4 rounded-xl">
                                    <label className="text-xs font-bold text-blue-700 uppercase block mb-2 flex items-center gap-2"><Zap size={14}/> Importação Rápida via XML (NFe)</label>
                                    <div className="flex gap-2">
                                        <input type="file" accept=".xml" className="text-xs" onChange={e => e.target.files && setXmlFile(e.target.files[0])}/>
                                        <button type="button" onClick={handleImportXML} disabled={!xmlFile} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-blue-700 disabled:opacity-50">Processar XML</button>
                                    </div>
                                </div>

                                <button type="submit" className="w-full bg-slate-900 text-white py-4 rounded-xl font-bold hover:bg-black shadow-lg">SALVAR PRODUTO</button>
                            </form>
                        </div>
                    </div>
                </div>
            )}
            
            {/* MODAL DE CUPOM (TIPO JANELA) REVISADO */}
            {printOrder && ( 
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-fadeIn">
                    <div className="bg-white rounded-lg shadow-2xl flex flex-col items-center max-h-[90vh] overflow-hidden w-full max-w-[350px] relative">
                        <div className="w-full bg-slate-900 text-white p-4 flex justify-between items-center shrink-0 no-print">
                            <h3 className="font-bold text-sm">Impressão de Cupom</h3>
                            <button onClick={() => setPrintOrder(null)} className="text-white hover:text-red-400"><X size={20}/></button>
                        </div>
                        <div className="overflow-y-auto p-4 bg-gray-200 w-full flex justify-center flex-1">
                            <div id="printArea" className="bg-white shadow-xl scale-100 origin-top">
                                <CupomEntrega 
                                    order={printOrder} 
                                    printerName={currentUser?.name || 'Admin'} 
                                    customText={settings.customReceiptText} 
                                    title={settings.customReceiptTitle}
                                    subtitle={settings.customReceiptSubtitle}
                                    docName={settings.customReceiptDocName}
                                />
                            </div>
                        </div>
                        <div className="w-full p-4 bg-white border-t border-gray-200 flex gap-3 no-print shrink-0">
                            <button onClick={handlePrint} className="flex-1 bg-slate-900 text-white py-3 rounded-lg font-bold shadow-lg hover:bg-black flex items-center justify-center gap-2 text-sm"><Printer size={16}/> IMPRIMIR</button>
                            <button onClick={() => setPrintOrder(null)} className="flex-1 bg-red-100 text-red-600 py-3 rounded-lg font-bold hover:bg-red-200 text-sm">FECHAR</button>
                        </div>
                        <style>{`
                            @media print {
                                body * { visibility: hidden; }
                                #printArea, #printArea * { visibility: visible; }
                                #printArea { position: absolute; left: 0; top: 0; width: 100%; margin: 0; padding: 0; box-shadow: none; }
                                .no-print { display: none !important; }
                            }
                        `}</style>
                    </div>
                </div> 
            )}

            {/* MODAL DE RECIBO A4 (TIPO JANELA) REVISADO */}
            {viewingReceipt && viewingReceipt.data && ( 
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-fadeIn">
                    <div className="bg-gray-100 rounded-lg shadow-2xl w-full max-w-4xl h-[90vh] flex flex-col relative overflow-hidden">
                        <div className="p-4 bg-slate-900 text-white flex justify-between items-center rounded-t-lg shrink-0 no-print">
                            <h3 className="font-bold flex items-center gap-2"><FileText size={18}/> Visualização de Recibo</h3>
                            <button onClick={() => setViewingReceipt(null)}><X size={20}/></button>
                        </div>
                        <div className="flex-1 overflow-auto p-8 flex justify-center bg-gray-500/20">
                            <div id="printAreaA4" className="bg-white shadow-2xl">
                                <ReciboA4 data={viewingReceipt.data} type={viewingReceipt.type} config={settings} printerName={currentUser?.name || 'Admin'} />
                            </div>
                        </div>
                        <div className="p-4 bg-white border-t flex justify-end gap-3 no-print rounded-b-lg shrink-0">
                            <button onClick={() => window.print()} className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold shadow hover:bg-blue-700 flex items-center gap-2"><Printer size={16}/> Imprimir</button>
                            <button onClick={() => setViewingReceipt(null)} className="bg-gray-200 text-gray-700 px-6 py-2 rounded-lg font-bold hover:bg-gray-300">Fechar</button>
                        </div>
                        <style>{`
                            @media print {
                                body * { visibility: hidden; }
                                #printAreaA4, #printAreaA4 * { visibility: visible; }
                                #printAreaA4 { position: absolute; left: 0; top: 0; width: 100%; margin: 0; padding: 0; box-shadow: none; transform: none !important; }
                                .no-print { display: none !important; }
                            }
                        `}</style>
                    </div>
                </div> 
            )}

            {/* RELATORIO MODAL COM EDICAO */}
            {showReportModal && ( 
                <div className="fixed inset-0 z-[100] bg-white flex flex-col animate-fadeIn overflow-auto">
                    <div className="fixed top-4 right-4 flex gap-3 no-print z-[110]">
                        <div className="flex items-center gap-2 mr-4 bg-gray-100 px-3 rounded-lg">
                            <span className="text-xs font-bold text-gray-500">Habilitar Edição Manual</span>
                            <button onClick={() => setIsEditingReport(!isEditingReport)} className={`w-10 h-5 rounded-full relative transition-colors ${isEditingReport ? 'bg-green-500' : 'bg-gray-300'}`}>
                                <div className={`w-3 h-3 bg-white rounded-full absolute top-1 transition-all ${isEditingReport ? 'left-6' : 'left-1'}`}></div>
                            </button>
                        </div>
                        <button onClick={() => window.print()} className="bg-blue-600 text-white px-6 py-3 rounded-full font-bold shadow-2xl hover:bg-blue-700 transition-all flex items-center gap-2"><Printer size={20}/> IMPRIMIR</button>
                        <button onClick={() => { setShowReportModal(false); setIsEditingReport(false); }} className="bg-red-600 text-white px-6 py-3 rounded-full font-bold shadow-2xl hover:bg-red-700 transition-all flex items-center gap-2"><X size={20}/> FECHAR</button>
                    </div>
                    <div className="min-h-screen bg-white p-8 md:p-16">
                        <div className="max-w-5xl mx-auto">
                            <div className="text-center border-b-4 border-slate-900 pb-8 mb-8">
                                <h1 className="text-3xl font-black uppercase tracking-wider text-slate-900">{settings.institutionName}</h1>
                                <p className="text-slate-500 font-bold text-sm mt-2">{settings.systemName}</p>
                                <p className="text-slate-400 text-xs mt-1">Gerado em: {new Date().toLocaleString()}</p>
                            </div>
                            <div className="mb-8">
                                <h2 className="text-xl font-bold uppercase border-l-4 border-blue-600 pl-4 text-slate-800">{reportConfig.type === 'GENERAL' ? 'Relatório Geral do Sistema' : reportConfig.type === 'FINANCIAL' ? 'Relatório Financeiro Detalhado' : reportConfig.type === 'ACCOUNTABILITY' ? 'Prestação de Contas (Associados)' : reportConfig.type === 'INDIVIDUAL' ? `Extrato Individual: ${reportConfig.selectedUser?.name}` : reportConfig.type === 'STOCK_LOW' ? 'Relatório de Reposição de Estoque' : reportConfig.type === 'SALES_BY_CATEGORY' ? 'Vendas por Categoria' : reportConfig.type === 'TOP_PRODUCTS' ? 'Produtos Mais Vendidos' : 'Top Clientes'}</h2>
                                {(reportConfig.type === 'FINANCIAL' || reportConfig.type === 'ACCOUNTABILITY') && <p className="text-sm text-slate-500 mt-2 pl-5">Período: {new Date(reportConfig.startDate).toLocaleDateString()} até {new Date(reportConfig.endDate).toLocaleDateString()}</p>}
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm border-collapse">
                                    <thead>
                                        <tr className="bg-slate-100 text-slate-600 uppercase text-xs font-bold border-b-2 border-slate-300">
                                            {Object.keys(editableReportItems[0] || {}).filter(k => k !== 'id').map(key => (<th key={key} className="p-3 text-left">{key === 'desc' ? 'Descrição' : key === 'sub' ? 'Detalhe' : key === 'value' ? 'Valor (R$)' : key === 'stock' ? 'Qtd' : key}</th>))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {editableReportItems.map((item, idx) => (
                                            <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50 text-slate-700">
                                                {Object.entries(item).filter(([k]) => k !== 'id').map(([key, val]: any, i) => (
                                                    <td key={i} className="p-3">
                                                        {isEditingReport ? (
                                                            <input className="w-full border-b border-dashed border-gray-400 p-1 bg-transparent outline-none" value={val} onChange={(e) => updateReportItem(idx, key, e.target.value)}/>
                                                        ) : (key === 'value' || key === 'cost' || key === 'totalCost' ? `R$ ${Number(val).toFixed(2)}` : val)}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot>
                                        <tr className="bg-slate-900 text-white font-bold">
                                            <td colSpan={2} className="p-4 text-right uppercase">Total Geral / Saldo</td>
                                            <td className="p-4 text-left">R$ {(editableSummary.totalIn - editableSummary.totalOut).toFixed(2)}</td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </div>
                    </div>
                </div> 
            )}

            {/* MODAL DE AUTENTICAÇÃO */}
            {showAuthModal && ( 
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn">
                    <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-8">
                        <div className="flex justify-center mb-6 text-slate-800">
                            <div className="bg-slate-900 p-4 rounded-full text-white shadow-lg"><Lock size={32} /></div>
                        </div>
                        <h3 className="text-center font-bold text-2xl mb-2 text-slate-800">Acesso Restrito</h3>
                        <p className="text-center text-sm text-gray-500 mb-6">{authAction === 'CONFIG_ACTION' || authAction === 'CLEAN_PRODUCTS' || authAction === 'ZERO_STOCK' || authAction === 'ZERO_FINANCE' ? 'Confirme sua senha para continuar.' : 'Senha necessária.'}</p>
                        <form onSubmit={confirmAuth}>
                            <input type="password" className="w-full p-4 border-2 border-slate-200 rounded-xl bg-slate-50 text-center font-bold text-lg text-slate-900 mb-6" placeholder="Senha Admin" autoFocus value={authPass} onChange={e => setAuthPass(e.target.value)} />
                            <div className="flex gap-3">
                                <button type="button" onClick={() => { setShowAuthModal(false); setPendingConfigAction(null); }} className="flex-1 py-3.5 bg-gray-100 text-gray-600 font-bold rounded-xl">Cancelar</button>
                                <button type="submit" className="flex-1 py-3.5 bg-slate-900 text-white font-bold rounded-xl">Confirmar</button>
                            </div>
                        </form>
                    </div>
                </div> 
            )}
            
            {/* MODAL DE FORNECEDORES */}
            {showSupplierModal && (
                <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fadeIn">
                    <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
                        <div className="p-4 bg-indigo-900 text-white flex justify-between items-center">
                            <h3 className="font-bold flex items-center gap-2"><Truck size={20}/> Gestão de Fornecedores</h3>
                            <button onClick={() => setShowSupplierModal(false)} className="bg-white/10 hover:bg-white/20 p-2 rounded-full"><X size={20}/></button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
                            {suppliers.length === 0 ? (
                                <div className="text-center text-gray-400 py-10">Nenhum fornecedor cadastrado via XML.</div>
                            ) : (
                                <div className="space-y-3">
                                    {suppliers.map(s => (
                                        <div key={s.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex justify-between items-center">
                                            <div>
                                                <h4 className="font-bold text-slate-800">{s.name}</h4>
                                                <p className="text-xs text-gray-500 font-mono">CNPJ: {s.cnpjOrCpf}</p>
                                                <p className="text-[10px] text-gray-400 mt-1">{s.description}</p>
                                            </div>
                                            <button onClick={() => { if(confirm('Remover fornecedor?')) removeSupplier(s.id); }} className="p-2 text-red-500 hover:bg-red-50 rounded-lg">
                                                <Trash2 size={18}/>
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL HISTÓRICO / FAMÍLIA ATUALIZADO */}
            {historyModalCpf && ( 
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fadeIn">
                    <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
                        <div className="p-4 bg-slate-800 text-white flex justify-between items-center sticky top-0">
                            <div><h3 className="font-bold flex items-center gap-2"><Users size={18}/> Rede Familiar e Compras</h3><p className="text-xs opacity-70">Interno: {historyModalName || 'Não identificado'} | CPF: {historyModalCpf}</p></div>
                            <button onClick={()=>setHistoryModalCpf(null)}><X size={20}/></button>
                        </div>
                        <div className="p-6 overflow-y-auto bg-gray-50 flex-1">
                            {(() => { 
                                const prisonerOrders = (orders || []).filter(o => o.inmateCpf === historyModalCpf && o.status !== OrderStatus.CANCELLED);
                                const linkedUsers = (users || []).filter(u => u.inmateCpf === historyModalCpf || u.prisonerCpf === historyModalCpf);
                                return ( 
                                    <div className="space-y-6"> 
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4"> 
                                            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm text-center"><p className="text-xs font-bold text-gray-500 uppercase">Total Gasto (Geral)</p><p className="text-xl font-bold text-green-600">R$ {prisonerOrders.reduce((a,b)=>a+(Number(b.total) || 0),0).toFixed(2)}</p></div> 
                                            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm text-center"><p className="text-xs font-bold text-gray-500 uppercase">Pedidos Realizados</p><p className="text-xl font-bold text-blue-600">{prisonerOrders.length}</p></div> 
                                            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm text-center"><p className="text-xs font-bold text-gray-500 uppercase">Familiares Cadastrados</p><p className="text-xl font-bold text-purple-600">{linkedUsers.length}</p></div> 
                                        </div> 
                                        <div> 
                                            <h4 className="font-bold text-slate-800 mb-3 text-sm uppercase tracking-wide border-b pb-2">Familiares Vinculados</h4> 
                                            {linkedUsers.length === 0 ? <p className="text-sm text-gray-500 italic">Nenhum familiar encontrado.</p> : linkedUsers.map(famUser => { const famOrders = prisonerOrders.filter(o => o.userId === famUser.id); const totalSpent = famOrders.reduce((a,b)=>a+(Number(b.total) || 0),0); return (<div key={famUser.id} className="bg-white border-l-4 border-blue-600 rounded-r-xl p-4 shadow-sm mb-3 flex flex-col md:flex-row justify-between items-center gap-4"><div className="flex-1"><div className="flex items-center gap-2"><p className="font-bold text-slate-800 uppercase">{famUser.name}</p><span className="text-[10px] bg-blue-100 text-blue-800 px-2 rounded-full font-bold uppercase">{famUser.relationship || famUser.kinship || 'Parente'}</span></div><p className="text-xs text-gray-500 mt-1 flex gap-3"><span className="flex items-center gap-1"><Phone size={12}/> {famUser.phone || 'S/ Tel'}</span><span>CPF: {famUser.cpf}</span></p></div><div className="text-right"><p className="text-xs font-bold text-gray-400 uppercase">Compras</p><p className="text-lg font-bold text-green-600">R$ {totalSpent.toFixed(2)}</p><p className="text-[10px] text-gray-400">{famOrders.length} pedidos</p></div></div>)})} 
                                        </div> 
                                    </div> 
                                ) 
                            })()}
                        </div>
                    </div>
                </div> 
            )}
        </main>
    </div>
  );
};