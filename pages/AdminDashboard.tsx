import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useApp, buildSalesCsv } from '../context/StoreContext';
import { User, Order, Product, UserRole, WalletTransaction } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { useTheme } from '../context/ThemeContext';
import { OnlineStatusIndicator } from '../components/OnlineStatusIndicator';
import { OfflineSalesBanner } from '../components/admin/OfflineSalesBanner';
import { PageHeader, UiButton } from '../components/ui';

import { AppDownloadButton } from '../components/AppDownloadModal';
import { UninstallModal } from '../components/UninstallModal';
import { 
  ehReceita, 
  getLocalDateStr, 
  translateStatus, 
  getStatusColor, 
  isMaster as isMasterAdmin 
} from '../components/admin/adminUtils';
import { Menu, X, Banknote, Trash2, BarChart3, FileText, AlertTriangle } from 'lucide-react';

// Import all modular subcomponents
import { AdminSidebar } from '../components/admin/AdminSidebar';
import { AdminHomeTab } from '../components/admin/AdminHomeTab';
import { AdminMaintenanceTab } from '../components/admin/AdminMaintenanceTab';
import { AdminAuditTab } from '../components/admin/AdminAuditTab';
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
import { abrirJanelaImpressao } from '../utils/printUtils';
import { toDate } from '../utils/dateUtils';
import { usePermissions } from '../hooks/usePermissions';
import { carregarPedidosDoPeriodo } from '../hooks/useReportData';

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

export function AdminDashboard() {
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
    createAdminUser,
    updateAdminPermissions,
    resetStock,
    resetFinance,
    resetSystem,
    sendSystemMessage,
    updateAdminPassword,
    validateMasterPassword,
    defineMasterPassword,
    masterPasswordStatus,
    addPreRegisteredInmate,
    deletePreRegisteredInmate,
    preRegisteredInmates,
    approveWalletTransaction,
    rejectWalletTransaction,
    getWalletTransactions,
    withdrawWalletCredit,
    adminDirectSale,
    addWalletCreditDirectly,
    refundOrder,
    resetCredits,
    mergeDuplicateProducts,
    toggleUserCredit,
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
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  
  // Filters & Searches
  const [orderSearch, setOrderSearch] = useState('');
  const [orderViewMode, setOrderViewMode] = useState<'grid' | 'list'>('list');
  
  const [productSearch, setProductSearch] = useState('');
  const [productViewMode, setProductViewMode] = useState<'grid' | 'list'>('list');
  const [xmlFile, setXmlFile] = useState<File | null>(null);
  const [margin, setMargin] = useState('30');
  
  const [newInmate, setNewInmate] = useState({ name: '', cpf: '', unit: '' });
  
  const [userSearch, setUserSearch] = useState('');
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
    selectedUser: null as User | null,
    paymentFilter: 'TODAS',
    statusFilter: 'TODOS',
    clienteFilter: '',
    operadorFilter: ''
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

  // Rejections and Refunds
  const [isRejecting, setIsRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  // Security Auth Modals
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [pendingConfigAction, setPendingConfigAction] = useState<((senhaMestra?: string) => void) | null>(null);
  const [authPass, setAuthPass] = useState('');
  const [isSettingsAuthenticated, setIsSettingsAuthenticated] = useState(false);

  // 3. Firestore Real-time Listeners
  useEffect(() => {
    // Histórico global de carteiras: somente admin (vendedor não lista a
    // coleção — as regras negam e o erro não adianta nada).
    if (currentUser?.role !== UserRole.ADMIN) {
      setLoadingWallet(false);
      return;
    }
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
  }, [currentUser?.role]);

  // Recarrega a lista de transações sob demanda.
  // Necessária quando a aprovação FALHA: o servidor pode ter mudado o status
  // (ex.: comprovante duplicado → rejeitado automaticamente) mesmo devolvendo
  // erro. O onSnapshot acima atualiza sozinho, mas pode atrasar; aqui o admin
  // vê o estado real na hora.
  const recarregarTransacoes = React.useCallback(async () => {
    if (currentUser?.role !== UserRole.ADMIN) return;
    try {
      const txs = await getWalletTransactions();
      setWalletTx(txs);
    } catch (e) {
      console.error("Erro ao recarregar transações da carteira:", e);
    }
  }, [currentUser?.role, getWalletTransactions]);

  // 4. Role-Based Access Control
  const { role: userRole, loading: roleLoading } = usePermissions(currentUser?.id);

  // 4.1. Permissões definitivas do master (independente de leitura de doc)
const isMaster = isMasterAdmin(currentUser);

  // 5. Permission Helpers
  // useCallback: identidade estável p/ deps de efeutos/filhos (evita re-run em loop).
  const hasPermission = React.useCallback((perm: string) => {
    if (isMaster) return true;
    // Operador de caixa (vendedor): acesso fixo ao PDV e operação própria.
    if (userRole === 'operator') {
      return ['sales', 'orders', 'products', 'cash'].includes(perm);
    }
    const perms = currentUser?.permissions;
    if (perms === undefined) return true; // admin legado (sem campo) = acesso total
    if (perms.includes('all')) return true;
    return perms.includes(perm);
  }, [isMaster, userRole, currentUser?.permissions]);

  // Fonte única de verdade para verificação de acesso a abas.
  // Usada por: goToTab, redirect effect, sidebar, render guards.
  const canAccessTab = React.useCallback((tab: string) => {
    const tabPermissions: Record<string, string> = {
      'orders': 'orders',
      'products': 'products',
      'sales': 'sales',
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
      // Abas master-only (renderizam só para isMaster || userRole === 'admin').
      // Sem esta lista elas entravam por QUALQUER atalho: o admin chegava e
      // via só o cabeçalho, com o corpo em branco. 'settings' ainda usava a
      // permissão 'reports', que não é a condição real de render.
      'settings': '',
      'maintenance': '',
      // 'audit' renderiza com hasPermission('finance') — não é master-only.
      'audit': 'finance',
    };
    const needPerm = tabPermissions[tab];
    const masterOnly = tab in tabPermissions && tabPermissions[tab] === '';
    return masterOnly ? (isMaster || userRole === 'admin') : (!needPerm || hasPermission(needPerm));
}, [isMaster, userRole, hasPermission]);

  // Redirect blocked tabs based on role (defense-in-depth).
  // O master principal NUNCA é bloqueado/redirecionado, mesmo se a leitura de permissões falhar.
  // Usa canAccessTab como fonte única de verdade para consistência com goToTab e sidebar.
  useEffect(() => {
    if (roleLoading) return;
    if (!canAccessTab(activeTab)) {
      setActiveTab('home');
    }
  }, [canAccessTab, activeTab, roleLoading]);

  // Navegação centralizada com verificação de permissão.
  // Memoizada para identidade estável (evita re-renders filhos e garante que atalhos F1-F12 usem a versão atual).
  const goToTab = React.useCallback((tab: string) => {
    if (canAccessTab(tab)) {
      setActiveTab(tab);
    } else {
      showNotification('Permissão negada para esta seção.', 'error');
    }
  }, [canAccessTab, setActiveTab]);

  // ATALHOS GLOBAIS F1-F12 + '?' — funcionam em qualquer aba do painel.
  // Guardas: nada de atalho com janela aberta, nem digitando em campos.
  const shortcutsModalOpen = [showSalesModal, showReportModal, showShortcutsModal, showProductModal, showWithdrawalModal, showAuthModal, historyModalCpf, viewingReceipt, selectedOrderDetails, selectedWalletTx, viewingUser, manualCreditTarget, showUninstallModal].some(Boolean);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) return;
      // Regex exata para F1-F12 (evita falso positivo para tecla 'F' sozinha).
      const isFKey = /^F([1-9]|1[0-2])$/.test(e.key);
      if (!isFKey && !(e.key === '?')) return;
      if (shortcutsModalOpen) return;
      e.preventDefault();
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
    paymentMethod: 'PIX' | 'WALLET' | 'CASH' | 'MIXED' | 'FIADO' | 'FIADO_30', 
    total: number, 
    payments?: { method: 'PIX' | 'WALLET' | 'CASH' | 'CARD' | 'FIADO' | 'FIADO_30'; amount: number }[], 
    change?: number,
    customerAccountId?: string,
    clientToken?: string,
    jointWallet?: { secondUserId: string; secondWalletAmount: number },
    cardBrand?: string,
    fiado30UserId?: string,
    senhaPrimaria?: string,
    senhaSecundaria?: string,
    sessaoCaixaId?: string,
    descontoPct?: number
  ) => {
    const res = await adminDirectSale(targetUserId, items, paymentMethod, total, payments, change, customerAccountId, clientToken, jointWallet, cardBrand, fiado30UserId, senhaPrimaria, senhaSecundaria, sessaoCaixaId, descontoPct);
    if (!res) {
      throw new Error('A venda não foi confirmada pelo servidor. Verifique sua internet e tente novamente.');
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
    clientToken?: string,
    cardBrand?: string,
    sessaoCaixaId?: string
  ) => {
    const res = await registrarVendaOffline(targetUserId, items, paymentMethod, total, payments, change, customerAccountId, cardBrand, sessaoCaixaId, clientToken);
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
      const ok = await addPreRegisteredInmate({ name: newInmate.name, cpf: newInmate.cpf, unit: newInmate.unit || '' });
      // O contexto já exibe o toast de sucesso/erro; limpa o form só em sucesso.
      if (ok) setNewInmate({ name: '', cpf: '', unit: '' });
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

  const handleImportXML = () => {
    if (!xmlFile) {
      showNotification('Selecione um arquivo XML.', 'error');
      return;
    }
    handleProtectedAction(async (senhaMestra: string) => {
      try {
        // Margem em PERCENTUAL (30 = +30%): quem soma é o servidor
        // (1 + margem/100). Dividir aqui por 100 dobrava a divisão e o preço
        // saía ~igual ao custo. Não-numérico vira 0.
        const margemPct = parseFloat(margin);
        await importXmlProduct(xmlFile, Number.isFinite(margemPct) ? margemPct : 0, senhaMestra);
        setXmlFile(null);
        showNotification('XML importado com sucesso!', 'success');
      } catch (error: any) {
        showNotification(error.message || 'Erro ao importar XML.', 'error');
      }
    });
  };

  const handleProtectedAction = (action: (senhaMestra?: string) => void) => {
    setPendingConfigAction(() => action);
    setShowAuthModal(true);
  };

  const handleAuthConfirm = async () => {
    try {
      const inputPass = (authPass || '').trim();
      const status = await masterPasswordStatus();
      if (!status.definida) {
        // Senha mestra ainda não configurada: BLOQUEIA a ação pendente. Antes
        // o callback rodava sem senha e TODAS as callables de 2º fator
        // (importXmlProduct, zerarCarteiras...) recusavam depois do clique.
        // A configuração da senha acontece em Configurações — não aqui.
        setShowAuthModal(false);
        setAuthPass('');
        setPendingConfigAction(null);
        showNotification('Senha mestra ainda não configurada. Defina-a em Configurações antes de executar esta ação.', 'error');
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
        // Repassa a senha validada para a ação: callables de 2º fator
        // (zerarCarteiras, resetarSistemaTotal...) exigem senhaMestra no payload.
        pendingConfigAction(inputPass);
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

  // Exporta o CSV direto do Firestore, não do array `orders` do contexto: esse
  // array é truncado (50) para o painel não pesar, e um CSV do contador com
  // total subestimado é um erro contábil difícil de detectar depois.
  const handleExportExcel = async (typeOverride?: string, startDate?: string, endDate?: string) => {
    const tipo = typeOverride || reportConfig.type;
    const ini = startDate ?? reportConfig.startDate;
    const fim = endDate ?? reportConfig.endDate;
    if (!tipo) return showNotification('Selecione um tipo de relatório primeiro.', 'error');
    if (tipo !== 'SALES_CSV') {
      setShowReportModal(true);
      return;
    }
    showNotification('Gerando CSV do período completo...', 'info');
    const { itens, erro } = await carregarPedidosDoPeriodo(ini, fim);
        // Sem este bloqueio, uma falha de índice/permissão gerava um CSV com
        // apenas as vendas do cache local e a notificação dizia "gerado com N
        // vendas" — o contador receberia um arquivo incompleto sem aviso.
        if (erro) {
          console.error('[CSV vendas] leitura do período falhou', erro);
          return showNotification('Não foi possível ler o período completo. O CSV não foi gerado para evitar totais incorretos. Verifique os índices do Firestore.', 'error');
        }
        const csv = buildSalesCsv(itens, users, ini, fim);
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

  const handleRejectOrder = () => {
    if (!selectedOrderDetails) return;
    if (!rejectReason.trim()) return showNotification('É obrigatório informar o motivo.', 'error');
    // Abre modal de senha mestra; ao confirmar, executa o estorno no servidor
    handleProtectedAction(async (senhaMestra: string) => {
      setIsRejecting(true);
      try {
        // ESTORNO NO SERVIDOR (restaura estoque atomicamente) — necessário porque
        // pedidos PIX debitam estoque na criação. Usar updateOrderStatus p/ cancelar
        // SEM restaurar estoque vaza inventário.
        await refundOrder(selectedOrderDetails.id, `REPROVADO: ${rejectReason}`, { senhaMestra });
        await sendSystemMessage({
          title: `Pedido #${selectedOrderDetails.id.slice(0, 6)} Reprovado`,
          content: `Seu pedido foi reprovado pela administração. Motivo: ${rejectReason}`,
          targetUserId: selectedOrderDetails.userId,
          type: 'error'
        });
        setRejectReason('');
        setTimeout(() => setSelectedOrderDetails(null), 1200);
        showNotification('Pedido reprovado com sucesso!', 'success');
      } catch (e: any) {
        showNotification('Erro ao reprovar pedido: ' + e.message, 'error');
      } finally {
        setIsRejecting(false);
      }
    });
  };

  const handleDownloadSource = () => {
    showNotification('O código fonte do projeto está disponível no repositório Git do sistema.', 'info');
  };

  const handleBuildExe = () => {
    showNotification('Esta versão é web (PWA). Instale pelo navegador usando o botão de instalação.', 'info');
  };

  // Helper local para normalizar status (usado em vários memos)
  const normStatus = (status: string | undefined): string => String(status || '').toLowerCase();

  // 7. Computed Statistics and Graph Data
  const filteredOrdersForHome = useMemo(() => {
    const now = new Date(); now.setHours(0, 0, 0, 0);
    return (orders || []).filter(o => {
      if (!ehReceita(o.status)) return false;
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
    
    const salesTotal = filteredOrdersForHome.reduce((a, b) => a + (Number(b.total) || 0), 0);
    const ordersCount = filteredOrdersForHome.length;
    const pendingUsersCount = (users || []).filter(u => !u.approved && u.role === UserRole.FAMILY).length;

    return {
      totalIn: totalEntries,
      totalOut: totalExits,
      pendingOrders,
      pendingDeposits,
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
          return od.getDate() === d.getDate() && od.getMonth() === d.getMonth() && ehReceita(o.status);
        } catch (e) { return false; }
      });
      const total = dayOrders.reduce((acc, o) => acc + (Number(o.total) || 0), 0);
      data.push({ name: dateStr, vendas: total });
    }
    return data;
  }, [orders]);

return (
    <div className="min-h-screen bg-[var(--bg-main)] text-slate-900 flex font-sans overflow-x-hidden">
       
       {/* Sidebar Integration */}
<AdminSidebar
        activeTab={activeTab}
        setActiveTab={goToTab}
        pendingOrdersCount={stats.pendingOrders}
        pendingDepositsCount={stats.pendingDeposits}
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
        userRole={userRole}
        canAccessTab={canAccessTab}
      />

      {/* Main Administrative Container */}
      <div className="flex-1 md:ml-64 flex flex-col min-h-screen w-full relative">

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
        
        {/* Vendas OFFLINE pendentes/sincronização.
            O respiro fica DENTRO do banner: quando ele não tem nada a
            mostrar (retorna null, caso normal), o wrapper sem padding some
            junto. Antes sobravam 32px vazios no topo de toda tela. */}
        <OfflineSalesBanner />

        {/* Manutenção: faixa compacta com avisos automáticos + checklist (admin-only) */}
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

        {/* Dynamic Header */}
        <PageHeader
          menuButton={
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="md:hidden text-slate-500 hover:bg-slate-100 p-2 rounded-lg border border-slate-200 touch-target"
            >
              {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          }
          icon={<Banknote size={18} />}
          title={
            <>
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
              {activeTab === 'customers' && 'Contas a Pagar (Fiado / Crédito)'}
              {activeTab === 'settings' && 'Parâmetros Administrativos'}
              {activeTab === 'maintenance' && 'Centro de Manutenção'}
              {activeTab === 'audit' && 'Auditoria de Anomalias'}
            </>
          }
          subtitle={((settings as any)?.institutionName || 'Mercado Fácil ASSPEN') + ' • Sistema de Gestão Penitenciária'}
          actions={
            <>
              {!isStandalone && <span><AppDownloadButton variant="full" label="Baixar App" /></span>}
              <UiButton variant="ghost" size="sm" icon={<Trash2 size={17} />} onClick={() => setShowUninstallModal(true)} title="Desinstalar aplicativo" aria-label="Desinstalar aplicativo" className="w-9 h-9 text-slate-500 border border-slate-200 rounded-lg hover:bg-red-50 hover:text-red-500 hover:border-red-200" />
              <OnlineStatusIndicator />
            </>
          }
        />

        {/* Dynamic Page/Tab Content Switcher */}
        {/* Padding de respiro fica AQUI, em um único nível. Antes este <main>
            tinha pb-24 (96px) e cada aba somava mais pb-20 (80px) — 176px de
            área morta no fim de TODA tela. Não existe barra fixa inferior para
            compensar (a sidebar é lateral), então o extra não servia a nada. */}
        <main className="flex-1 min-w-0 w-full p-4 sm:p-6 lg:p-8 lg:pb-12">
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
                    setActiveTab={goToTab}
                    setShowProductModal={setShowProductModal}
                    filterType="day"
                    orders={orders}
                    products={products}
                    walletTx={walletTx}
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
                  handleResetStock={() => handleProtectedAction(resetStock)}
                  onRequestMasterPassword={handleProtectedAction}
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
                  onRequestMasterPassword={handleProtectedAction}
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
                  resetFinance={async () => { await handleProtectedAction(resetFinance); }}
                  resetCredits={async () => { await handleProtectedAction(resetCredits); }}
                  showNotification={showNotification}
                  loadMoreExpenses={loadMoreExpenses}
                  ordersLimit={ordersLimit}
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
                <AdminCustomersTab
                  onRequestMasterPassword={handleProtectedAction}
                />
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
                  resetCredits={async () => { await handleProtectedAction(resetCredits); }}
                />
              )}

              {activeTab === 'audit' && hasPermission('finance') && <AdminAuditTab />}

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
                  resetStock={() => handleProtectedAction(resetStock)}
                  resetFinance={() => handleProtectedAction(resetFinance)}
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
            // NÃO fecha o modal aqui: em caso de erro o `catch` do próprio modal
            // precisa rodar para traduzir a causa ("comprovante já utilizado")
            // e manter a prova visível. Fechar aqui zerava a mensagem e o admin
            // só veria um toast genérico. O modal fecha sozinho no SUCESSO.
            await approveWalletTransaction(id);
          }}
          onReject={async (id) => {
            await rejectWalletTransaction(id);
          }}
          onRefresh={() => recarregarTransacoes()}
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