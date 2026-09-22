import React, { useState, useEffect, useMemo, useRef } from 'react';
import { X, Search, Barcode, ShoppingCart, Check, Lock, User as UserIcon, Plus, Minus, Package, Wallet, CreditCard, DollarSign, Trash2, LayoutGrid, List } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Product, User, Order, AppConfig, UserRole } from '../../types';
import { filtrarClientesPdv } from '../../utils/pdvSearch';
import { formatarMoeda, parseMoeda, generatePixPayload as generatePix, isAdminRole } from '../../utils';
import { montarPagamentoPdv, arredondarCentavos, MetodoPagamentoPDV, MetodoLancamento } from '../../utils/pdvPayment';
import { imprimirSilenciosoFiscal } from '../../utils/printUtils';
import { useApp } from '../../context/StoreContext';

interface TelaPDVProps {
  isOpen: boolean;
  onClose: () => void;
  users: User[];
  products: Product[];
  orders?: Order[];
  onConfirm: (targetUserId: string, items: any[], paymentMethod: MetodoPagamentoPDV, total: number, payments?: { method: MetodoLancamento; amount: number }[], change?: number, customerAccountId?: string, clientToken?: string, jointWallet?: { secondUserId: string; secondWalletAmount: number }, cardBrand?: string, fiado30UserId?: string, senhaPrimaria?: string, senhaSecundaria?: string, sessaoCaixaId?: string) => Promise<any>;
  onConfirmOffline?: (targetUserId: string, items: any[], paymentMethod: MetodoPagamentoPDV, total: number, payments?: { method: MetodoLancamento; amount: number }[], change?: number, customerAccountId?: string, clientToken?: string, cardBrand?: string, sessaoCaixaId?: string) => Promise<any>;
  setPrintOrder?: (order: any) => void;
  settings?: AppConfig;
  currentUser?: User;
}

let sharedAudioCtx: AudioContext | null = null;

const METODOS: { key: MetodoPagamentoPDV; rotulo: string; icon: any }[] = [
  { key: 'PIX', rotulo: 'PIX', icon: CreditCard },
  { key: 'CASH', rotulo: 'Dinheiro', icon: DollarSign },
  { key: 'CARD', rotulo: 'Cartão', icon: CreditCard },
  { key: 'WALLET', rotulo: 'Créditos', icon: Wallet },
  { key: 'FIADO', rotulo: 'Fiado', icon: UserIcon },
  { key: 'MIXED', rotulo: 'Misto', icon: ShoppingCart },
];

/**
 * TelaPDV — PDV de balcão em layout Bento (8/4 colunas).
 * Substitui a grade md:grid-cols-2 anterior pelo layout fixo:
 *   esquerda (8): busca do cliente → código de barras (F2) → catálogo em cards
 *   direita (4): carrinho + fechamento com estado dinâmico do botão
 * Toda a autoridade de preço/saldo/estoque/caixa continua NO SERVIDOR
 * (functions/processarVendaAdmin); aqui só há UX e validações amigáveis.
 */
export const TelaPDV: React.FC<TelaPDVProps> = ({
  isOpen, onClose, users, products, orders = [], onConfirm, onConfirmOffline, setPrintOrder, settings, currentUser,
}) => {
  const { showNotification, validateAnyMasterPassword, sessaoCaixaAtiva, refreshSessaoCaixa } = useApp();

  // ── Estado do carrinho / venda ──
  const [carrinho, setCarrinho] = useState<any[]>([]);
  const [clienteSelecionado, setClienteSelecionado] = useState('');
  const [buscaCliente, setBuscaCliente] = useState('');
  const [mostrarListaClientes, setMostrarListaClientes] = useState(false);
  const [codigoProduto, setCodigoProduto] = useState('');
  const [formaPagamento, setFormaPagamento] = useState<MetodoPagamentoPDV>('WALLET');
  const [valorMisto, setValorMisto] = useState({ PIX: '', WALLET: '', CASH: '' });
  const [valorRecebido, setValorRecebido] = useState('');
  const [bandeiraCartao, setBandeiraCartao] = useState('');
  const [pixConfirmado, setPixConfirmado] = useState(false);
  const [cardConfirmado, setCardConfirmado] = useState(false);
  const [cartaoConfirmado, setCartaoConfirmado] = useState(false);
  const [pixMistoConfirmado, setPixMistoConfirmado] = useState(false);
  const [processando, setProcessando] = useState(false);

  // ── Limpeza automática de estados de validação ao trocar método ou finalizar venda ──
  useEffect(() => {
    setPixConfirmado(false);
    setCardConfirmado(false);
    setCartaoConfirmado(false);
    setPixMistoConfirmado(false);
    setSenhaSupervisor('');
    setSenhaSupervisaoOk(false);
    setSenhaSupervisaoErro('');
    setValidandoSenhaSupervisor(false);
  }, [formaPagamento]);

  const [ultimoPedido, setUltimoPedido] = useState<Order | null>(null);

  useEffect(() => {
    if (ultimoPedido) {
      setPixConfirmado(false);
      setCardConfirmado(false);
      setCartaoConfirmado(false);
      setPixMistoConfirmado(false);
      setSenhaSupervisor('');
      setSenhaSupervisaoOk(false);
      setSenhaSupervisaoErro('');
      setValidandoSenhaSupervisor(false);
    }
  }, [ultimoPedido]);

  const [produtoPrecoDinamico, setProdutoPrecoDinamico] = useState<{ produto: Product; preco: string } | null>(null);
  const [isSoundEnabled, setIsSoundEnabled] = useState(true);
  const [modoVisao, setModoVisao] = useState<'grade' | 'lista'>('grade');
  // Autorização de supervisor para vendas em Créditos (WALLET) — validação síncrona.
  const [senhaSupervisor, setSenhaSupervisor] = useState('');
  const [senhaSupervisaoOk, setSenhaSupervisaoOk] = useState(false);
  const [senhaSupervisaoErro, setSenhaSupervisaoErro] = useState('');
  const [validandoSenhaSupervisor, setValidandoSenhaSupervisor] = useState(false);

  // Token de idempotência: reenvios da MESMA venda reutilizam o token e o
  // servidor devolve o pedido já criado (nunca debita 2x).
  const [saleToken, setSaleToken] = useState<string>(() => crypto.randomUUID());
  useEffect(() => {
    setSaleToken(crypto.randomUUID());
  }, [carrinho, clienteSelecionado, formaPagamento]);

  const clienteInputRef = useRef<HTMLInputElement>(null);
  const produtoInputRef = useRef<HTMLInputElement>(null);
  const clienteSearchRef = useRef<HTMLDivElement>(null);

  // ── Reset + foco ao abrir ──
  useEffect(() => {
    if (!isOpen) return;
    setCarrinho([]);
    setClienteSelecionado('');
    setBuscaCliente('');
    setCodigoProduto('');
    setMostrarListaClientes(true);
    setUltimoPedido(null);
    setValorMisto({ PIX: '', WALLET: '', CASH: '' });
    setValorRecebido('');
    setPixConfirmado(false);
    setCardConfirmado(false);
    setBandeiraCartao('');
    setSenhaSupervisor('');
    setSenhaSupervisaoOk(false);
    setSenhaSupervisaoErro('');
    setFormaPagamento('WALLET');
    setProdutoPrecoDinamico(null);
    refreshSessaoCaixa();
    setTimeout(() => clienteInputRef.current?.focus(), 100);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Fecha dropdown ao clicar fora
  useEffect(() => {
    if (!isOpen) return;
    const handle = (e: MouseEvent) => {
      if (clienteSearchRef.current && !clienteSearchRef.current.contains(e.target as Node)) {
        setMostrarListaClientes(false);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [isOpen]);

  // ── Atalhos: F2 foca no código de barras; ESC fecha (priorizando modais) ──
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        produtoInputRef.current?.focus();
      } else if (e.key === 'Escape') {
        if (produtoPrecoDinamico) setProdutoPrecoDinamico(null);
        else if (mostrarListaClientes) setMostrarListaClientes(false);
        else onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, produtoPrecoDinamico, mostrarListaClientes, onClose]);

  // ── Derivação de dados ──
  const consumidorGeral: User = {
    id: 'consumidor_geral', name: 'CONSUMIDOR GERAL', email: 'venda@balcao.com', role: UserRole.FAMILY,
    status: 'active', approved: true, cpf: '000.000.000-00', inmateName: 'CONSUMIDOR', inmateCpf: '000.000.000-00',
  };
  const todosClientes = useMemo(() =>
    [consumidorGeral, ...users.filter(u => !isAdminRole(u.role) && u.status !== 'suspended')],
    [users] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const clientesFiltrados = useMemo(() => filtrarClientesPdv(todosClientes, buscaCliente), [todosClientes, buscaCliente]);
  const cliente = useMemo(() => todosClientes.find(u => u.id === clienteSelecionado), [todosClientes, clienteSelecionado]);
  const clienteEhConsumidor = clienteSelecionado === 'consumidor_geral' || !clienteSelecionado;

  const precoEfetivo = (p: any): number => {
    const promo = Number((p as any)?.promoPrice || 0);
    return promo > 0 ? promo : (Number(p?.price) || 0);
  };

  const produtosFiltrados = useMemo(() => {
    const term = (codigoProduto || '').trim().toLowerCase();
    if (!term) return products.slice(0, 60);
    return products.filter(p => {
      const nome = (p.name || '').toLowerCase();
      const barcode = String((p as any).barcode || '').toLowerCase();
      const ean = String((p as any).ean || '').toLowerCase();
      return nome.includes(term) || barcode.includes(term) || ean.includes(term) || (p.id || '').toLowerCase().includes(term);
    }).slice(0, 60);
  }, [products, codigoProduto]);

  const pixChave = (): string => {
    const chaves = Array.isArray(settings?.pixKeys) ? (settings.pixKeys as string[]) : [];
    return (chaves.find(k => k && k.trim()) || settings?.cnpj || '').trim();
  };

  // ── Áudio (contexto único, sem vazamento) ──
  const playAddSound = () => {
    if (!isSoundEnabled) return;
    try {
      const AC = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext | undefined;
      if (!AC) return;
      const ctx = sharedAudioCtx ?? (sharedAudioCtx = new AC());
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 1400;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.15);
      osc.onended = () => { try { osc.disconnect(); gain.disconnect(); } catch {} };
    } catch {}
  };

  // ── Carrinho ──
  const adicionarAoCarrinho = (produto: Product, forceQty = 1) => {
    if ((produto.stock ?? 0) <= 0) return;
    const precoBase = precoEfetivo(produto);
    if (precoBase <= 0) return;

    if ((produto as any).dynamicPrice) {
      playAddSound();
      setProdutoPrecoDinamico({ produto, preco: String(precoBase || 0) });
      return;
    }

    playAddSound();
    setCarrinho(prev => {
      const existente = prev.find(item => String(item.productId) === String(produto.id));
      if (existente) {
        const novaQtd = existente.quantity + forceQty;
        const estoqueDisp = existente.stock ?? 0;
        if (estoqueDisp <= 0 || novaQtd > estoqueDisp) {
          showNotification(`Estoque máximo para ${produto?.name || 'este item'}: ${estoqueDisp} un.`, 'info');
          return prev.map(item => String(item.productId) === String(produto.id) ? { ...item, quantity: estoqueDisp } : item);
        }
        return prev.map(item => String(item.productId) === String(produto.id) ? { ...item, quantity: novaQtd } : item);
      }
      return [{ productId: produto?.id || '', name: produto?.name || 'Produto', price: precoBase, quantity: forceQty, imageUrl: produto?.imageUrl || '', stock: produto?.stock || 0 }, ...prev];
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
    if (cod.includes('*')) {
      const parts = cod.split('*');
      if (parts.length === 2 && /^\d+$/.test(parts[0].trim())) {
        forceQty = parseInt(parts[0], 10);
        cod = parts[1].trim();
      } else if (parts.length === 2) {
        cod = parts[1].trim();
      }
    }
    if (!cod) return;

    // Código de barras / EAN / id — zeros à esquerda ignorados (leitor EAN-13).
    const normCod = (c: string) => String(c || '').replace(/^0+/, '').trim();
    const codNorm = normCod(cod);
    const produto = (products || []).find(p =>
      String((p as any).barcode || '').trim() === cod ||
      String((p as any).ean || '').trim() === cod ||
      String(p.id) === cod ||
      (codNorm && (normCod((p as any).barcode) === codNorm || normCod((p as any).ean) === codNorm))
    );
    if (produto) {
      adicionarAoCarrinho(produto, forceQty);
      setCodigoProduto('');
      setTimeout(() => produtoInputRef.current?.focus(), 50);
      return;
    }

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
      showNotification(`${resultados.length} produtos encontrados — refine a busca.`, 'info');
    } else if (cod.trim().length >= 3) {
      showNotification(`Nenhum produto encontrado para "${cod.trim()}".`, 'info');
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

  const pixPayloadCarrinho = useMemo(() => {
    const chave = pixChave();
    if (!chave) return '';
    return generatePix(chave, settings?.appName || 'ASSOCIACAO ASSPEN MT', 'PEIXOTO DE AZEVEDO', totalCarrinho, 'MERCFACIL');
  }, [totalCarrinho, settings]); // eslint-disable-line react-hooks/exhaustive-deps

  // Segurança extra: se o total mudar com PIX pendente, exige nova confirmação.
  useEffect(() => {
    if (pixConfirmado) setPixConfirmado(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalCarrinho]);

  // ── Seleção de cliente ──
  const selecionarCliente = (u: User) => {
    setClienteSelecionado(u.id);
    setBuscaCliente(u.name);
    setMostrarListaClientes(false);
    setTimeout(() => produtoInputRef.current?.focus(), 50);
  };

  const handleClienteKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (clientesFiltrados.length === 1) selecionarCliente(clientesFiltrados[0]);
    } else if (e.key === 'Escape') {
      setMostrarListaClientes(false);
    }
  };

  // ── Finalização ──
  const validarSenhaSupervisor = async () => {
    if (!senhaSupervisor.trim()) {
      setSenhaSupervisaoOk(false);
      setSenhaSupervisaoErro('Informe a senha do supervisor.');
      return;
    }
    setValidandoSenhaSupervisor(true);
    try {
      // Senha MESTRA única (compatível com o gate FIADO do servidor e com o
      // operador de caixa, que não tem a senha primária+secundária dupla).
      const ok = await validateAnyMasterPassword(senhaSupervisor.trim());
      setSenhaSupervisaoOk(ok);
      setSenhaSupervisaoErro(ok ? '' : 'Senha inválida para esta operação.');
    } catch {
      setSenhaSupervisaoOk(false);
      setSenhaSupervisaoErro('Não foi possível validar a senha. Verifique a conexão.');
    } finally {
      setValidandoSenhaSupervisor(false);
    }
  };

  const isFiado = formaPagamento === 'FIADO' || formaPagamento === 'FIADO_30';
  const temPixNoMisto = formaPagamento === 'MIXED' && parseMoeda(valorMisto.PIX) > 0;
  const temCashNaVenda = formaPagamento === 'CASH' || (formaPagamento === 'MIXED' && parseMoeda(valorMisto.CASH) > 0);
  // Cliente válido = selecionado E não é o consumidor genérico
  const clienteValido = clienteSelecionado && !clienteEhConsumidor;
  const semClienteCredito = (formaPagamento === 'WALLET' || isFiado) && !clienteValido;
  const saldoCarteiraCliente = Number(cliente?.walletBalance || 0);
  const limiteSemanalDisponivel = Math.max(0, Number((settings as any)?.weeklyWalletLimit || 300) - Number(cliente?.weeklySpent || 0));
  
  // Validações por método de pagamento
  const bloqueioCash = temCashNaVenda && !sessaoCaixaAtiva?.id;
  const bloqueioCartao = formaPagamento === 'CARD' && !cartaoConfirmado;
  const bloqueioPixMisto = temPixNoMisto && !pixMistoConfirmado;
  // Fiado: precisa cliente válido E senha do supervisor
  const bloqueioFiado = isFiado && (!clienteValido || !senhaSupervisaoOk);
  const bloqueioWallet = formaPagamento === 'WALLET' && (!clienteValido || saldoCarteiraCliente < totalCarrinho);
  const bloqueioPix = (formaPagamento === 'PIX' || temPixNoMisto) && !pixConfirmado;
  
  const motivoBloqueioCredito = !clienteValido && (formaPagamento === 'WALLET' || isFiado)
    ? 'Selecione um cliente cadastrado para créditos/fiado'
    : (formaPagamento === 'WALLET' && saldoCarteiraCliente < totalCarrinho) ? `Saldo insuficiente (disponível: ${formatarMoeda(saldoCarteiraCliente)})`
    : (isFiado && clienteValido && !senhaSupervisaoOk) ? 'Valide a senha do supervisor para liberar o fiado'
    : '';

  const podeFinalizar = carrinho.length > 0 
    && !processando 
    && !motivoBloqueioCredito
    && !bloqueioCash
    && !bloqueioCartao
    && !bloqueioPixMisto
    && !bloqueioFiado
    && !bloqueioWallet
    && !bloqueioPix;
  const habilitadoVisual = podeFinalizar ? 'enabled' : 'disabled';

  const finalizarVenda = async () => {
    if (processando) return;
    if (carrinho.length === 0) return;

    if (formaPagamento === 'PIX' && !pixChave()) {
      showNotification('Configure a chave PIX (CNPJ ou chave aleatória) nas Configurações antes de vender no PIX.', 'error');
      return;
    }

    const targetId = clienteSelecionado || 'balcao_anonimo';
    let paymentsArray: { method: MetodoLancamento; amount: number }[] | undefined;
    let changeValue: number | undefined;
    // customerAccountId para FIADO/FIADO_30: SEMPRE o usuário cadastrado do
    // estado global do PDV — nada de id local duplicado por método.
    const customerAccountId = (formaPagamento === 'FIADO' || formaPagamento === 'FIADO_30') ? clienteSelecionado : undefined;
    // sessaoCaixaId vem da SESSÃO GLOBAL reativa do contexto (abre/fecha em
    // tempo real). Nunca lê variável local/estática que possa nascer vazia.
    const sessaoCaixaId = sessaoCaixaAtiva?.id || null;
    // FIADO/FIADO_30: a senha validada do supervisor (mestra) é reencaminhada
    // ao servidor, que revalida (nunca confia só no frontend).
    const senhaFiado = (isFiado && senhaSupervisaoOk) ? senhaSupervisor.trim() : undefined;
    let montagem;
    try {
      montagem = montarPagamentoPdv({
        formaPagamento,
        total: totalCarrinho,
        valorMisto,
        valorRecebido,
        clienteSelecionado,
        targetId,
        clienteEhConsumidor,
        saldoCarteiraCliente: cliente?.walletBalance,
      });
    } catch (e: any) {
      // BUGFIX: erro de MONTAGEM (valores/cálculos) nunca era "queda de rede".
      // Antes caía no catch de exceção e, offline, virava uma venda offline com
      // paymentsArray quebrado. Validação é validação: termina aqui.
      showNotification(e?.message || 'Dados de pagamento inválidos.', 'error');
      return;
    }
    if (montagem.ok === false) {
      showNotification(montagem.message, 'error');
      return;
    }
    paymentsArray = montagem.paymentsArray;
    changeValue = montagem.changeValue;

    setProcessando(true);
    try {
      const pedido = await onConfirm(targetId, carrinho, formaPagamento, totalCarrinho, paymentsArray, changeValue, customerAccountId, saleToken, undefined, bandeiraCartao || undefined, undefined, senhaFiado, undefined, sessaoCaixaId);
      if (pedido) {
        setUltimoPedido(pedido);
        setProcessando(false);
        setCarrinho([]);
        setClienteSelecionado('');
        setBuscaCliente('');
        setCodigoProduto('');
        setValorMisto({ PIX: '', WALLET: '', CASH: '' });
        setValorRecebido('');
        setPixConfirmado(false);
        setCardConfirmado(false);
        setBandeiraCartao('');
        setSenhaSupervisor('');
        setSenhaSupervisaoOk(false);
        setSenhaSupervisaoErro('');
      }
    } catch (e: any) {
      setProcessando(false);
      // FIADO offline é BLOQUEADO no servidor (senha mestra sempre revalidada
      // lá). Nunca enfileirar: a dívida dependeria de uma senha que só existe
      // no backend.
      if (isFiado) {
        showNotification(formaPagamento === 'FIADO_30'
          ? 'Fiado 30 Dias requer conexão para validar a senha mestra no servidor.'
          : 'Venda fiada exige conexão para validar a senha mestra no servidor. Conecte e finalize novamente.', 'error');
        return;
      }
      if (!navigator.onLine && onConfirmOffline) {
        try {
          const pedidoOffline = await onConfirmOffline(targetId, carrinho, formaPagamento, totalCarrinho, paymentsArray, changeValue, customerAccountId, saleToken, bandeiraCartao || undefined, sessaoCaixaId || undefined);
          if (pedidoOffline) {
            setUltimoPedido(pedidoOffline);
            setCarrinho([]);
            setClienteSelecionado('');
            setBuscaCliente('');
            setCodigoProduto('');
            setValorMisto({ PIX: '', WALLET: '', CASH: '' });
            setValorRecebido('');
            showNotification('Venda registrada OFFLINE — será sincronizada quando a internet voltar.', 'info');
            return;
          }
        } catch (e2: any) {
          showNotification(e2.message || 'Não foi possível registrar a venda offline.', 'error');
        }
      }
      showNotification(e.message || 'Erro ao finalizar venda.', 'error');
    }
  };

  // Auto-impressão silenciosa (bobina/Electron) sem abrir janela de impressão.
  useEffect(() => {
    if (ultimoPedido && settings?.autoPrint !== false) {
      imprimirSilenciosoFiscal({ type: 'CUPOM', data: ultimoPedido }, settings).catch(() => {});
      if (setPrintOrder) setPrintOrder(ultimoPedido);
      setTimeout(() => produtoInputRef.current?.focus(), 50);
    }
  }, [ultimoPedido, settings]); // eslint-disable-line react-hooks/exhaustive-deps

  const trocoPreview = useMemo(() => {
    if (formaPagamento === 'CASH') {
      const recebido = parseMoeda(valorRecebido);
      if (recebido > totalCarrinho) return recebido - totalCarrinho;
    }
    if (formaPagamento === 'MIXED') {
      const total = parseMoeda(valorMisto.PIX) + parseMoeda(valorMisto.WALLET) + parseMoeda(valorMisto.CASH);
      if (total > totalCarrinho) return total - totalCarrinho;
    }
    return null;
  }, [formaPagamento, valorRecebido, valorMisto, totalCarrinho]);

  if (!isOpen) return null;

  return (
    <div className="min-h-screen w-full bg-slate-50 text-slate-800 antialiased font-sans block relative z-[9999] opacity-100">
      {/* Barra superior discreta */}
      <div className="w-full px-4 pt-4 flex items-center justify-between border-b border-slate-200/80 bg-white">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
          <ShoppingCart size={18} className="text-emerald-600" />
          PDV Balcão
          <span className="text-xs font-medium text-slate-400 hidden sm:inline">· F2 para código de barras</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsSoundEnabled(s => !s)}
            className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 font-medium hover:bg-slate-50 transition-colors"
          >
            Som: {isSoundEnabled ? 'ON' : 'OFF'}
          </button>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-white border border-slate-200 text-slate-500 flex items-center justify-center hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors"
            aria-label="Fechar PDV"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="w-full p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* 🛠️ BLOCO DA ESQUERDA (8 Colunas) */}
        <div className="lg:col-span-8 flex flex-col gap-6" data-testid="left-column">
          {/* Métodos de Pagamento — horizontal abaixo do header PDV Balcão */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-wrap items-center gap-3 w-full mb-4 shrink-0">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 shrink-0">Pagamento</span>
            <div className="grid grid-cols-6 gap-1.5 flex-1 min-w-0 h-11">
              {METODOS.map(m => {
                const Icon = m.icon;
                const ativo = formaPagamento === m.key;
                return (
                  <button
                    key={m.key}
                    title={m.rotulo}
                    onClick={() => { setFormaPagamento(m.key); setPixConfirmado(false); setCardConfirmado(false); setSenhaSupervisor(''); setSenhaSupervisaoOk(false); setSenhaSupervisaoErro(''); }}
                    className={`flex items-center justify-center gap-1 rounded-xl border text-[10px] font-bold transition-all ${
                      ativo
                        ? 'bg-emerald-600 border-emerald-600 text-white shadow-md shadow-emerald-600/20'
                        : 'bg-white border-slate-200 text-slate-500 hover:border-emerald-300 hover:text-emerald-600'
                    }`}
                  >
                    <Icon size={14} />
                    {m.rotulo}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Container Principal (Bento Style) */}
          <div className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col gap-5">
            {/* Header Interno Discreto */}
            <div className="border-b border-slate-100 pb-3">
              <span className="text-xs font-black uppercase tracking-wider text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-md">
                Venda no Balcão — {cliente ? cliente.name : 'Defina o Cliente'}
              </span>
            </div>

            {/* Campo 1: Busca do Cliente */}
            <div ref={clienteSearchRef} className="flex flex-col gap-1.5 relative">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Responsável / Cliente
              </label>
              <div className="relative">
                <Search className="absolute left-4 top-3.5 h-5 w-5 text-slate-400" />
                <input
                  ref={clienteInputRef}
                  type="text"
                  value={buscaCliente}
                  onChange={(e) => { setBuscaCliente(e.target.value); setMostrarListaClientes(true); setClienteSelecionado(''); }}
                  onKeyDown={handleClienteKeyDown}
                  placeholder="Nome, CPF ou nome do interno..."
                  className="w-full pl-12 pr-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white text-sm font-medium transition-all bg-slate-50 border border-slate-200"
                />
                {clienteSelecionado && cliente && (
                  <button
                    onClick={() => { setClienteSelecionado(''); setBuscaCliente(''); setMostrarListaClientes(true); clienteInputRef.current?.focus(); }}
                    className="absolute right-3 top-2.5 h-7 w-7 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 flex items-center justify-center transition-colors"
                    title="Trocar cliente"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>

              {/* Lista suspensa corrigida: z-50 + sombra pesada + posicionamento fino */}
              {mostrarListaClientes && (
                <div className="absolute top-[100%] left-0 w-full bg-white border border-slate-200 rounded-xl shadow-xl mt-1 p-1 text-xs text-slate-500 z-50 max-h-56 overflow-y-auto">
                  {buscaCliente.trim() === '' ? (
                    <div className="p-3 text-slate-400">
                      Digite nome, CPF ou nome do interno para buscar...
                    </div>
                  ) : clientesFiltrados.length === 0 ? (
                    <div className="p-3 text-slate-400">Nenhum cliente encontrado.</div>
                  ) : (
                    clientesFiltrados.map(u => (
                      <button
                        key={u.id}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => selecionarCliente(u)}
                        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg hover:bg-emerald-50 hover:text-emerald-700 text-left transition-colors"
                      >
                        <span className="flex items-center gap-2 font-semibold text-slate-700">
                          <UserIcon size={14} className="text-slate-400" />
                          {u.name}
                        </span>
                        <span className="text-[10px] text-slate-400 truncate max-w-[45%]">
                          {(u.inmateName || u.prisonerName || '') || (u.cpf || '')}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Campo 2: Código de Barras (margin-top garante que a lista acima não cubra) */}
            <div className="flex flex-col gap-1.5 mt-8">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Código de Barras (F2) ou Nome do Produto
              </label>
              <form className="flex gap-2" onSubmit={adicionarProduto}>
                <div className="relative flex-1">
                  <Barcode className="absolute left-4 top-3.5 h-5 w-5 text-slate-400" />
                  <input
                    ref={produtoInputRef}
                    type="text"
                    value={codigoProduto}
                    onChange={(e) => setCodigoProduto(e.target.value)}
                    placeholder="Bipe o código ou digite o nome..."
                    className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white text-sm font-medium transition-all"
                  />
                </div>
                {/* Botão de Adicionar Estilizado */}
                <button
                  type="submit"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 rounded-xl flex items-center justify-center shadow-md shadow-emerald-600/10 transition-colors"
                  aria-label="Adicionar produto"
                >
                  <Plus size={20} />
                </button>
              </form>
            </div>
          </div>

          {/* CATÁLOGO DE PRODUTOS (grade compacta ou lista) */}
          <div className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200/80 shadow-sm">
            <div className="flex items-center justify-between mb-4 gap-3">
              <span className="text-xs font-black uppercase tracking-wider text-slate-500">Catálogo</span>
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium text-slate-400">{produtosFiltrados.length} produto(s)</span>
                <div className="flex items-center bg-slate-100 rounded-lg p-0.5 border border-slate-200">
                  <button
                    onClick={() => setModoVisao('grade')}
                    className={`p-1.5 rounded-md transition-all flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider ${
                      modoVisao === 'grade'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-slate-500 hover:text-emerald-600'
                    }`}
                    title="Visualizar em Grade"
                    aria-label="Visualizar em Grade"
                  >
                    <LayoutGrid size={14} />
                    <span className="hidden md:inline">Grade</span>
                  </button>
                  <button
                    onClick={() => setModoVisao('lista')}
                    className={`p-1.5 rounded-md transition-all flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider ${
                      modoVisao === 'lista'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-slate-500 hover:text-emerald-600'
                    }`}
                    title="Visualizar em Lista"
                    aria-label="Visualizar em Lista"
                  >
                    <List size={14} />
                    <span className="hidden md:inline">Lista</span>
                  </button>
                </div>
              </div>
            </div>

            {produtosFiltrados.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
                <Package size={40} strokeWidth={1.2} />
                <span className="text-sm">Nenhum produto encontrado.</span>
              </div>
            ) : modoVisao === 'grade' ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {produtosFiltrados.map(p => {
                const semEstoque = (p.stock ?? 0) <= 0;
                const preco = precoEfetivo(p);
                return (
                  <button
                    key={p.id}
                    disabled={semEstoque || preco <= 0}
                    onClick={() => adicionarAoCarrinho(p)}
                    className={`relative group text-left rounded-xl border bg-white transition-all duration-200 ${
                      semEstoque
                        ? 'border-slate-200/60 opacity-50 cursor-not-allowed'
                        : 'border-slate-200/60 hover:border-emerald-500 hover:ring-4 hover:ring-emerald-500/5 hover:shadow-md'
                    }`}
                  >
                    <div className="w-full h-20 sm:h-24 bg-white rounded-t-xl flex items-center justify-center overflow-hidden border-b border-slate-100 p-2">
                      {p.imageUrl ? (
                        <img src={p.imageUrl} alt={p.name} className="max-w-full max-h-full object-contain block mx-auto" loading="lazy" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      ) : (
                        <Package className="text-slate-300" size={28} strokeWidth={1.2} />
                      )}
                    </div>
                    <div className="p-3 flex flex-col gap-1">
                      <span className="text-[11px] font-semibold text-slate-700 leading-tight line-clamp-1 truncate" title={p.name}>{p.name}</span>
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[13px] font-black text-emerald-600">{formatarMoeda(preco)}</span>
                        <span className={`text-[9px] font-semibold ${semEstoque ? 'text-red-400' : 'text-slate-400'}`}>
                          {semEstoque ? 'Sem estoque' : `${p.stock} un.`}
                        </span>
                      </div>
                    </div>
                    {!semEstoque && preco > 0 && (
                      <div className="absolute top-2 right-2 w-7 h-7 rounded-full bg-emerald-600 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-md">
                        <Plus size={15} />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
            ) : (
            <div className="flex flex-col">
              {produtosFiltrados.map(p => {
                const semEstoque = (p.stock ?? 0) <= 0;
                const preco = precoEfetivo(p);
                const ean = (p as any).ean || (p as any).barcode || '';
                return (
                  <button
                    key={p.id}
                    disabled={semEstoque || preco <= 0}
                    onClick={() => adicionarAoCarrinho(p)}
                    className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border bg-white transition-all duration-200 ${
                      semEstoque
                        ? 'border-slate-200/60 opacity-50 cursor-not-allowed'
                        : 'border-slate-200/60 hover:border-emerald-500 hover:ring-4 hover:ring-emerald-500/5 hover:shadow-md'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-10 h-10 rounded-lg bg-white border border-slate-100 flex items-center justify-center overflow-hidden shrink-0">
                        {p.imageUrl ? (
                          <img src={p.imageUrl} alt={p.name} className="max-w-full max-h-full object-contain block mx-auto" loading="lazy" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        ) : (
                          <Package size={18} className="text-slate-300" strokeWidth={1.2} />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-semibold text-slate-700 leading-tight truncate">{p.name}</p>
                        {ean && <p className="text-[9px] font-mono text-slate-400 truncate mt-0.5">EAN: {ean}</p>}
                      </div>
                    </div>
                    <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md shrink-0 ${semEstoque ? 'text-red-400 bg-red-50' : 'text-slate-500 bg-slate-100'}`}>
                      {semEstoque ? 'Sem estoque' : `${p.stock} un.`}
                    </span>
                    <span className="text-[13px] font-black text-emerald-600 shrink-0 w-20 text-right tabular-nums">{formatarMoeda(preco)}</span>
                  </button>
                );
              })}
            </div>
            )}
          </div>
        </div>

        {/* 🛒 BARRA LATERAL DIREITA — Itens no topo, maximizados */}
        <div className="lg:col-span-4 lg:h-[calc(100vh-120px)] lg:sticky lg:top-24 flex flex-col h-full bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4 sm:p-6 w-full">
          {/* ELEMENTO 1: ITENS DA VENDA — Topo absoluto, altura maximizada */}
          <div className="flex-1 overflow-y-auto min-h-[250px] max-h-[calc(100vh-320px)] pr-1 flex flex-col gap-2 border-b border-slate-100 mb-4 lg:flex-1 lg:min-h-0 lg:max-h-[calc(100vh-320px)]">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-3 shrink-0">
              <span className="text-xs font-black uppercase tracking-wider text-slate-500 flex items-center gap-2">
                <ShoppingCart size={14} className="text-emerald-600" /> Itens da Venda
              </span>
              <span className="text-xs font-bold text-slate-400">{carrinho.length} item(ns)</span>
            </div>

            {/* Lista de itens com rolagem interna */}
            <div className="flex flex-col gap-2 overflow-y-auto">
              {carrinho.length === 0 && (
                <div className="flex flex-col items-center justify-center py-14 text-slate-300 gap-2 shrink-0">
                  <ShoppingCart size={40} strokeWidth={1} className="opacity-40" />
                  <span className="text-xs text-slate-400 font-medium">Carrinho vazio — bipe ou toque em produtos</span>
                </div>
              )}
              {carrinho.map(item => (
                <div key={String(item.productId)} className="flex items-center gap-2.5 bg-white rounded-xl p-2 shrink-0 border border-slate-100">
                  <div className="w-11 h-11 rounded-lg bg-white border border-slate-100 flex items-center justify-center overflow-hidden shrink-0">
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                    ) : (
                      <Package size={18} className="text-slate-300" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-700 leading-tight truncate">{item.name}</p>
                    <p className="text-[11px] font-black text-emerald-600 tabular-nums mt-0.5">{formatarMoeda(item.price * item.quantity)}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => atualizarQuantidade(item.productId, -1)}
                      className="w-6 h-6 rounded-xl bg-white border border-slate-200 text-slate-500 flex items-center justify-center hover:bg-red-50 hover:text-red-500 transition-colors"
                      aria-label="Diminuir"
                    >
                      <Minus size={12} />
                    </button>
                    <span className="w-8 text-center text-xs font-black text-slate-700 tabular-nums">{item.quantity}x</span>
                    <button
                      onClick={() => atualizarQuantidade(item.productId, 1)}
                      className="w-6 h-6 rounded-xl bg-white border border-slate-200 text-slate-500 flex items-center justify-center hover:bg-emerald-50 hover:text-emerald-600 transition-colors"
                      aria-label="Aumentar"
                    >
                      <Plus size={12} />
                    </button>
                  </div>
                  <button
                    onClick={() => removerDoCarrinho(item.productId)}
                    title="Remover item"
                    aria-label="Remover item"
                    className="text-slate-400 hover:text-rose-500 hover:bg-rose-50 p-2 rounded-xl transition-all cursor-pointer shrink-0"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* ELEMENTO 2: CRÉDITOS (WALLET) — Exibe apenas saldo/limite, sem senha */}
          {formaPagamento === 'WALLET' && (
            <div className="bg-white border border-slate-200/80 rounded-xl p-4 flex flex-col gap-3 w-full mb-4 animate-in fade-in duration-200 shrink-0">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Créditos do Cliente</span>
              {semClienteCredito ? (
                <div className="text-xs font-semibold text-slate-500 bg-white rounded-xl p-3 border border-slate-100">
                  Selecione um cliente para usar créditos
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-white border border-slate-200/80 rounded-xl p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Saldo da Carteira</p>
                    <p className={`text-lg font-black tracking-tight ${saldoCarteiraCliente >= totalCarrinho ? 'text-emerald-600' : 'text-red-500'}`}>{formatarMoeda(saldoCarteiraCliente)}</p>
                    <p className="text-[10px] font-semibold text-slate-400 mt-0.5">Crédito na semana: {formatarMoeda(limiteSemanalDisponivel)}</p>
                  </div>
                  <div className="bg-white border border-slate-200/80 rounded-xl p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Limite Fiado</p>
                    <p className="text-lg font-black tracking-tight text-slate-800">{formatarMoeda(Math.max(0, Number((cliente as any)?.creditLimit || 0) - Number((cliente as any)?.currentDebt || 0)))}</p>
                    <p className="text-[10px] font-semibold text-slate-400 mt-0.5">Dívida atual: {formatarMoeda(Number((cliente as any)?.currentDebt || 0))}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ELEMENTO 3: FIADO — Exige senha do supervisor */}
          {formaPagamento === 'FIADO' && (
            <div className="bg-white border border-slate-200/80 rounded-xl p-4 flex flex-col gap-3 w-full mb-4 animate-in fade-in duration-200 shrink-0">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Venda a Fiado — Requer Autorização</span>
              {semClienteCredito ? (
                <div className="text-xs font-semibold text-slate-500 bg-white rounded-xl p-3 border border-slate-100">
                  Selecione um cliente para vender a fiado
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-white border border-slate-200/80 rounded-xl p-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Limite Fiado</p>
                      <p className="text-lg font-black tracking-tight text-slate-800">{formatarMoeda(Math.max(0, Number((cliente as any)?.creditLimit || 0) - Number((cliente as any)?.currentDebt || 0)))}</p>
                      <p className="text-[10px] font-semibold text-slate-400 mt-0.5">Dívida atual: {formatarMoeda(Number((cliente as any)?.currentDebt || 0))}</p>
                    </div>
                    <div className="bg-white border border-slate-200/80 rounded-xl p-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Saldo da Carteira</p>
                      <p className="text-lg font-black tracking-tight text-slate-800">{formatarMoeda(saldoCarteiraCliente)}</p>
                      <p className="text-[10px] font-semibold text-slate-400 mt-0.5">Crédito na semana: {formatarMoeda(limiteSemanalDisponivel)}</p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Senha do Interno/Supervisor</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="password"
                        value={senhaSupervisor}
                        onChange={(e) => { setSenhaSupervisor(e.target.value); setSenhaSupervisaoOk(false); setSenhaSupervisaoErro(''); }}
                        onKeyDown={(e) => e.key === 'Enter' && validarSenhaSupervisor()}
                        placeholder="Digite a senha de validação"
                        className="w-full min-w-0 px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white text-sm font-medium transition-all"
                      />
                      <button
                        onClick={validarSenhaSupervisor}
                        disabled={validandoSenhaSupervisor || !senhaSupervisor.trim()}
                        className={`h-[42px] shrink-0 px-4 rounded-xl border text-xs font-bold transition-colors ${
                          senhaSupervisaoOk
                            ? 'bg-emerald-600 border-emerald-600 text-white'
                            : 'bg-white border-slate-200 text-slate-600 hover:border-emerald-400 hover:text-emerald-700'
                        } ${validandoSenhaSupervisor ? 'opacity-50 cursor-wait' : ''} ${!senhaSupervisor.trim() ? 'opacity-40 cursor-not-allowed' : ''}`}
                      >
                        {validandoSenhaSupervisor ? 'Validando...' : senhaSupervisaoOk ? (
                          <span className="inline-flex items-center gap-1"><Check size={14} />Autorizado</span>
                        ) : 'Validar'}
                      </button>
                    </div>
                    {senhaSupervisaoErro && <p className="text-[11px] font-semibold text-red-500 px-1">{senhaSupervisaoErro}</p>}
                    {senhaSupervisaoOk && <p className="text-[11px] font-semibold text-emerald-600 px-1">Autorização confirmada — fiado liberado.</p>}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ELEMENTO 4: TOTALIZADOR E BOTÃO FINALIZAR — Fixo na base do rodapé direito */}
          <div className="mt-auto pt-2 w-full shrink-0 bg-white border-t border-slate-200/80">
            {/* Contexto PIX / CARD / CASH / MIXED — renderizado inline no rodapé quando não WALLET */}
            {formaPagamento === 'PIX' && (
              pixChave() ? (
                <div className="flex flex-col items-center gap-3 bg-white rounded-xl p-4 mb-3 border border-slate-200/80">
                  {totalCarrinho > 0 ? (
                    <>
                      <div className="bg-white rounded-xl p-3 border border-slate-200/80">
                        <QRCodeSVG value={pixPayloadCarrinho} size={140} level="M" />
                      </div>
                      <span className="text-xs font-bold text-slate-500">Valor: {formatarMoeda(totalCarrinho)}</span>
                      <button
                        onClick={() => setPixConfirmado(c => !c)}
                        className={`w-full min-h-[42px] rounded-xl border text-sm font-bold transition-colors ${
                          pixConfirmado
                            ? 'bg-emerald-50 border-emerald-500 text-emerald-700'
                            : 'bg-white border-slate-200 text-slate-600 hover:border-emerald-400 hover:text-emerald-700'
                        }`}
                      >
                        {pixConfirmado ? 'PIX Confirmado' : 'Confirmar Recebimento do PIX'}
                      </button>
                    </>
                  ) : (
                    <span className="text-xs text-slate-400">Adicione itens para gerar o QR PIX.</span>
                  )}
                </div>
              ) : (
                <div className="text-xs font-semibold text-red-500 bg-red-50 rounded-xl p-3 mb-3">
                  Configure a chave PIX (CNPJ ou chave aleatória) nas Configurações para vender no PIX.
                </div>
              )
            )}
            {formaPagamento === 'CARD' && (
              <div className="flex flex-col gap-2 mb-3">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Bandeira do Cartão</label>
                <input
                  type="text"
                  value={bandeiraCartao}
                  onChange={(e) => setBandeiraCartao(e.target.value)}
                  placeholder="Ex.: Mastercard, Elo..."
                  className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white text-sm font-medium transition-all"
                />
                <button
                  onClick={() => setCartaoConfirmado(c => !c)}
                  className={`w-full py-2.5 px-4 bg-slate-100 border border-slate-200 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors shadow-sm cursor-pointer text-center block mb-2 font-sans uppercase tracking-wider ${
                    cartaoConfirmado
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800 shadow-sm'
                      : ''
                  }`}
                >
                  {cartaoConfirmado ? '✓ Recebimento Confirmado' : 'Confirmar Recebimento do Valor'}
                </button>
              </div>
            )}
            {formaPagamento === 'CASH' && (
              <div className="flex flex-col gap-1.5 mb-3">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Valor Recebido</label>
                <input
                  type="text"
                  value={valorRecebido}
                  onChange={(e) => setValorRecebido(e.target.value)}
                  placeholder="R$ 0,00"
                  className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white text-sm font-medium transition-all"
                />
                {parseMoeda(valorRecebido) > 0 && (
                  <div className="text-xs font-semibold text-slate-500 flex justify-between px-1">
                    <span>Troco</span>
                    <span className="text-emerald-600 font-black">{formatarMoeda(Math.max(0, parseMoeda(valorRecebido) - totalCarrinho))}</span>
                  </div>
                )}
              </div>
            )}
            {formaPagamento === 'MIXED' && (
              <div className="mb-3">
                <div className="grid grid-cols-3 gap-2 mb-2">
                  {(['PIX', 'WALLET', 'CASH'] as const).map(k => (
                    <div key={k} className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{k === 'CASH' ? 'Dinheiro' : k === 'WALLET' ? 'Créditos' : 'PIX'}</label>
                      <input
                        type="text"
                        value={valorMisto[k]}
                        onChange={(e) => setValorMisto(prev => ({ ...prev, [k]: e.target.value }))}
                        placeholder="R$ 0,00"
                        className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white text-sm font-medium transition-all"
                      />
                    </div>
                  ))}
                </div>
                {temPixNoMisto && (
                  <button
                    onClick={() => setPixMistoConfirmado(c => !c)}
                    disabled={pixMistoConfirmado}
                    className={`w-full py-2.5 px-4 bg-amber-50 border border-amber-200 hover:bg-amber-100 text-amber-800 font-bold text-xs rounded-xl transition-colors shadow-sm cursor-pointer text-center block mb-2 font-sans uppercase tracking-wider ${
                      pixMistoConfirmado
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800 cursor-default'
                        : ''
                    }`}
                  >
                    {pixMistoConfirmado ? '✓ PIX Recebido e Confirmado' : 'Confirmar Recebimento do PIX (Misto)'}
                  </button>
                )}
              </div>
            )}

{/* Painel de Fechamento */}
            <div className="flex flex-col gap-3">
              {trocoPreview !== null && trocoPreview > 0 && (
                <div className="bg-emerald-50 text-emerald-700 rounded-xl p-3 flex justify-between items-center text-sm font-bold">
                  <span>Troco a devolver</span>
                  <span className="text-base font-black">{formatarMoeda(trocoPreview)}</span>
                </div>
              )}
              <div className="bg-slate-50 p-4 rounded-xl flex justify-between items-center">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Total a Receber</span>
                <span className="text-2xl font-black text-slate-900">{formatarMoeda(totalCarrinho)}</span>
              </div>
              {/* Mensagens de bloqueio específicas por método */}
              {bloqueioCash && (
                <p className="text-xs text-red-600 text-center font-medium bg-red-50 rounded-xl p-2">
                  ⚠ Caixa fechado — abra o caixa no painel administrativo para vender em dinheiro
                </p>
              )}
              {bloqueioFiado && !clienteValido && (
                <p className="text-xs text-red-600 text-center font-medium bg-red-50 rounded-xl p-2">
                  ⚠ Selecione um cliente cadastrado para vender a fiado
                </p>
              )}
              {bloqueioFiado && clienteValido && !senhaSupervisaoOk && (
                <p className="text-xs text-amber-600 text-center font-medium bg-amber-50 rounded-xl p-2">
                  ⚠ Valide a senha do supervisor para liberar a venda a fiado
                </p>
              )}
              {bloqueioCartao && (
                <p className="text-xs text-amber-600 text-center font-medium bg-amber-50 rounded-xl p-2">
                  ⚠ Confirme o recebimento no cartão antes de finalizar
                </p>
              )}
              {bloqueioPixMisto && (
                <p className="text-xs text-amber-600 text-center font-medium bg-amber-50 rounded-xl p-2">
                  ⚠ Confirme o recebimento do PIX no pagamento misto
                </p>
              )}
              {bloqueioPix && formaPagamento === 'PIX' && (
                <p className="text-xs text-amber-600 text-center font-medium bg-amber-50 rounded-xl p-2">
                  ⚠ Confirme o recebimento do PIX antes de finalizar
                </p>
              )}
              {bloqueioWallet && (
                <p className="text-xs text-red-600 text-center font-medium bg-red-50 rounded-xl p-2">
                  ⚠ Saldo insuficiente ou cliente não selecionado para créditos
                </p>
              )}
              {/* Botão Finalizar Venda — base fixa */}
              <button
                disabled={!podeFinalizar}
                onClick={finalizarVenda}
                className={`w-full py-4 px-6 rounded-xl transition-all flex items-center justify-center gap-2 text-base font-bold ${
                  podeFinalizar
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg cursor-pointer'
                    : 'bg-slate-100 text-slate-400 border border-slate-200 shadow-none cursor-not-allowed pointer-events-none'
                }`}
              >
                <Check size={20} />
                {processando ? 'Processando...' : 'Finalizar Venda'}
              </button>
            </div>
          </div>
        </div>

      </div>

      {/* Modal de preço dinâmico */}
      {produtoPrecoDinamico && (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4" onMouseDown={() => setProdutoPrecoDinamico(null)}>
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 p-6 w-full max-w-sm" onMouseDown={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-black text-slate-700">Preço do item</span>
              <button onClick={() => setProdutoPrecoDinamico(null)} className="text-slate-400 hover:text-red-500"><X size={18} /></button>
            </div>
            <p className="text-xs font-semibold text-slate-500 mb-3">{produtoPrecoDinamico.produto.name}</p>
            <input
              autoFocus
              type="text"
              value={produtoPrecoDinamico.preco}
              onChange={(e) => setProdutoPrecoDinamico(prev => prev ? { ...prev, preco: e.target.value } : prev)}
              onKeyDown={(e) => e.key === 'Enter' && confirmarPrecoDinamico()}
              placeholder="R$ 0,00"
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white text-sm font-medium transition-all mb-4"
            />
            <button
              onClick={confirmarPrecoDinamico}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl shadow-md shadow-emerald-600/20 transition-colors flex items-center justify-center gap-2"
            >
              <Plus size={18} /> Adicionar ao Carrinho
            </button>
          </div>
        </div>
      )}

      {/* Fim do overlay do PDV */}
    </div>
  );
};

export default TelaPDV;