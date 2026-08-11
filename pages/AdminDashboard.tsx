import React, { useState, useEffect, useMemo } from 'react';
import { useApp, buildSalesCsv } from '../context/StoreContext';
import { OrderStatus, ThemeOption, User, Order, Product, UserRole, WalletTransaction, Expense, Supplier } from '../types';
import { THEME_COLORS } from '../constants';
import { motion, AnimatePresence } from 'framer-motion';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, writeBatch, setDoc, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { useTheme } from '../context/ThemeContext';
import { OnlineStatusIndicator } from '../components/OnlineStatusIndicator';
import { InstallButton } from '../components/InstallButton';
import { Menu, X, Banknote } from 'lucide-react';

// Import all modular subcomponents
import { AdminSidebar } from '../components/admin/AdminSidebar';
import { AdminHomeTab } from '../components/admin/AdminHomeTab';
import { AdminOrdersTab } from '../components/admin/AdminOrdersTab';
import { AdminProductsTab } from '../components/admin/AdminProductsTab';
import { AdminInmatesTab } from '../components/admin/AdminInmatesTab';
import { AdminUsersTab } from '../components/admin/AdminUsersTab';
import { AdminFinanceTab } from '../components/admin/AdminFinanceTab';
import { AdminWalletTab } from '../components/admin/AdminWalletTab';
import { AdminReportsTab } from '../components/admin/AdminReportsTab';
import { AdminSettingsTab } from '../components/admin/AdminSettingsTab';
import { AdminSalesModal } from '../components/admin/AdminSalesModal';
import { AdminOrderDetailsModal } from '../components/admin/AdminOrderDetailsModal';
import { AdminOrderHistoryModal } from '../components/admin/AdminOrderHistoryModal';
import { AdminUserDetailsModal } from '../components/admin/AdminUserDetailsModal';
import { AdminWalletTransactionModal } from '../components/admin/AdminWalletTransactionModal';
import { AdminReportPreviewModal } from '../components/admin/AdminReportPreviewModal';
import { AdminCashTab } from '../components/admin/AdminCashTab';
import { AdminDashboardCharts } from '../components/admin/AdminDashboardCharts';
import { AdminStockAlertsTab } from '../components/admin/AdminStockAlertsTab';
import { AdminCustomersTab } from '../components/admin/AdminCustomersTab';
import { AdminModals } from '../components/admin/AdminModals';
import { ManualCreditModal } from '../components/admin/ManualCreditModal';
import { executarArquivamentoLocal, shouldRunArchive } from '../utils/archiveUtils';
import { abrirJanelaImpressao } from '../utils/printUtils';
import { usePermissions } from '../hooks/usePermissions';

const ForbiddenMessage = () => (
  <div className="flex flex-col items-center justify-center py-24 text-center">
    <div className="w-20 h-20 rounded-2xl bg-red-50 border border-red-200 flex items-center justify-center mb-6">
      <span className="text-3xl font-black text-red-500">!</span>
    </div>
    <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight mb-2">Acesso Negado</h2>
    <p className="text-slate-500 text-sm max-w-sm">
      Você não tem permissão para acessar esta seção. Consulte o administrador do sistema.
    </p>
  </div>
);

function getLocalDateStr() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function AdminDashboard() {
  const { colors } = useTheme();
  
  // 1. Core Destructured Values from StoreContext
  const {
    orders,
    products,
    users,
    expenses,
    settings,
    suppliers,
    currentUser,
    isLoading,
    updateOrderStatus,
    approveUser,
    deleteUser,
    suspendUser,
    addProduct,
    updateProduct,
    deleteProduct,
    importXmlProduct,
    addExpense,
    updateSettings,
    clearOldData,
    backupSystem,
    logout,
    showNotification,
    deleteOrder,
    createAdminUser,
    removeSupplier,
    resetStock,
    resetFinance,
    resetSystem,
    sendSystemMessage,
    updateAdminPassword,
    validateMasterPassword,
    defineMasterPassword,
    masterPasswordStatus,
    addSupplier,
    addPreRegisteredInmate,
    deletePreRegisteredInmate,
    preRegisteredInmates,
    approveWalletTransaction,
    rejectWalletTransaction,
    withdrawWalletCredit,
    adminDirectSale,
    addWalletCreditDirectly,
    refundOrder,
    resetCredits,
    mergeDuplicateProducts,
    toggleUserCredit,
    archiveOldData,
    activateSystem,
    generateActivationKey,
    isInstallable,
    installApp,
    importInmatesCsv,
    loadMoreOrders,
    loadMoreExpenses,
    loadMoreProducts
  } = useApp();

  // 2. Local State Management
  const [activeTab, setActiveTab] = useState('home');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showSalesModal, setShowSalesModal] = useState(false);
  
  // Real-time Wallet Transactions
  const [walletTx, setWalletTx] = useState<WalletTransaction[]>([]);
  const [loadingWallet, setLoadingWallet] = useState(true);

  // Modal selections
  const [selectedOrderDetails, setSelectedOrderDetails] = useState<Order | null>(null);
  const [selectedWalletTx, setSelectedWalletTx] = useState<WalletTransaction | null>(null);
  const [viewingReceipt, setViewingReceipt] = useState<any>(null);
  const [printOrder, setPrintOrder] = useState<Order | null>(null);
  const [showProductModal, setShowProductModal] = useState(false);
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  
  // Filters & Searches
  const [orderSearch, setOrderSearch] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState('ALL');
  const [orderDateFilter, setOrderDateFilter] = useState('');
  const [orderViewMode, setOrderViewMode] = useState<'grid' | 'list'>('list');
  
  const [productSearch, setProductSearch] = useState('');
  const [productViewMode, setProductViewMode] = useState<'grid' | 'list'>('list');
  const [xmlFile, setXmlFile] = useState<File | null>(null);
  const [margin, setMargin] = useState('30');
  
  const [newInmate, setNewInmate] = useState({ name: '', cpf: '' });
  
  const [userSearch, setUserSearch] = useState('');
  const [userDateFilter, setUserDateFilter] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [viewingUser, setViewingUser] = useState<User | null>(null);
  const [historyModalCpf, setHistoryModalCpf] = useState('');
  const [historyModalName, setHistoryModalName] = useState('');
  const [manualCreditTarget, setManualCreditTarget] = useState<User | null>(null);
  const [showWithdrawalModal, setShowWithdrawalModal] = useState<any>(null);
  const [withdrawalAmount, setWithdrawalAmount] = useState('');
  const [withdrawalReason, setWithdrawalReason] = useState('Retirada administrativa');
  
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [confirmAdminPassword, setConfirmAdminPassword] = useState('');
  
  // Reports Config
  const [reportConfig, setReportConfig] = useState({
    type: 'GENERAL',
    startDate: getLocalDateStr(),
    endDate: getLocalDateStr(),
    financeType: 'ALL',
    individualSearch: '',
    selectedUser: null as User | null
  });
  const [showReportModal, setShowReportModal] = useState(false);

  // Finance Filters & Expense Form
  const [financeFilters, setFinanceFilters] = useState({
    start: getLocalDateStr(),
    end: getLocalDateStr(),
    term: '',
    recipient: ''
  });
  const [expenseForm, setExpenseForm] = useState({
    description: '',
    amount: '',
    recipientName: '',
    recipientDoc: '',
    category: 'Manutenção',
    type: 'OPERATIONAL',
    observation: ''
  });

  // Rejections and Refunds
  const [isRejecting, setIsRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showRefundModal, setShowRefundModal] = useState<Order | null>(null);
  const [refundReason, setRefundReason] = useState('');
  const [isProcessingRefund, setIsProcessingRefund] = useState(false);

  // Security Auth Modals
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authAction, setAuthAction] = useState<'FILTER' | 'STOCK' | 'FINANCE' | 'SYSTEM' | 'PASSWORD'>('FILTER');
  const [pendingConfigAction, setPendingConfigAction] = useState<(() => void) | null>(null);
  const [authPass, setAuthPass] = useState('');
  const [isSettingsAuthenticated, setIsSettingsAuthenticated] = useState(false);

  // 3. Firestore Real-time Listeners
  useEffect(() => {
    const q = query(collection(db, 'wallet_transactions'), orderBy('createdAt', 'desc'), limit(500));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const txs: WalletTransaction[] = [];
      snapshot.forEach((doc) => {
        txs.push({ id: doc.id, ...doc.data() } as WalletTransaction);
      });
      setWalletTx(txs);
      setLoadingWallet(false);
    }, (error) => {
      console.error("Erro ao escutar transações da carteira:", error);
      setLoadingWallet(false);
    });
    return () => unsubscribe();
  }, []);


  // Run client-side archiving once per day on admin login
  useEffect(() => {
    if (!currentUser) return;
    if (!shouldRunArchive()) return;
    const timer = setTimeout(() => {
      executarArquivamentoLocal().catch(console.error);
    }, 15000); // 15s delay — let the UI settle first
    return () => clearTimeout(timer);
  }, [currentUser?.id]);

  // 4. Role-Based Access Control
  const { role: userRole, loading: roleLoading } = usePermissions(currentUser?.id);

  // 4.1. Permissões definitivas do master (independente de leitura de doc)
  const isMaster = useMemo(() => {
    if (!currentUser) return false;
    return currentUser.id === 'master' || currentUser.id === 'admin'
      || (currentUser as any).mainAdmin === true
      || currentUser.email === 'admin@mercado.com';
  }, [currentUser]);

  // Redirect blocked tabs based on role (defense-in-depth).
  // O master principal NUNCA é bloqueado/redirecionado, mesmo se a leitura de permissões falhar.
  useEffect(() => {
    if (roleLoading) return;
    if (userRole === 'operator' && !isMaster) {
      if (['bi', 'customers', 'settings'].includes(activeTab)) {
        setActiveTab('home');
      }
    } else if (userRole === 'manager' && !isMaster) {
      if (['cash', 'inmates', 'users', 'finance', 'wallet', 'customers', 'reports', 'bi', 'settings'].includes(activeTab)) {
        setActiveTab('home');
      }
    }
  }, [userRole, roleLoading, activeTab, isMaster]);

  // SEGURANÇA: Dupla camada — validação nativa no componente.
  // Se o Firebase Auth não confirmar cargo administrativo, desloga imediatamente.
  // O master principal (email admin@mercado.com / mainAdmin) é sempre mantido no painel.
  React.useEffect(() => {
    if (roleLoading) return;
    if (!currentUser) return;
    if (!isMaster && currentUser.role !== UserRole.ADMIN && userRole !== 'admin') {
      logout();
    }
  }, [currentUser, userRole, roleLoading, logout, isMaster]);

  // ATALHOS GLOBAIS F2/F4/F6 na HOME
  useEffect(() => {
    if (activeTab !== 'home') return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'F2') { e.preventDefault(); setShowSalesModal(true); }
      if (e.key === 'F4') { e.preventDefault(); setActiveTab('reports'); }
      if (e.key === 'F6') { e.preventDefault(); setActiveTab('finance'); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeTab]);

  // 5. Permission Helpers
  const hasPermission = (perm: string) => {
    return isMaster || (currentUser?.permissions || []).includes(perm);
  };

  // 6. Direct Sale (PDV) Callback Hookup
  const handleConfirmDirectSale = async (
    targetUserId: string, 
    items: any[], 
    paymentMethod: 'PIX' | 'WALLET' | 'CASH' | 'MIXED' | 'FIADO', 
    total: number, 
    payments?: { method: 'PIX' | 'WALLET' | 'CASH' | 'CARD' | 'FIADO'; amount: number }[], 
    change?: number,
    customerAccountId?: string
  ) => {
    const res = await adminDirectSale(targetUserId, items, paymentMethod, total, payments, change, customerAccountId);
    if (!res) {
      throw new Error('Erro ao processar venda no caixa.');
    }
    showNotification('Venda realizada com sucesso!', 'success');
    return res;
  };

  // 6. Action Handlers
  const handleAddInmate = async () => {
    if (!newInmate.name.trim() || !newInmate.cpf.trim()) {
      showNotification('Nome e CPF são obrigatórios.', 'error');
      return;
    }
    try {
      await addPreRegisteredInmate({ name: newInmate.name, cpf: newInmate.cpf });
      setNewInmate({ name: '', cpf: '' });
      showNotification('Interno cadastrado com sucesso!', 'success');
    } catch (error: any) {
      showNotification(error.message || 'Erro ao cadastrar interno.', 'error');
    }
  };

  const handleDeletePreRegisteredInmate = async (id: string) => {
    if (window.confirm('Tem certeza que deseja excluir este interno pré-cadastrado?')) {
      try {
        await deletePreRegisteredInmate(id);
        showNotification('Interno removido do pré-cadastro.', 'success');
      } catch (error: any) {
        showNotification('Erro ao excluir: ' + error.message, 'error');
      }
    }
  };

  const handleWithdrawal = async () => {
    if (!showWithdrawalModal) return;
    const amount = parseFloat(withdrawalAmount);
    if (isNaN(amount) || amount <= 0) {
      showNotification('Insira um valor válido.', 'error');
      return;
    }
    try {
      const targetId = showWithdrawalModal.userId || showWithdrawalModal.id;
      if (showWithdrawalModal.isDeposit) {
        await addWalletCreditDirectly(targetId, amount, withdrawalReason || 'Adição manual');
      } else if (showWithdrawalModal.isRefund) {
        await addWalletCreditDirectly(targetId, amount, withdrawalReason || 'Estorno administrativo');
      } else {
        await withdrawWalletCredit(targetId, amount, withdrawalReason);
      }
      setShowWithdrawalModal(null);
      setWithdrawalAmount('');
      setWithdrawalReason('Retirada administrativa');
      showNotification('Operação realizada com sucesso!', 'success');
    } catch (error: any) {
      showNotification(error.message || 'Erro ao realizar operação.', 'error');
    }
  };

  const handleAddSupplier = async (name: string) => {
    if (!name.trim()) return;
    try {
      const newSupplier: Supplier = {
        id: Date.now().toString(),
        name: name.trim(),
        cnpjOrCpf: '',
        contact: '',
        description: ''
      };
      await addSupplier(newSupplier);
      showNotification('Fornecedor cadastrado com sucesso!', 'success');
    } catch (error: any) {
      showNotification('Erro ao cadastrar fornecedor: ' + error.message, 'error');
    }
  };

  const handleImportXML = async () => {
    if (!xmlFile) {
      showNotification('Selecione um arquivo XML.', 'error');
      return;
    }
    try {
      await importXmlProduct(xmlFile, parseFloat(margin) / 100);
      setXmlFile(null);
      showNotification('XML importado com sucesso!', 'success');
    } catch (error: any) {
      showNotification(error.message || 'Erro ao importar XML.', 'error');
    }
  };

  const handleProtectedAction = (action: () => void, type: any = 'SYSTEM') => {
    setPendingConfigAction(() => action);
    setAuthAction(type);
    setShowAuthModal(true);
  };

  const handleSettingsAccess = () => {
    setIsSettingsAuthenticated(false);
    setPendingConfigAction(() => () => setIsSettingsAuthenticated(true));
    setAuthAction('SYSTEM');
    setShowAuthModal(true);
  };

  const handleAuthConfirm = async () => {
    try {
      const inputPass = (authPass || '').trim();
      const status = await masterPasswordStatus();
      if (!status.definida) {
        // Primeiro acesso: senha mestra ainda não definida — libera para configurá-la
        setShowAuthModal(false);
        setAuthPass('');
        if (pendingConfigAction) {
          pendingConfigAction();
          setPendingConfigAction(null);
        }
        showNotification('Senha mestra ainda não configurada. Defina uma ao entrar.', 'info');
        return;
      }
      if (!inputPass) {
        showNotification('Digite a senha mestra.', 'error');
        return;
      }
      const ok = await validateMasterPassword(inputPass);
      if (!ok) {
        console.error('[AUTH FAIL] senha mestra incorreta');
        showNotification('Senha mestra incorreta.', 'error');
        return;
      }
      setShowAuthModal(false);
      setAuthPass('');
      if (pendingConfigAction) {
        pendingConfigAction();
        setPendingConfigAction(null);
      }
    } catch (error: any) {
      console.error('[AUTH ERROR]', error);
      showNotification('Erro na autenticação.', 'error');
    }
  };

  const handleChangeAdminPassword = async () => {
    const trimmedPass = newAdminPassword.trim();
    const trimmedConfirm = confirmAdminPassword.trim();
    if (trimmedPass !== trimmedConfirm) {
      showNotification('As senhas não coincidem.', 'error');
      return;
    }
    if (trimmedPass.length < 4) {
      showNotification('A senha deve ter pelo menos 4 caracteres.', 'error');
      return;
    }
    try {
      await updateAdminPassword(trimmedPass);
      setNewAdminPassword('');
      setConfirmAdminPassword('');
      showNotification('Senha administrativa atualizada com sucesso!', 'success');
    } catch (error: any) {
      showNotification('Erro ao atualizar senha: ' + error.message, 'error');
    }
  };

  const handleOpenReceipt = (item: any) => {
    const receiptType = item?.type === 'ENTRY' ? 'ORDER' : 'EXPENSE';
    setViewingReceipt({ data: item, type: receiptType, config: settings });
  };

  const handleOpenReport = () => {
    setShowReportModal(true);
  };

  const handleExportExcel = () => {
    if (!reportConfig.type) return showNotification('Selecione um tipo de relatório primeiro.', 'error');
    if (reportConfig.type !== 'SALES_CSV') {
      setShowReportModal(true);
      return;
    }
    const csv = buildSalesCsv(orders, users, reportConfig.startDate, reportConfig.endDate);
    if (!csv || !csv.csv || csv.linhas.length === 0) return showNotification('Nenhuma venda encontrada para o período.', 'error');
    const blob = new Blob([csv.csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `movimentacao-vendas-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showNotification(`CSV gerado com ${csv.linhas.length} vendas para o contador.`, 'success');
  };

  const handleRejectOrder = async () => {
    if (!selectedOrderDetails) return;
    if (!rejectReason.trim()) return showNotification('É obrigatório informar o motivo.', 'error');
    try {
      await updateOrderStatus(selectedOrderDetails.id, OrderStatus.CANCELLED);
      await sendSystemMessage({
        title: `Pedido #${selectedOrderDetails.id.slice(0, 6)} Reprovado`,
        content: `Seu pedido foi reprovado pela administração. Motivo: ${rejectReason}`,
        targetUserId: selectedOrderDetails.userId,
        type: 'error'
      });
      showNotification('Pedido reprovado e usuário notificado.', 'success');
      setRejectReason('');
      setIsRejecting(false);
      setTimeout(() => setSelectedOrderDetails(null), 1200);
    } catch (e: any) {
      showNotification('Erro ao reprovar pedido: ' + e.message, 'error');
    }
  };

  const handleRefundOrder = async () => {
    if (!showRefundModal) return;
    if (!refundReason.trim()) return showNotification('Motivo do reembolso é obrigatório.', 'error');
    setIsProcessingRefund(true);
    try {
      await refundOrder(showRefundModal.id);
      await sendSystemMessage({
        title: `Pedido #${showRefundModal.id.slice(0, 6)} Reembolsado`,
        content: `Seu pedido foi reembolsado. Valor devolvido para a carteira. Motivo: ${refundReason}`,
        targetUserId: showRefundModal.userId,
        type: 'info'
      });
      showNotification('Pedido reembolsado com sucesso!', 'success');
      setRefundReason('');
      setTimeout(() => setShowRefundModal(null), 1200);
    } catch (e: any) {
      showNotification('Erro ao processar reembolso: ' + e.message, 'error');
    } finally {
      setIsProcessingRefund(false);
    }
  };

  const handleDownloadSource = () => {
    showNotification('O código fonte do projeto está disponível no repositório Git do sistema.', 'info');
  };

  const handleBuildExe = () => {
    showNotification('Esta versão é web (PWA). Instale pelo navegador usando o botão de instalação.', 'info');
  };

  // Helper translations and colors
  const normStatus = (status: string | undefined): string => String(status || '').toLowerCase();
  const translateStatus = (status: string | undefined): string => {
    const s = normStatus(status);
    if (!s || s === 'pending' || s === 'pendente') return 'Pendente';
    if (s === 'paid' || s === 'pago') return 'Pago';
    if (s === 'preparing' || s === 'preparando') return 'Preparando';
    if (s === 'out_for_delivery') return 'Em Entrega';
    if (s === 'delivered' || s === 'entregue') return 'Entregue';
    if (s === 'cancelled' || s === 'cancelado') return 'Cancelado';
    if (s === 'refunded' || s === 'devolvido' || s === 'reembolsado') return 'Reembolsado';
    return status || 'Pendente';
  };

  const getStatusColor = (status: string): string => {
    const s = normStatus(status);
    if (s === 'pending' || s === 'pendente') return 'text-amber-500 bg-amber-500/10 border-amber-500/20';
    if (s === 'paid' || s === 'pago') return 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20';
    if (s === 'preparing' || s === 'preparando') return 'text-sky-500 bg-sky-500/10 border-sky-500/20';
    if (s === 'out_for_delivery') return 'text-indigo-500 bg-indigo-500/10 border-indigo-500/20';
    if (s === 'delivered' || s === 'entregue') return 'text-blue-500 bg-blue-500/10 border-blue-500/20';
    if (s === 'cancelled' || s === 'cancelado') return 'text-rose-500 bg-rose-500/10 border-rose-500/20';
    if (s === 'refunded' || s === 'devolvido' || s === 'reembolsado') return 'text-purple-500 bg-purple-500/10 border-purple-500/20';
    return 'text-gray-500 bg-gray-500/10 border-gray-500/20';
  };

  // 7. Computed Statistics and Graph Data
  const filteredOrdersForHome = useMemo(() => {
    const now = new Date(); now.setHours(0, 0, 0, 0);
    return (orders || []).filter(o => {
      if (['cancelled', 'cancelado'].includes(normStatus(o.status))) return false;
      if (!o.date) return false;
      try {
        const d = new Date(o.date); d.setHours(0, 0, 0, 0);
        if (isNaN(d.getTime())) return false;
        return d.getTime() === now.getTime();
      } catch (e) { return false; }
    });
  }, [orders]);

  const stats = useMemo(() => {
    const MONEY_IN = ['paid', 'pago', 'preparing', 'separacao', 'delivered', 'entregue'];
    const moneyInFilter = (o: Order) => MONEY_IN.includes(normStatus(o.status));
    const totalEntries = (orders || []).filter(moneyInFilter).reduce((a, b) => a + (Number(b.total) || 0), 0);
    const totalExits = (expenses || []).reduce((a, b) => a + (Number(b.amount) || 0), 0);
    const pendingOrders = (orders || []).filter(o => ['pending', 'pendente'].includes(normStatus(o.status))).length;
    const pendingDeposits = (walletTx || []).filter(tx => tx.status === 'pending').length;
    const activeUsers = (users || []).filter(u => u.role === UserRole.FAMILY && u.status === 'active').length;
    
    const salesTotal = filteredOrdersForHome.reduce((a, b) => a + (Number(b.total) || 0), 0);
    const ordersCount = filteredOrdersForHome.length;
    const pendingUsersCount = (users || []).filter(u => !u.approved && u.role === UserRole.FAMILY).length;

    return {
      totalIn: totalEntries,
      totalOut: totalExits,
      pendingOrders,
      pendingDeposits,
      activeUsers,
      salesTotal,
      ordersCount,
      pendingUsersCount
    };
  }, [orders, expenses, walletTx, users, filteredOrdersForHome]);

  const chartData = useMemo(() => {
    const data = [];
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const dateStr = d.toLocaleDateString('pt-BR', { weekday: 'short' });
      const dayOrders = (orders || []).filter(o => {
        if (!o.date) return false;
        try {
          const od = new Date(o.date);
          if (isNaN(od.getTime())) return false;
          return od.getDate() === d.getDate() && od.getMonth() === d.getMonth() && !['cancelled', 'cancelado'].includes(normStatus(o.status));
        } catch (e) { return false; }
      });
      const total = dayOrders.reduce((acc, o) => acc + (Number(o.total) || 0), 0);
      data.push({ name: dateStr, vendas: total });
    }
    return data;
  }, [orders]);

  const orderPendingCount = useMemo(() => {
    return (orders || []).filter(o => ['pending', 'pendente'].includes(normStatus(o.status))).length;
  }, [orders]);

  const depositPendingCount = useMemo(() => {
    return (walletTx || []).filter(tx => tx.status === 'pending').length;
  }, [walletTx]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center text-white">
        <div className="w-16 h-16 border-4 border-[var(--primary-color)] border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-sm font-black tracking-widest uppercase text-blue-600">Carregando painel...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-100 flex font-sans overflow-x-hidden">
      
      {/* Sidebar Integration */}
      <AdminSidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        pendingOrdersCount={orderPendingCount}
        pendingDepositsCount={depositPendingCount}
        logout={logout}
        appName={settings?.appName || 'Mercado Fácil'}
        userName={currentUser?.name || 'Administrador'}
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
        onOpenSales={() => setShowSalesModal(true)}
        permissions={currentUser?.permissions || []}
        isMaster={isMaster}
        primaryColor={settings?.primaryColor || '#10b981'}
        userRole={userRole}
      />

      {/* Main Administrative Container */}
      <div className="flex-1 lg:pl-72 flex flex-col min-h-screen w-full relative">
        
        {/* Dynamic Header */}
        <header className="sticky top-0 bg-white border-b border-slate-200 z-30 px-6 py-4 flex items-center justify-between transition-all duration-300 shadow-sm">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} 
              className="lg:hidden text-slate-500 hover:bg-slate-800 p-2.5 rounded-xl border border-slate-200 touch-target"
            >
              {isMobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
            <div>
              <h2 className="text-lg font-black tracking-tight uppercase leading-none text-slate-900">
                {activeTab === 'home' && 'Painel Geral'}
                {activeTab === 'orders' && 'Gerenciamento de Pedidos'}
                {activeTab === 'products' && 'Catálogo de Produtos'}
                {activeTab === 'cash' && 'Controle de Caixa / Gaveta'}
                {activeTab === 'inmates' && 'Cadastro de Internos'}
                {activeTab === 'users' && 'Gestão de Familiares'}
                {activeTab === 'finance' && 'Fluxo de Caixa & Despesas'}
                {activeTab === 'wallet' && 'Depósitos & Saldos'}
                {activeTab === 'reports' && 'Relatórios do Sistema'}
                {activeTab === 'bi' && 'Dashboard de Business Intelligence'}
                {activeTab === 'stock_alerts' && 'Alertas de Reposição'}
                {activeTab === 'customers' && 'Conta de Clientes (Fiado / Crédito)'}
                {activeTab === 'settings' && 'Parâmetros Administrativos'}
              </h2>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-1">
                {(settings as any)?.institutionName || 'Mercado Fácil ASSPEN'} • Sistema de Gestão Penitenciária
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <InstallButton variant="full" role="user" label="Instalar App (Usuário)" />
            <InstallButton variant="full" role="admin" label="Instalar Painel Admin" />
            <OnlineStatusIndicator />
          </div>
        </header>

        {/* Dynamic Page/Tab Content Switcher */}
        <main className="flex-1 p-6 lg:p-8 max-w-7xl w-full mx-auto pb-24">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="h-full w-full"
            >
              {activeTab === 'home' && (
                <AdminHomeTab
                  stats={stats}
                  chartData={chartData}
                  isMaster={isMaster}
                  setActiveTab={setActiveTab}
                  setShowProductModal={setShowProductModal}
                  setOrderStatusFilter={setOrderStatusFilter}
                  filterType="day"
                  orders={orders}
                  products={products}
                  walletTx={walletTx}
                  approveWalletTransaction={approveWalletTransaction}
                  rejectWalletTransaction={rejectWalletTransaction}
                  onSelectTransaction={setSelectedWalletTx}
                  onOpenSales={() => setShowSalesModal(true)}
                />
              )}

              {activeTab === 'orders' && hasPermission('orders') && (
                <AdminOrdersTab
                  orders={orders}
                  searchTerm={orderSearch}
                  setSearchTerm={setOrderSearch}
                  viewMode={orderViewMode}
                  setViewMode={setOrderViewMode}
                  translateStatus={translateStatus}
                  getStatusColor={getStatusColor}
                  setSelectedOrderDetails={setSelectedOrderDetails}
                  setPrintOrder={setPrintOrder}
                  setViewingReceipt={setViewingReceipt}
                  loadMoreOrders={loadMoreOrders}
                />
              )}

              {activeTab === 'products' && hasPermission('products') && (
                <AdminProductsTab
                  products={products}
                  suppliers={suppliers}
                  searchTerm={productSearch}
                  setSearchTerm={setProductSearch}
                  viewMode={productViewMode}
                  setViewMode={setProductViewMode}
                  setShowProductModal={setShowProductModal}
                  setEditingProduct={setEditingProduct}
                  deleteProduct={deleteProduct}
                  xmlFile={xmlFile}
                  setXmlFile={setXmlFile}
                  handleImportXML={handleImportXML}
                  margin={margin}
                  setMargin={setMargin}
                  onPrintCatalog={() => {
                    if (!products || products.length === 0) {
                      showNotification('Nenhum produto no catálogo para imprimir.', 'warning');
                      return;
                    }
                    abrirJanelaImpressao({ type: 'CATALOGO', data: products }, settings);
                  }}
                  mergeDuplicateProducts={mergeDuplicateProducts}
                  handleResetStock={() => handleProtectedAction(resetStock, 'STOCK')}
                  loadMoreProducts={loadMoreProducts}
                />
              )}

              {activeTab === 'cash' && hasPermission('cash') && (
                <AdminCashTab
                  operatorId={currentUser?.id || ''}
                  operatorName={currentUser?.name || 'Administrador'}
                  primaryColor={settings?.primaryColor || '#10b981'}
                />
              )}

              {activeTab === 'inmates' && hasPermission('inmates') && (
                <AdminInmatesTab
                  preRegisteredInmates={preRegisteredInmates}
                  users={users}
                  newInmate={newInmate}
                  setNewInmate={setNewInmate}
                  handleAddInmate={handleAddInmate}
                  deletePreRegisteredInmate={handleDeletePreRegisteredInmate}
                  importInmatesCsv={importInmatesCsv}
                />
              )}

              {activeTab === 'users' && hasPermission('users') && (
                <AdminUsersTab
                  users={users}
                  orders={orders}
                  userSearch={userSearch}
                  setUserSearch={setUserSearch}
                  showPasswords={showPasswords}
                  setShowPasswords={setShowPasswords}
                  setViewingUser={setViewingUser}
                  setShowWithdrawalModal={setShowWithdrawalModal}
                  approveUser={approveUser}
                  suspendUser={suspendUser}
                  toggleUserCredit={toggleUserCredit}
                  deleteUser={deleteUser}
                  toggleExcepcionalFlag={(userId, value) => updateDoc(doc(db, 'users', userId), { autorizacaoExcepcional: value })}
                  onAddCredit={(user) => {
                    if (!isMaster) {
                      showNotification('Apenas o administrador principal pode inserir crédito manual.', 'error');
                      return;
                    }
                    setManualCreditTarget(user);
                  }}
                />
              )}

              {activeTab === 'finance' && hasPermission('finance') && (
                <AdminFinanceTab
                  expenses={expenses}
                  orders={orders}
                  isMaster={isMaster}
                  suppliers={suppliers}
                  financeFilters={financeFilters}
                  setFinanceFilters={setFinanceFilters}
                  handleOpenReceipt={handleOpenReceipt}
                  totalEntries={stats.totalIn}
                  totalExits={stats.totalOut}
                  settings={settings}
                  addExpense={addExpense}
                  resetFinance={async () => { await handleProtectedAction(resetFinance, 'FINANCE'); }}
                  resetCredits={async () => { await handleProtectedAction(resetCredits, 'FINANCE'); }}
                  showNotification={showNotification}
                  loadMoreExpenses={loadMoreExpenses}
                />
              )}

              {activeTab === 'wallet' && hasPermission('wallet') && (
                <AdminWalletTab
                  walletTx={walletTx}
                  userSearch={userSearch}
                  setUserSearch={setUserSearch}
                  financeFilters={financeFilters}
                  setFinanceFilters={setFinanceFilters}
                  loadingWallet={loadingWallet}
                  approveWalletTransaction={approveWalletTransaction}
                  rejectWalletTransaction={rejectWalletTransaction}
                  showNotification={showNotification}
                  onSelectTransaction={setSelectedWalletTx}
                />
              )}

              {activeTab === 'reports' && hasPermission('reports') && (
                <AdminReportsTab
                  reportConfig={reportConfig}
                  setReportConfig={setReportConfig}
                  users={users}
                  handleOpenReport={handleOpenReport}
                  handleExportExcel={handleExportExcel}
                />
              )}

              {activeTab === 'bi' && hasPermission('reports') && (isMaster || userRole === 'admin') && (
                <AdminDashboardCharts />
              )}
              {activeTab === 'bi' && !(isMaster || userRole === 'admin') && (
                <ForbiddenMessage />
              )}

              {activeTab === 'customers' && hasPermission('finance') && userRole !== 'operator' && (
                <AdminCustomersTab />
              )}
              {activeTab === 'customers' && userRole === 'operator' && (
                <ForbiddenMessage />
              )}

              {activeTab === 'stock_alerts' && hasPermission('products') && (
                <AdminStockAlertsTab
                  products={products}
                  onEditProduct={(product) => {
                    setEditingProduct(product);
                    setShowProductModal(true);
                  }}
                />
              )}

              {activeTab === 'settings' && (isMaster || userRole === 'admin') && (
                <AdminSettingsTab
                  isMaster={isMaster}
                  isAuthenticated={isSettingsAuthenticated}
                  onAuthenticate={() => handleProtectedAction(() => setIsSettingsAuthenticated(true))}
                  newAdminPassword={newAdminPassword}
                  setNewAdminPassword={setNewAdminPassword}
                  confirmAdminPassword={confirmAdminPassword}
                  setConfirmAdminPassword={setConfirmAdminPassword}
                  handleChangeAdminPassword={handleChangeAdminPassword}
                  handleProtectedAction={handleProtectedAction}
                  clearOldData={clearOldData}
                  backupSystem={backupSystem}
                  resetStock={() => handleProtectedAction(resetStock, 'STOCK')}
                  resetFinance={() => handleProtectedAction(resetFinance, 'FINANCE')}
                  resetSystem={resetSystem}
                  users={users}
                  deleteUser={deleteUser}
                  createAdminUser={createAdminUser}
                  handleDownloadSource={handleDownloadSource}
                  handleBuildExe={handleBuildExe}
                  updateSettings={updateSettings}
                  defineMasterPassword={defineMasterPassword}
                  showNotification={showNotification}
                  activateSystem={activateSystem}
                  generateActivationKey={generateActivationKey}
                  isInstallable={isInstallable}
                  installApp={installApp}
                  settings={settings}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* PDV (Venda Direta) Central modal */}
      {showSalesModal && (
        <AdminSalesModal
          isOpen={showSalesModal}
          onClose={() => setShowSalesModal(false)}
          users={users}
          products={products}
          orders={orders}
          onConfirm={handleConfirmDirectSale}
          setPrintOrder={setPrintOrder}
          settings={settings}
          currentUser={currentUser || undefined}
        />
      )}

      {/* Global details modal for orders */}
      {selectedOrderDetails && (
          <AdminOrderDetailsModal
            order={selectedOrderDetails}
            onClose={() => setSelectedOrderDetails(null)}
            isRejecting={isRejecting}
            setIsRejecting={setIsRejecting}
            rejectReason={rejectReason}
            setRejectReason={setRejectReason}
            handleRejectOrder={handleRejectOrder}
            updateOrderStatus={(id, status) => updateOrderStatus(id, status as any)}
            showNotification={showNotification}
            setViewingReceipt={setViewingReceipt}
            setPrintOrder={setPrintOrder}
            setShowRefundModal={setShowRefundModal}
            translateStatus={translateStatus}
            setHistoryModalCpf={setHistoryModalCpf}
            setHistoryModalName={setHistoryModalName}
            settings={settings}
          />
      )}

      {/* Histórico de compras do cliente/interno (aberto pelo botão "Histórico") */}
      <AdminOrderHistoryModal
        open={!!historyModalCpf}
        cpf={historyModalCpf}
        name={historyModalName}
        orders={orders}
        onClose={() => setHistoryModalCpf('')}
      />

      {/* Global details modal for family members (full editable history + documents) */}
      {viewingUser && (
        <AdminUserDetailsModal
          user={viewingUser}
          orders={orders}
          walletTx={walletTx}
          onClose={() => setViewingUser(null)}
          onSave={async (id, fields) => {
            await updateDoc(doc(db, 'users', id), fields);
          }}
          approveUser={approveUser}
          suspendUser={suspendUser}
          deleteUser={deleteUser}
          toggleUserCredit={toggleUserCredit}
          toggleExcepcionalFlag={(userId, value) => updateDoc(doc(db, 'users', userId), { autorizacaoExcepcional: value })}
          onAddCredit={(user) => {
            if (!isMaster) {
              showNotification('Apenas o administrador principal pode inserir crédito manual.', 'error');
              return;
            }
            setManualCreditTarget(user);
          }}
          showNotification={showNotification}
        />
      )}

      {/* Modal de Aporte Manual de Crédito (somente admin principal) */}
      <ManualCreditModal
        user={manualCreditTarget}
        onClose={() => setManualCreditTarget(null)}
        onConfirm={async (userId, valor, motivo) => {
          await addWalletCreditDirectly(userId, valor, motivo);
          showNotification(`Crédito de R$ ${valor.toFixed(2)} inserido com sucesso!`, 'success');
        }}
      />

      {/* Global details modal for wallet transactions (deposits/withdrawals) */}
      {selectedWalletTx && (
        <AdminWalletTransactionModal
          transaction={selectedWalletTx}
          onClose={() => setSelectedWalletTx(null)}
          onApprove={async (id) => {
            if (selectedWalletTx) {
              await approveWalletTransaction(id);
              setSelectedWalletTx(null);
            }
          }}
          onReject={async (id) => {
            if (selectedWalletTx) {
              await rejectWalletTransaction(id);
              setSelectedWalletTx(null);
            }
          }}
          appName={settings.appName || 'MERCADO FÁCIL'}
        />
      )}

      {/* Global preview modal for generated PDF/HTML reports */}
      {showReportModal && (
        <AdminReportPreviewModal
          isOpen={showReportModal}
          onClose={() => setShowReportModal(false)}
          config={reportConfig}
          orders={orders}
          expenses={expenses}
          users={users}
          products={products}
          settings={settings}
        />
      )}

      {/* Standard security, withdrawal, refund, and product management modals */}
      <AdminModals
        showAuthModal={showAuthModal}
        setShowAuthModal={setShowAuthModal}
        authPass={authPass}
        setAuthPass={setAuthPass}
        handleAuthConfirm={handleAuthConfirm}
        
        showWithdrawalModal={showWithdrawalModal}
        setShowWithdrawalModal={setShowWithdrawalModal}
        withdrawalAmount={withdrawalAmount}
        setWithdrawalAmount={setWithdrawalAmount}
        withdrawalReason={withdrawalReason}
        setWithdrawalReason={setWithdrawalReason}
        handleWithdrawal={handleWithdrawal}

        showRefundModal={showRefundModal}
        setShowRefundModal={setShowRefundModal}
        refundReason={refundReason}
        setRefundReason={setRefundReason}
        handleRefundOrder={handleRefundOrder}
        isProcessingRefund={isProcessingRefund}

        showProductModal={showProductModal}
        setShowProductModal={setShowProductModal}
        editingProduct={editingProduct}
        setEditingProduct={setEditingProduct}
        addProduct={addProduct}
        updateProduct={updateProduct}
        products={products}

        viewingReceipt={viewingReceipt}
        setViewingReceipt={setViewingReceipt}

        printOrder={printOrder}
        setPrintOrder={setPrintOrder}
        settings={settings}
      />

    </div>
  );
}