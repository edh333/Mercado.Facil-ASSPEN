import React, { useState, useEffect, useMemo, useRef } from 'react';
import { X, Search, ShoppingCart, UserCircle2, Scan, CreditCard, 
DollarSign, Wallet, Package, ChevronLeft, Plus, Minus, Check, Volume2, VolumeX, Box, 
Trash2, RefreshCw, Landmark, Lock, LogIn, LogOut, AlertTriangle, CheckCircle, 
BookOpen, Printer, BarChart3, Calendar, Users2, Clock, Undo2, RotateCcw, PauseCircle, History, Tag } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Product, User, UserRole, Order, AppConfig, CustomerAccount } from '../../types';
import { getCustomerAccounts } from '../../utils/customerUtils';
import { filtrarClientesPdv } from '../../utils/pdvSearch';
import { motion, AnimatePresence } from 'framer-motion';
import { formatarMoeda, parseMoeda, generatePixPayload as generatePix, isAdminRole } from '../../utils';
import { getActiveSession, openCashSession, addSupplement, addWithdrawal, closeCashSession, CashSession } from '../../utils/cashSession';
import { imprimirSilenciosoFiscal, imprimirComPrioridadeFiscal } from '../../utils/printUtils';
import ConfirmacaoDestrutiva from './ConfirmacaoDestrutiva';
import RefundSaleModal from './RefundSaleModal';
import { montarPagamentoPdv, calcularDenominacoes, arredondarCentavos } from '../../utils/pdvPayment';
import { useApp } from '../../context/StoreContext';

interface AdminSalesModalProps {
  isOpen: boolean;
  onClose: () => void;
  users: User[];
  products: Product[];
  orders?: Order[];
  onConfirm: (targetUserId: string, items: any[], paymentMethod: 'PIX' | 'WALLET' | 'CASH' | 'CARD' | 'MIXED' | 'FIADO' | 'FIADO_30', total: number, payments?: {method: 'PIX' | 'WALLET' | 'CASH' | 'CARD' | 'FIADO' | 'FIADO_30', amount: number}[], change?: number, customerAccountId?: string, clientToken?: string, jointWallet?: { secondUserId: string; secondWalletAmount: number }, cardBrand?: string, fiado30UserId?: string, senhaPrimaria?: string, senhaSecundaria?: string) => Promise<any>;
  onConfirmOffline?: (targetUserId: string, items: any[], paymentMethod: 'PIX' | 'WALLET' | 'CASH' | 'CARD' | 'MIXED' | 'FIADO' | 'FIADO_30', total: number, payments?: {method: 'PIX' | 'WALLET' | 'CASH' | 'CARD' | 'FIADO' | 'FIADO_30', amount: number}[], change?: number, customerAccountId?: string, cardBrand?: string, fiado30UserId?: string) => Promise<any>;
  setPrintOrder?: (order: any) => void;
  settings?: AppConfig;
  currentUser?: User;
}

// AudioContext compartilhado (evita vazamento de contexto por clique → travamento do navegador)
let sharedAudioCtx: AudioContext | null = null;

export const AdminSalesModalDefault: React.FC<AdminSalesModalProps> = ({
  isOpen, onClose, users, products, orders = [], onConfirm, setPrintOrder, settings, currentUser, onConfirmOffline
}) => {
  const [carrinho, setCarrinho] = useState<any[]>([]);
  const [clienteSelecionado, setClienteSelecionado] = useState<string>('');
  const [buscaCliente, setBuscaCliente] = useState('');
  const [codigoProduto, setCodigoProduto] = useState('');
  const [mostrarListaClientes, setMostrarListaClientes] = useState(false);
  const [formaPagamento, setFormaPagamento] = useState<'PIX' | 'WALLET' | 'CASH' | 'CARD' | 'MIXED' | 'FIADO' | 'FIADO_30'>('PIX');
  const [valorMisto, setValorMisto] = useState({ PIX: '', WALLET: '', CASH: '' });
  const [valorRecebido, setValorRecebido] = useState('');
  const [processando, setProcessando] = useState(false);
  const [ultimoPedido, setUltimoPedido] = useState<Order | null>(null);
  const [modalPagamento, setModalPagamento] = useState(false);
  const [mobileTab, setMobileTab] = useState<'catalog' | 'cart'>('catalog');
  const [pixCopied, setPixCopied] = useState(false);
  const [pixConfirmado, setPixConfirmado] = useState(false);
  const [bandeiraCartao, setBandeiraCartao] = useState('');
  const [cardConfirmado, setCardConfirmado] = useState(false);
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth < 1024 : true);
  const [isSoundEnabled, setIsSoundEnabled] = useState(true);
  const [showProductModal, setShowProductModal] = useState(false);
  const [productModalSearch, setProductModalSearch] = useState('');
  const [produtoPrecoDinamico, setProdutoPrecoDinamico] = useState<{ produto: Product; preco: string } | null>(null);

  // ── Novas opções PDV: estorno, última venda, suspensas ──
  const { refundOrder, showNotification, validateMasterPassword, validateDualMasterPassword } = useApp();
  const [ultimaVenda, setUltimaVenda] = useState<Order | null>(null);
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refundSelected, setRefundSelected] = useState<Order | null>(null);
  const [showSuspendedList, setShowSuspendedList] = useState(false);
  const [suspendedCarts, setSuspendedCarts] = useState<{ id: string; items: any[]; clienteId: string; clienteNome: string; total: number; createdAt: string }[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('pdv_suspended_carts') || '[]');
    } catch {
      return [];
    }
  });
  // Conirmações destrutivas padronizadas (substituem window.confirm)
  const [confirmacaoLimpar, setConfirmacaoLimpar] = useState<'carrinho' | 'venda' | null>(null);
  const [confirmandoDesfazer, setConfirmandoDesfazer] = useState(false);
  const [confirmandoDescartarId, setConfirmandoDescartarId] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem('pdv_suspended_carts', JSON.stringify(suspendedCarts));
    } catch { /* noop */ }
  }, [suspendedCarts]);

  // ── Resumo de Vendas (por dia / por cliente) ──
  const [showSalesPanel, setShowSalesPanel] = useState(false);
  const [salesTab, setSalesTab] = useState<'day' | 'client'>('day');
  const [salesPeriod, setSalesPeriod] = useState<'today' | '7' | '30' | 'all'>('today');
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  // ── Fiado / Customer Account State ──
  const [customerAccounts, setCustomerAccounts] = useState<CustomerAccount[]>([]);
  const [selectedCustomerAccount, setSelectedCustomerAccount] = useState<CustomerAccount | null>(null);
  const [customerAccountSearch, setCustomerAccountSearch] = useState('');
  const [customerAccountsLoaded, setCustomerAccountsLoaded] = useState(false);

  // ── Fiado: confirmação de DUPLA senha (primária + secundária) antes de finalizar ──
  const [confirmandoFiado, setConfirmandoFiado] = useState(false);
  const [senhaFiadoPrimaria, setSenhaFiadoPrimaria] = useState('');
  const [senhaFiadoSecundaria, setSenhaFiadoSecundaria] = useState('');
  const [senhaFiadoErro, setSenhaFiadoErro] = useState('');
  const [senhaFiadoProcessando, setSenhaFiadoProcessando] = useState(false);

  // ── Fiado 30 dias: seleção de usuário + DUPLA senha mestra ──
  const [fiado30UserId, setFiado30UserId] = useState<string>('');
  const [fiado30Search, setFiado30Search] = useState('');
  const [confirmandoFiado30, setConfirmandoFiado30] = useState(false);
  const [senhaFiado30Primaria, setSenhaFiado30Primaria] = useState('');
  const [senhaFiado30Secundaria, setSenhaFiado30Secundaria] = useState('');
  const [senhaFiado30Erro, setSenhaFiado30Erro] = useState('');
  const [senhaFiado30Processando, setSenhaFiado30Processando] = useState(false);

  // Token de idempotência da venda: gerado UMA vez por venda lógica (muda quando
  // o carrinho/cliente/pagamento mudam). Reenvios da MESMA venda (timeout/retry
  // após resposta perdida) reutilizam o token e o servidor devolve o pedido já
  // criado — nunca debita 2x.
  const [saleToken, setSaleToken] = useState<string>(() => crypto.randomUUID());
  useEffect(() => {
    setSaleToken(crypto.randomUUID());
  }, [carrinho, clienteSelecionado, formaPagamento, selectedCustomerAccount?.id, fiado30UserId]);

  // Load customer accounts when modal opens
  useEffect(() => {
    if (isOpen && !customerAccountsLoaded) {
      getCustomerAccounts().then(setCustomerAccounts).catch(console.error);
      setCustomerAccountsLoaded(true);
    }
  }, [isOpen, customerAccountsLoaded]);

  // ── Venda em Dupla (Split Joint Wallet) State ──
  const [isJointWalletMode, setIsJointWalletMode] = useState(false);
  const [secondUserId, setSecondUserId] = useState('');
  const [secondUserSearch, setSecondUserSearch] = useState('');
  const [secondWalletAmountInput, setSecondWalletAmountInput] = useState('');
  const [confirmandoJointSenha, setConfirmandoJointSenha] = useState(false);
  const [jointSenhaAdmin, setJointSenhaAdmin] = useState('');
  const [jointSenhaAdminErro, setJointSenhaAdminErro] = useState('');
  const [jointSenhaProcessando, setJointSenhaProcessando] = useState(false);
  const [jointAdminAuthorized, setJointAdminAuthorized] = useState(false);

  const filteredSecondUsers = useMemo(() => {
    if (!secondUserSearch || secondUserSearch.length < 2) return [];
    const query = secondUserSearch.toLowerCase().trim();
    return users.filter(u =>
      u.id !== clienteSelecionado &&
      ((u.name || '').toLowerCase().includes(query) ||
       (u.cpf || '').includes(query) ||
       (u.inmateCpf || '').includes(query) ||
       (u.inmateName || '').toLowerCase().includes(query))
    ).slice(0, 10);
  }, [users, secondUserSearch, clienteSelecionado]);

  const secondUserObj = useMemo(() => {
    return users.find(u => u.id === secondUserId) || null;
  }, [users, secondUserId]);

  const handleAutorizarJointWallet = async () => {
    if (jointSenhaProcessando) return;
    setJointSenhaProcessando(true);
    setJointSenhaAdminErro('');
    try {
      const senha = (jointSenhaAdmin || '').trim();
      if (!senha) {
        setJointSenhaAdminErro('Digite a senha para autorizar.');
        return;
      }
      const ok = await validateMasterPassword(senha);
      if (!ok) {
        setJointSenhaAdminErro('Senha incorreta. Tente novamente.');
        return;
      }
      setJointAdminAuthorized(true);
      setIsJointWalletMode(true);
      setConfirmandoJointSenha(false);
      const clienteObj = users.find(u => u.id === clienteSelecionado);
      const saldo1 = clienteObj ? (clienteObj.walletBalance || 0) : 0;
      const falta = Math.max(0, totalCarrinho - Math.max(0, saldo1));
      setSecondWalletAmountInput(falta.toFixed(2));
    } catch (e: any) {
      setJointSenhaAdminErro(e.message || 'Erro ao validar senha.');
    } finally {
      setJointSenhaProcessando(false);
    }
  };

  // Reset fiado + PIX + Venda em Dupla state when payment modal closes
  useEffect(() => {
    if (!modalPagamento) {
      fiadoVinculoAtivo.current = null;
      fiadoDesvinculadoRef.current = false;
      setSelectedCustomerAccount(null);
      setCustomerAccountSearch('');
      setConfirmandoFiado(false);
      setSenhaFiadoPrimaria('');
      setSenhaFiadoSecundaria('');
      setSenhaFiadoErro('');
      setPixConfirmado(false);
      setBandeiraCartao('');
      setCardConfirmado(false);
      setValorMisto({ PIX: '', WALLET: '', CASH: '' });
      setValorRecebido('');
      setIsJointWalletMode(false);
      setSecondUserId('');
      setSecondUserSearch('');
      setSecondWalletAmountInput('');
      setConfirmandoJointSenha(false);
      setJointSenhaAdmin('');
      setJointSenhaAdminErro('');
      setJointAdminAuthorized(false);
    }
  }, [modalPagamento]);

  // ── Cash Session State ──
  const [cashSession, setCashSession] = useState<CashSession | null>(null);
  const [cashLoading, setCashLoading] = useState(true);
  const [showCashModal, setShowCashModal] = useState<'open' | 'supplement' | 'withdrawal' | 'close' | null>(null);
  const [cashAmount, setCashAmount] = useState('');
  const [cashReason, setCashReason] = useState('');
  const [cashActionLoading, setCashActionLoading] = useState(false);
  const [closeResult, setCloseResult] = useState<{ diff: number; expected: number } | null>(null);

  const clienteInputRef = useRef<HTMLInputElement>(null);
  const clienteSearchRef = useRef<HTMLDivElement>(null);
  const produtoInputRef = useRef<HTMLInputElement>(null);
  const fiadoSearchRef = useRef<HTMLInputElement>(null);

  const checkCashSession = async () => {
    if (!currentUser?.id) return;
    setCashLoading(true);
    try {
      const active = await getActiveSession(currentUser.id);
      setCashSession(active);
    } catch {
      setCashSession(null);
    } finally {
      setCashLoading(false);
    }
  };

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setCarrinho([]);
      setClienteSelecionado('');
      setBuscaCliente('');
      setCodigoProduto('');
      setMostrarListaClientes(true);
      setUltimoPedido(null);
      setUltimaVenda(null);
      setModalPagamento(false);
      setPixConfirmado(false);
      setBandeiraCartao('');
      setCardConfirmado(false);
      setMobileTab('catalog');
      setCloseResult(null);
      setSelectedCustomerAccount(null);
      setCustomerAccountSearch('');
      setRefundSelected(null);
      fiadoVinculoAtivo.current = null;
      fiadoDesvinculadoRef.current = false;
      checkCashSession();
      getCustomerAccounts().then(setCustomerAccounts).catch(console.error);
      setTimeout(() => clienteInputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Fecha dropdown de clientes ao clicar fora
  useEffect(() => {
    if (!isOpen) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (clienteSearchRef.current && !clienteSearchRef.current.contains(e.target as Node)) {
        setMostrarListaClientes(false);
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [isOpen]);

  // AJUSTE: ATALHOS DE TECLADO PDV
  useEffect(() => {
    if (!isOpen) return;

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // F2: Foca no input de busca de produtos (código de barras)
      if (e.key === 'F2') {
        e.preventDefault();
        produtoInputRef.current?.focus();
      }
      // F4: Abre modal de catálogo de produtos com fotos
      if (e.key === 'F4') {
        e.preventDefault();
        setShowProductModal(prev => !prev);
        if (!showProductModal) setProductModalSearch('');
      }
      // F7: Cancelar Venda
      if (e.key === 'F7') {
        e.preventDefault();
        cancelarVenda();
      }
      // F8: Abre Pagamento (se cliente selecionado e carrinho não vazio)
      if (e.key === 'F8') {
        e.preventDefault();
        if (clienteSelecionado && carrinho.length > 0) {
          setPixConfirmado(false);
          setModalPagamento(true);
        }
      }
      // F9: Estorno
      if (e.key === 'F9') {
        e.preventDefault();
        abrirEstorno();
      }
      // F10: Reimprimir último cupom
      if (e.key === 'F10') {
        e.preventDefault();
        reimprimirUltimo();
      }
      // F11: Painel de Histórico de Vendas
      if (e.key === 'F11') {
        e.preventDefault();
        setShowSalesPanel(prev => !prev);
      }
      // ESC: Fecha PDV ou Modais internos (confirmações destrutivas têm prioridade)
      if (e.key === 'Escape') {
        if (confirmacaoLimpar) {
          setConfirmacaoLimpar(null);
        } else if (confirmandoDesfazer) {
          setConfirmandoDesfazer(false);
        } else if (confirmandoDescartarId) {
          setConfirmandoDescartarId(null);
        } else if (produtoPrecoDinamico) {
          setProdutoPrecoDinamico(null);
        } else if (confirmandoFiado) {
          setConfirmandoFiado(false);
          setSenhaFiadoPrimaria('');
          setSenhaFiadoSecundaria('');
          setSenhaFiadoErro('');
        } else if (modalPagamento) {
          setPixConfirmado(false);
          setModalPagamento(false);
        } else if (showRefundModal) {
          setShowRefundModal(false);
        } else if (showSuspendedList) {
          setShowSuspendedList(false);
        } else if (showProductModal) {
          setShowProductModal(false);
        } else if (showSalesPanel) {
          setShowSalesPanel(false);
        } else if (ultimoPedido) {
          // Só dispensa o cupom de sucesso — o PDV permanece aberto para nova venda.
          setUltimoPedido(null);
          setTimeout(() => produtoInputRef.current?.focus(), 50);
        } else if (mostrarListaClientes) {
          setMostrarListaClientes(false);
        } else {
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isOpen, modalPagamento, ultimoPedido, mostrarListaClientes, clienteSelecionado, carrinho.length, showProductModal, onClose, ultimaVenda, showSalesPanel, showRefundModal, showSuspendedList, confirmacaoLimpar, confirmandoDesfazer, confirmandoDescartarId, produtoPrecoDinamico, confirmandoFiado]);

  const corPrincipal = settings?.pdvColor || '#10b981'; // Default to Emerald if not set

  const todosClientes = useMemo(() => {
    if (!users) return [];
    // Consumidor geral é sintético (não vive no Firestore) — entra apenas na
    // busca do PDV; painéis administrativos usam a lista real (sem ele).
    const consumidor: User = { id: 'consumidor_geral', name: 'CONSUMIDOR GERAL', email: 'venda@balcao.com', role: UserRole.FAMILY, status: 'active', approved: true, cpf: '000.000.000-00', inmateName: 'CONSUMIDOR', inmateCpf: '000.000.000-00' };
    return [consumidor, ...users.filter(u => !isAdminRole(u.role) && u.status !== 'suspended')];
  }, [users]);

  const pixChaveDisponivel = (): string => {
    const chaves = Array.isArray(settings?.pixKeys) ? (settings.pixKeys as string[] || []) : [];
    const valida = chaves.find(k => k && k.trim());
    return (valida || settings?.cnpj || '').trim();
  };

  const mascararChavePix = (chave: string): string => {
    const c = (chave || '').trim();
    if (!c) return '';
    if (c.includes('@') || c.length <= 20) return c;
    return `•••${c.slice(-4)}`;
  };

  const gerarPixPayload = (valor: number): string => {
    const chave = pixChaveDisponivel();
    if (!chave) return '';
    const merchantName = settings?.appName || 'ASSOCIACAO ASSPEN MT';
    const city = 'PEIXOTO DE AZEVEDO';
    return generatePix(chave, merchantName, city, valor, 'MERCFACIL');
  };

  const filteredProductsForModal = useMemo(() => {
    const term = (productModalSearch || '').trim().toLowerCase();
    if (!term) return products.slice(0, 60);
    return products.filter(p => {
      const nome = (p.name || '').toLowerCase();
      const barcode = ((p as any).barcode || '').toLowerCase();
      return nome.includes(term) || barcode.includes(term) || (p.id || '').toLowerCase().includes(term);
    }).slice(0, 60);
  }, [products, productModalSearch]);

  // Busca de clientes do PDV (regra: lista vazia até o operador digitar).
  const clientesFiltrados = useMemo(
    () => filtrarClientesPdv(todosClientes, buscaCliente || ''),
    [todosClientes, buscaCliente]
  );

  const produtosFiltrados = useMemo(() => {
    const term = (codigoProduto || '').trim();
    if (!term) return products.slice(0, 60);
    const termo = term.toLowerCase();
    return products.filter(p => {
      const nome = (p.name || '').toLowerCase();
      const barcode = ((p as any).barcode || '').toLowerCase();
      return nome.includes(termo) || barcode.includes(termo) || (p.id || '').toLowerCase().includes(termo);
    }).slice(0, 60);
  }, [products, codigoProduto]);

  const cliente = useMemo(() => todosClientes.find(u => u.id === clienteSelecionado), [todosClientes, clienteSelecionado]);

  // Conta de fiado que corresponde ao consumidor JÁ selecionado no PDV
  // (casamento por CPF normalizado e, sem CPF, por nome exato). Garante que a
  // venda fiada "use o consumidor selecionado" — sem seleção duplicada.
  const contaFiadoDoCliente = useMemo(() => {
    if (!cliente) return null;
    const cpf = (cliente.cpf || '').replace(/\D/g, '');
    if (cpf) {
      const porCpf = customerAccounts.find(a => (a.cpf || '').replace(/\D/g, '') === cpf);
      if (porCpf) return porCpf;
    }
    const nome = (cliente.name || '').trim().toLowerCase();
    if (nome) {
      const porNome = customerAccounts.find(a => (a.nome || '').trim().toLowerCase() === nome);
      if (porNome) return porNome;
    }
    // Fallback: usa o próprio usuário como conta de fiado (evita busca duplicada)
    return {
      id: cliente.id,
      nome: cliente.name || cliente.inmateName || 'Cliente',
      cpf: cliente.cpf,
      telefone: cliente.phone || cliente.telefone,
      currentDebt: Number(cliente.currentDebt || 0),
      creditLimit: Number(cliente.creditLimit || 0),
      status: cliente.status,
      allowCredit: cliente.allowCredit || cliente.autorizacaoExcepcional,
      _virtual: true,
    } as any;
  }, [cliente, customerAccounts]);

  // Vínculo automático da venda fiada com o cliente JÁ escolhido no PDV.
  // Vincula UMA vez por venda; NÃO interfere quando o operador digita na busca
  // para escolher outra conta ou pede "Trocar"; re-vincula se o cliente mudar.
  const fiadoVinculoAtivo = useRef<{ userId: string; accountId: string } | null>(null);
  const fiadoDesvinculadoRef = useRef(false);

  // Cliente do PDV mudou → descarta vínculo/conta de fiado anterior (nunca
  // registrar fiado no cliente ERRADO, mesmo com conta pré-selecionada).
  useEffect(() => {
    if (fiadoVinculoAtivo.current && fiadoVinculoAtivo.current.userId !== clienteSelecionado) {
      fiadoVinculoAtivo.current = null;
      fiadoDesvinculadoRef.current = false;
      setSelectedCustomerAccount(null);
      setCustomerAccountSearch('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteSelecionado]);

  useEffect(() => {
    if (formaPagamento !== 'FIADO' || !contaFiadoDoCliente) return;
    // Operador já escolheu uma conta (manual ou vínculo anterior) — respeita.
    if (selectedCustomerAccount) return;
    // Operador digitando na busca para trocar de conta — respeita a pesquisa.
    if (customerAccountSearch.trim() !== '') return;
    // Operador clicou "Trocar" — permanece em modo manual nesta venda.
    if (fiadoDesvinculadoRef.current) return;
    setSelectedCustomerAccount(contaFiadoDoCliente);
    setCustomerAccountSearch(contaFiadoDoCliente.nome);
    fiadoVinculoAtivo.current = { userId: clienteSelecionado, accountId: contaFiadoDoCliente.id };
    fiadoDesvinculadoRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formaPagamento, contaFiadoDoCliente, clienteSelecionado, selectedCustomerAccount, customerAccountSearch]);

  // Ao escolher uma conta de fiado manualmente, vincula o consumidor (usuário)
  // correspondente — venda e débito fiado ficam na MESMA pessoa.
  const vincularConsumidorAoFiado = (ca: CustomerAccount) => {
    const cpf = (ca.cpf || '').replace(/\D/g, '');
    const alvo = todosClientes.find(u =>
      (cpf && (u.cpf || '').replace(/\D/g, '') === cpf) ||
      (!cpf && (u.name || '').trim().toLowerCase() === (ca.nome || '').trim().toLowerCase())
    );
    if (alvo) setClienteSelecionado(alvo.id);
  };

  const filteredCustomerAccounts = useMemo(() => {
    const term = customerAccountSearch.toLowerCase().trim();
    if (!term) return customerAccounts;
    return customerAccounts.filter(a =>
      (a.nome || '').toLowerCase().includes(term) ||
      (a.telefone || '').includes(term)
    );
  }, [customerAccounts, customerAccountSearch]);

  const filteredFiado30Users = useMemo(() => {
    const term = fiado30Search.toLowerCase().trim();
    const eligibleUsers = users.filter(u => {
      const creditLimit = Number(u.creditLimit || 0);
      const isBlocked = String(u.status || '').toLowerCase() === 'blocked';
      const allowCredit = u.allowCredit || u.autorizacaoExcepcional;
      return creditLimit > 0 && !isBlocked && allowCredit;
    });
    if (!term) return eligibleUsers;
    return eligibleUsers.filter(u =>
      (u.name || u.inmateName || u.nome || '').toLowerCase().includes(term) ||
      (u.telefone || u.phone || '').includes(term) ||
      (u.cpf || '').includes(term)
    );
  }, [users, fiado30Search]);

  const estaCancelado = (o: Order) => {
    const s = String(o?.status || '').toUpperCase();
    return s.startsWith('CANCEL') || s === 'REFUNDED' || s === 'RETURNED' || s === 'ESTORNADO';
  };

  // AudioContext ÚNICO e reutilizável — criar um novo por clique vaza memória e trava o navegador.
  const playAddSound = () => {
    if (!isSoundEnabled) return;
    try {
      const AC = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext | undefined;
      if (!AC) return;
      const ctx = sharedAudioCtx ?? (sharedAudioCtx = new AC());
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      oscillator.frequency.value = 1400;
      oscillator.type = 'sine';
      gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.15);
      oscillator.onended = () => {
        try { oscillator.disconnect(); gainNode.disconnect(); } catch { /* noop */ }
      };
    } catch (e) {}
  };

  const adicionarAoCarrinho = (produto: Product, forceQty?: number) => {
    if ((produto.stock ?? 0) <= 0) return;
    if ((produto.price || 0) <= 0) return;

    // Mesmo critério do servidor (functions processarVendaAdmin): promoPrice tem
    // prioridade sobre price — garante que o valor exibido/cobrado é o do servidor.
    const precoBase = (produto as any).promoPrice > 0 && (produto as any).promoPrice !== null
      ? Number((produto as any).promoPrice)
      : produto.price;

    // Produto de preço dinâmico: abre o seletor próprio em vez de adicionar direto.
    if ((produto as any).dynamicPrice) {
      playAddSound();
      setProdutoPrecoDinamico({ produto, preco: String(precoBase || 0) });
      return;
    }

    playAddSound();

    setCarrinho(prev => {
      const existente = prev.find(item => String(item.productId) === String(produto.id));
      const qtdToAdd = forceQty || 1;
      if (existente) {
        const novaQtd = existente.quantity + qtdToAdd;
        // Nunca ultrapassa o estoque (o servidor também valida, mas o operador
        // descobre antes de tentar finalizar).
        const estoqueDisp = existente.stock ?? 0;
        if (estoqueDisp <= 0 || novaQtd > estoqueDisp) {
          showNotification(`Estoque máximo para ${produto?.name || 'este item'}: ${estoqueDisp} un.`, 'info');
          return prev.map(item => String(item.productId) === String(produto.id) ? { ...item, quantity: estoqueDisp } : item);
        }
        return prev.map(item => String(item.productId) === String(produto.id) ? { ...item, quantity: novaQtd } : item);
      }
      return [{ productId: produto?.id || '', name: produto?.name || 'Produto', price: precoBase || 0, quantity: qtdToAdd, imageUrl: produto?.imageUrl || '', stock: produto?.stock || 0 }, ...prev];
    });
  };

  const confirmarPrecoDinamico = () => {
    const alvo = produtoPrecoDinamico;
    if (!alvo) return;
    const valor = parseMoeda(alvo.preco);
    if (!(valor > 0)) {
      showNotification('Informe um preço válido (maior que zero).', 'error');
      return;
    }
    const p = alvo.produto;
    const existente = carrinho.find(item => String(item.productId) === String(p.id));
    const qtdAtual = existente?.quantity || 0;
    if ((p.stock ?? 0) <= 0 || qtdAtual + 1 > (p.stock ?? 0)) {
      showNotification(`Estoque máximo para ${p?.name || 'este item'}: ${p.stock || 0} un.`, 'info');
      return;
    }
    setCarrinho(prev =>
      existente
        ? prev.map(item => String(item.productId) === String(p.id) ? { ...item, quantity: item.quantity + 1, price: valor } : item)
        : [{ productId: p?.id || '', name: p?.name || 'Produto', price: valor, quantity: 1, imageUrl: p?.imageUrl || '', stock: p?.stock || 0 }, ...prev]
    );
    setProdutoPrecoDinamico(null);
    setTimeout(() => produtoInputRef.current?.focus(), 50);
  };

  const adicionarProduto = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    let cod = (codigoProduto || '').trim();
    if (!cod) return;

    let forceQty = 1;

    // Lógica de multiplicador robusta (Ex: 5*789...)
    if (cod.includes('*')) {
      const parts = cod.split('*');
      if (parts.length === 2) {
        const qtyMatch = parts[0].match(/^\d+$/);
        if (qtyMatch) {
          forceQty = parseInt(parts[0]);
          cod = parts[1].trim();
        } else {
          // Prefixo inválido (ex: 'A*'), ignorar prefixo
          cod = parts[1].trim();
        }
      }
    }

    if (!cod) return;

    // Busca exata por código de barras/EAN/id, ignorando zeros à esquerda
    // (muitos leitores enviam 789... sem o 0 inicial do EAN-13)
    const normCod = (c: string) => String(c || '').replace(/^0+/, '').trim();
    const codNorm = normCod(cod);
    const produto = (products || []).find(p =>
      String(p.barcode || '').trim() === cod ||
      String(p.ean || '').trim() === cod ||
      String(p.id) === cod ||
      (codNorm && (normCod(p.barcode) === codNorm || normCod(p.ean) === codNorm))
    );
    if (produto) {
      adicionarAoCarrinho(produto, forceQty);
      setCodigoProduto('');
      setTimeout(() => produtoInputRef.current?.focus(), 50);
      return;
    }

    // Código numérico (leitor de barras) sem produto correspondente: feedback imediato
    if (/^\d{8,14}$/.test(cod)) {
      showNotification(`Código de barras ${cod} não encontrado no cadastro.`, 'error');
      setCodigoProduto('');
      setTimeout(() => produtoInputRef.current?.focus(), 50);
      return;
    }

    const resultados = (products || []).filter(p => {
       const nome = (p.name || '').toLowerCase();
       const barcode = ((p as any).barcode || '').toLowerCase();
       const ean = ((p as any).ean || '').toLowerCase();
       return nome.includes(cod.toLowerCase()) || barcode.includes(cod.toLowerCase()) || ean.includes(cod.toLowerCase()) || (p.id || '').toLowerCase().includes(cod.toLowerCase());
    }).slice(0, 5);

    if (resultados.length === 1) {
      adicionarAoCarrinho(resultados[0], forceQty);
      setCodigoProduto('');
      setTimeout(() => produtoInputRef.current?.focus(), 50);
    } else if (resultados.length > 1) {
      // Busca ambígua: mantém o termo digitado para o operador refinar e avisa.
      const termos = resultados.slice(0, 3).map(r => r?.name).filter(Boolean).join(' · ');
      showNotification(`${resultados.length} produtos encontrados — refine a busca. Ex.: ${termos}`, 'info');
    } else if (cod.trim().length >= 3) {
      showNotification(`Nenhum produto encontrado para "${cod.trim()}".`, 'info');
    }
  };

  const handleClienteKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (clientesFiltrados.length === 1) {
        setClienteSelecionado(clientesFiltrados[0].id);
        setBuscaCliente(clientesFiltrados[0].name);
        setMostrarListaClientes(false);
        setTimeout(() => produtoInputRef.current?.focus(), 50);
      }
    } else if (e.key === 'Escape') {
      setMostrarListaClientes(false);
      setBuscaCliente('');
    }
  };

  const handleProdutoKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      adicionarProduto();
    }
  };

  const removerDoCarrinho = (productId: string) => {
    setCarrinho(prev => prev.filter(item => String(item.productId) !== String(productId)));
    setTimeout(() => produtoInputRef.current?.focus(), 50);
  };
  const atualizarQuantidade = (productId: string, delta: number) => {
    setCarrinho(prev => prev.map(item => {
      if (String(item.productId) === String(productId)) {
        const novaQtd = item.quantity + delta;
        if (novaQtd <= 0) return null;
        if (delta > 0 && (item.stock || 0) > 0 && novaQtd > (item.stock || 0)) {
          showNotification(`Estoque máximo para este item: ${item.stock || 0} un.`, 'info');
          return { ...item, quantity: item.stock };
        }
        return { ...item, quantity: novaQtd };
      }
      return item;
    }).filter(Boolean) as any[]);
  };

  const totalCarrinho = useMemo(() => carrinho.reduce((soma, item) => arredondarCentavos(soma + item.price * item.quantity), 0), [carrinho]);

  // Preço efetivo na vitrine = MESMA regra do servidor e do carrinho
  // (promoPrice ativo substitui o price) — evita exibir um valor e cobrar outro.
  const precoEfetivoProduto = (p: any): number => {
    const promo = Number((p as any)?.promoPrice || 0);
    return promo > 0 ? promo : (Number(p?.price) || 0);
  };

  // Memoizado: o payload PIX (geração do QR) é usado várias vezes por render —
  // calcular uma única vez economiza processamento a cada tecla digitada no PDV.
  const pixPayloadCarrinho = useMemo(() => gerarPixPayload(totalCarrinho), [totalCarrinho, gerarPixPayload]);
  const pixPayloadMisto = useMemo(() => gerarPixPayload(parseMoeda(valorMisto.PIX)), [valorMisto.PIX, gerarPixPayload]);

  // Segurança extra: se o total do carrinho mudar com PIX pendente, exige nova confirmação
  useEffect(() => {
    if (modalPagamento && pixConfirmado) {
      setPixConfirmado(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalCarrinho, valorMisto.PIX]);

  const cancelarVenda = () => {
    if (carrinho.length > 0) setConfirmacaoLimpar('venda');
  };

  const abrirEstorno = () => {
    setRefundSelected(null);
    setShowRefundModal(true);
  };

  const abrirEstornoCom = (o: Order) => {
    setRefundSelected(o);
    setShowRefundModal(true);
  };

  const reimprimirUltimo = () => {
    const alvo = ultimaVenda || ultimoPedido;
    if (!alvo) {
      showNotification('Nenhuma venda realizada nesta sessão para reimprimir.', 'error');
      return;
    }
    imprimirComPrioridadeFiscal({ type: 'CUPOM', data: alvo }, settings)
      .catch(() => showNotification('Falha ao reimprimir o cupom.', 'error'));
  };

  const reimprimirPedido = (o: Order) => {
    imprimirComPrioridadeFiscal({ type: 'CUPOM', data: o }, settings)
      .catch(() => showNotification('Falha ao reimprimir o cupom.', 'error'));
  };

  const executarDesfazerUltimaVenda = async () => {
    const alvo = ultimaVenda || ultimoPedido;
    if (!alvo) {
      showNotification('Nenhuma venda para desfazer.', 'error');
      return;
    }
    try {
      await refundOrder(alvo.id, 'Desfeita no PDV pelo operador');
      const ehFiado = String(alvo.paymentMethod || '').toUpperCase() === 'FIADO';
      if (ehFiado) {
        showNotification('Venda fiada desfeita. Reverta a dívida em Contas de Clientes.', 'info');
      }
      setUltimaVenda(null);
      setUltimoPedido(null);
    } catch (e: any) {
      showNotification(e.message || 'Erro ao desfazer a venda.', 'error');
    }
  };

  const desfazerUltimaVenda = () => {
    if (!ultimaVenda && !ultimoPedido) return;
    setConfirmandoDesfazer(true);
  };

  const suspenderVenda = () => {
    if (carrinho.length === 0) return;
    const nova = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      items: [...carrinho],
      clienteId: clienteSelecionado || '',
      clienteNome: cliente?.name || 'Sem cliente',
      total: totalCarrinho,
      createdAt: new Date().toISOString()
    };
    setSuspendedCarts(prev => [nova, ...prev].slice(0, 10));
    setCarrinho([]);
    setClienteSelecionado('');
    setBuscaCliente('');
    showNotification('Venda suspensa com segurança. Use o histórico para retomar.', 'success');
  };

  const retomarVendaSuspensa = (id: string) => {
    const suspensa = suspendedCarts.find(s => s.id === id);
    if (!suspensa) return;
    setCarrinho(suspensa.items);
    setClienteSelecionado(suspensa.clienteId || '');
    setBuscaCliente(suspensa.clienteNome || '');
    setSuspendedCarts(prev => prev.filter(s => s.id !== id));
    setShowSuspendedList(false);
    showNotification('Venda restaurada. Confira os itens e finalize.', 'success');
  };

  const descartarVendaSuspensa = (id: string) => {
    setConfirmandoDescartarId(id);
  };

  // ── Cash Actions ──
  const handleCashOpen = async () => {
    const valor = parseMoeda(cashAmount);
    if (!currentUser?.id || cashAmount === '' || !(valor >= 0)) return;
    setCashActionLoading(true);
    try {
      await openCashSession(currentUser.id, currentUser.name || 'Operador', valor);
      setShowCashModal(null);
      setCashAmount('');
      checkCashSession();
    } catch (e: any) {
      showNotification(e.message || 'Erro ao abrir caixa.', 'error');
    } finally {
      setCashActionLoading(false);
    }
  };

  const handleCashSupplement = async () => {
    const valor = parseMoeda(cashAmount);
    if (!cashSession?.id || !(valor > 0) || !cashReason.trim()) return;
    setCashActionLoading(true);
    try {
      await addSupplement(cashSession.id, valor, (cashReason || '').trim());
      setShowCashModal(null);
      setCashAmount('');
      setCashReason('');
      checkCashSession();
    } catch (e: any) {
      showNotification(e.message || 'Erro ao registrar suprimento.', 'error');
    } finally {
      setCashActionLoading(false);
    }
  };

  const handleCashWithdrawal = async () => {
    const valor = parseMoeda(cashAmount);
    if (!cashSession?.id || !(valor > 0) || !cashReason.trim()) return;
    setCashActionLoading(true);
    try {
      await addWithdrawal(cashSession.id, valor, (cashReason || '').trim());
      setShowCashModal(null);
      setCashAmount('');
      setCashReason('');
      checkCashSession();
    } catch (e: any) {
      showNotification(e.message || 'Erro ao registrar sangria.', 'error');
    } finally {
      setCashActionLoading(false);
    }
  };

  const handleCashClose = async () => {
    const valor = parseMoeda(cashAmount);
    if (!cashSession?.id || cashAmount === '' || !(valor >= 0)) return;
    setCashActionLoading(true);
    try {
      const result = await closeCashSession(cashSession.id, valor);
      setCloseResult(result);
      setShowCashModal(null);
      setCashAmount('');
      checkCashSession();
    } catch (e: any) {
      showNotification(e.message || 'Erro ao fechar caixa.', 'error');
    } finally {
      setCashActionLoading(false);
    }
  };

  const resetPdvFields = () => {
    setCarrinho([]);
    setClienteSelecionado('');
    setBuscaCliente('');
    setCodigoProduto('');
    setMostrarListaClientes(true);
    setModalPagamento(false);
    setValorMisto({ PIX: '', WALLET: '', CASH: '' });
    setValorRecebido('');
    setPixConfirmado(false);
    setSelectedCustomerAccount(null);
    setCustomerAccountSearch('');
    setConfirmandoFiado(false);
    fiadoVinculoAtivo.current = null;
    fiadoDesvinculadoRef.current = false;
    setProdutoPrecoDinamico(null);
    setShowProductModal(false);
    setProductModalSearch('');
    setMobileTab('catalog');
  };

  const finalizarVenda = async () => {
    if (processando) return;
    if (carrinho.length === 0) return;
    if (formaPagamento === 'PIX' && !pixChaveDisponivel()) {
      showNotification('Configure a chave PIX (CNPJ ou chave aleatória) nas Configurações antes de vender no PIX.', 'error');
      return;
    }
    const temPixLocal = formaPagamento === 'PIX'
      || (formaPagamento === 'MIXED' && parseMoeda(valorMisto.PIX) > 0);
    if (temPixLocal && !pixConfirmado) {
      showNotification('Confirme o recebimento do PIX antes de finalizar a venda.', 'error');
      return;
    }
    if (formaPagamento === 'CARD' && !cardConfirmado) {
      showNotification('Confirme o recebimento do valor no cartão antes de finalizar a venda.', 'error');
      return;
    }
    const temCashLocal = formaPagamento === 'CASH' || (formaPagamento === 'MIXED' && parseMoeda(valorMisto.CASH) > 0);
    if (temCashLocal && !cashLoading && !cashSession) {
      showNotification('Nenhuma sessão de caixa aberta para este operador. Abra o caixa antes de vender em dinheiro.', 'error');
      return;
    }
    // BUGFIX: a Venda em Dupla NÃO pode entrar na fila offline — o enfileiramento
    // descartaria o split e a sincronização falharia depois (saldo insuficiente),
    // com o operador acreditando que a venda foi registrada.
    if (formaPagamento === 'WALLET' && isJointWalletMode && jointAdminAuthorized && secondUserId && parseMoeda(secondWalletAmountInput) > 0 && !navigator.onLine) {
      showNotification('A Venda em Dupla exige conexão com a internet (as duas carteiras são debitadas atomicamente no servidor). Conecte-se para finalizar.', 'error');
      return;
    }
    // BUGFIX: parte em créditos do pagamento misto também é débito de carteira
    // (server-authoritative) — OFFLINE só PIX/DINHEIRO/FIADO/CARTÃO podem
    // ficar na fila. Evita "venda registrada, recusada depois na sincronização".
    if (formaPagamento === 'MIXED' && parseMoeda(valorMisto.WALLET) > 0 && !navigator.onLine) {
      showNotification('A parte em créditos internos (WALLET) do pagamento misto exige conexão com a internet (o saldo é debitado no servidor). Conecte-se para finalizar.', 'error');
      return;
    }
    setProcessando(true);
    const targetId = clienteSelecionado || 'balcao_anonimo';
    let paymentsArray: {method: 'PIX' | 'WALLET' | 'CASH' | 'CARD' | 'FIADO', amount: number}[] | undefined = undefined;
    let changeValue: number | undefined = undefined;
    try {
      // Composição de pagamento 100% delegada à lógica pura testável
      // (utils/pdvPayment.ts): monta payments/change/split de dupla com as
      // MESMAS regras de antes — arredondamento a centavos e tolerâncias.
      const montagem = montarPagamentoPdv({
        formaPagamento,
        total: totalCarrinho,
        valorMisto,
        valorRecebido,
        clienteSelecionado,
        targetId,
        clienteEhConsumidor,
        contaFiadoSelecionada: selectedCustomerAccount,
        fiado30UserId,
        saldoCarteiraCliente: cliente?.walletBalance,
        weeklySpentCliente: (cliente as any)?.weeklySpent,
        weeklyWalletLimit: settings?.weeklyWalletLimit,
        isJointWalletMode,
        jointAdminAuthorized,
        secondUserId,
        secondWalletAmountInput,
      });
      if (montagem.ok === false) {
        showNotification(montagem.message, 'error');
        return;
      }
      paymentsArray = montagem.paymentsArray;
      changeValue = montagem.changeValue;
      const jointWalletPayload = montagem.jointWalletPayload;

      if (formaPagamento === 'FIADO') {
        // BUGFIX: venda fiada exige Senha Mestra ANTES de criar a dívida.
        // A porta existia como código morto (executarVendaFiado nunca era chamada).
        // Offline: segue permitido (operador é admin autenticado e o servidor
        // revalida limite/status da conta no momento da sincronização).
        if (!navigator.onLine) {
          const pedido = await onConfirmOffline(clienteSelecionado, carrinho, 'FIADO', totalCarrinho, undefined, undefined, selectedCustomerAccount.id);
          if (pedido) {
            setUltimoPedido(pedido);
            setUltimaVenda(pedido);
            resetPdvFields();
            showNotification('Venda FIADA registrada OFFLINE — será sincronizada quando a internet voltar.', 'info');
          }
          return;
        }
        setProcessando(false);
        setConfirmandoFiado(true);
        return;
      }

      if (formaPagamento === 'FIADO_30') {
        // Fiado 30 dias: usa usuário cadastrado diretamente + exige senha mestra
        if (!navigator.onLine) {
          // Offline não suportado para FIADO_30 (requer validação de senha mestra no servidor)
          showNotification('Fiado 30 Dias requer conexão com a internet para validação da senha mestra.', 'error');
          return;
        }
        setProcessando(false);
        setConfirmandoFiado30(true);
        return;
      }

      const pedido = await onConfirm(targetId, carrinho, formaPagamento, totalCarrinho, paymentsArray, changeValue, undefined, saleToken, jointWalletPayload, bandeiraCartao || undefined, fiado30UserId);
      if (pedido) {
        setUltimoPedido(pedido);
        setUltimaVenda(pedido);
        resetPdvFields();
      }
    } catch (e: any) {
      // SEM INTERNET: em vez de perder a venda, oferece o registro OFFLINE
      // (fila local + sincronização automática quando a rede voltar).
      if (!navigator.onLine && onConfirmOffline) {
        try {
          const pedidoOffline = await onConfirmOffline(targetId, carrinho, formaPagamento, totalCarrinho, paymentsArray, changeValue, (formaPagamento === 'FIADO' ? selectedCustomerAccount?.id : undefined), (formaPagamento === 'CARD' ? (bandeiraCartao || undefined) : undefined));
          if (pedidoOffline) {
            setUltimoPedido(pedidoOffline);
            setUltimaVenda(pedidoOffline);
            resetPdvFields();
            showNotification('Venda registrada OFFLINE — será sincronizada quando a internet voltar.', 'info');
            return;
          }
        } catch (e2: any) {
          showNotification(e2.message || 'Não foi possível registrar a venda offline.', 'error');
        }
      }
      showNotification(e.message || 'Erro ao finalizar venda.', 'error');
    } finally { setProcessando(false); }
  };

  // Confirma a venda FIADA após validar a DUPLA senha (primária + secundária) no servidor.
  const executarVendaFiado = async () => {
    if (senhaFiadoProcessando) return;
    setSenhaFiadoProcessando(true);
    setSenhaFiadoErro('');
    try {
      const primaria = (senhaFiadoPrimaria || '').trim();
      const secundaria = (senhaFiadoSecundaria || '').trim();
      if (!primaria || !secundaria) {
        setSenhaFiadoErro('Digite ambas as senhas (primária e secundária).');
        return;
      }
      if (!selectedCustomerAccount) throw new Error('Selecione um cliente de fiado.');
      const ok = await validateDualMasterPassword(primaria, secundaria);
      if (!ok) {
        setSenhaFiadoErro('Uma das senhas está incorreta. Tente novamente.');
        return;
      }
      const pedido = await onConfirm(clienteSelecionado, carrinho, 'FIADO', totalCarrinho, undefined, undefined, selectedCustomerAccount.id, saleToken, undefined, undefined, undefined, primaria, secundaria);
      if (pedido) {
        setUltimoPedido(pedido);
        setUltimaVenda(pedido);
        resetPdvFields();
      }
    } catch (e: any) {
      if (!navigator.onLine && onConfirmOffline) {
        try {
          const pedidoOffline = await onConfirmOffline(clienteSelecionado, carrinho, 'FIADO', totalCarrinho, undefined, undefined, selectedCustomerAccount?.id);
          if (pedidoOffline) {
            setUltimoPedido(pedidoOffline);
            setUltimaVenda(pedidoOffline);
            resetPdvFields();
            showNotification('Venda registrada OFFLINE — será sincronizada quando a internet voltar.', 'info');
          }
        } catch (e2: any) {
          setSenhaFiadoErro(e2.message || 'Não foi possível registrar a venda offline.');
        }
        return;
      }
      if (/senha|password/i.test(String(e?.message || ''))) {
        setSenhaFiadoErro(e.message);
      } else {
        setSenhaFiadoErro(e.message || 'Erro ao finalizar venda.');
      }
    } finally {
      setSenhaFiadoProcessando(false);
    }
  };

  // Confirma a venda FIADO 30 DIAS após validar a DUPLA senha mestra no servidor.
  const executarVendaFiado30 = async () => {
    if (senhaFiado30Processando) return;
    setSenhaFiado30Processando(true);
    setSenhaFiado30Erro('');
    try {
      const primaria = (senhaFiado30Primaria || '').trim();
      const secundaria = (senhaFiado30Secundaria || '').trim();
      if (!primaria || !secundaria) {
        setSenhaFiado30Erro('Digite ambas as senhas (primária e secundária).');
        return;
      }
      if (!fiado30UserId) throw new Error('Selecione um usuário para o fiado 30 dias.');
      const ok = await validateDualMasterPassword(primaria, secundaria);
      if (!ok) {
        setSenhaFiado30Erro('Uma das senhas está incorreta. Tente novamente.');
        return;
      }
      const pedido = await onConfirm(fiado30UserId, carrinho, 'FIADO_30', totalCarrinho, undefined, undefined, fiado30UserId, saleToken, undefined, undefined, fiado30UserId, primaria, secundaria);
      if (pedido) {
        setUltimoPedido(pedido);
        setUltimaVenda(pedido);
        resetPdvFields();
      }
    } catch (e: any) {
      if (!navigator.onLine) {
        showNotification('Fiado 30 Dias não suporta modo offline.', 'error');
        return;
      }
      if (/senha|password/i.test(String(e?.message || ''))) {
        setSenhaFiado30Erro(e.message);
      } else {
        setSenhaFiado30Erro(e.message || 'Erro ao finalizar venda.');
      }
    } finally {
      setSenhaFiado30Processando(false);
    }
  };

  // AUTO-IMPRESSÃO SILENCIOSA: tenta a bobina (QZ Tray) ou o Electron (silent)
  // SEM abrir janela de impressão. O cupom de sucesso SEMPRE aparece na tela com
  // o botão "Bobina 48mm (Fiscal)" — a janela só abre quando o operador pedir.
  useEffect(() => {
    if (ultimoPedido && settings?.autoPrint !== false) {
      imprimirSilenciosoFiscal({ type: 'CUPOM', data: ultimoPedido }, settings).catch(console.error);
    }
  }, [ultimoPedido, settings]);

  // PIX pendente = venda com parte PIX (total ou mista) ainda não confirmada pelo operador
  const temPixNaVenda = formaPagamento === 'PIX'
    || (formaPagamento === 'MIXED' && parseMoeda(valorMisto.PIX) > 0);
  const pixPendente = temPixNaVenda && !pixConfirmado;

  // ── RESUMO DE VENDAS (por dia / por cliente) ──
  // CRÍTICO: estes useMemo DEVEM ficar ANTES do `if (!isOpen) return null`.
  // Hooks depois de retorno condicional mudam a contagem de hooks entre
  // renders (modal aberto = N hooks, fechado = N-3) e disparam o erro
  // React #310 "Rendered more hooks than during the previous render".
  const salesOrders = useMemo(() => {
    const agora = new Date();
    const inicio = new Date();
    if (salesPeriod === 'today') inicio.setHours(0, 0, 0, 0);
    else if (salesPeriod === '7') inicio.setDate(agora.getDate() - 7);
    else if (salesPeriod === '30') inicio.setDate(agora.getDate() - 30);
    else inicio.setTime(0);
    return (orders || []).filter(o => {
      if (!o || !o.date) return false;
      if (String(o.status).toUpperCase().startsWith('CANCEL')) return false;
      try {
        const d = new Date(o.date);
        if (isNaN(d.getTime())) return false;
        return d >= inicio && d <= agora;
      } catch { return false; }
    });
  }, [orders, salesPeriod]);

  const salesByDay = useMemo(() => {
    const map = new Map<string, Order[]>();
    for (const o of salesOrders) {
      const key = new Date(o.date).toLocaleDateString('pt-BR');
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(o);
    }
    return [...map.entries()].map(([day, list]) => ({
      day,
      list,
      count: list.length,
      total: list.reduce((s, o) => s + (Number(o.total) || 0), 0),
    })).sort((a, b) => (a.day < b.day ? 1 : -1));
  }, [salesOrders]);

  const salesByClient = useMemo(() => {
    const map = new Map<string, Order[]>();
    for (const o of salesOrders) {
      const name = o.userName || o.inmateName || o.userId || 'CONSUMIDOR GERAL';
      if (!map.has(name)) map.set(name, []);
      map.get(name)!.push(o);
    }
    return [...map.entries()].map(([name, list]) => ({
      name,
      list,
      count: list.length,
      total: list.reduce((s, o) => s + (Number(o.total) || 0), 0),
    })).sort((a, b) => b.total - a.total);
  }, [salesOrders]);

  if (!isOpen) return null;

  // ── Venda em Dupla: derivados de render (sem hooks — pós early-return) ──
  const limparTexto = (v: any, max: number) => String(v ?? '').replace(/[\r\n]+/g, ' ').trim().toUpperCase().slice(0, max);
  const mascararCpf = (cpf?: string) => {
    const d = String(cpf || '').replace(/\D/g, '');
    return d.length >= 11 ? `${'*'.repeat(d.length - 8)}.${d.slice(-8, -5)}.${d.slice(-5, -2)}-${d.slice(-2)}` : '';
  };
  const saldoClientePdv = Math.max(0, cliente?.walletBalance || 0);
  const faltaCarteira = Math.max(0, totalCarrinho - saldoClientePdv);
  // Conta de fiado atualmente vinculada automaticamente ao cliente do PDV
  const fiadoVinculado = !!fiadoVinculoAtivo.current
    && fiadoVinculoAtivo.current.userId === clienteSelecionado
    && fiadoVinculoAtivo.current.accountId === selectedCustomerAccount?.id;
  const jointAtivo = formaPagamento === 'WALLET' && isJointWalletMode && jointAdminAuthorized;
  const segundaParcela = parseMoeda(secondWalletAmountInput);
  const limiteSemanalSegundo = Math.max(0, (settings?.weeklyWalletLimit || 300) - ((secondUserObj as any)?.weeklySpent || 0));
  const jointValido = !!(
    jointAtivo && secondUserId && secondUserObj && segundaParcela > 0 &&
    segundaParcela <= (Math.max(0, secondUserObj.walletBalance || 0) + 0.009) &&
    segundaParcela <= limiteSemanalSegundo + 0.009 &&
    saldoClientePdv + segundaParcela >= totalCarrinho - 0.009
  );

  const pPixMisto = parseMoeda(valorMisto.PIX);
  const pWalletMisto = parseMoeda(valorMisto.WALLET);
  const pCashMisto = parseMoeda(valorMisto.CASH);
  const somaMisto = Math.round((pPixMisto + pWalletMisto + pCashMisto) * 100) / 100;
  const mistoFaltante = Math.max(0, Math.round((totalCarrinho - somaMisto) * 100) / 100);
  const clienteEhConsumidor = cliente?.id === 'consumidor_geral' || cliente?.id === 'balcao_anonimo';

  // Validações do botão "Finalizar" no modal de pagamento — espelham os checks
  // de finalizarVenda para bloquear com aviso por helper (sem alert nativo).
  const valorCashPdv = parseMoeda(valorRecebido);
  const caixaAbertoPdv = !cashLoading && !!cashSession;
  const precisaCashPdv = formaPagamento === 'CASH' || (formaPagamento === 'MIXED' && pCashMisto > 0);
  const trocoCashPdv = Math.max(0, valorCashPdv - totalCarrinho);
  const falhaCashValor = formaPagamento === 'CASH' && valorCashPdv < totalCarrinho - 0.009;
  const falhaCashSessao = precisaCashPdv && !caixaAbertoPdv;
  const falhaMistoValor = formaPagamento === 'MIXED' && somaMisto < totalCarrinho - 0.009;
  const falhaMistoExcedente = formaPagamento === 'MIXED' && somaMisto > totalCarrinho + 0.009 && pCashMisto <= 0;
  // Parte em créditos do MIXED: valida saldo e limite semanal ANTES do servidor
  // (venda fica travada no botão, sem esperar rejeição no backend).
  const saldoCarteiraPdv = Math.max(0, cliente?.walletBalance || 0);
  const limiteSemanalPdv = Math.max(0, (settings?.weeklyWalletLimit || 300) - ((cliente as any)?.weeklySpent || 0));
  const falhaMistoWalletConsumidor = formaPagamento === 'MIXED' && pWalletMisto > 0 && clienteEhConsumidor;
  const falhaMistoWallet = formaPagamento === 'MIXED' && pWalletMisto > 0 && !clienteEhConsumidor
    && (pWalletMisto > saldoCarteiraPdv + 0.009 || pWalletMisto > limiteSemanalPdv + 0.009);

  const totalPeriodo = salesOrders.reduce((s, o) => s + (Number(o.total) || 0), 0);
  const formatarHora = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } catch { return ''; }
  };

  return (
    <div className="fixed inset-0 z-[500] flex flex-col font-sans bg-white animate-fadeIn overflow-hidden">

{/* HEADER - GLASSMORPHISM PRO MAX */}
      <header className="flex items-center justify-between px-3 sm:px-8 py-3 sm:py-5 bg-white/80 backdrop-blur-md border-b border-slate-200 shrink-0 relative z-[100] shadow-sm">
        <div className="flex items-center gap-3 sm:gap-5 relative z-10 min-w-0">
          <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-slate-100 bg-white group transition-transform hover:scale-105">
            <ShoppingCart size={20} className="sm:hidden" style={{ color: corPrincipal }} />
            <ShoppingCart size={24} style={{ color: corPrincipal }} className="hidden sm:block group-hover:rotate-12 transition-transform" />
          </div>
          <div className="min-w-0">
            <h1 className="font-black text-lg sm:text-2xl text-slate-900 tracking-tight truncate leading-none mb-1">{settings?.appName || 'MERCADO FÁCIL'}</h1>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <p className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] sm:tracking-[0.3em] whitespace-nowrap">Terminal de Venda Direta</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-4 relative z-10 min-w-0 flex-1 justify-end">
          {/* Status Indicators */}
          <div className="hidden sm:flex items-center gap-6 mr-6 px-6 py-3 bg-slate-50 rounded-2xl border border-slate-100">
             <div className="text-right">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Operador</p>
                <p className="text-xs font-bold text-slate-700">{currentUser?.name || 'Admin'}</p>
             </div>
             <div className="w-px h-6 bg-slate-200"></div>
             <div className="text-right">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Data</p>
                <p className="text-xs font-bold text-slate-700">{new Date().toLocaleDateString('pt-BR')}</p>
             </div>
          </div>

          {/* Botões secundários: rolam horizontalmente no celular (nunca estouram) */}
          <div className="flex items-center gap-2 sm:gap-4 overflow-x-auto max-w-full no-scrollbar shrink">
            {cashLoading ? (
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center bg-slate-100 text-slate-400 shrink-0">
                <RefreshCw className="animate-spin" size={20} />
              </div>
            ) : cashSession ? (
              <>
                <div className="hidden sm:flex items-center gap-2 px-4 py-2 bg-emerald-50 border border-emerald-200 rounded-2xl shrink-0">
                  <Landmark size={16} className="text-emerald-600" />
                  <span className="text-[10px] font-black text-emerald-700 uppercase tracking-wider">Caixa Aberto</span>
                </div>
                <button
                  onClick={() => { setCashAmount(''); setCashReason(''); setShowCashModal('withdrawal'); }}
                  className="lg:w-auto w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center gap-2 px-4 bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 transition-all shadow-sm active:scale-95 font-black text-[10px] uppercase tracking-wider shrink-0"
                  title="Registrar Sangria"
                >
                  <Minus size={20} /> <span className="hidden lg:inline">Sangria</span>
                </button>
                <button
                  onClick={() => { setCashAmount(''); setShowCashModal('close'); }}
                  className="lg:w-auto w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center gap-2 px-4 bg-red-50 border border-red-200 text-red-700 hover:bg-red-100 transition-all shadow-sm active:scale-95 font-black text-[10px] uppercase tracking-wider shrink-0"
                  title="Fechar Caixa"
                >
                  <LogOut size={20} /> <span className="hidden lg:inline">Fechar</span>
                </button>
              </>
            ) : null}

            <button
              onClick={() => reimprimirUltimo()}
              disabled={!ultimaVenda && !ultimoPedido}
              className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center bg-white border border-slate-100 text-slate-600 hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-200 transition-all shadow-md active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
              title="Reimprimir Último Cupom (F10)"
            >
              <Printer size={22} />
            </button>

            <button
              onClick={() => desfazerUltimaVenda()}
              disabled={!ultimaVenda && !ultimoPedido}
              className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center bg-white border border-slate-100 text-slate-600 hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-all shadow-md active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
              title="Desfazer / Cancelar Última Venda (estorno completo)"
            >
              <Undo2 size={22} />
            </button>

            <button
              onClick={() => suspenderVenda()}
              disabled={carrinho.length === 0}
              className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center bg-white border border-slate-100 text-slate-600 hover:bg-amber-50 hover:text-amber-600 hover:border-amber-200 transition-all shadow-md active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
              title="Suspender Venda (salvar carrinho para retomar depois)"
            >
              <PauseCircle size={22} />
            </button>

            <button
              onClick={() => setShowSuspendedList(true)}
              disabled={suspendedCarts.length === 0}
              className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center bg-white border border-slate-100 text-slate-600 hover:bg-sky-50 hover:text-sky-600 hover:border-sky-200 transition-all shadow-md active:scale-95 relative disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
              title="Vendas Suspensas (retomar ou descartar)"
            >
              <History size={22} />
              {suspendedCarts.length > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-amber-500 rounded-full flex items-center justify-center text-[9px] font-black text-white border-2 border-white">
                  {suspendedCarts.length}
                </span>
              )}
            </button>

            <button
              onClick={() => abrirEstorno()}
              className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center bg-white border border-slate-100 text-slate-600 hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-all shadow-md active:scale-95 shrink-0"
              title="Estorno de Venda (buscar pedido e devolver — F9)"
            >
              <RotateCcw size={22} />
            </button>

            <button
              onClick={() => setShowSalesPanel(true)}
              className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center bg-white border border-slate-100 text-slate-600 hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-200 transition-all shadow-md active:scale-95 shrink-0"
              title="Histórico de Vendas com ações (F11)"
            >
              <BarChart3 size={24} />
            </button>

            <button
              onClick={() => setIsSoundEnabled(!isSoundEnabled)}
              className={`w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center transition-all shadow-md border shrink-0 ${isSoundEnabled ? 'bg-white border-slate-100 text-emerald-600 hover:bg-emerald-50' : 'bg-red-50 text-red-500 border-red-100 hover:bg-red-100'}`}
              title="Sons"
            >
              {isSoundEnabled ? <Volume2 size={24} /> : <VolumeX size={24} />}
            </button>
          </div>

          {/* Fechar: SEMPRE visível (fora da rolagem) — crítico em telas touch sem ESC */}
          <button
            onClick={onClose}
            className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center bg-slate-900 text-white hover:bg-red-600 transition-all shadow-xl active:scale-95 group border border-slate-800 shrink-0"
            title="Fechar (ESC)"
          >
            <X size={28} className="group-hover:rotate-90 transition-transform duration-300" />
          </button>
        </div>
      </header>

      {/* ════════════════════════════════════════════════ */}
      {/* CASH SESSION OVERLAY - Bloqueia vendas se caixa fechado */}
      {/* ════════════════════════════════════════════════ */}
      {!cashLoading && !cashSession && (
        <div className="flex-1 flex flex-col items-center justify-center bg-gradient-to-b from-slate-50 to-white p-8">
          <div className="w-24 h-24 rounded-full bg-slate-100 flex items-center justify-center mb-6 border border-slate-200 shadow-inner">
            <Lock size={48} className="text-slate-400" />
          </div>
          <h2 className="text-2xl font-bold text-slate-800 mb-2 tracking-tight">Caixa Fechado</h2>
          <p className="text-slate-500 text-sm mb-1 text-center max-w-sm">
            Para iniciar as vendas, informe o valor inicial em dinheiro na gaveta.
          </p>
          <p className="text-[10px] font-bold text-amber-600 mb-8 text-center max-w-sm uppercase tracking-wider bg-amber-50 px-6 py-2 rounded-xl border border-amber-200">
            As vendas serão liberadas após a abertura do caixa
          </p>
          <button
            onClick={() => { setCashAmount(''); setShowCashModal('open'); }}
            className="flex items-center gap-3 px-10 py-5 rounded-2xl text-white font-black text-sm uppercase tracking-widest shadow-xl hover:brightness-110 transition-all active:scale-95 border border-emerald-400/20"
            style={{ backgroundColor: corPrincipal }}
          >
            <LogIn size={24} /> Abrir Caixa
          </button>
          <p className="mt-6 text-[10px] text-slate-400 font-semibold">
            Operador: {currentUser?.name || 'Administrador'}
          </p>
        </div>
      )}

      {/* ════════════════════════════════════════════════ */}
      {/* MAIN CONTENT - CATÁLOGO + CARRINHO (caixa aberto) */}
      {/* ════════════════════════════════════════════════ */}
      {!cashLoading && cashSession && (
        <main className="flex-1 flex overflow-hidden p-4 sm:p-6 gap-4 sm:gap-6 min-h-0 relative z-10">

          {/* LADO ESQUERDO: CLIENTE + CATÁLOGO */}
          <section className={`flex-[1.3] flex flex-col gap-4 min-w-0 ${mobileTab !== 'catalog' ? 'hidden lg:flex' : 'flex'}`}>

            {/* BUSCA CLIENTE / RESPONSÁVEL */}
            <div className="bg-slate-50 rounded-[2rem] border border-slate-200 p-5 shadow-sm shrink-0">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${corPrincipal}22`, color: corPrincipal }}>
                  <UserCircle2 size={22} />
                </div>
                <h2 className="font-black text-[11px] uppercase tracking-[0.2em] text-slate-500">Responsável / Cliente</h2>
              </div>

              {cliente ? (
                <div className="flex items-center justify-between bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center font-black text-xl text-white shrink-0" style={{ backgroundColor: corPrincipal }}>
                      {(cliente?.name || '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="font-black text-sm text-slate-900 uppercase truncate">{cliente?.name || 'Cliente'}</p>
                      <p className="text-[10px] font-bold text-slate-400 mt-0.5">Interno: {cliente?.inmateName || cliente?.prisonerName || 'N/A'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Saldo</p>
                      <p className="font-black text-lg text-emerald-600 leading-none">R$ {formatarMoeda(cliente.walletBalance || 0)}</p>
                    </div>
                    <button
                      onClick={() => { setClienteSelecionado(''); setBuscaCliente(''); setMostrarListaClientes(true); setTimeout(() => clienteInputRef.current?.focus(), 50); }}
                      className="p-2 hover:bg-red-50 text-red-400 rounded-xl transition-all cursor-pointer"
                      title="Trocar cliente"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="relative" ref={clienteSearchRef}>
                  <button
                    onClick={() => { setClienteSelecionado('consumidor_geral'); setBuscaCliente('CONSUMIDOR GERAL'); setMostrarListaClientes(false); produtoInputRef.current?.focus(); }}
                    className="w-full mb-3 p-4 rounded-2xl border-2 border-dashed border-emerald-300 bg-emerald-50/60 hover:bg-emerald-100 hover:border-emerald-400 transition-all flex items-center justify-center gap-3 cursor-pointer"
                    title="Venda direta no balcão, sem identificação"
                  >
                    <ShoppingCart size={18} className="text-emerald-600" />
                    <span className="font-black text-[11px] uppercase tracking-[0.2em] text-emerald-700">Venda no Balcão — Consumidor Final</span>
                  </button>
                  <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    ref={clienteInputRef}
                    placeholder="Nome, CPF ou nome do interno..."
                    className="w-full bg-white border border-slate-200 rounded-2xl p-4 pl-12 font-bold text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all"
                    value={buscaCliente}
                    onChange={e => { setBuscaCliente(e.target.value); setMostrarListaClientes(true); }}
                    onFocus={() => setMostrarListaClientes(true)}
                    onKeyDown={handleClienteKeyDown}
                  />
                  {mostrarListaClientes && (
                    <div className="absolute left-0 right-0 top-full mt-2 bg-white border border-slate-200 rounded-2xl shadow-2xl z-50 overflow-hidden max-h-72 overflow-y-auto custom-scrollbar">
                      {clientesFiltrados.map(u => (
                        <button
                          key={u.id}
                          onClick={() => { setClienteSelecionado(u.id); setBuscaCliente(u.name); setMostrarListaClientes(false); setTimeout(() => produtoInputRef.current?.focus(), 50); }}
                          className="w-full p-4 flex items-center justify-between hover:bg-emerald-50 border-b border-slate-100 last:border-0 transition-colors cursor-pointer"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center font-bold text-sm text-emerald-700">{(u.inmateName || u.prisonerName || u.name)?.[0]?.toUpperCase()}</div>
                            <div className="text-left">
                              <p className="font-black text-xs uppercase text-slate-900">{(u.inmateName || u.prisonerName || u.name || 'Usuário').toUpperCase()}</p>
                              <p className="text-[9px] text-slate-400">Familiar: {u?.name || '—'}</p>
                              {(u.cpf || u.phone) && (
                                <p className="text-[9px] text-slate-300">{u.cpf || ''}{u.cpf && u.phone ? ' · ' : ''}{u.phone || ''}</p>
                              )}
                            </div>
                          </div>
                          <p className="font-black text-xs text-emerald-600">R$ {formatarMoeda(u.walletBalance || 0)}</p>
                        </button>
                      ))}
                      {clientesFiltrados.length === 0 && (
                        <p className="p-6 text-center text-xs text-slate-400 font-bold">
                          {(buscaCliente || '').trim() ? 'Nenhum resultado encontrado.' : 'Digite nome, CPF ou nome do interno para buscar...'}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* SCANNER / CÓDIGO DE BARRAS */}
            <div className="bg-white border border-slate-200 rounded-[2rem] p-4 shadow-sm shrink-0">
              <form onSubmit={adicionarProduto} className="flex items-center gap-3">
                <div className="flex items-center gap-3 bg-slate-50 p-2 rounded-2xl border border-slate-200 flex-1 min-w-0">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${corPrincipal}22`, color: corPrincipal }}>
                    <Scan size={20} />
                  </div>
                  <input
                    ref={produtoInputRef}
                    placeholder="CÓDIGO DE BARRAS (F2) ou NOME DO PRODUTO..."
                    className="flex-1 bg-transparent border-0 font-black text-sm text-slate-900 placeholder:text-slate-400 outline-none uppercase tracking-wider min-w-0"
                    value={codigoProduto}
                    onChange={e => setCodigoProduto(e.target.value)}
                    onKeyDown={handleProdutoKeyDown}
                  />
                </div>
                <button
                  type="submit"
                  className="w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-lg hover:brightness-110 transition-all active:scale-95 cursor-pointer shrink-0"
                  style={{ backgroundColor: corPrincipal }}
                  title="Adicionar produto"
                >
                  <Plus size={22} strokeWidth={3} />
                </button>
              </form>
            </div>

            {/* GRID DE PRODUTOS */}
            <div className="flex-1 overflow-y-auto pr-1 min-h-0 custom-scrollbar">
              {produtosFiltrados.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400">
                  <Package size={56} strokeWidth={1} />
                  <p className="font-black text-xs uppercase mt-4 tracking-widest">Nenhum produto encontrado</p>
                  <p className="text-[10px] font-bold text-slate-400 mt-1">Tente outro termo de busca</p>
                </div>
              ) : (
                <>
                  {codigoProduto.trim() === '' && products.length > 60 && (
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2 px-1">
                      Exibindo os {Math.min(products.length, 60)} primeiros de {products.length} produtos — digite o nome ou código para buscar
                    </p>
                  )}
                  <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
                  {produtosFiltrados.map(p => {
                    const isOut = (p?.stock || 0) <= 0;
                    return (
                      <button
                        key={p.id}
                        onClick={() => adicionarAoCarrinho(p)}
                        disabled={isOut || (p.price || 0) <= 0}
                        className={`group p-3 bg-white border border-slate-200 rounded-[2rem] flex flex-col items-center hover:border-emerald-400 transition-all active:scale-95 shadow-sm hover:shadow-md ${isOut ? 'opacity-40 grayscale' : ''}`}
                      >
                        <div className="w-full aspect-square rounded-2xl bg-slate-50 mb-3 overflow-hidden relative border border-slate-100">
                          {p.imageUrl ? <img src={p.imageUrl} alt="" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" /> : (
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                              <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center mb-2">
                                <Package size={20} className="text-slate-300" />
                              </div>
                              <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Sem Foto</span>
                            </div>
                          )}
                          {!isOut && p.stock <= 5 && <span className="absolute top-2 left-2 bg-amber-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full uppercase">Baixo Estoque</span>}
                          {isOut && <span className="absolute inset-0 bg-black/60 flex items-center justify-center font-black text-[10px] uppercase tracking-widest text-white">Esgotado</span>}
                        </div>
                        {p.brand && <p className="text-[10px] font-black uppercase tracking-widest mb-1 opacity-60" style={{ color: corPrincipal }}>{p.brand}</p>}
                        <p className="font-bold text-[11px] uppercase tracking-tight text-slate-800 line-clamp-1 w-full text-center">{p?.name || 'Produto'}</p>
                        <div className="flex items-baseline justify-center gap-1.5 mt-1">
                          {(p as any).promoPrice > 0 && (
                            <span className="text-[9px] font-bold text-slate-300 line-through uppercase">R$ {formatarMoeda(p.price)}</span>
                          )}
                          <p className="font-black text-lg leading-none" style={{ color: corPrincipal }}>R$ {formatarMoeda(precoEfetivoProduto(p))}</p>
                        </div>
                        <p className="text-[9px] font-bold text-slate-400 mt-0.5 uppercase tracking-widest">{p.stock || 0} em estoque</p>
                      </button>
                    );
                  })}
                </div>
                </>
              )}
            </div>
          </section>

          {/* LADO DIREITO: CARRINHO E RESUMO */}
          <section className={`flex-1 flex flex-col gap-4 min-w-0 ${mobileTab !== 'cart' ? 'hidden lg:flex' : 'flex'}`}>
            <div className="flex-1 bg-white border border-slate-200 rounded-[2.5rem] flex flex-col overflow-hidden shadow-sm min-h-0">
              <div className="p-5 border-b border-slate-100 flex justify-between items-center shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${corPrincipal}22`, color: corPrincipal }}>
                    <ShoppingCart size={20} />
                  </div>
                  <h2 className="font-black text-[11px] uppercase tracking-[0.2em] text-slate-500">Carrinho de Venda</h2>
                </div>
                <button onClick={() => carrinho.length > 0 && setConfirmacaoLimpar('carrinho')} className="text-[10px] font-black uppercase text-red-400 tracking-widest hover:bg-red-50 px-3 py-1.5 rounded-xl transition-all cursor-pointer">
                  Limpar Tudo
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar min-h-0">
                {carrinho.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-300">
                    <Package size={56} strokeWidth={1} />
                    <p className="font-black text-xs uppercase mt-4 tracking-widest">Nenhum item no carrinho</p>
                    <p className="text-[10px] font-bold text-slate-400 mt-1">Use o código de barras ou toque nos produtos</p>
                  </div>
                ) : (
                  carrinho.map((item: any, idx: number) => (
                    <div key={item.productId || idx} className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-100 rounded-2xl">
                      <div className="w-12 h-12 rounded-xl bg-white border border-slate-100 overflow-hidden flex-none">
                        {item.imageUrl ? (
                          <img src={item.imageUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-slate-100">
                            <Package size={16} className="text-slate-300" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-black text-xs uppercase tracking-tight text-slate-900 truncate">{item?.name || 'Produto'}</p>
                        <div className="flex items-center gap-3 mt-1">
                          <div className="flex items-center bg-white rounded-lg p-0.5 border border-slate-200">
                            <button onClick={() => atualizarQuantidade(item.productId, -1)} className="w-6 h-6 flex items-center justify-center text-slate-500 hover:text-red-500 cursor-pointer"><Minus size={12} strokeWidth={3} /></button>
                            <span className="w-6 text-center text-xs font-black text-slate-900">{item?.quantity || 0}</span>
                            <button onClick={() => atualizarQuantidade(item.productId, 1)} className="w-6 h-6 flex items-center justify-center text-slate-500 hover:text-emerald-600 cursor-pointer"><Plus size={12} strokeWidth={3} /></button>
                          </div>
                          <span className="text-xs font-black text-slate-400">× R$ {formatarMoeda(item?.price || 0)}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-black text-sm text-slate-900">R$ {formatarMoeda((item?.price || 0) * (item?.quantity || 0))}</p>
                        <button onClick={() => removerDoCarrinho(item.productId)} className="text-red-400 hover:text-red-500 p-1.5 hover:bg-red-50 rounded-lg transition-all cursor-pointer">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* RESUMO E BOTÃO FINAL */}
              <div className="p-5 bg-slate-50 border-t border-slate-100 space-y-4 shrink-0">
                <div className="flex justify-between items-end">
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total a Receber</p>
                    <h3 className="text-4xl font-black tracking-tighter text-slate-900">R$ {formatarMoeda(totalCarrinho)}</h3>
                  </div>
                  <div className="flex items-center gap-1 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    <ShoppingCart size={14} /> {carrinho.reduce((s: number, i: any) => s + (i.quantity || 0), 0)} itens
                  </div>
                </div>

                <button
                  onClick={() => { setModalPagamento(true); setPixConfirmado(false); }}
                  disabled={carrinho.length === 0 || !clienteSelecionado}
                  className={`w-full py-5 rounded-[2rem] font-black text-base uppercase tracking-[0.3em] transition-all flex items-center justify-center gap-4 ${carrinho.length === 0 || !clienteSelecionado ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'text-white shadow-[0_15px_40px_rgba(0,0,0,0.2)] hover:brightness-110 active:scale-[0.98]'}`}
                  style={carrinho.length === 0 || !clienteSelecionado ? undefined : { backgroundColor: corPrincipal }}
                >
                  <Check size={20} /> Finalizar Venda
                </button>
                {!clienteSelecionado && carrinho.length > 0 && (
                  <p className="text-center text-[10px] font-black text-amber-600 uppercase tracking-widest">Selecione um responsável / cliente para finalizar</p>
                )}
              </div>
            </div>
          </section>
        </main>
      )}

      {/* TABS MOBILE (Catálogo / Carrinho) */}
      {!cashLoading && cashSession && (
        <div className="flex lg:hidden gap-2 px-4 pb-4 shrink-0 relative z-10">
          <button
            onClick={() => setMobileTab('catalog')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all border cursor-pointer ${mobileTab === 'catalog' ? 'text-white border-transparent' : 'bg-white text-slate-500 border-slate-200'}`}
            style={mobileTab === 'catalog' ? { backgroundColor: corPrincipal } : undefined}
          >
            <Package size={16} /> Catálogo
          </button>
          <button
            onClick={() => setMobileTab('cart')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all border cursor-pointer relative ${mobileTab === 'cart' ? 'text-white border-transparent' : 'bg-white text-slate-500 border-slate-200'}`}
            style={mobileTab === 'cart' ? { backgroundColor: corPrincipal } : undefined}
          >
            <ShoppingCart size={16} /> Carrinho
            {carrinho.length > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-[9px] font-black text-white border-2 border-white">
                {carrinho.reduce((s: number, i: any) => s + (i.quantity || 0), 0)}
              </span>
            )}
          </button>
        </div>
      )}

      {/* Fechamento com resultado da auditoria */}
      {closeResult && (
        <div className={`mx-6 mt-4 mb-0 p-4 rounded-2xl border flex items-start gap-3 shrink-0 ${closeResult.diff === 0 ? 'bg-emerald-50 border-emerald-200' : closeResult.diff < 0 ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
          {closeResult.diff === 0
            ? <CheckCircle className="text-emerald-500 mt-0.5 shrink-0" size={20} />
            : <AlertTriangle className={`${closeResult.diff < 0 ? 'text-red-500' : 'text-amber-500'} mt-0.5 shrink-0`} size={20} />
          }
          <div className="flex-1">
            <p className="font-bold text-slate-800 text-sm">Auditoria de Fechamento</p>
            <p className="text-xs text-slate-600">Esperado: <strong>R$ {closeResult.expected.toFixed(2)}</strong> · Contado: <strong>R$ {(closeResult.expected + closeResult.diff).toFixed(2)}</strong></p>
            <p className={`text-xs font-bold mt-1 ${closeResult.diff === 0 ? 'text-emerald-600' : closeResult.diff < 0 ? 'text-red-600' : 'text-amber-600'}`}>
              {closeResult.diff === 0 ? 'Caixa conferido e correto!' : closeResult.diff > 0 ? `Sobra de R$ ${closeResult.diff.toFixed(2)}` : `Falta de R$ ${Math.abs(closeResult.diff).toFixed(2)}`}
            </p>
          </div>
          <button onClick={() => setCloseResult(null)} aria-label="Fechar resultado" className="text-slate-400 hover:text-slate-700 cursor-pointer">
            <X size={18} />
          </button>
        </div>
      )}

      {/* MODAL DE PAGAMENTO (PRO MAX APPLE PAY STYLE) */}
      <AnimatePresence>
        {modalPagamento && (
          <div className="fixed inset-0 z-[700] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-3xl" onClick={() => { if (!processando && !pixPendente) setModalPagamento(false); }}></div>
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 50 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 50 }}
              className="w-full max-w-xl bg-white rounded-[3rem] shadow-[0_40px_100px_rgba(0,0,0,0.8)] flex flex-col max-h-[95vh] overflow-hidden border border-slate-200 relative z-10"
            >
              <div className="p-8 sm:p-10 border-b border-slate-200 shrink-0 bg-slate-50 text-center">
                <p className="font-black text-[10px] text-slate-500 uppercase tracking-[0.4em] mb-2">Total a Pagar</p>
                <h3 className="font-black text-4xl sm:text-5xl text-emerald-600 tracking-tighter truncate max-w-full">
                    <span className="text-2xl text-emerald-500/50 mr-2">R$</span>
                    {formatarMoeda(totalCarrinho)}
                </h3>
              </div>

              <div className="flex-1 overflow-y-auto p-8 sm:p-10 space-y-8 custom-scrollbar">

                {/* Payment Method Selector */}
                <div className="grid grid-cols-2 gap-4">
                {[
                  { key: 'PIX', label: 'PIX', icon: CreditCard },
                  { key: 'WALLET', label: 'Créditos Internos', icon: Wallet },
                  { key: 'CASH', label: 'Dinheiro', icon: DollarSign },
                  { key: 'CARD', label: 'Cartão', icon: CreditCard },
                  { key: 'MIXED', label: 'Pagamento Misto', icon: Box },
                  { key: 'FIADO', label: 'Fiado / Conta', icon: BookOpen },
                ].map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    onClick={() => { setFormaPagamento(key as any); setPixConfirmado(false); setBandeiraCartao(''); setCardConfirmado(false); if (key === 'FIADO') setCustomerAccountSearch(''); }}
                    className={`py-6 rounded-[2rem] font-black text-[11px] sm:text-xs uppercase tracking-[0.2em] flex flex-col items-center justify-center gap-3 transition-all touch-target border ${formaPagamento === key ? 'bg-emerald-500 text-white border-emerald-500 scale-[1.02]' : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-emerald-100 hover:text-emerald-700'}`}
                  >
                    <Icon size={24} className={formaPagamento === key ? 'animate-pulse' : ''}/>
                    {label}
                  </button>
                ))}
                </div>

                {formaPagamento === 'PIX' && (
                  <motion.div initial={{opacity:0}} animate={{opacity:1}} className="bg-emerald-500/10 border border-emerald-500/20 rounded-[2.5rem] p-8 text-center relative overflow-hidden">
                    <div className="flex items-center gap-3 mb-6 justify-center relative z-10">
                      <CreditCard size={20} className="text-emerald-600" />
                      <span className="font-black text-[11px] uppercase tracking-[0.4em] text-emerald-600">Escaneie para Pagar</span>
                    </div>

                    <div className="flex items-center justify-center gap-2 mb-6 relative z-10">
                      {['QR Code', 'Cliente paga', 'Confirme'].map((passo, idx) => (
                        <div key={passo} className="flex items-center gap-2">
                          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-[0.15em] ${idx === 0 ? 'bg-emerald-500 text-white' : (idx === 1 && !pixConfirmado) || (idx === 2 && pixConfirmado) ? 'bg-amber-400 text-white' : 'bg-slate-200 text-slate-500'}`}>
                            <span>{idx + 1}</span> {passo}
                          </div>
                          {idx < 2 && <span className="text-slate-300 text-xs">→</span>}
                        </div>
                      ))}
                    </div>

                    {pixPayloadCarrinho ? (
                      <>
                        <div className="bg-white rounded-[2rem] p-5 inline-block shadow-2xl relative z-10">
                          <QRCodeSVG
                            value={pixPayloadCarrinho}
                            size={220}
                            level="H"
                            bgColor="#ffffff"
                            fgColor="#022c22"
                            includeMargin={true}
                          />
                        </div>
                        <p className="mt-3 text-[9px] font-bold text-slate-400 uppercase tracking-[0.2em] relative z-10">
                          Chave usada: {settings?.cnpj && !Array.isArray(settings?.pixKeys) ? 'CNPJ' : 'Cadastrada'} • {mascararChavePix(pixChaveDisponivel())}
                        </p>
                        {pixChaveDisponivel() && (
                          <div className="mt-6 bg-slate-50 rounded-[1.5rem] p-4 border border-slate-200 relative z-10">
                            <p className="text-[9px] font-black text-emerald-500 uppercase tracking-[0.3em] mb-2">Chave Copia e Cola</p>
                            <input
                              readOnly
                              value={pixPayloadCarrinho}
                              className="w-full text-[10px] font-mono text-slate-500 bg-transparent outline-none text-center select-all mb-3"
                              onClick={(e) => (e.target as HTMLInputElement).select()}
                            />
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(pixPayloadCarrinho);
                                setPixCopied(true);
                                setTimeout(() => setPixCopied(false), 2000);
                              }}
                              className="w-full py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-xl text-sm transition-all active:scale-95 flex items-center justify-center gap-2"
                            >
                              {pixCopied ? 'CÓDIGO COPIADO COM SUCESSO!' : 'COPIAR CHAVE PIX COPIA E COLA'}
                            </button>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="bg-amber-50 border-2 border-dashed border-amber-300 rounded-[2rem] p-6 relative z-10">
                        <AlertTriangle size={28} className="text-amber-500 mx-auto mb-3" />
                        <p className="font-black text-[11px] uppercase tracking-[0.2em] text-amber-600 mb-2">Nenhuma chave PIX cadastrada</p>
                        <p className="text-[11px] font-bold text-slate-500 leading-relaxed">
                          Cadastre a chave PIX (CNPJ ou chave aleatória) em <b>Configurações → Pagamentos</b> para gerar o QR Code.
                        </p>
                      </div>
                    )}

                    <div className={`mt-6 rounded-[2rem] p-6 text-center relative overflow-hidden border-2 transition-all duration-300 ${pixConfirmado ? 'bg-emerald-500 border-emerald-500' : 'bg-slate-50 border-slate-200'}`}>
                      {!pixConfirmado && (
                        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_1px_1px,#0f172a_1px,transparent_0)] bg-[length:20px_20px]"></div>
                      )}
                      <div className="relative z-10">
                        <div className="flex items-center justify-center gap-3 mb-3">
                          <span className={`w-3 h-3 rounded-full ${pixConfirmado ? 'bg-white animate-pulse' : 'bg-amber-400 animate-pulse'}`}></span>
                          <p className={`font-black text-[11px] uppercase tracking-[0.35em] ${pixConfirmado ? 'text-white' : 'text-slate-600'}`}>
                            {pixConfirmado ? 'PIX Confirmado — Valor Recebido' : 'Aguardando Confirmação'}
                          </p>
                        </div>
                        {pixConfirmado ? (
                          <p className="text-white font-black text-2xl tracking-tighter mb-1">R$ {formatarMoeda(totalCarrinho)}</p>
                        ) : (
                          <p className="text-[11px] font-bold text-slate-500 leading-relaxed mb-1">
                            Após o cliente escanear o QR Code, confirme que o valor<br/>chegou na sua conta para liberar a finalização.
                          </p>
                        )}
                        {!pixConfirmado && (
                          <button
                            type="button"
                            onClick={() => setPixConfirmado(true)}
                            className="mt-4 w-full py-4 rounded-2xl bg-amber-500 hover:bg-amber-600 text-white font-black text-[11px] uppercase tracking-[0.3em] transition-all active:scale-95 flex items-center justify-center gap-3 shadow-[0_12px_30px_rgba(245,158,11,0.35)]"
                          >
                            <CheckCircle size={18} /> CONFIRMAR RECEBIMENTO DO PIX
                          </button>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}

                {formaPagamento === 'WALLET' && (
                  <motion.div initial={{opacity:0}} animate={{opacity:1}} className="space-y-4">
                    {/* Saldo atual do cliente no PDV */}
                    <div className={`rounded-[2.5rem] p-6 text-center border-2 ${(cliente?.walletBalance || 0) >= totalCarrinho ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
                      <p className="text-[10px] font-black uppercase tracking-[0.3em] mb-1" style={{ color: (cliente?.walletBalance || 0) >= totalCarrinho ? '#059669' : '#d97706' }}>
                        Carteira de {limparTexto((cliente?.inmateName || cliente?.name) || 'Cliente', 26)}
                      </p>
                      <p className={`text-3xl font-black tracking-tight tnum ${(cliente?.walletBalance || 0) >= totalCarrinho ? 'text-emerald-700' : 'text-amber-700'}`}>
                        R$ {formatarMoeda(cliente?.walletBalance || 0)}
                      </p>
                      {faltaCarteira > 0 && (
                        <p className="mt-2 text-[11px] font-black text-amber-600 uppercase tracking-wider">
                          {clienteEhConsumidor
                            ? 'Carteira indisponível para venda sem cliente — selecione um cliente cadastrado'
                            : `Faltam R$ ${formatarMoeda(faltaCarteira)} — use a Venda em Dupla abaixo`}
                        </p>
                      )}
                    </div>

                    {/* GATILHO: saldo insuficiente libera a modalidade (exige senha mestra) */}
                    {faltaCarteira > 0 && !jointAtivo && !clienteEhConsumidor && (
                      <button
                        type="button"
                        onClick={() => setConfirmandoJointSenha(true)}
                        disabled={!clienteSelecionado}
                        className="w-full py-5 rounded-[2rem] bg-slate-900 hover:bg-slate-800 text-white font-black text-[11px] uppercase tracking-[0.25em] transition-all active:scale-[0.98] disabled:opacity-40 flex items-center justify-center gap-3 shadow-lg"
                      >
                        <Users2 size={18} /> VENDA EM DUPLA — DIVIDIR COM OUTRA CARTEIRA
                      </button>
                    )}

                    {/* AUTORIZAÇÃO POR SENHA MESTRA */}
                    {confirmandoJointSenha && !jointAdminAuthorized && (
                      <div className="bg-slate-50 border-2 border-slate-200 rounded-[2rem] p-6 space-y-3">
                        <div className="flex items-center gap-2">
                          <Lock size={16} className="text-slate-500 shrink-0" />
                          <p className="text-[10px] font-black text-slate-600 uppercase tracking-[0.2em]">Senha Mestra necessária para débito em dupla</p>
                        </div>
                        <input
                          type="password"
                          autoFocus
                          placeholder="••••••••"
                          className="w-full bg-white border-2 border-slate-200 focus:border-emerald-500 p-4 rounded-2xl font-black text-center text-lg outline-none transition-colors"
                          value={jointSenhaAdmin}
                          onChange={e => { setJointSenhaAdmin(e.target.value); setJointSenhaAdminErro(''); }}
                          onKeyDown={e => { if (e.key === 'Enter') handleAutorizarJointWallet(); }}
                        />
                        {jointSenhaAdminErro && (
                          <p className="text-[10px] font-black text-red-600 uppercase tracking-wider flex items-center gap-1.5">
                            <AlertTriangle size={13} /> {jointSenhaAdminErro}
                          </p>
                        )}
                        <div className="flex gap-2">
                          <button type="button" onClick={() => { setConfirmandoJointSenha(false); setJointSenhaAdmin(''); setJointSenhaAdminErro(''); }}
                            className="flex-1 py-3.5 rounded-2xl bg-white border-2 border-slate-200 hover:bg-slate-100 font-black text-[10px] uppercase tracking-[0.2em] text-slate-600 transition-all active:scale-95">
                            Cancelar
                          </button>
                          <button type="button" onClick={handleAutorizarJointWallet} disabled={jointSenhaProcessando}
                            className="flex-1 py-3.5 rounded-2xl text-white font-black text-[10px] uppercase tracking-[0.2em] transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 shadow-md"
                            style={{ backgroundColor: corPrincipal }}>
                            {jointSenhaProcessando ? <RefreshCw size={14} className="animate-spin" /> : <CheckCircle size={14} />} Autorizar
                          </button>
                        </div>
                      </div>
                    )}

                    {/* SELEÇÃO DO 2º DEVEDOR + COMPOSIÇÃO DO SPLIT */}
                    {jointAtivo && (
                      <div className="rounded-[2rem] border-2 p-5 space-y-4 animate-fadeIn overflow-hidden" style={{ borderColor: corPrincipal }}>
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-black text-[10px] uppercase tracking-[0.25em]" style={{ color: corPrincipal }}>Venda em Dupla Ativa</p>
                          <button type="button"
                            onClick={() => { setIsJointWalletMode(false); setSecondUserId(''); setSecondUserSearch(''); setSecondWalletAmountInput(''); }}
                            className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-black text-[9px] uppercase tracking-widest transition-all active:scale-95 flex items-center gap-1">
                            <X size={12} /> Desativar
                          </button>
                        </div>

                        {!secondUserId ? (
                          <>
                            <div className="relative">
                              <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                              <input
                                autoFocus
                                placeholder="Buscar 2º devedor (nome, interno ou CPF)..."
                                className="w-full bg-slate-50 border-2 border-slate-200 focus:border-emerald-500 pl-11 pr-4 py-3.5 rounded-2xl text-sm font-bold outline-none transition-colors"
                                value={secondUserSearch}
                                onChange={e => setSecondUserSearch(e.target.value)}
                              />
                            </div>
                            {secondUserSearch.length >= 2 && filteredSecondUsers.length === 0 && (
                              <p className="text-center text-[10px] font-black text-slate-400 uppercase tracking-wider py-2">Nenhum usuário encontrado</p>
                            )}
                            <div className="space-y-2 max-h-56 overflow-y-auto custom-scrollbar">
                              {filteredSecondUsers.map(u => {
                                const limiteU = Math.max(0, (settings?.weeklyWalletLimit || 300) - ((u as any)?.weeklySpent || 0));
                                return (
                                  <button key={u.id} type="button"
                                    onClick={() => { setSecondUserId(u.id); setSecondUserSearch(''); }}
                                    className="w-full flex items-center gap-3 p-3 bg-white hover:bg-emerald-50 border-2 border-slate-100 hover:border-emerald-300 rounded-2xl text-left transition-all active:scale-[0.99]">
                                    <UserCircle2 size={34} className="text-slate-300 shrink-0" />
                                    <div className="flex-1 min-w-0">
                                      <p className="font-black text-xs uppercase text-slate-900 truncate">{(u.inmateName || u.prisonerName || u.name || 'Usuário')}</p>
                                      <p className="text-[9px] font-bold text-slate-400 truncate">Familiar: {u?.name || '—'} {(u.inmateCpf || u.cpf) ? `• CPF ${mascararCpf(u.inmateCpf || u.cpf)}` : ''}</p>
                                    </div>
                                    <div className="text-right shrink-0">
                                      <p className="font-black text-xs text-emerald-600 tnum">R$ {formatarMoeda(u.walletBalance || 0)}</p>
                                      <p className="text-[8px] font-bold text-slate-400 uppercase">Semana: R$ {formatarMoeda(limiteU)}</p>
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          </>
                        ) : (
                          <>
                            {/* Devedor selecionado */}
                            <div className="flex items-center gap-3 p-3 bg-white border-2 border-slate-100 rounded-2xl">
                              <UserCircle2 size={38} className="shrink-0" style={{ color: corPrincipal }} />
                              <div className="flex-1 min-w-0">
                                <p className="font-black text-xs uppercase text-slate-900 truncate">{((secondUserObj?.inmateName || secondUserObj?.prisonerName || secondUserObj?.name) || 'Usuário')}</p>
                                <p className="text-[9px] font-bold text-slate-400 truncate">
                                  Saldo: R$ {formatarMoeda(secondUserObj?.walletBalance || 0)} • Semana: R$ {formatarMoeda(limiteSemanalSegundo)}
                                </p>
                              </div>
                              <button type="button" onClick={() => { setSecondUserId(''); setSecondWalletAmountInput(''); }}
                                className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-black text-[9px] uppercase tracking-widest transition-all active:scale-95 shrink-0">
                                Trocar
                              </button>
                            </div>

                            {/* Valor da 2ª parte */}
                            <div>
                              <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2">Valor a debitar do 2º devedor</p>
                              <input
                                type="number" min="0" step="0.01" inputMode="decimal"
                                placeholder="0,00"
                                className="w-full bg-slate-50 border-2 border-slate-200 focus:border-emerald-500 p-4 rounded-2xl font-black text-2xl text-center outline-none transition-colors tnum"
                                value={secondWalletAmountInput}
                                onChange={e => setSecondWalletAmountInput(e.target.value)}
                              />
                              <div className="flex gap-2 mt-2">
                                {[faltaCarteira, Math.min(segundaParcela || faltaCarteira, limiteSemanalSegundo)].map((v, i) => v > 0 && (
                                  <button key={i} type="button" onClick={() => setSecondWalletAmountInput(v.toFixed(2))}
                                    className="px-3 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl text-[10px] font-black text-slate-700 transition-all active:scale-95">
                                    {i === 0 ? 'Valor Exato (Falta)' : 'Máx. Semanal'}
                                  </button>
                                ))}
                                <button type="button" onClick={() => setSecondWalletAmountInput('')}
                                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl text-[10px] font-black text-slate-500 transition-all active:scale-95">
                                  Limpar
                                </button>
                              </div>
                            </div>

                            {/* Composição do split */}
                            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-1.5 font-bold text-xs tnum">
                              <div className="flex justify-between">
                                <span className="uppercase text-slate-500">Devedor 1 ({limparTexto((cliente?.inmateName || cliente?.name) || 'Cliente', 16)})</span>
                                <span>R$ {formatarMoeda(Math.max(0, totalCarrinho - segundaParcela))}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="uppercase text-slate-500">Devedor 2</span>
                                <span className={segundaParcela > 0 ? 'text-emerald-600' : ''}>R$ {formatarMoeda(segundaParcela)}</span>
                              </div>
                              <div className="border-t border-dashed border-slate-300 pt-1.5 flex justify-between font-black">
                                <span className="uppercase">Total</span><span>R$ {formatarMoeda(totalCarrinho)}</span>
                              </div>
                            </div>

                            {/* Validações inline */}
                            {!jointValido && (
                              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2">
                                <AlertTriangle size={15} className="text-amber-600 shrink-0 mt-0.5" />
                                <span className="text-[10px] font-black text-amber-700 uppercase tracking-wide leading-relaxed">
                                  {segundaParcela <= 0 ? 'Informe o valor da 2ª parte.'
                                    : segundaParcela > (Math.max(0, secondUserObj?.walletBalance || 0)) ? 'Valor excede o saldo do 2º devedor.'
                                    : segundaParcela > limiteSemanalSegundo ? 'Valor excede o limite semanal do 2º devedor.'
                                    : 'Soma das partes não cobre o total.'}
                                </span>
                              </div>
                            )}
                            {jointValido && (
                              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2">
                                <CheckCircle size={15} className="text-emerald-600 shrink-0" />
                                <span className="text-[10px] font-black text-emerald-700 uppercase tracking-wider">
                                  Débito será dividido entre as duas carteiras
                                </span>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </motion.div>
                )}

{formaPagamento === 'CASH' && (
                  <motion.div initial={{opacity:0}} animate={{opacity:1}} className="space-y-4">
                    {!cashLoading && !cashSession && (
                      <div className="bg-red-50 border-2 border-red-200 rounded-[2rem] p-6 text-center">
                        <AlertTriangle size={26} className="text-red-500 mx-auto mb-3" />
                        <p className="text-[11px] font-black text-red-600 uppercase tracking-[0.25em] mb-1">Caixa não aberto</p>
                        <p className="text-[11px] font-bold text-slate-600 mb-4">Você precisa abrir o caixa físico antes de vender em dinheiro.</p>
                        <button
                          type="button"
                          onClick={() => setShowCashModal('open')}
                          className="w-full py-4 rounded-2xl bg-red-500 hover:bg-red-600 text-white font-black text-[11px] uppercase tracking-[0.25em] transition-all active:scale-95 flex items-center justify-center gap-2"
                        >
                          <Landmark size={16} /> Abrir Caixa Agora
                        </button>
                      </div>
                    )}
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] ml-2">Valor Recebido do Cliente</p>
                    <div className="flex flex-wrap justify-center gap-2">
                      {[10, 20, 50, 100].map(v => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setValorRecebido((parseMoeda(valorRecebido || '0') + v).toFixed(2))}
                          className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl text-xs font-black text-slate-700 transition-all active:scale-95 cursor-pointer"
                        >
                          +R$ {v}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setValorRecebido(String(totalCarrinho))}
                        className="px-4 py-2.5 bg-emerald-100 hover:bg-emerald-200 border border-emerald-200 rounded-xl text-xs font-black text-emerald-700 transition-all active:scale-95 cursor-pointer"
                      >
                        Valor Exato
                      </button>
                    </div>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0,00"
                      className="w-full bg-slate-50 border border-slate-200 p-6 rounded-[2rem] font-black text-3xl text-center text-slate-900 outline-none focus:border-emerald-500 transition-colors shadow-inner"
                      value={valorRecebido}
                      onChange={e => setValorRecebido(e.target.value)}
                    />
                    {valorCashPdv > 0 && valorCashPdv >= totalCarrinho - 0.009 && (
                      <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-[2rem] p-6 text-center animate-fadeIn">
                        <p className="text-[10px] text-emerald-500 font-black uppercase tracking-[0.4em] mb-2">Troco a Devolver</p>
                        <p className="text-3xl font-black text-emerald-600">R$ {formatarMoeda(trocoCashPdv)}</p>
                        {calcularDenominacoes(trocoCashPdv).length > 0 && (
                          <div className="mt-4 pt-4 border-t border-emerald-500/20">
                            <p className="text-[9px] font-black text-emerald-600 uppercase tracking-[0.3em] mb-3">Sugestão de Notas e Moedas</p>
                            <div className="flex flex-wrap justify-center gap-2">
                              {calcularDenominacoes(trocoCashPdv).map(d => (
                                <span key={d.valor} className="px-3 py-1.5 bg-white border border-emerald-200 rounded-xl text-[10px] font-black text-emerald-700">
                                  R$ {d.valor.toFixed(2).replace('.', ',')} × {d.qtd}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </motion.div>
                )}

                {formaPagamento === 'CARD' && (
                  <motion.div initial={{opacity:0}} animate={{opacity:1}} className="space-y-4 bg-blue-50 p-6 rounded-[2.5rem] border border-blue-200">
                    <p className="text-[10px] font-black text-blue-700 uppercase tracking-[0.3em] text-center mb-2">Pagamento com Cartão</p>
                    <p className="text-sm font-bold text-slate-600 text-center">Confirme o valor na maquininha e selecione a bandeira.</p>
                    <div className="flex flex-wrap justify-center gap-2 mt-4">
                      {['Visa', 'Mastercard', 'Elo', 'Amex', 'Hipercard', 'Outro'].map(bandeira => (
                        <button
                          key={bandeira}
                          type="button"
                          onClick={() => setBandeiraCartao(bandeira)}
                          className={`px-4 py-2 rounded-xl text-sm font-black transition-all active:scale-95 ${bandeiraCartao === bandeira ? 'bg-blue-700 text-white shadow-lg' : 'bg-white hover:bg-blue-100 text-blue-700 border border-blue-200'}`}
                        >
                          {bandeira}
                        </button>
                      ))}
                    </div>
                    <div className={`mt-4 rounded-2xl p-5 border-2 transition-all duration-300 ${cardConfirmado ? 'bg-emerald-500 border-emerald-500' : 'bg-white border-blue-200'}`}>
                      <p className={`font-black text-[10px] uppercase tracking-[0.3em] text-center ${cardConfirmado ? 'text-white' : 'text-slate-600'}`}>
                        {cardConfirmado ? 'Cartão Confirmado — Valor Recebido' : 'Aguardando Confirmação'}
                      </p>
                      {cardConfirmado && (
                        <p className="text-white font-black text-2xl text-center mt-2">R$ {formatarMoeda(totalCarrinho)}</p>
                      )}
                      {!cardConfirmado && (
                        <button
                          type="button"
                          onClick={() => setCardConfirmado(true)}
                          className="mt-4 w-full py-4 rounded-2xl bg-amber-500 hover:bg-amber-600 text-white font-black text-[11px] uppercase tracking-[0.3em] transition-all active:scale-95"
                        >
                          <CheckCircle size={18} /> CONFIRMAR RECEBIMENTO NO CARTÃO
                        </button>
                      )}
                    </div>
                  </motion.div>
                )}

                {formaPagamento === 'MIXED' && (
                  <motion.div initial={{opacity:0}} animate={{opacity:1}} className="space-y-4 bg-slate-50 p-6 rounded-[2.5rem] border border-slate-200">
                    <p className="text-[10px] text-slate-500 font-black uppercase text-center mb-6 tracking-[0.3em]">Composição do Pagamento</p>
                    {([
                      { key: 'PIX', label: 'PIX', color: 'blue' },
                      { key: 'WALLET', label: 'Créditos', color: 'emerald' },
                      { key: 'CASH', label: 'Dinheiro', color: 'slate' },
                    ] as const).map(({ key, label, color }) => (
                      <div key={key} className="flex items-center gap-4 bg-slate-50 p-3 rounded-[1.5rem] border border-slate-200/30">
                        <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                          style={{
                            backgroundColor: key === 'PIX' ? 'rgba(59,130,246,0.1)' : key === 'WALLET' ? 'rgba(16,185,129,0.1)' : 'rgba(100,116,139,0.1)',
                            color: key === 'PIX' ? '#60a5fa' : key === 'WALLET' ? '#34d399' : '#94a3b8',
                            borderColor: key === 'PIX' ? 'rgba(59,130,246,0.2)' : key === 'WALLET' ? 'rgba(16,185,129,0.2)' : 'rgba(100,116,139,0.2)',
                            borderWidth: 1
                          }}
                        >
                          {key === 'PIX' ? <CreditCard size={20} /> : key === 'WALLET' ? <Wallet size={20} /> : <DollarSign size={20} />}
                        </div>
                        <span className="text-slate-900 font-black w-24 text-[11px] uppercase tracking-widest">{label}</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0,00"
                          className="flex-1 bg-transparent border-b border-slate-200 p-2 text-slate-900 font-black text-xl text-right outline-none focus:border-emerald-500 transition-colors"
                          value={valorMisto[key as keyof typeof valorMisto]}
                          onChange={e => { if (key === 'PIX') setPixConfirmado(false); setValorMisto({...valorMisto, [key]: e.target.value}); }}
                        />
                      </div>
                    ))}
                    {pCashMisto > 0 && !cashLoading && !cashSession && (
                      <div className="bg-red-50 border border-red-200 rounded-2xl p-3 flex items-center gap-2">
                        <AlertTriangle size={14} className="text-red-500 shrink-0" />
                        <span className="text-[10px] font-black text-red-600 uppercase tracking-wider">Caixa não aberto — abra antes de vender com dinheiro.</span>
                      </div>
                    )}
                    {parseMoeda(valorMisto.PIX) > 0 && (
                      <motion.div initial={{opacity:0}} animate={{opacity:1}} className="bg-blue-500/5 border border-blue-500/20 rounded-[2rem] p-6 text-center mt-6">
                        <div className="flex items-center gap-3 mb-2 justify-center">
                          <CreditCard size={18} className="text-blue-600" />
                          <span className="font-black text-[9px] uppercase tracking-[0.3em] text-blue-700">PIX — Parte da Compra</span>
                        </div>
                        <p className="font-black text-2xl text-blue-700 mb-4">R$ {formatarMoeda(parseMoeda(valorMisto.PIX))}</p>
                        {pixPayloadMisto ? (
                          <div className="bg-white rounded-[2rem] p-4 inline-block shadow-lg border border-blue-100">
                            <QRCodeSVG
                              value={pixPayloadMisto}
                              size={180}
                              level="H"
                              bgColor="#ffffff"
                              fgColor="#1e3a5f"
                              includeMargin={true}
                            />
                          </div>
                        ) : (
                          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                            <AlertTriangle size={22} className="text-amber-500 mx-auto mb-2" />
                            <p className="text-[10px] font-black text-amber-600 uppercase tracking-wider">Nenhuma chave PIX cadastrada. Cadastre em Configurações → Pagamentos.</p>
                          </div>
                        )}
                        <div className={`mt-4 rounded-2xl p-5 border-2 transition-all duration-300 ${pixConfirmado ? 'bg-emerald-500 border-emerald-500' : 'bg-slate-50 border-slate-200'}`}>
                          <p className={`font-black text-[10px] uppercase tracking-[0.3em] ${pixConfirmado ? 'text-white' : 'text-slate-600'}`}>
                            {pixConfirmado ? 'PIX Confirmado — Valor Recebido' : 'Aguardando Confirmação'}
                          </p>
                          {!pixConfirmado && (
                            <button
                              type="button"
                              onClick={() => setPixConfirmado(true)}
                              className="mt-3 w-full py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-600 text-white font-black text-[10px] uppercase tracking-[0.3em] transition-all active:scale-95 flex items-center justify-center gap-2 shadow-[0_10px_25px_rgba(245,158,11,0.3)]"
                            >
                              <CheckCircle size={16} /> CONFIRMAR RECEBIMENTO DO PIX
                            </button>
                          )}
                        </div>
                      </motion.div>
                    )}
                    {mistoFaltante > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        <button
                          type="button"
                          onClick={() => setValorMisto(prev => ({ ...prev, CASH: mistoFaltante.toFixed(2) }))}
                          className="px-4 py-3 rounded-2xl bg-emerald-100 hover:bg-emerald-200 border border-emerald-200 text-[10px] font-black text-emerald-700 uppercase tracking-widest transition-all active:scale-95"
                        >
                          Completar com Dinheiro (+R$ {formatarMoeda(mistoFaltante)})
                        </button>
                      </div>
                    )}
                    <div className={`mt-4 rounded-2xl p-4 flex justify-between items-center font-bold text-[11px] uppercase tracking-wider ${somaMisto > 0 && somaMisto >= totalCarrinho - 0.009 ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : mistoFaltante > 0 ? 'bg-amber-50 border border-amber-200 text-amber-700' : 'bg-slate-100 border border-slate-200 text-slate-500'}`}>
                      <span>Composição informada</span>
                      <span className="font-black tnum">
                        {somaMisto > 0 && totalCarrinho > 0 ? `R$ ${formatarMoeda(somaMisto)} de R$ ${formatarMoeda(totalCarrinho)}` : 'Informe os valores acima'}
                      </span>
                    </div>
                  </motion.div>
                )}
                {formaPagamento === 'FIADO' && (
                  <motion.div initial={{opacity:0}} animate={{opacity:1}} className="space-y-4">
                    <div className="flex items-center justify-between gap-2 ml-2">
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Cliente para Fiado</p>
                      {fiadoVinculado && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-100 text-emerald-700 rounded-xl text-[9px] font-black uppercase tracking-widest">
                          <CheckCircle size={12} /> Vinculado ao cliente do PDV
                        </span>
                      )}
                    </div>

                    {formaPagamento === 'FIADO' && clienteEhConsumidor && (
                      <div className="bg-red-50 border-2 border-red-200 rounded-[2rem] p-6 text-center">
                        <AlertTriangle size={26} className="text-red-500 mx-auto mb-3" />
                        <p className="text-[11px] font-black text-red-600 uppercase tracking-[0.25em] mb-1">Selecione um cliente cadastrado</p>
                        <p className="text-[11px] font-bold text-slate-600">Venda fiada exige cliente cadastrado — escolha o cliente no início da venda (não o Consumidor Final).</p>
                      </div>
                    )}

                    {!clienteEhConsumidor && clienteSelecionado && !selectedCustomerAccount && customerAccountSearch.trim() === '' && !contaFiadoDoCliente && (
                      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-2 animate-fadeIn">
                        <AlertTriangle size={15} className="text-amber-600 shrink-0 mt-0.5" />
                        <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wide leading-relaxed">
                          Nenhuma conta de fiado encontrada para <b>{limparTexto((cliente?.name || cliente?.inmateName || 'o cliente selecionado'), 24)}</b>.
                          Cadastre em <b>Clientes → Contas de Fiado</b> ou escolha abaixo.
                        </p>
                      </div>
                    )}

                    {!clienteEhConsumidor && (
                      <div className="relative">
                        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          ref={fiadoSearchRef}
                          type="text"
                          placeholder="Buscar cliente cadastrado..."
                          value={customerAccountSearch}
                          onChange={e => { setCustomerAccountSearch(e.target.value); setSelectedCustomerAccount(null); }}
                          className="w-full pl-10 pr-4 py-4 rounded-[1.5rem] bg-slate-50 border border-slate-200 text-slate-900 font-semibold text-sm outline-none focus:border-emerald-500 transition-all"
                        />
                      </div>
                    )}
                    {!clienteEhConsumidor && customerAccountSearch && !selectedCustomerAccount && (
                      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm max-h-48 overflow-y-auto custom-scrollbar">
                        {filteredCustomerAccounts.length === 0 ? (
                          <p className="p-4 text-center text-slate-400 text-xs font-semibold">Nenhum cliente encontrado</p>
                        ) : filteredCustomerAccounts.map(ca => {
                          const isOverLimit = (ca.currentDebt || 0) >= ca.creditLimit && ca.creditLimit > 0;
                          return (
                            <button
                              key={ca.id}
                              onClick={() => { setSelectedCustomerAccount(ca); setCustomerAccountSearch(ca.nome); }}
                              disabled={ca.status === 'blocked' || isOverLimit}
                              className={`w-full flex items-center gap-4 p-4 hover:bg-emerald-50 transition-all border-b border-slate-100 last:border-0 text-left ${ca.status === 'blocked' ? 'opacity-50' : ''}`}
                            >
                              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isOverLimit ? 'bg-red-100 text-red-600' : ca.currentDebt > 0 ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'}`}>
                                <BookOpen size={18} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-bold text-slate-900 text-sm truncate">{ca.nome}</p>
                                <p className="text-[10px] text-slate-500">Tel: {ca.telefone || '—'} • Limite: R$ {formatarMoeda(ca.creditLimit)}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-[10px] font-black text-slate-400 uppercase">Dívida</p>
                                <p className={`font-black text-sm ${isOverLimit ? 'text-red-600' : 'text-slate-900'}`}>R$ {formatarMoeda(ca.currentDebt || 0)}</p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {!clienteEhConsumidor && selectedCustomerAccount && (
                      <div className="bg-slate-50 rounded-2xl border border-slate-200 p-5 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-black text-slate-900 text-sm truncate">{selectedCustomerAccount.nome}</p>
                            <p className="text-[10px] text-slate-500">{selectedCustomerAccount.telefone || '—'}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className={`text-[9px] font-black px-3 py-1.5 rounded-lg uppercase tracking-wider ${(selectedCustomerAccount.currentDebt || 0) >= (selectedCustomerAccount.creditLimit || 0) ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                              {(selectedCustomerAccount.creditLimit || 0) > 0 ? `R$ ${formatarMoeda((selectedCustomerAccount.creditLimit || 0) - (selectedCustomerAccount.currentDebt || 0))} disponível` : 'Sem limite'}
                            </span>
                            <button
                              type="button"
                              onClick={() => { fiadoDesvinculadoRef.current = true; fiadoVinculoAtivo.current = null; setSelectedCustomerAccount(null); setCustomerAccountSearch(''); setTimeout(() => fiadoSearchRef.current?.focus(), 50); }}
                              className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 font-black text-[9px] uppercase tracking-wider transition-all active:scale-95 flex items-center gap-1"
                            >
                              <X size={11} /> Trocar
                            </button>
                          </div>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="font-semibold text-slate-500">Limite: R$ {formatarMoeda(selectedCustomerAccount.creditLimit)}</span>
                          <span className="font-black text-red-600">Dívida Atual: R$ {formatarMoeda(selectedCustomerAccount.currentDebt || 0)}</span>
                        </div>
                        <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${(selectedCustomerAccount.currentDebt || 0) >= selectedCustomerAccount.creditLimit ? 'bg-red-500' : 'bg-emerald-500'}`}
                            style={{ width: `${selectedCustomerAccount.creditLimit > 0 ? Math.min((selectedCustomerAccount.currentDebt || 0) / selectedCustomerAccount.creditLimit * 100, 100) : 0}%` }}
                          />
                        </div>
                        {((selectedCustomerAccount.currentDebt || 0) + totalCarrinho) > (selectedCustomerAccount.creditLimit || 0) && (selectedCustomerAccount.creditLimit || 0) > 0 && (
                          <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2">
                            <AlertTriangle size={16} className="text-red-600 shrink-0" />
                            <span className="text-xs font-black text-red-600 uppercase tracking-wider">Sem saldo no momento - Limite excedido</span>
                          </div>
                        )}
                      </div>
                    )}
                  </motion.div>
                )}
              </div>

              <div className="flex gap-4 p-8 border-t border-slate-200 bg-slate-50 shrink-0">
                <button onClick={() => setModalPagamento(false)} className="flex-1 py-5 rounded-[1.5rem] font-black text-[11px] uppercase tracking-[0.2em] text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200 touch-target transition-all active:scale-95">
                    Cancelar
                </button>
                {formaPagamento === 'WALLET' && ((settings?.weeklyWalletLimit || 300) - ((cliente as any)?.weeklySpent || 0)) <= 0 ? (
                  <div className="w-full py-6 rounded-[2rem] bg-red-50 border-2 border-red-200 flex items-center justify-center">
                    <span className="font-black text-red-600 uppercase tracking-[0.3em] text-xs leading-none">Sem saldo no momento</span>
                  </div>
                ) : (formaPagamento === 'FIADO' || formaPagamento === 'FIADO_30') && (clienteEhConsumidor || !selectedCustomerAccount && formaPagamento === 'FIADO' || !fiado30UserId && formaPagamento === 'FIADO_30') ? (
                  <div className="w-full py-6 rounded-[2rem] bg-red-50 border-2 border-red-200 flex items-center justify-center px-4">
                    <span className="font-black text-red-600 uppercase tracking-[0.3em] text-xs leading-none text-center">
                      {clienteEhConsumidor ? 'Exige cliente cadastrado' : formaPagamento === 'FIADO' && !selectedCustomerAccount ? 'Selecione um cliente' : formaPagamento === 'FIADO_30' && !fiado30UserId ? 'Selecione um usuário' : 'Sem saldo no momento'}
                    </span>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col gap-2">
                    <button
                      onClick={finalizarVenda}
                      disabled={processando || pixPendente || falhaCashValor || falhaCashSessao || falhaMistoValor || falhaMistoExcedente || falhaMistoWalletConsumidor || falhaMistoWallet || (formaPagamento === 'CARD' && !cardConfirmado) || (formaPagamento === 'WALLET' && !jointValido && (((cliente as any)?.walletBalance || 0) < totalCarrinho || ((settings?.weeklyWalletLimit || 300) - ((cliente as any)?.weeklySpent || 0)) < totalCarrinho))}
                      className="w-full py-6 rounded-[2rem] font-black text-base uppercase tracking-[0.4em] text-white shadow-[0_20px_40px_rgba(0,0,0,0.3)] hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-4"
                      style={{ backgroundColor: corPrincipal }}
                    >
                      {processando ? (
                        <RefreshCw className="animate-spin" size={20} />
                      ) : (
                        <>
                          <Check size={24} />
                          {pixPendente ? 'AGUARDANDO CONFIRMAÇÃO PIX'
                            : (formaPagamento === 'CARD' && !cardConfirmado) ? 'AGUARDANDO CONFIRMAÇÃO CARTÃO'
                            : (formaPagamento === 'WALLET' && jointValido) ? 'FINALIZAR EM DUPLA'
                            : (formaPagamento === 'WALLET' && (cliente?.walletBalance || 0) < totalCarrinho) ? 'SALDO INSUFICIENTE'
                            : (formaPagamento === 'MIXED' && falhaMistoWalletConsumidor) ? 'CONSUMO EXIGE CLIENTE'
                            : (formaPagamento === 'MIXED' && falhaMistoWallet) ? 'CRÉDITOS INDISPONÍVEIS'
                            : 'FINALIZAR VENDA'}
                        </>
                      )}
                    </button>
                    {(formaPagamento === 'MIXED' && falhaMistoWalletConsumidor) && (
                      <p className="text-center text-[9px] font-black uppercase tracking-widest text-red-600">
                        Venda para consumidor final não pode usar créditos internos (WALLET)
                      </p>
                    )}
                    {(formaPagamento === 'MIXED' && falhaMistoWallet) && (
                      <p className="text-center text-[9px] font-black uppercase tracking-widest text-amber-600">
                        Parte em créditos acima do saldo ({formatarMoeda(saldoCarteiraPdv)}) ou do limite semanal disponível ({formatarMoeda(limiteSemanalPdv)})
                      </p>
                    )}
                    {(formaPagamento === 'WALLET' && jointAtivo) && (
                      <p className={`text-center text-[9px] font-black uppercase tracking-widest ${jointValido ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {jointValido
                          ? 'Débito compartilhado autorizado — 2 carteiras serão debitadas'
                          : 'Complete a composição do split para liberar a finalização'}
                      </p>
                    )}
                    {pixPendente && (
                      <p className="text-center text-[9px] font-black text-amber-600 uppercase tracking-widest">
                        Confirme o recebimento do PIX acima para liberar a finalização
                      </p>
                    )}
                    {formaPagamento === 'CASH' && falhaCashValor && (
                      <p className="text-center text-[9px] font-black text-amber-600 uppercase tracking-widest">
                        Faltam R$ {formatarMoeda(Math.max(0, totalCarrinho - valorCashPdv))} — informe o valor recebido ou use os botões acima
                      </p>
                    )}
                    {(formaPagamento === 'CASH' || formaPagamento === 'MIXED') && falhaCashSessao && (
                      <p className="text-center text-[9px] font-black text-amber-600 uppercase tracking-widest">
                        Abra o caixa antes de vender em dinheiro
                      </p>
                    )}
                    {formaPagamento === 'MIXED' && falhaMistoValor && (
                      <p className="text-center text-[9px] font-black text-amber-600 uppercase tracking-widest">
                        Faltam R$ {formatarMoeda(mistoFaltante)} na composição do pagamento
                      </p>
                    )}
                    {formaPagamento === 'MIXED' && falhaMistoExcedente && (
                      <p className="text-center text-[9px] font-black text-amber-600 uppercase tracking-widest">
                        Excedente sem dinheiro em caixa — reduza a parte PIX ou créditos
                      </p>
                    )}
                    {formaPagamento === 'CARD' && !cardConfirmado && (
                      <p className="text-center text-[9px] font-black text-amber-600 uppercase tracking-widest">
                        Confirme o recebimento no cartão acima para liberar a finalização
                      </p>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* DUPLA SENHA MESTRA — AUTORIZAÇÃO DE VENDA FIADA (Primária + Secundária) */}
      <AnimatePresence>
        {confirmandoFiado && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[1001] flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4">
            <motion.div initial={{ scale: 0.95, y: 16 }} animate={{ scale: 1, y: 0 }}
              className="w-full max-w-sm bg-white rounded-[2rem] p-8 shadow-[0_40px_100px_rgba(0,0,0,0.5)] border border-slate-200 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center shrink-0">
                  <Lock size={18} className="text-white" />
                </div>
                <div>
                  <p className="font-black text-sm uppercase tracking-tight text-slate-900">Autorizar Venda Fiada</p>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Dupla senha obrigatória (Primária + Secundária)</p>
                </div>
              </div>
              {selectedCustomerAccount && (
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex justify-between items-center font-black text-xs tnum">
                  <span className="uppercase text-slate-600 truncate max-w-[55%]">{selectedCustomerAccount.nome || 'Cliente Fiado'}</span>
                  <span style={{ color: corPrincipal }}>+R$ {formatarMoeda(totalCarrinho)}</span>
                </div>
              )}
              <div className="space-y-3">
                <div>
                  <label className="block text-[9px] font-black text-slate-500 uppercase tracking-wider mb-1">Senha Primária (Admin Principal)</label>
                  <input
                    type="password" autoFocus placeholder="••••••••"
                    className="w-full bg-slate-50 border-2 border-slate-200 focus:border-emerald-500 p-4 rounded-2xl font-black text-center text-lg outline-none transition-colors"
                    value={senhaFiadoPrimaria}
                    onChange={e => { setSenhaFiadoPrimaria(e.target.value); setSenhaFiadoErro(''); }}
                    onKeyDown={e => { if (e.key === 'Enter') executarVendaFiado(); }}
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-black text-slate-500 uppercase tracking-wider mb-1">Senha Secundária (Admin Secundário / Mestra)</label>
                  <input
                    type="password" placeholder="••••••••"
                    className="w-full bg-slate-50 border-2 border-slate-200 focus:border-emerald-500 p-4 rounded-2xl font-black text-center text-lg outline-none transition-colors"
                    value={senhaFiadoSecundaria}
                    onChange={e => { setSenhaFiadoSecundaria(e.target.value); setSenhaFiadoErro(''); }}
                    onKeyDown={e => { if (e.key === 'Enter') executarVendaFiado(); }}
                  />
                </div>
              </div>
              {senhaFiadoErro && (
                <p className="text-[10px] font-black text-red-600 uppercase tracking-wider flex items-center gap-1.5">
                  <AlertTriangle size={13} /> {senhaFiadoErro}
                </p>
              )}
              <div className="flex gap-2 pt-1">
                <button type="button"
                  onClick={() => { setConfirmandoFiado(false); setSenhaFiadoPrimaria(''); setSenhaFiadoSecundaria(''); setSenhaFiadoErro(''); }}
                  className="flex-1 py-3.5 rounded-2xl bg-white border-2 border-slate-200 hover:bg-slate-100 font-black text-[10px] uppercase tracking-[0.2em] text-slate-600 transition-all active:scale-95">
                  Cancelar
                </button>
                <button type="button" onClick={executarVendaFiado} disabled={senhaFiadoProcessando}
                  className="flex-1 py-3.5 rounded-2xl text-white font-black text-[10px] uppercase tracking-[0.2em] transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 shadow-md"
                  style={{ backgroundColor: corPrincipal }}>
                  {senhaFiadoProcessando ? <RefreshCw size={14} className="animate-spin" /> : <CheckCircle size={14} />} Confirmar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* SUCESSO MODAL - RECIBO PROFISSIONAL */}
      <AnimatePresence>
      {ultimoPedido && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/90 backdrop-blur-xl p-4 sm:p-6"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 30 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            className="w-full max-w-xl bg-white rounded-[2.5rem] shadow-[0_40px_120px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col max-h-[90vh] border border-slate-200"
          >
            {/* Header Sucesso */}
            <div className="p-10 bg-emerald-500 text-center relative overflow-hidden shrink-0">
               <div className="absolute inset-0 bg-gradient-to-br from-emerald-500 via-emerald-600 to-emerald-700"></div>
               {/* Decorative circles */}
               <div className="absolute -top-10 -left-10 w-40 h-40 bg-white/10 rounded-full blur-3xl"></div>
               <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-emerald-400/20 rounded-full blur-3xl"></div>
               
               <div className="relative z-10 flex flex-col items-center">
                  <motion.div 
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", damping: 12 }}
                    className="w-24 h-24 bg-white rounded-full flex items-center justify-center mb-6 shadow-2xl border-4 border-emerald-400/30"
                  >
                    <Check size={48} className="text-emerald-600" strokeWidth={3} />
                  </motion.div>
                  <h2 className="text-white font-black text-3xl tracking-tight uppercase leading-none">Venda Confirmada</h2>
                  <p className="text-emerald-100 font-bold text-[10px] tracking-[0.5em] uppercase mt-3 opacity-80">Mercado Fácil PDV Center</p>
               </div>
            </div>

            {/* Conteúdo do Cupom */}
            <div className="flex-1 overflow-y-auto p-10 custom-scrollbar font-mono text-slate-800">
               <div className="flex justify-between items-start mb-10 pb-6 border-b border-dashed border-slate-200">
                  <div className="text-left">
                     <p className="text-[10px] font-black text-slate-400 uppercase mb-2 tracking-[0.2em]">Referência do Pedido</p>
                     <p className="font-bold text-base tracking-widest text-slate-900 bg-slate-50 px-3 py-1 rounded-lg border border-slate-100 inline-block font-sans lowercase">#{ultimoPedido.id?.slice(-8)}</p>
                  </div>
                  <div className="text-right">
                     <p className="text-[10px] font-black text-slate-400 uppercase mb-2 tracking-[0.2em]">Data e Emissão</p>
                     <p className="font-bold text-sm text-slate-700 font-sans">{new Date().toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })}</p>
                  </div>
               </div>

               <div className="mb-10">
                  <div className="flex items-center gap-3 mb-6 pb-2 border-b border-slate-100">
                    <Package size={14} className="text-slate-400" />
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Relação de Itens da Compra</p>
                  </div>
                  
                  <div className="space-y-6">
                      {(ultimoPedido.items || []).map((item, idx) => (
                        <div key={idx} className="flex justify-between items-start group">
                          <div className="flex-1 pr-6">
                            <p className="font-black text-sm text-slate-900 uppercase leading-snug group-hover:text-emerald-600 transition-colors font-sans">{item.name}</p>
                            <p className="text-[11px] text-slate-400 mt-1 uppercase font-semibold">
                              {item.quantity}un x R$ {formatarMoeda(item.priceAtPurchase || 0)}
                            </p>
                          </div>
                          <div className="text-right font-black text-slate-900 text-sm font-sans pt-1">
                            R$ {formatarMoeda((item.quantity || 1) * (item.priceAtPurchase || 0))}
                          </div>
                        </div>
                      ))}
                  </div>
               </div>

               {/* Resumo Financeiro */}
               <div className="mt-10 p-8 rounded-[2rem] bg-slate-50 border-2 border-slate-100 relative">
                  {/* Decorative notch */}
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-6 h-6 bg-slate-50 rotate-45 border-t-2 border-l-2 border-slate-100"></div>
                  
                  <div className="space-y-4">
                      <div className="flex justify-between items-center text-slate-500 font-bold uppercase text-[10px] tracking-widest">
                        <span>Base de Cálculo</span>
                        <span>R$ {formatarMoeda(ultimoPedido.total)}</span>
                      </div>
                      <div className="flex justify-between items-center text-slate-500 font-bold uppercase text-[10px] tracking-widest">
                        <span>Forma de Pagamento</span>
                        <span className="text-slate-900">
                          {ultimoPedido.paymentMethod === 'WALLET' ? 'SALDO INTERNO'
                            : ultimoPedido.paymentMethod === 'CARD' && (ultimoPedido as any).cardBrand
                              ? `CARTÃO (${(ultimoPedido as any).cardBrand})`
                              : ultimoPedido.paymentMethod}
                        </span>
                      </div>
                      <div className="pt-4 mt-2 border-t border-slate-200 flex justify-between items-center">
                        <span className="font-black text-xs text-slate-900 uppercase tracking-[0.3em]">Total Pago</span>
                        <span className="text-3xl font-black text-emerald-600 tracking-tighter">R$ {formatarMoeda(ultimoPedido.total)}</span>
                      </div>
                  </div>
               </div>
               
                <div className="mt-8 text-center">
                   <p className="text-[9px] font-black text-slate-300 uppercase tracking-[0.5em]">Obrigado pela preferência!</p>
                </div>
            </div>

            {/* Footer Ações - Impressora fiscal (bobina) em primeiro lugar por padrão */}
            <div className="p-8 border-t border-slate-100 bg-slate-50/50 flex gap-4 shrink-0">
                <button
                  onClick={() => {
                    imprimirComPrioridadeFiscal({ type: 'CUPOM', data: ultimoPedido }, settings).catch(console.error);
                  }}
                  className="flex-1 py-5 rounded-2xl font-black text-white text-[10px] uppercase tracking-widest shadow-[0_15px_30px_rgba(0,0,0,0.15)] hover:brightness-110 transition-all active:scale-95 flex items-center justify-center gap-3 border border-emerald-400/20"
                  style={{ backgroundColor: corPrincipal }}
                >
                  <Printer size={18} /> Bobina 48mm (Fiscal)
                </button>
                <button
                  onClick={() => {
                    if (setPrintOrder) setPrintOrder(ultimoPedido);
                  }}
                  className="flex-1 py-5 rounded-2xl bg-white border border-slate-200 text-slate-600 font-black text-[10px] uppercase tracking-widest hover:bg-slate-100 transition-all active:scale-95 flex items-center justify-center gap-3 shadow-sm hover:shadow-md"
                >
                  <Scan size={18} /> Imprimir Recibo
                </button>
                <button
                  onClick={() => { setUltimoPedido(null); setTimeout(() => produtoInputRef.current?.focus(), 50); }}
                  className="flex-1 py-5 rounded-2xl bg-slate-900 text-white font-black text-[10px] uppercase tracking-widest hover:bg-slate-700 transition-all active:scale-95 flex items-center justify-center gap-3 shadow-sm"
                >
                  <Plus size={18} /> Nova Operação
                </button>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* F4 PRODUCT CATALOG MODAL - VITRINE DE FOTOS */}
      {showProductModal && (
        <div className="fixed inset-0 z-[900] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-3xl p-6 shadow-2xl max-w-5xl w-full max-h-[85vh] overflow-hidden flex flex-col border border-slate-200"
          >
            <div className="flex justify-between items-center pb-4 border-b border-slate-100 mb-4 shrink-0">
              <div>
                <h3 className="text-lg font-bold text-slate-800 tracking-tight"><Search size={18} className="inline-block mr-1.5 -mt-0.5 text-emerald-600" />Catálogo de Produtos</h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Selecione os produtos para adicionar ao carrinho (F4 para fechar)</p>
              </div>
              <button
                onClick={() => setShowProductModal(false)}
                className="p-2 text-slate-400 hover:text-red-500 rounded-xl transition-all"
              >
                <X size={24} />
              </button>
            </div>

            <div className="relative mb-4 shrink-0">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                <Search size={18} />
              </div>
              <input
                className="w-full pl-12 pr-6 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-500 outline-none bg-slate-50 text-sm font-bold shadow-inner"
                placeholder="Filtrar produtos no catálogo..."
                value={productModalSearch}
                onChange={e => setProductModalSearch(e.target.value)}
                autoFocus
              />
            </div>

            <div className="flex-1 overflow-y-auto pr-1">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {filteredProductsForModal.length === 0 ? (
                  <div className="col-span-full text-center py-20 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                    <Package size={40} className="mx-auto mb-4 opacity-25 text-slate-400" />
                    <p className="font-black uppercase tracking-wider text-xs text-slate-400">Nenhum produto encontrado</p>
                  </div>
                ) : filteredProductsForModal.map((p, idx) => {
                  const isOutOfStock = (p?.stock || 0) <= 0;
                  return (
                    <div
                      key={p?.id || `modal-prod-${idx}`}
                      className={`bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all duration-200 p-4 flex flex-col justify-between h-full relative cursor-pointer ${isOutOfStock ? 'opacity-60 grayscale' : ''}`}
                      onClick={() => {
                        if (!isOutOfStock) {
                          adicionarAoCarrinho(p);
                        }
                      }}
                    >
                      <div className="w-full aspect-square rounded-xl overflow-hidden bg-slate-50 mb-3 relative">
                        {p.imageUrl ? (
                          <img src={p.imageUrl} className="w-full h-full object-contain" alt={p.name} />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center bg-slate-100">
                            <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center mb-2 border border-slate-200/60">
                              <Package size={20} className="text-slate-300" />
                            </div>
                            <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest">Sem Foto</span>
                          </div>
                        )}
                        {isOutOfStock && (
                          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                            <span className="text-[10px] font-black bg-white text-black px-3 py-1 rounded-lg uppercase">Esgotado</span>
                          </div>
                        )}
                      </div>
                      <div className="flex-1 flex flex-col justify-between">
                        <h4 className="text-slate-800 font-bold text-xs tracking-wide line-clamp-2 uppercase mb-2">{p.name}</h4>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-emerald-600 font-extrabold text-xs">
                            {(p as any).promoPrice > 0 && (
                              <span className="text-[9px] text-slate-300 line-through mr-1 uppercase font-black">R$ {formatarMoeda(p.price)}</span>
                            )}
                            R$ {formatarMoeda(precoEfetivoProduto(p))}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!isOutOfStock) adicionarAoCarrinho(p);
                            }}
                            disabled={isOutOfStock}
                            className="bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg p-2 transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                          >
                            <Plus size={16} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* ── Cash Operation Modals ── */}
      {showCashModal && (
        <div className="fixed inset-0 z-[800] flex items-end sm:items-center justify-center bg-black/40 px-4 pb-4 sm:pb-0">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl">

            {showCashModal === 'open' && (
              <>
                <h3 className="text-lg font-bold text-slate-900 mb-1">Abrir Caixa</h3>
                <p className="text-sm text-slate-500 mb-4">Informe o valor inicial (fundo de troco) na gaveta.</p>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Valor Inicial (R$)</label>
                <input type="number" min="0" step="0.01" value={cashAmount}
                  onChange={e => setCashAmount(e.target.value)}
                  placeholder="Ex: 100,00"
                  className="w-full border border-slate-300 rounded-xl px-4 py-3 text-lg font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-400 mb-4" />
              </>
            )}

            {(showCashModal === 'supplement' || showCashModal === 'withdrawal') && (
              <>
                <h3 className="text-lg font-bold text-slate-900 mb-1">
                  {showCashModal === 'supplement' ? 'Suprimento' : 'Sangria de Segurança'}
                </h3>
                <p className="text-sm text-slate-500 mb-4">
                  {showCashModal === 'supplement' ? 'Entrada de dinheiro no caixa.' : 'Retirada de dinheiro do caixa.'}
                </p>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Valor (R$)</label>
                <input type="number" min="0.01" step="0.01" value={cashAmount}
                  onChange={e => setCashAmount(e.target.value)}
                  placeholder="0,00"
                  className="w-full border border-slate-300 rounded-xl px-4 py-3 text-lg font-bold text-slate-900 focus:outline-none focus:ring-2 mb-3" />
                <label className="block text-xs font-semibold text-slate-600 mb-1">Motivo</label>
                <input type="text" value={cashReason}
                  onChange={e => setCashReason(e.target.value)}
                  placeholder="Ex: Troco inicial, Retirada p/ cofre..."
                  className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 mb-4" />
              </>
            )}

            {showCashModal === 'close' && (
              <>
                <h3 className="text-lg font-bold text-slate-900 mb-1">Fechar Caixa</h3>
                <p className="text-sm text-slate-500 mb-1">Valor esperado no caixa:</p>
                <p className="text-2xl font-black text-slate-800 mb-4">{cashSession ? `R$ ${cashSession.currentBalance.toFixed(2)}` : '—'}</p>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Valor Contado Fisicamente (R$)</label>
                <input type="number" min="0" step="0.01" value={cashAmount}
                  onChange={e => setCashAmount(e.target.value)}
                  placeholder="0,00"
                  className="w-full border border-slate-300 rounded-xl px-4 py-3 text-lg font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-400 mb-4" />
              </>
            )}

            <div className="flex gap-3">
              <button onClick={() => { setShowCashModal(null); setCashAmount(''); setCashReason(''); }}
                className="flex-1 py-3 rounded-2xl border border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50 transition-all">
                Cancelar
              </button>
              <button
                onClick={
                  showCashModal === 'open' ? handleCashOpen
                    : showCashModal === 'supplement' ? handleCashSupplement
                    : showCashModal === 'withdrawal' ? handleCashWithdrawal
                    : handleCashClose
                }
                disabled={cashActionLoading}
                className="flex-1 py-3 rounded-2xl text-white font-bold text-sm shadow-md hover:brightness-110 transition-all active:scale-95 disabled:opacity-60"
                style={{ backgroundColor: showCashModal === 'close' ? '#ef4444' : showCashModal === 'withdrawal' ? '#ef4444' : corPrincipal }}
              >
                {cashActionLoading ? '...' : showCashModal === 'open' ? 'Abrir Caixa' : showCashModal === 'supplement' ? 'Registrar' : showCashModal === 'withdrawal' ? 'Registrar Sangria' : 'Confirmar Fechamento'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Painel Resumo de Vendas (por dia / por cliente) ── */}
      {showSalesPanel && (
        <div className="fixed inset-0 z-[900] bg-black/50 flex items-center justify-center p-4 sm:p-6 animate-fadeIn">
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-white rounded-[2rem] w-full max-w-3xl shadow-2xl flex flex-col overflow-hidden max-h-[92vh]"
          >
            {/* Header */}
            <div className="px-6 sm:px-8 py-5 border-b border-slate-100 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/30">
                  <BarChart3 size={24} />
                </div>
                <div>
                  <h2 className="font-black text-base uppercase tracking-tight leading-none">Resumo de Vendas</h2>
                  <p className="text-[10px] text-white/50 font-bold uppercase tracking-[0.25em] mt-1.5">Terminal de Venda Direta</p>
                </div>
              </div>
              <button
                onClick={() => setShowSalesPanel(false)}
                className="w-11 h-11 rounded-xl bg-white/10 hover:bg-red-500 text-white flex items-center justify-center transition-all active:scale-90"
              >
                <X size={20} />
              </button>
            </div>

            {/* Filtros + Tabs */}
            <div className="px-6 sm:px-8 py-4 border-b border-slate-100 flex flex-col sm:flex-row gap-4 sm:items-center justify-between shrink-0 bg-slate-50/60">
              <div className="flex gap-2">
                {([
                  { key: 'day', label: 'Por Dia', icon: Calendar },
                  { key: 'client', label: 'Por Cliente', icon: Users2 },
                ] as const).map(t => (
                  <button
                    key={t.key}
                    onClick={() => { setSalesTab(t.key); setExpandedKey(null); }}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all active:scale-95 ${salesTab === t.key ? 'bg-slate-900 text-white shadow-lg' : 'bg-white text-slate-500 border border-slate-200 hover:text-slate-800'}`}
                  >
                    <t.icon size={14} /> {t.label}
                  </button>
                ))}
              </div>
              <div className="flex gap-1.5 bg-white rounded-xl p-1 border border-slate-200 w-fit">
                {([
                  { key: 'today', label: 'Hoje' },
                  { key: '7', label: '7 Dias' },
                  { key: '30', label: '30 Dias' },
                  { key: 'all', label: 'Tudo' },
                ] as const).map(p => (
                  <button
                    key={p.key}
                    onClick={() => setSalesPeriod(p.key)}
                    className={`px-3.5 py-2 rounded-lg font-black text-[9px] uppercase tracking-widest transition-all ${salesPeriod === p.key ? 'bg-emerald-500 text-white shadow-md' : 'text-slate-500 hover:text-slate-800'}`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Resumo geral */}
            <div className="px-6 sm:px-8 py-4 flex gap-4 border-b border-slate-100 shrink-0">
              <div className="flex-1 bg-emerald-50 border border-emerald-200 rounded-2xl px-5 py-4">
                <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest">Vendas no Período</p>
                <p className="text-2xl font-black text-emerald-700 mt-1">{salesOrders.length}</p>
              </div>
              <div className="flex-1 bg-slate-900 rounded-2xl px-5 py-4">
                <p className="text-[9px] font-black text-white/50 uppercase tracking-widest">Faturamento Total</p>
                <p className="text-2xl font-black text-emerald-400 mt-1">R$ {formatarMoeda(totalPeriodo)}</p>
              </div>
            </div>

            {/* Lista */}
            <div className="flex-1 overflow-y-auto px-6 sm:px-8 py-4 custom-scrollbar">
              {salesOrders.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                    <BarChart3 size={28} className="text-slate-400" />
                  </div>
                  <p className="font-black text-slate-500 uppercase tracking-widest text-xs">Nenhuma venda no período</p>
                </div>
              )}

              {salesTab === 'day' && salesByDay.map(day => {
                const isOpen = expandedKey === day.day;
                return (
                  <div key={day.day} className="mb-3 rounded-2xl border border-slate-200 overflow-hidden bg-white">
                    <button
                      onClick={() => setExpandedKey(isOpen ? null : day.day)}
                      className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-all gap-3"
                    >
                      <div className="flex items-center gap-4 min-w-0">
                        <div className="w-11 h-11 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0">
                          <Calendar size={20} />
                        </div>
                        <div className="text-left min-w-0">
                          <p className="font-black text-slate-900 text-sm uppercase tracking-tight">{day.day}</p>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{day.count} venda{day.count !== 1 ? 's' : ''}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-black text-emerald-600 text-sm">R$ {formatarMoeda(day.total)}</span>
                        <ChevronLeft size={18} className={`text-slate-400 transition-transform ${isOpen ? '-rotate-90' : 'rotate-180'}`} />
                      </div>
                    </button>
                    {isOpen && (
                      <div className="border-t border-slate-100 bg-slate-50/50">
                        {day.list.map(o => (
                          <div key={o.id} className="flex items-center justify-between px-6 py-3 border-b border-slate-100 last:border-b-0 gap-3">
                            <div className="min-w-0">
                              <p className="font-bold text-slate-700 text-xs truncate">{o.userName || o.inmateName || o.userId || 'CONSUMIDOR GERAL'}</p>
                              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">#{String(o.id || '').slice(0, 10)} · {formatarHora(o.date)} · {o.paymentMethod || o.status}</p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="font-black text-slate-800 text-sm">R$ {formatarMoeda(o.total)}</span>
                              {!estaCancelado(o) && (
                                <>
                                  <button
                                    onClick={() => reimprimirPedido(o)}
                                    className="p-2 rounded-lg hover:bg-emerald-100 text-emerald-600 transition-all"
                                    title="Reimprimir cupom"
                                  >
                                    <Printer size={15} />
                                  </button>
                                  <button
                                    onClick={() => abrirEstornoCom(o)}
                                    className="p-2 rounded-lg hover:bg-red-100 text-red-500 transition-all"
                                    title="Estornar venda"
                                  >
                                    <RotateCcw size={15} />
                                  </button>
                                </>
                              )}
                              {estaCancelado(o) && (
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-100 px-2 py-1 rounded-md">Estornada</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {salesTab === 'client' && salesByClient.map(cli => {
                const isOpen = expandedKey === cli.name;
                return (
                  <div key={cli.name} className="mb-3 rounded-2xl border border-slate-200 overflow-hidden bg-white">
                    <button
                      onClick={() => setExpandedKey(isOpen ? null : cli.name)}
                      className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-all gap-3"
                    >
                      <div className="flex items-center gap-4 min-w-0">
                        <div className="w-11 h-11 rounded-2xl bg-blue-500/10 text-blue-600 flex items-center justify-center font-black shrink-0">
                          {String(cli.name).charAt(0).toUpperCase()}
                        </div>
                        <div className="text-left min-w-0">
                          <p className="font-black text-slate-900 text-sm uppercase tracking-tight truncate">{cli.name}</p>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{cli.count} venda{cli.count !== 1 ? 's' : ''}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-black text-blue-600 text-sm">R$ {formatarMoeda(cli.total)}</span>
                        <ChevronLeft size={18} className={`text-slate-400 transition-transform ${isOpen ? '-rotate-90' : 'rotate-180'}`} />
                      </div>
                    </button>
                    {isOpen && (
                      <div className="border-t border-slate-100 bg-slate-50/50">
                        {cli.list.map(o => (
                          <div key={o.id} className="flex items-center justify-between px-6 py-3 border-b border-slate-100 last:border-b-0 gap-3">
                            <div className="min-w-0 flex items-center gap-2">
                              <Clock size={12} className="text-slate-400 shrink-0" />
                              <p className="font-bold text-slate-700 text-xs truncate">{new Date(o.date).toLocaleDateString('pt-BR')} · {formatarHora(o.date)}</p>
                              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider hidden sm:inline">#{String(o.id || '').slice(0, 10)}</p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="font-black text-slate-800 text-sm">R$ {formatarMoeda(o.total)}</span>
                              {!estaCancelado(o) && (
                                <>
                                  <button
                                    onClick={() => reimprimirPedido(o)}
                                    className="p-2 rounded-lg hover:bg-emerald-100 text-emerald-600 transition-all"
                                    title="Reimprimir cupom"
                                  >
                                    <Printer size={15} />
                                  </button>
                                  <button
                                    onClick={() => abrirEstornoCom(o)}
                                    className="p-2 rounded-lg hover:bg-red-100 text-red-500 transition-all"
                                    title="Estornar venda"
                                  >
                                    <RotateCcw size={15} />
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="px-6 sm:px-8 py-4 border-t border-slate-100 flex justify-end shrink-0 bg-slate-50/60">
              <button
                onClick={() => setShowSalesPanel(false)}
                className="px-8 py-3.5 rounded-2xl bg-slate-900 text-white font-black text-[10px] uppercase tracking-widest hover:bg-slate-800 transition-all active:scale-95"
              >
                Fechar
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* ── MODAL DE ESTORNO DE VENDA (F9) ── */}
      <RefundSaleModal
        isOpen={showRefundModal}
        initialOrder={refundSelected}
        ordersBase={orders}
        onClose={() => setShowRefundModal(false)}
        onAfterSuccess={(order) => {
          if (ultimaVenda && String(order.id) === String(ultimaVenda.id)) setUltimaVenda(null);
        }}
      />

      {/* ── MODAL DE VENDAS SUSPENSAS ── */}
      {showSuspendedList && (
        <div className="fixed inset-0 z-[950] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn">
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-white rounded-[2rem] w-full max-w-xl shadow-2xl flex flex-col overflow-hidden max-h-[90vh]"
          >
            <div className="px-6 sm:px-8 py-5 border-b border-slate-100 bg-gradient-to-br from-amber-500 via-amber-500 to-amber-600 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center shadow-lg">
                  <PauseCircle size={24} />
                </div>
                <div>
                  <h2 className="font-black text-base uppercase tracking-tight leading-none">Vendas Suspensas</h2>
                  <p className="text-[10px] text-white/60 font-bold uppercase tracking-[0.25em] mt-1.5">Retome ou descarte carrinhos salvos</p>
                </div>
              </div>
              <button
                onClick={() => setShowSuspendedList(false)}
                className="w-11 h-11 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all active:scale-90"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 sm:px-8 py-5 custom-scrollbar">
              {suspendedCarts.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                    <PauseCircle size={28} className="text-slate-400" />
                  </div>
                  <p className="font-black text-slate-500 uppercase tracking-widest text-xs">Nenhuma venda suspensa</p>
                </div>
              )}
              {suspendedCarts.map(sc => (
                <div key={sc.id} className="mb-3 rounded-2xl border border-slate-200 bg-white overflow-hidden">
                  <div className="p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-black text-slate-900 text-xs uppercase truncate">{sc.clienteNome}</p>
                        <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">
                          {sc.items.reduce((s: number, i: any) => s + (i.quantity || 0), 0)} itens · {new Date(sc.createdAt).toLocaleString('pt-BR')}
                        </p>
                      </div>
                      <span className="font-black text-emerald-600 text-sm shrink-0">R$ {formatarMoeda(sc.total)}</span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {sc.items.slice(0, 6).map((item: any, idx: number) => (
                        <span key={idx} className="text-[9px] font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-md">
                          {item.name} ×{item.quantity}
                        </span>
                      ))}
                      {sc.items.length > 6 && (
                        <span className="text-[9px] font-black text-slate-400 bg-slate-100 px-2 py-1 rounded-md">+{sc.items.length - 6} itens</span>
                      )}
                    </div>
                  </div>
                  <div className="flex border-t border-slate-100">
                    <button
                      onClick={() => descartarVendaSuspensa(sc.id)}
                      className="flex-1 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all"
                    >
                      Descartar
                    </button>
                    <button
                      onClick={() => retomarVendaSuspensa(sc.id)}
                      className="flex-1 py-3 text-[10px] font-black uppercase tracking-widest text-emerald-600 hover:bg-emerald-50 transition-all border-l border-slate-100"
                    >
                      Retomar Venda
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="px-6 sm:px-8 py-4 border-t border-slate-100 flex justify-end shrink-0 bg-slate-50/60">
              <button
                onClick={() => setShowSuspendedList(false)}
                className="px-8 py-3.5 rounded-2xl bg-slate-900 text-white font-black text-[10px] uppercase tracking-widest hover:bg-slate-800 transition-all active:scale-95"
              >
                Fechar
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* ── PREÇO DINÂMICO (produto de valor livre) ── */}
      <AnimatePresence>
        {produtoPrecoDinamico && (
          <div className="fixed inset-0 z-[950] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn">
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              className="bg-white rounded-[2rem] w-full max-w-sm shadow-2xl border border-slate-200 overflow-hidden"
            >
              <div className="px-6 py-5 border-b border-slate-100 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
                  <Tag size={18} className="text-emerald-400" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-black text-sm uppercase tracking-tight leading-none">Preço Dinâmico</h3>
                  <p className="text-[9px] text-white/50 font-bold uppercase tracking-[0.2em] mt-1">Produto sem valor fixo</p>
                </div>
              </div>
              <div className="p-6 space-y-4">
                <p className="font-black text-xs uppercase tracking-widest text-slate-700 truncate">{produtoPrecoDinamico.produto?.name || 'Produto'}</p>
                <div className="relative">
                  <span className="absolute left-5 top-1/2 -translate-y-1/2 font-black text-lg text-emerald-600">R$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    autoFocus
                    placeholder="0,00"
                    className="w-full bg-slate-50 border-2 border-slate-200 focus:border-emerald-500 pl-14 pr-4 py-4 rounded-2xl font-black text-2xl tnum outline-none transition-colors"
                    value={produtoPrecoDinamico.preco}
                    onChange={e => setProdutoPrecoDinamico(prev => prev ? { ...prev, preco: e.target.value } : prev)}
                    onKeyDown={e => { if (e.key === 'Enter') confirmarPrecoDinamico(); }}
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setProdutoPrecoDinamico(null)}
                    className="flex-1 py-3.5 rounded-2xl bg-white border-2 border-slate-200 hover:bg-slate-100 font-black text-[10px] uppercase tracking-[0.2em] text-slate-600 transition-all active:scale-95"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={confirmarPrecoDinamico}
                    className="flex-1 py-3.5 rounded-2xl text-white font-black text-[10px] uppercase tracking-[0.2em] transition-all active:scale-95 shadow-md"
                    style={{ backgroundColor: corPrincipal }}
                  >
                    <Plus size={14} className="inline-block mr-1" /> Adicionar ao Carrinho
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── CONFIMAÇÕES DESTRUTIVAS (substituem window.confirm) ── */}
      <ConfirmacaoDestrutiva
        isOpen={!!confirmacaoLimpar}
        titulo={confirmacaoLimpar === 'venda' ? 'Cancelar Venda' : 'Limpar Carrinho'}
        descricao={confirmacaoLimpar === 'venda'
          ? 'O CARRINHO e o cliente selecionado serão LIMPOS. Todos os itens adicionados serão perdidos.'
          : 'TODOS os itens do carrinho serão REMOVIDOS. Esta ação não pode ser desfeita.'}
        palavraChave={confirmacaoLimpar === 'venda' ? 'CANCELAR' : 'LIMPAR'}
        onConfirm={() => {
          if (confirmacaoLimpar === 'carrinho') {
            setCarrinho([]);
          } else if (confirmacaoLimpar === 'venda') {
            setCarrinho([]);
            setCodigoProduto('');
            setClienteSelecionado('');
            setBuscaCliente('');
          }
          setConfirmacaoLimpar(null);
          setTimeout(() => produtoInputRef.current?.focus(), 50);
        }}
        onClose={() => setConfirmacaoLimpar(null)}
      />
      <ConfirmacaoDestrutiva
        isOpen={confirmandoDesfazer}
        titulo="Desfazer Última Venda"
        descricao="A venda será ESTORNADA — estoque, saldo de carteira e caixa serão restaurados. Esta ação não pode ser desfeita."
        palavraChave="DESFAZER"
        onConfirm={() => { setConfirmandoDesfazer(false); executarDesfazerUltimaVenda(); }}
        onClose={() => setConfirmandoDesfazer(false)}
      />
      <ConfirmacaoDestrutiva
        isOpen={!!confirmandoDescartarId}
        titulo="Descartar Venda Suspensa"
        descricao="O carrinho suspenso selecionado será DELETADO definitivamente — sem possibilidade de retomada."
        palavraChave="DESCARTAR"
        onConfirm={() => {
          if (confirmandoDescartarId) {
            setSuspendedCarts(prev => prev.filter(s => s.id !== confirmandoDescartarId));
          }
          setConfirmandoDescartarId(null);
        }}
        onClose={() => setConfirmandoDescartarId(null)}
      />

    </div>
  );
};
