import React, { useState, useEffect, useMemo } from 'react';
import { useApp, buildSalesCsv } from '../context/StoreContext';
import { OrderStatus, ThemeOption, User, Order, Product, UserRole, WalletTransaction, Expense, Supplier } from '../types';
import { THEME_COLORS } from '../constants';
import { motion, AnimatePresence } from 'framer-motion';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, writeBatch, setDoc, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { useTheme } from '../context/ThemeContext';
import { OnlineStatusIndicator } from '../components/OnlineStatusIndicator';
import { OfflineSalesBanner } from '../components/admin/OfflineSalesBanner';

import { AppDownloadButton } from '../components/AppDownloadModal';
import { UninstallModal } from '../components/UninstallModal';
import { ehReceita } from '../components/admin/adminUtils';
import { Menu, X, Banknote, Trash2, BarChart3, FileText, AlertTriangle, ArrowUpRight } from 'lucide-react';

// Import all modular subcomponents
import { AdminSidebar } from '../components/admin/AdminSidebar';
import { AdminHomeTab } from '../components/admin/AdminHomeTab';
import { AdminMaintenanceTab } from '../components/admin/AdminMaintenanceTab';
import { AdminShortcutsModal } from '../components/admin/AdminShortcutsModal';
import { AdminOrdersTab } from '../components/admin/AdminOrdersTab';
import { AdminProductsTab } from '../components/admin/AdminProductsTab';
import { AdminInmatesTab } from '../components/admin/AdminInmatesTab';
import { AdminUsersTab } from '../components/admin/AdminUsersTab';
import { AdminFinanceTab } from '../components/admin/AdminFinanceTab';
import { AdminWalletTab } from '../components/admin/AdminWalletTab';
import { AdminReportsTab } from '../components/admin/AdminReportsTab';
import { AdminSalesDashboard } from '../components/admin/AdminSalesDashboard';
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
import { MaintenanceCenter } from '../components/admin/MaintenanceCenter';
import { AdminMessagesTab } from '../components/admin/AdminMessagesTab';
import { AdminCustomersTab } from '../components/admin/AdminCustomersTab';
import { AdminModals } from '../components/admin/AdminModals';
import { ManualCreditModal } from '../components/admin/ManualCreditModal';
import { executarArquivamentoLocal, shouldRunArchive } from '../utils/archiveUtils';
import { abrirJanelaImpressao } from '../utils/printUtils';
import { toDate } from '../utils/dateUtils';
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
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;
  
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
    previewXmlImport,
    sanitizeCatalog,
    addExpense,
    deleteExpense,
    updateSettings,
    clearOldData,
    backupSystem,
    logout,
    showNotification,
    deleteOrder,
    createAdminUser,
    updateAdminPermissions,
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
    loadMoreProducts,
    productsLimit,
    ordersLimit,
    usersLimit,
    loadMoreUsers,
    expandUsersLimit,
    inmatesLimit,
    loadMoreInmates,
    cotaCritica,
    registrarVendaOffline,
    sincronizarVendasOffline,
    vendasOfflinePendentes,
    vendasOfflineComErro,
    messages,
    sendMessage,
    isLoggingOut
  } = useApp();

  // 2. Local State Management
  const [activeTab, setActiveTab] = useState('home');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showSalesModal, setShowSalesModal] = useState(false);

  // Troca de aba SEMPRE volta ao topo: sem isso o navegador mantinha a posição
  // de scroll da aba anterior e o Fluxo de Caixa (e qualquer aba) abria no fim
  // da página.
  React.useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [activeTab]);

  // Real-time Wallet Transactions
  const [walletTx, setWalletTx] = useState<WalletTransaction[]>([]);
  const [loadingWallet, setLoadingWallet] = useState(true);

  // Modal selections
  const [selectedOrderDetails, setSelectedOrderDetails] = useState<Order | null>(null);
  const [selectedWalletTx, setSelectedWalletTx] = useState<WalletTransaction | null>(null);
  const [viewingReceipt, setViewingReceipt] = useState<any>(null);
  const [printOrder, setPrintOrder] = useState<Order | null>(null);
  const [showProductModal, setShowProductModal] = useState(false);
  const [showStockEditModal, setShowStockEditModal] = useState<Product | null>(null);
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
  const [withdrawalPassword, setWithdrawalPassword] = useState('');
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
  const [reportsMode, setReportsMode] = useState<'visual' | 'formal'>('visual');
  const [showReportModal, setShowReportModal] = useState(false);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const [showUninstallModal, setShowUninstallModal] = useState(false);

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
      if (['bi', 'customers', 'settings', 'maintenance'].includes(activeTab)) {
        setActiveTab('home');
      }
    } else if (userRole === 'manager' && !isMaster) {
      if (['cash', 'inmates', 'users', 'messages', 'finance', 'wallet', 'customers', 'reports', 'bi', 'settings', 'maintenance'].includes(activeTab)) {
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

  // 5. Permission Helpers
  const hasPermission = (perm: string) => {
    if (isMaster) return true;
    const perms = currentUser?.permissions;
    if (perms === undefined) return true; // admin legado (sem campo) = acesso total
    if (perms.includes('all')) return true;
    return perms.includes(perm);
  };

  // ATALHOS GLOBAIS F1-F12 + '?' — funcionam em qualquer aba do painel.
  // Guardas: nada de atalho com janela aberta, nem digitando em campos.
  const shortcutsModalOpen = [showSalesModal, showReportModal, showShortcutsModal, showProductModal, showRefundModal, showWithdrawalModal, showAuthModal, historyModalCpf, viewingReceipt].some(Boolean);

  const goToTab = (tab: string) => {
    const tabPermissions: Record<string, string> = {
      'orders': 'orders',
      'products': 'products',
      'cash': 'cash',
      'inmates': 'inmates',
      'users': 'users',
      'finance': 'finance',
      'wallet': 'wallet',
      'reports': 'reports',
      'customers': 'finance',
      'messages': 'users',
      'stock_alerts': 'products',
      'bi': 'reports',
      'settings': 'reports'
    };
    const needPerm = tabPermissions[tab];
    if (!needPerm || hasPermission(needPerm)) {
      setActiveTab(tab);
    } else {
      showNotification('Permissão negada para esta seção.', 'error');
    }
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) return;
      const isFKey = e.key.startsWith('F') && !isNaN(Number(e.key.slice(1)));
      if (!isFKey && !(e.key === '?')) return;
      if (shortcutsModalOpen) return;
      e.preventDefault();
      const key = e.key;
      if (key === '?') { setShowShortcutsModal(true); return; }
      const map: Record<string, () => void> = {
        F1: () => setActiveTab('home'),
        F2: () => { if (hasPermission('sales')) setShowSalesModal(true); else showNotification('Permissão negada para Venda Direta (PDV).', 'error'); },
        F3: () => goToTab('orders'),
        F4: () => goToTab('reports'),
        F5: () => goToTab('products'),
        F6: () => goToTab('finance'),
        F7: () => goToTab('wallet'),
        F8: () => goToTab('users'),
        F9: () => goToTab('bi'),
        F10: () => goToTab('settings'),
        F11: () => goToTab('cash'),
        F12: () => goToTab('customers')
      };
      const action = map[key];
      if (action) action();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [shortcutsModalOpen, hasPermission]);

  // 6. Direct Sale (PDV) Callback Hookup
  const handleConfirmDirectSale = async (
    targetUserId: string, 
    items: any[], 
    paymentMethod: 'PIX' | 'WALLET' | 'CASH' | 'MIXED' | 'FIADO', 
    total: number, 
    payments?: { method: 'PIX' | 'WALLET' | 'CASH' | 'CARD' | 'FIADO'; amount: number }[], 
    change?: number,
    customerAccountId?: string,
    clientToken?: string,
    jointWallet?: { secondUserId: string; secondWalletAmount: number },
    cardBrand?: string
  ) => {
    const res = await adminDirectSale(targetUserId, items, paymentMethod, total, payments, change, customerAccountId, clientToken, jointWallet, cardBrand);
    if (!res) {
      throw new Error('Erro ao processar venda no caixa.');
    }
    showNotification('Venda realizada com sucesso!', 'success');
    return res;
  };

  // 6b. Venda OFFLINE (sem internet): registra na fila local; sincroniza
  // automaticamente quando a conexão voltar (servidor valida e deduplica).
  const handleConfirmOfflineSale = async (
    targetUserId: string,
    items: any[],
    paymentMethod: 'PIX' | 'WALLET' | 'CASH' | 'MIXED' | 'FIADO' | 'FIADO_30',
    total: number,
    payments?: { method: 'PIX' | 'WALLET' | 'CASH' | 'CARD' | 'FIADO' | 'FIADO_30'; amount: number }[],
    change?: number,
    customerAccountId?: string,
    cardBrand?: string
  ) => {
    const res = await registrarVendaOffline(targetUserId, items, paymentMethod, total, payments, change, customerAccountId, cardBrand);
    if (!res) {
      throw new Error('Não foi possível registrar a venda offline.');
    }
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
    try {
      await deletePreRegisteredInmate(id);
      showNotification('Interno removido do pré-cadastro.', 'success');
    } catch (error: any) {
      showNotification('Erro ao excluir: ' + error.message, 'error');
    }
  };

  const withdrawalProcessingRef = React.useRef(false);

  const handleWithdrawal = async () => {
    if (!showWithdrawalModal) return;
    // Anti duplo clique: dois cliques rápidos = DOIS lançamentos de dinheiro.
    if (withdrawalProcessingRef.current) return;
    const rawValor = String(withdrawalAmount).trim();
    const amount = /,/.test(rawValor)
      ? parseFloat(rawValor.replace(/\./g, '').replace(',', '.'))
      : parseFloat(rawValor);
    if (isNaN(amount) || amount <= 0) {
      showNotification('Insira um valor válido.', 'error');
      return;
    }
    if (!withdrawalPassword) {
      showNotification('Informe a senha de confirmação.', 'error');
      return;
    }
    withdrawalProcessingRef.current = true;
    try {
      const targetId = showWithdrawalModal.userId || showWithdrawalModal.id;
      if (showWithdrawalModal.isDeposit) {
        await addWalletCreditDirectly(targetId, amount, withdrawalReason || 'Adição manual', withdrawalPassword);
      } else if (showWithdrawalModal.isRefund) {
        await addWalletCreditDirectly(targetId, amount, withdrawalReason || 'Estorno administrativo', withdrawalPassword);
      } else {
        await withdrawWalletCredit(targetId, amount, withdrawalReason, withdrawalPassword);
      }
      setShowWithdrawalModal(null);
      setWithdrawalAmount('');
      setWithdrawalPassword('');
      setWithdrawalReason('Retirada administrativa');
      showNotification('Operação realizada com sucesso!', 'success');
    } catch (error: any) {
      showNotification(error.message || 'Erro ao realizar operação.', 'error');
    } finally {
      withdrawalProcessingRef.current = false;
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
    if (trimmedPass.length < 6) {
      showNotification('A senha deve ter pelo menos 6 caracteres.', 'error');
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

  const handleExportExcel = (typeOverride?: string, startDate?: string, endDate?: string) => {
    const tipo = typeOverride || reportConfig.type;
    const ini = startDate ?? reportConfig.startDate;
    const fim = endDate ?? reportConfig.endDate;
    if (!tipo) return showNotification('Selecione um tipo de relatório primeiro.', 'error');
    if (tipo !== 'SALES_CSV') {
      setShowReportModal(true);
      return;
    }
    const csv = buildSalesCsv(orders, users, ini, fim);
    if (!csv || !csv.csv || csv.linhas.length === 0) return showNotification('Nenhuma venda encontrada para o período.', 'error');
    const blob = new Blob([csv.csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `movimentacao-vendas-${getLocalDateStr()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showNotification(`CSV gerado com ${csv.linhas.length} vendas para o contador.`, 'success');
  };

  const handleRejectOrder = async () => {
    if (!selectedOrderDetails) return;
    if (!rejectReason.trim()) return showNotification('É obrigatório informar o motivo.', 'error');
    setIsRejecting(true);
    try {
      // ESTORNO NO SERVIDOR (restaura estoque atomicamente) — necessário porque
      // pedidos PIX debitam estoque na criação. Usar updateOrderStatus p/ cancelar
      // SEM restaurar estoque vaza inventário.
      await refundOrder(selectedOrderDetails.id, `REPROVADO: ${rejectReason}`);
      await sendSystemMessage({
        title: `Pedido #${selectedOrderDetails.id.slice(0, 6)} Reprovado`,
        content: `Seu pedido foi reprovado pela administração. Motivo: ${rejectReason}`,
        targetUserId: selectedOrderDetails.userId,
        type: 'error'
      });
      setRejectReason('');
      setIsRejecting(false);
      setTimeout(() => setSelectedOrderDetails(null), 1200);
    } catch (e: any) {
      showNotification('Erro ao reprovar pedido: ' + e.message, 'error');
    } finally {
      setIsRejecting(false);
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
        const d = toDate(o.date); if (!d) return false; d.setHours(0, 0, 0, 0);
        return d.getTime() === now.getTime();
      } catch (e) { return false; }
    });
  }, [orders]);

  const stats = useMemo(() => {
    // Receita definida em UM lugar só (ehReceita) — cards e Financeiro agora batem.
    const totalEntries = (orders || []).filter(o => ehReceita(o.status)).reduce((a, b) => a + (Number(b.total) || 0), 0);
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
          const od = toDate(o.date); if (!od) return false;
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
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center text-slate-900">
        <div className="w-16 h-16 border-4 border-[var(--primary-color)] border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-sm font-black tracking-widest uppercase text-blue-600">Carregando painel...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-main)] text-slate-900 flex font-sans overflow-x-hidden">
      
      {/* Sidebar Integration */}
      <AdminSidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        pendingOrdersCount={orderPendingCount}
        pendingDepositsCount={depositPendingCount}
        pendingUsersCount={stats.pendingUsersCount}
        logout={logout}
        isLoggingOut={isLoggingOut}
        appName={settings?.appName || 'Mercado Fácil'}
        userName={currentUser?.name || 'Administrador'}
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
        onOpenSales={() => setShowSalesModal(true)}
        permissions={currentUser?.permissions === undefined ? ['all'] : currentUser.permissions}
        isMaster={isMaster}
        primaryColor={settings?.primaryColor || '#10b981'}
        userRole={userRole}
      />

      {/* Main Administrative Container */}
      <div className="flex-1 lg:ml-64 flex flex-col min-h-screen w-full relative">

        {/* Alerta profissional de cota: o sistema detectou limite do plano
            (Spark) — em vez de falhar silenciosamente, orienta a ação certa. */}
        {cotaCritica && (
          <div className="sticky top-0 z-40 px-6 py-3 bg-amber-500 text-white flex items-center gap-3 shadow-lg">
            <AlertTriangle size={18} className="shrink-0" />
            <p className="text-[11px] font-black uppercase tracking-wide leading-snug flex-1">
              Cota gratuita do Firebase atingida hoje. Partes do sistema podem ficar temporariamente indisponíveis até a cota renovar (meia-noite UTC). Para funcionamento livre e permanente (1.500 usuários/dia), ative o plano Blaze: Firebase Console → Usage e Billing → Upgrade.
            </p>
            <button onClick={() => window.open('https://console.firebase.google.com/u/0/project/_/usage/billing', '_blank')} className="shrink-0 bg-white text-amber-600 px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-amber-50 transition-all">
              Ativar agora
            </button>
          </div>
        )}
        
        {/* Vendas OFFLINE pendentes/sincronização */}
        <div className="px-6 pt-4">
          <OfflineSalesBanner />
        </div>

        {/* Manutenção: faixa compacta com avisos automáticos + checklist (admin-only) */}
        <div className="px-6 pt-4">
          <MaintenanceCenter
            variant="banner"
            products={products}
            orders={orders}
            walletTx={walletTx}
            users={users}
            cotaCritica={cotaCritica}
            currentUser={currentUser}
            onNavigate={goToTab}
          />
        </div>

        {/* Dynamic Header */}
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 px-4 sm:px-6 py-3 flex items-center justify-between backdrop-blur transition-all duration-300">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="lg:hidden text-slate-500 hover:bg-slate-100 p-2 rounded-lg border border-slate-200 touch-target"
            >
              {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            <div>
              <h2 className="text-base font-bold tracking-tight leading-tight text-slate-900">
                {activeTab === 'home' && 'Painel Geral'}
                {activeTab === 'orders' && 'Gerenciamento de Pedidos'}
                {activeTab === 'messages' && 'Comunicados & Mensagens'}
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
                {activeTab === 'maintenance' && 'Centro de Manutenção'}
              </h2>
              <p className="text-xs text-slate-500">
                {(settings as any)?.institutionName || 'Mercado Fácil ASSPEN'} • Sistema de Gestão Penitenciária
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3 flex-wrap justify-end">
            {!isStandalone && <span><AppDownloadButton variant="full" label="Baixar App" /></span>}
            <button onClick={() => setShowUninstallModal(true)} title="Desinstalar aplicativo" className="w-9 h-9 text-slate-500 border border-slate-200 rounded-lg flex items-center justify-center hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-all active:scale-90"><Trash2 size={17} /></button>
            <OnlineStatusIndicator />
          </div>
        </header>

        {/* Dynamic Page/Tab Content Switcher */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-6xl w-full mx-auto pb-24">
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
                <>
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
                    onOpenShortcuts={() => setShowShortcutsModal(true)}
                  />
                </>
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
                  ordersLimit={ordersLimit}
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
                  showStockEditModal={showStockEditModal}
                  setShowStockEditModal={setShowStockEditModal}
                  deleteProduct={deleteProduct}
                  xmlFile={xmlFile}
                  setXmlFile={setXmlFile}
                  handleImportXML={handleImportXML}
                  previewXmlImport={previewXmlImport}
                  margin={margin}
                  setMargin={setMargin}
                  onPrintCatalog={async () => {
                    // Busca TODOS os produtos do Firestore (sem limite do productsLimit)
                    // para garantir que o catálogo mostre tudo, não apenas os primeiros 500.
                    try {
                      const { getDocs, query: fsQuery, collection, orderBy, where, limit } = await import('firebase/firestore');
                      // Cap preventivo: evita leitura gigante de catálogo sem limite.
                      // Um catálogo de PDV raramente excede 5 mil SKUs; acima disso a
                      // impressão deve evoluir para faixas (ex.: por categoria).
                      const snap = await getDocs(fsQuery(collection(db, 'products'), orderBy('name', 'asc'), limit(5000)));
                      const allProducts = snap.docs.map(d => ({ ...d.data(), id: d.id } as Product))
                        .filter(p => (p as any).deleted !== true);
                      if (allProducts.length === 0) {
                        showNotification('Nenhum produto no catálogo para imprimir.', 'warning');
                        return;
                      }
                      abrirJanelaImpressao({ type: 'CATALOGO', data: allProducts }, settings);
                    } catch (e) {
                      console.error('Erro ao buscar todos os produtos para catálogo:', e);
                      // Fallback: usa a lista limitada do contexto
                      if (!products || products.length === 0) {
                        showNotification('Nenhum produto no catálogo para imprimir.', 'warning');
                        return;
                      }
                      abrirJanelaImpressao({ type: 'CATALOGO', data: products }, settings);
                    }
                  }}
                  mergeDuplicateProducts={mergeDuplicateProducts}
                  sanitizeCatalog={sanitizeCatalog}
                  handleResetStock={() => handleProtectedAction(resetStock, 'STOCK')}
                  loadMoreProducts={loadMoreProducts}
                  productsLimit={productsLimit}
                />
              )}

              {activeTab === 'cash' && hasPermission('cash') && (
                <AdminCashTab
                  operatorId={currentUser?.id || ''}
                  operatorName={currentUser?.name || 'Administrador'}
                  primaryColor={settings?.primaryColor || '#10b981'}
                  settings={settings}
                  orders={orders}
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
                  inmatesLimit={inmatesLimit}
                  loadMoreInmates={loadMoreInmates}
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
                  usersLimit={usersLimit}
                  loadMoreUsers={loadMoreUsers}
                  loadAllUsers={() => expandUsersLimit(2000)}
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

              {activeTab === 'messages' && hasPermission('users') && (
                <AdminMessagesTab
                  users={users}
                  messages={messages}
                  sendMessage={sendMessage}
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
                  deleteExpense={deleteExpense}
                  resetFinance={async () => { await handleProtectedAction(resetFinance, 'FINANCE'); }}
                  resetCredits={async () => { await handleProtectedAction(resetCredits, 'FINANCE'); }}
                  showNotification={showNotification}
                  loadMoreExpenses={loadMoreExpenses}
                />
              )}

              {activeTab === 'wallet' && hasPermission('wallet') && (
                <AdminWalletTab
                  walletTx={walletTx}
                  users={users}
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
                <>
                  <div className="flex gap-2 mb-6 print:hidden">
                    <button
                      onClick={() => setReportsMode('visual')}
                      className={`px-5 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center gap-2 ${reportsMode === 'visual' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'}`}
                    >
                      <BarChart3 size={16} /> Painel Visual
                    </button>
                    <button
                      onClick={() => setReportsMode('formal')}
                      className={`px-5 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center gap-2 ${reportsMode === 'formal' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'}`}
                    >
                      <FileText size={16} /> Relatórios Formais
                    </button>
                  </div>
                  {reportsMode === 'visual' ? (
                    <AdminSalesDashboard
                      orders={orders}
                      onExportCsv={(startDate, endDate) => {
                        setReportConfig({ ...reportConfig, startDate, endDate, type: 'SALES_CSV' });
                        handleExportExcel('SALES_CSV', startDate, endDate);
                      }}
                      showNotification={showNotification}
                    />
                  ) : (
                    <AdminReportsTab
                      reportConfig={reportConfig}
                      setReportConfig={setReportConfig}
                      users={users}
                      handleOpenReport={handleOpenReport}
                      handleExportExcel={handleExportExcel}
                      settings={settings}
                    />
                  )}
                </>
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

              {activeTab === 'maintenance' && (isMaster || userRole === 'admin') && (
                <AdminMaintenanceTab
                  products={products}
                  orders={orders}
                  walletTx={walletTx}
                  users={users}
                  cotaCritica={cotaCritica}
                  currentUser={currentUser}
                  onNavigate={goToTab}
                />
              )}

              {activeTab === 'settings' && (isMaster || userRole === 'admin') && (
                <AdminSettingsTab
                  isMaster={isMaster}
                  currentUserId={currentUser?.id}
                  currentUserName={currentUser?.name || currentUser?.email}
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
                  updateAdminPermissions={updateAdminPermissions}
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
          onConfirmOffline={handleConfirmOfflineSale}
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
        onConfirm={async (userId, valor, motivo, senhaMestra) => {
          await addWalletCreditDirectly(userId, valor, motivo, senhaMestra);
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
          transactions={walletTx}
        />
      )}

      {/* Global shortcuts help overlay (F1-F12 / '?') */}
      {showShortcutsModal && (
        <AdminShortcutsModal
          isOpen={showShortcutsModal}
          onClose={() => setShowShortcutsModal(false)}
        />
      )}

      {/* Uninstall app modal */}
      {showUninstallModal && (
        <UninstallModal
          isOpen={showUninstallModal}
          onClose={() => setShowUninstallModal(false)}
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
        withdrawalPassword={withdrawalPassword}
        setWithdrawalPassword={setWithdrawalPassword}
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

        showStockEditModal={showStockEditModal}
        setShowStockEditModal={setShowStockEditModal}
        validateMasterPassword={validateMasterPassword}
        currentUser={currentUser || undefined}
        showNotification={showNotification}

        viewingReceipt={viewingReceipt}
        setViewingReceipt={setViewingReceipt}

        printOrder={printOrder}
        setPrintOrder={setPrintOrder}
        settings={settings}
      />

    </div>
  );
}