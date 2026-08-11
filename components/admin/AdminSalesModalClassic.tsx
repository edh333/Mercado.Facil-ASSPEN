import React, { useState, useEffect, useMemo, useRef } from 'react';
import { X, Search, Barcode, Receipt, Package, Users, CreditCard, CheckCircle, Zap, Percent, ShoppingCart, Plus, Minus, Trash2, Home, ArrowRight, Ban, UserCheck, Wallet, DollarSign } from 'lucide-react';
import { Product, User as UserType, Order, AppConfig } from '../../types';
import { motion, AnimatePresence } from 'framer-motion';
import { formatarMoeda } from '../../utils';

interface AdminSalesModalProps {
  isOpen: boolean;
  onClose: () => void;
  users: UserType[];
  products: Product[];
  onConfirm: (targetUserId: string, items: any[], paymentMethod: 'PIX' | 'WALLET' | 'CASH' | 'MIXED', total: number, payments?: {method: string, amount: number}[], change?: number) => Promise<any>;
  setPrintOrder?: (order: any) => void;
  settings?: AppConfig;
  currentUser?: UserType;
}

export const AdminSalesModalClassic: React.FC<AdminSalesModalProps> = ({
  isOpen, onClose, users, products, onConfirm, setPrintOrder, settings, currentUser
}) => {
  const [carrinho, setCarrinho] = useState<any[]>([]);
  const [codigoBarras, setCodigoBarras] = useState('');
  const [buscaProduto, setBuscaProduto] = useState('');
  const [quantidade, setQuantidade] = useState(1);
  const [modalPagamento, setModalPagamento] = useState(false);
  const [modalSucesso, setModalSucesso] = useState(false);
  const [cliente, setCliente] = useState<UserType | null>(null);
  const [buscaResponsavel, setBuscaResponsavel] = useState('');
  const [mostrarListaResp, setMostrarListaResp] = useState(false);
  const [formaPagamento, setFormaPagamento] = useState<'PIX' | 'WALLET' | 'CASH' | 'MIXED'>('PIX');
  const [valorMisto, setValorMisto] = useState({ PIX: '', WALLET: '', CASH: '' });
  const [valorRecebido, setValorRecebido] = useState('');
  const [processando, setProcessando] = useState(false);
  const [ultimoPedido, setUltimoPedido] = useState<Order | null>(null);
  const [activeTab, setActiveTab] = useState<'store' | 'cart'>('store');
  const [desconto, setDesconto] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const scannerRef = useRef<HTMLInputElement>(null);

  // Cores do tema escuro unificado (baseado na tela de Login)
  const colors = {
    bg: '#020617',
    card: '#0f172a',
    cardLight: '#1e293b',
    accent: '#10b981',
    accentHover: '#059669',
    primary: '#3b82f6',
    text: '#f8fafc',
    textMuted: '#94a3b8',
    border: '#1e293b',
    danger: '#ef4444',
    success: '#10b981'
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        if (mostrarListaResp) setMostrarListaResp(false);
        else if (modalPagamento) setModalPagamento(false);
        else if (modalSucesso) { setModalSucesso(false); setCarrinho([]); setCliente(null); }
        else onClose();
      }
      if (e.key === 'F2') { e.preventDefault(); inputRef.current?.focus(); } // Pesquisa Cliente
      if (e.key === 'F3') { e.preventDefault(); if (cliente && carrinho.length > 0 && !modalPagamento) setModalPagamento(true); } // Pagar
      if (e.key === 'F4') { e.preventDefault(); scannerRef.current?.focus(); } // Scanner
      if (e.key === 'F6') { e.preventDefault(); setCarrinho([]); } // Limpar Carrinho
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, mostrarListaResp, modalPagamento, modalSucesso, cliente, carrinho.length]);

  useEffect(() => {
    if (isOpen) {
      setCarrinho([]); setCliente(null); setCodigoBarras(''); setBuscaProduto(''); setQuantidade(1);
      setBuscaResponsavel(''); setMostrarListaResp(false);
      setModalPagamento(false); setModalSucesso(false); setDesconto(0);
      setActiveTab('store');
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen]);

  const responsaveisFiltrados = useMemo(() => {
    const termo = (buscaResponsavel || '').toLowerCase().trim();
    if (!termo) return (users || []).filter(u => u.role !== 'ADMIN' && u.status !== 'suspended').slice(0, 5);
    return (users || []).filter(u =>
      u.role !== 'ADMIN' && u.status !== 'suspended' &&
      ((u.name || '').toLowerCase().includes(termo) ||
       (u.cpf || '').includes(termo) ||
       (u.inmateName || u.prisonerName || '').toLowerCase().includes(termo))
    ).slice(0, 10);
  }, [buscaResponsavel, users]);

  const produtosFiltrados = useMemo(() => {
    const termo = (buscaProduto || codigoBarras).toLowerCase().trim();
    let lista = (products || []).filter(p =>
      p.available !== false &&
      (p.price || 0) > 0
    );
    if (termo) {
      lista = lista.filter(p =>
        (p.name || '').toLowerCase().includes(termo) ||
        (p.barcode || '').toLowerCase().includes(termo) ||
        (p.ean || '').toLowerCase().includes(termo)
      );
    }
    return lista.slice(0, 20);
  }, [products, buscaProduto, codigoBarras]);

  const total = useMemo(() => {
    const cents = carrinho.reduce((acc, item) => acc + Math.round(item.price * 100) * item.quantity, 0);
    return cents / 100;
  }, [carrinho]);
  const totalComDesconto = useMemo(() => Math.max(0, total - desconto), [total, desconto]);

  const adicionarProduto = (produto: Product) => {
    if (produto.stock === 0) return;
    if (!produto.price || produto.price <= 0) return;
    setCarrinho(prev => {
      const existente = prev.find(item => String(item.productId) === String(produto.id));
      if (existente) {
        const novaQtde = existente.quantity + quantidade;
        if (produto.stock !== undefined && novaQtde > produto.stock) return prev;
        return prev.map(item => String(item.productId) === String(produto.id) ? { ...item, quantity: novaQtde } : item);
      }
      return [...prev, { productId: produto?.id || '', name: produto?.name || 'Produto', price: produto?.price || 0, quantity: quantidade || 1, imageUrl: produto?.imageUrl || '' }];
    });
    setCodigoBarras(''); setBuscaProduto(''); setQuantidade(1);
    if (window.innerWidth < 768 && carrinho.length === 0) setActiveTab('cart');
  };

  const atualizarQtd = (i: number, delta: number) => {
    setCarrinho(prev => prev.map((item, idx) => {
      if (idx !== i) return item;
      const novaQtde = Math.max(1, item.quantity + delta);
      const prod = products.find(p => String(p.id) === String(item.productId));
      if (prod?.stock !== undefined && novaQtde > prod.stock) return item;
      return { ...item, quantity: novaQtde };
    }));
  };

  const selecionarResponsavel = (u: UserType) => {
    setCliente(u); setBuscaResponsavel(''); setMostrarListaResp(false);
    setTimeout(() => scannerRef.current?.focus(), 150);
  };

  const finalizar = async () => {
    if (carrinho.length === 0) return;
    setProcessando(true);
    const targetId = cliente?.id || 'balcao_anonimo';
    try {
      let paymentsArray: {method: string, amount: number}[] | undefined = undefined;
      let changeValue: number | undefined = undefined;

      if (formaPagamento === 'MIXED') {
        const pPix = parseFloat(valorMisto.PIX) || 0;
        const pWallet = parseFloat(valorMisto.WALLET) || 0;
        const pCash = parseFloat(valorMisto.CASH) || 0;

        paymentsArray = [];
        if (pPix > 0) paymentsArray.push({ method: 'PIX', amount: pPix });
        if (pWallet > 0) paymentsArray.push({ method: 'WALLET', amount: pWallet });
        if (pCash > 0) paymentsArray.push({ method: 'CASH', amount: pCash });

        const totalRecebido = pPix + pWallet + pCash;
        if (totalRecebido > totalComDesconto && pCash > 0) {
           changeValue = totalRecebido - totalComDesconto;
           const cashIndex = paymentsArray.findIndex(p => p.method === 'CASH');
           if (cashIndex >= 0) {
               paymentsArray[cashIndex].amount -= changeValue;
           }
        } else if (totalRecebido < totalComDesconto) {
           alert('O valor misto inserido é menor que o total da compra.');
           setProcessando(false);
           return;
        }
      } else if (formaPagamento === 'CASH') {
        const recebido = parseFloat(valorRecebido) || 0;
        if (recebido < totalComDesconto - 0.009) {
           const faltam = (totalComDesconto - recebido).toFixed(2);
           alert(`Valor recebido insuficiente. Faltam R$ ${faltam}. Receba ao menos o total da venda em dinheiro.`);
           setProcessando(false);
           return;
        }
        if (recebido > totalComDesconto) {
          changeValue = recebido - totalComDesconto;
        }
      }

      const pedido = await onConfirm(targetId, carrinho, formaPagamento, totalComDesconto, paymentsArray, changeValue);
      setUltimoPedido(pedido); setModalPagamento(false); setModalSucesso(true);
      setValorMisto({ PIX: '', WALLET: '', CASH: '' });
      setValorRecebido('');
      if (setPrintOrder) setPrintOrder(pedido);
    } catch (err) {
      console.error('Erro:', err);
      alert('Erro ao finalizar venda. Verifique o estoque ou saldo.');
    }
    finally { setProcessando(false); }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[600] flex flex-col font-sans text-slate-50 overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-900">

      {/* BACKGROUND ANIMADO - igual ao da tela de Login */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[-20%] w-[70%] h-[70%] rounded-full blur-[180px] opacity-20 animate-float" style={{ backgroundColor: '#10b981' }}></div>
        <div className="absolute bottom-[-20%] right-[-20%] w-[70%] h-[70%] rounded-full blur-[180px] opacity-15 animate-float" style={{ backgroundColor: '#0f172a', animationDelay: '2s' }}></div>
        <div className="absolute top-[40%] left-[30%] w-[50%] h-[50%] rounded-full blur-[150px] opacity-10 animate-float" style={{ backgroundColor: '#f59e0b', animationDelay: '4s' }}></div>
      </div>

      {/* HEADER PRO MAX */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/50 backdrop-blur-xl shrink-0 relative z-10">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-emerald-600 rounded-2xl flex items-center justify-center shadow-[0_0_20px_rgba(16,185,129,0.3)] border border-emerald-400/20">
            <ShoppingCart size={24} className="text-white"/>
          </div>
          <div className="hidden sm:block">
            <h1 className="font-black text-xl tracking-tighter uppercase">{settings?.appName || 'MERCADO FÁCIL'}</h1>
            <p className="text-[10px] font-black text-emerald-400 tracking-[0.2em] uppercase">Venda Direta / PDV</p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3 px-3 sm:px-6 py-2 rounded-2xl bg-slate-800/50 border border-slate-700">
            <div className="text-right">
              <p className="text-[7px] sm:text-[9px] font-black text-slate-400 uppercase tracking-widest">Itens</p>
              <p className="font-black text-base sm:text-lg leading-none">{carrinho.reduce((a,b) => a + b.quantity, 0)}</p>
            </div>
            <div className="w-px h-8 bg-slate-700 mx-1 sm:mx-2" />
            <div className="text-right">
              <p className="text-[7px] sm:text-[9px] font-black text-emerald-400 uppercase tracking-widest">Total</p>
              <p className="font-black text-lg sm:text-2xl leading-none text-emerald-400">R$ {formatarMoeda(totalComDesconto)}</p>
            </div>
          </div>

          <button onClick={onClose} className="w-10 h-10 rounded-full flex items-center justify-center bg-slate-800 hover:bg-red-500 transition-all active:scale-90 group">
            <X size={20} className="group-hover:rotate-90 transition-transform"/>
          </button>
        </div>
      </header>

      {/* TABS MOBILE */}
      <div className="flex lg:hidden bg-gradient-to-br from-[#0f172a] to-[#1e293b] border border-white/10 p-1 mx-4 mt-4 rounded-2xl shrink-0 relative z-10">
        <button
          onClick={() => setActiveTab('store')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${activeTab === 'store' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-400'}`}
        >
          <Package size={16}/> Catálogo
        </button>
        <button
          onClick={() => setActiveTab('cart')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all relative ${activeTab === 'cart' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-400'}`}
        >
          <Receipt size={16}/> Carrinho
          {carrinho.length > 0 && <span className="absolute top-2 right-4 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-[10px] font-black border-2 border-slate-900">{carrinho.length}</span>}
        </button>
      </div>

      <main className="flex-1 flex overflow-hidden p-4 gap-4 relative z-10">

        {/* LADO ESQUERDO: CATÁLOGO E BUSCA */}
        <section className={`flex-[1.2] flex flex-col gap-4 ${activeTab !== 'store' ? 'hidden lg:flex' : 'flex'}`}>

          {/* BUSCA CLIENTE/FAMÍLIA */}
          <div className="bg-gradient-to-br from-[#0f172a] via-[#1e293b] to-[#0f172a] p-5 rounded-[2.5rem] border border-white/10 shadow-xl relative z-20 backdrop-blur-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-blue-500/20 rounded-xl">
                <Users size={18} className="text-blue-400"/>
              </div>
              <h2 className="font-black text-xs uppercase tracking-[0.2em] text-slate-300">Responsável / Família (F5)</h2>
            </div>

            {cliente ? (
              <div className="flex items-center justify-between bg-slate-800/80 p-4 rounded-3xl border border-blue-500/30 animate-fadeIn">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center font-black text-xl shadow-lg border border-white/10">
                    {(cliente?.name || '?').charAt(0)}
                  </div>
                  <div>
                    <p className="font-black text-sm uppercase tracking-tight">{cliente?.name || 'Cliente não identificado'}</p>
                    <p className="text-[10px] font-bold text-slate-400 mt-0.5">Interno: {cliente?.inmateName || 'N/A'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Saldo em Carteira</p>
                    <p className="font-black text-2xl text-emerald-400 leading-none">R$ {formatarMoeda(cliente.walletBalance || 0)}</p>
                  </div>
                  <button onClick={() => setCliente(null)} className="p-2 hover:bg-red-500/20 text-red-400 rounded-xl transition-all">
                    <Trash2 size={20}/>
                  </button>
                </div>
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={20}/>
                <input
                  ref={inputRef}
                  placeholder="Nome, CPF ou Nome do Interno..."
                  className="w-full bg-slate-800 border-2 border-slate-700 rounded-3xl p-4 pl-12 font-bold text-slate-100 focus:border-blue-500 outline-none transition-all placeholder:text-slate-600"
                  value={buscaResponsavel}
                  onChange={e => { setBuscaResponsavel(e.target.value); setMostrarListaResp(true); }}
                />

                <AnimatePresence>
                  {mostrarListaResp && buscaResponsavel.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                      className="absolute left-0 right-0 top-full mt-2 bg-slate-800 border border-slate-700 rounded-[2rem] shadow-2xl z-50 overflow-hidden"
                    >
                      {responsaveisFiltrados.map(u => (
                        <button key={u.id} onClick={() => selecionarResponsavel(u)} className="w-full p-4 flex items-center justify-between hover:bg-blue-500/10 border-b border-slate-700/50 last:border-0 transition-colors">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-slate-700 flex items-center justify-center font-bold text-sm">{u.name?.[0]}</div>
                            <div className="text-left">
                              <p className="font-bold text-xs uppercase">{u?.name || 'Usuário'}</p>
                              <p className="text-[9px] text-slate-400">Interno: {u.inmateName || 'N/A'}</p>
                            </div>
                          </div>
                          <p className="font-black text-xs text-emerald-400">R$ {formatarMoeda(u.walletBalance)}</p>
                        </button>
                      ))}
                      {responsaveisFiltrados.length === 0 && <p className="p-6 text-center text-xs text-slate-500 font-bold">Nenhum resultado encontrado.</p>}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>

          {/* SCANNER E CATÁLOGO */}
          <div className="flex-1 flex flex-col gap-4 min-h-0">
            {/* SCANNER */}
            <div className="bg-gradient-to-br from-[#0f172a] via-[#1e293b] to-[#0f172a] border border-white/10 p-4 rounded-[2.5rem] flex flex-col xl:flex-row gap-4 shadow-inner backdrop-blur-xl">
              {/* SCANNER AREA */}
              <div className="flex-[1.2] flex items-center gap-3 bg-slate-800/40 p-2 rounded-2xl border border-slate-700/50">
                <div className="bg-emerald-500/20 p-2.5 rounded-xl border border-emerald-500/30">
                  <Barcode size={20} className="text-emerald-400"/>
                </div>
                <input
                  ref={scannerRef}
                  placeholder="CÓDIGO DE BARRAS (F4)..."
                  className="flex-1 bg-transparent border-0 font-black text-sm text-emerald-50 placeholder:text-slate-700 outline-none uppercase tracking-widest"
                  value={codigoBarras}
                  onChange={e => setCodigoBarras(e.target.value)}
                  onKeyDown={e => {
                    const code = (codigoBarras || '').trim();
                    if (e.key === 'Enter' && code) {
                      const prod = products.find(p => p.barcode === code || String(p.id) === code || p.ean === code);
                      if (prod) adicionarProduto(prod);
                      else alert('Produto não encontrado!');
                      setCodigoBarras('');
                    }
                  }}
                />
              </div>

              {/* SEARCH & QTD AREA */}
              <div className="flex-[2] flex flex-col sm:flex-row items-center gap-3">
                <div className="flex-1 w-full flex items-center gap-3 bg-slate-800/40 p-2 rounded-2xl border border-slate-700/50">
                  <div className="bg-blue-500/20 p-2.5 rounded-xl border border-blue-500/30">
                    <Search size={20} className="text-blue-400"/>
                  </div>
                  <input
                    placeholder="PESQUISAR POR NOME DO PRODUTO..."
                    className="flex-1 bg-transparent border-0 font-black text-sm text-blue-50 placeholder:text-slate-500 outline-none uppercase tracking-widest min-w-0"
                    value={buscaProduto}
                    onChange={e => setBuscaProduto(e.target.value)}
                  />
                </div>

                {/* QUANTIDADE SELECTOR - REFORÇADO E COM Z-INDEX MÁXIMO NO CONTEXTO */}
                <div className="flex items-center bg-slate-950 border-2 border-emerald-500 rounded-[1.2rem] p-1 gap-2 shrink-0 relative z-[40] shadow-2xl scale-110 md:scale-100">
                  <button
                    onClick={(e) => { e.stopPropagation(); setQuantidade(Math.max(1, quantidade - 1)); }}
                    className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-red-500 text-white transition-all active:scale-90"
                  >
                    <Minus size={18} strokeWidth={3}/>
                  </button>
                  <div className="w-10 flex flex-col items-center">
                    <span className="text-[7px] font-black text-slate-500 uppercase leading-none mb-1">Qtd</span>
                    <span className="font-black text-xl text-white leading-none">{quantidade}</span>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); setQuantidade(quantidade + 1); }}
                    className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-emerald-500 text-white transition-all active:scale-90"
                  >
                    <Plus size={18} strokeWidth={3}/>
                  </button>
                </div>
              </div>
            </div>

            {/* GRID PRODUTOS */}
            <div className="flex-1 overflow-y-auto pr-2 no-scrollbar">
              {produtosFiltrados.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-600 opacity-50">
                  <Package size={64} strokeWidth={1} />
                  <p className="font-black text-sm uppercase mt-4 tracking-widest">Nenhum produto encontrado</p>
                  <p className="text-[10px] font-bold text-slate-700 mt-1">Tente outro termo de busca</p>
                </div>
              ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
                {produtosFiltrados.map(p => (
                  <button
                    key={p.id}
                    onClick={() => adicionarProduto(p)}
                    disabled={p.stock === 0}
                    className={`group p-3 bg-gradient-to-br from-[#0f172a] via-[#1e293b] to-[#0f172a] border border-white/10 rounded-[2rem] flex flex-col items-center hover:border-emerald-500/50 transition-all active:scale-95 backdrop-blur-xl ${p.stock === 0 ? 'opacity-40 grayscale' : 'hover:shadow-[0_10px_30px_rgba(0,0,0,0.3)]'}`}
                  >
                    <div className="w-full aspect-square rounded-2xl bg-gradient-to-br from-slate-700 to-slate-900 mb-3 overflow-hidden relative">
                      {p.imageUrl ? <img src={p.imageUrl} alt="" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" /> : (
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <div className="w-10 h-10 rounded-xl bg-slate-600/50 flex items-center justify-center mb-2">
                            <Package size={20} className="text-slate-400"/>
                          </div>
                          <span className="text-[7px] font-black text-slate-500 uppercase tracking-widest">Sem Foto</span>
                        </div>
                      )}
                      {p.stock <= 5 && p.stock > 0 && <span className="absolute top-2 left-2 bg-amber-500 text-white text-[8px] font-black px-2 py-0.5 rounded-full uppercase">Baixo Estoque</span>}
                      {p.stock === 0 && <span className="absolute inset-0 bg-black/60 flex items-center justify-center font-black text-[10px] uppercase tracking-widest">Esgotado</span>}
                    </div>
                    {p.brand && <p className="text-[8px] font-black text-blue-400 uppercase tracking-widest mb-1 opacity-80">{p.brand}</p>}
                    <p className="font-bold text-[11px] uppercase tracking-tight text-slate-200 line-clamp-1 w-full text-center">{p?.name || 'Produto'}</p>
                    <p className="font-black text-lg text-emerald-400 mt-1">R$ {formatarMoeda(p.price)}</p>
                    <p className="text-[9px] font-bold text-slate-500 mt-0.5 uppercase tracking-widest">{p.stock || 0} em estoque</p>
                  </button>
                ))}
              </div>
              )}
            </div>
          </div>
        </section>

        {/* LADO DIREITO: CARRINHO E RESUMO */}
        <section className={`flex-1 flex flex-col gap-4 ${activeTab !== 'cart' ? 'hidden lg:flex' : 'flex'}`}>
          <div className="flex-1 bg-gradient-to-br from-[#0f172a] via-[#1e293b] to-[#0f172a] border border-white/10 rounded-[2.5rem] flex flex-col overflow-hidden shadow-2xl backdrop-blur-xl">
            <div className="p-6 border-b border-white/10 flex justify-between items-center bg-slate-800/30">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/20 rounded-xl">
                  <Receipt size={20} className="text-blue-400"/>
                </div>
                <h2 className="font-black text-xs uppercase tracking-[0.2em]">Carrinho de Venda</h2>
              </div>
              <button onClick={() => setCarrinho([])} className="text-[10px] font-black uppercase text-red-400 tracking-widest hover:bg-red-500/10 px-3 py-1.5 rounded-xl transition-all">Limpar Tudo</button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3 no-scrollbar">
              {carrinho.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-600 opacity-50">
                  <Package size={64} strokeWidth={1} />
                  <p className="font-black text-sm uppercase mt-4 tracking-widest">Nenhum item no carrinho</p>
                </div>
              ) : (
                carrinho.map((item, i) => (
                  <motion.div
                    layout initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}
                    key={item.productId} className="flex items-center gap-4 p-4 bg-gradient-to-br from-slate-800/80 to-slate-900/80 border border-white/10 rounded-3xl backdrop-blur-sm"
                  >
                    <div className="w-12 h-12 rounded-xl bg-slate-700 shrink-0 overflow-hidden">
                      {item.imageUrl ? <img src={item.imageUrl} alt="" className="w-full h-full object-cover" /> : <Package size={20} className="m-auto mt-3.5 text-slate-500"/>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-xs uppercase tracking-tight truncate">{item?.name || 'Produto'}</p>
                      <div className="flex items-center gap-3 mt-1">
                        <div className="flex items-center bg-slate-900/50 rounded-lg p-0.5 border border-slate-700">
                          <button onClick={() => atualizarQtd(i, -1)} className="w-6 h-6 flex items-center justify-center hover:text-white text-slate-400"><Minus size={12}/></button>
                          <span className="w-6 text-center text-xs font-black">{item?.quantity || 0}</span>
                          <button onClick={() => atualizarQtd(i, 1)} className="w-6 h-6 flex items-center justify-center hover:text-white text-slate-400"><Plus size={12}/></button>
                        </div>
                        <span className="text-xs font-black text-slate-300">× R$ {formatarMoeda(item?.price || 0)}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-black text-sm text-emerald-400">R$ {formatarMoeda((item?.price || 0) * (item?.quantity || 0))}</p>
                      <button onClick={() => setCarrinho(prev => prev.filter((_, idx) => idx !== i))} className="text-red-400 hover:text-red-300 p-2 hover:bg-red-500/10 rounded-xl transition-all"><Trash2 size={18}/></button>
                    </div>
                  </motion.div>
                ))
              )}
            </div>

            {/* RESUMO E BOTÃO FINAL */}
            <div className="p-6 bg-gradient-to-br from-slate-800/80 to-slate-900/80 border-t border-white/10 space-y-4 backdrop-blur-sm">
              <div className="flex justify-between items-end">
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total a Receber</p>
                  <h3 className="text-4xl font-black text-emerald-400 tracking-tighter">R$ {formatarMoeda(totalComDesconto)}</h3>
                </div>
                <div className="text-right">
                   <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Desconto: R$ {formatarMoeda(desconto)}</p>
                </div>
              </div>

              <button
                onClick={() => setModalPagamento(true)}
                disabled={carrinho.length === 0}
                className={`w-full py-5 rounded-[2rem] font-black text-lg uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-4 ${carrinho.length === 0 ? 'bg-slate-700 text-slate-500 grayscale cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-[0_15px_40px_rgba(16,185,129,0.3)] active:scale-95'}`}
              >
                Finalizar Venda <ArrowRight size={24}/>
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* FOOTER SHORTCUTS - HIGH VISIBILITY */}
      <footer className="px-6 py-3 bg-slate-950/80 backdrop-blur-xl border-t border-slate-800 flex flex-wrap justify-center gap-x-10 gap-y-2 text-[10px] font-black uppercase tracking-[0.2em] relative z-10">
        <div className="flex items-center gap-2"><span className="text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-lg">[F2]</span> <span className="text-slate-300">PESQUISAR CLIENTE</span></div>
        <div className="flex items-center gap-2"><span className="text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-lg">[F3]</span> <span className="text-slate-300">FINALIZAR VENDA (PAGAR)</span></div>
        <div className="flex items-center gap-2"><span className="text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-lg">[F4]</span> <span className="text-slate-300">SCANNER / CÓD. BARRAS</span></div>
        <div className="flex items-center gap-2"><span className="text-red-400 bg-red-500/10 px-2 py-0.5 rounded-lg">[F6]</span> <span className="text-slate-300">LIMPAR CARRINHO</span></div>
        <div className="flex items-center gap-2"><span className="text-slate-400 bg-slate-500/10 px-2 py-0.5 rounded-lg">[ESC]</span> <span className="text-slate-300">SAIR / VOLTAR</span></div>
      </footer>

      {/* MODAL PAGAMENTO: ESTILO PRO MAX E ALTA VISIBILIDADE */}
      <AnimatePresence>
        {modalPagamento && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[700] flex items-center justify-center p-4 overlay-dark"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
              className="w-full max-w-lg bg-gradient-to-br from-[#0f172a] via-[#1e293b] to-[#0f172a] border border-white/10 rounded-[3rem] p-8 shadow-[0_40px_100px_rgba(0,0,0,0.8)] relative overflow-hidden backdrop-blur-xl"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-emerald-500 to-transparent"></div>

              <div className="text-center mb-8">
                <div className="w-16 h-16 bg-blue-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-blue-500/30">
                  <CreditCard size={32} className="text-blue-400"/>
                </div>
                <h3 className="font-black text-2xl uppercase tracking-tighter">Forma de Pagamento</h3>
                <p className="text-slate-500 text-sm font-bold uppercase tracking-widest mt-1">Pedido para {cliente?.name || 'Cliente'}</p>
              </div>

              <div className="bg-gradient-to-br from-slate-950 to-slate-900 p-6 rounded-[2rem] mb-8 border border-white/10 shadow-inner text-center">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] mb-2">Total do Pedido</p>
                <p className="text-6xl font-black text-emerald-400 tracking-tighter">R$ {formatarMoeda(totalComDesconto)}</p>
              </div>

              <div className="grid grid-cols-4 gap-4 mb-8">
                {[
                  { id: 'PIX', label: 'PIX', icon: <Zap size={24}/>, color: 'emerald' },
                  { id: 'WALLET', label: 'SALDO', icon: <Wallet size={24}/>, color: 'blue' },
                  { id: 'CASH', label: 'DINHEIRO', icon: <DollarSign size={24}/>, color: 'amber' },
                  { id: 'MIXED', label: 'MISTO', icon: <DollarSign size={24}/>, color: 'emerald' }
                ].map(m => (
                  <button
                    key={m.id}
                    onClick={() => setFormaPagamento(m.id as any)}
                    className={`p-4 sm:p-6 rounded-[2rem] border-2 transition-all flex flex-col items-center gap-3 active:scale-90 touch-target min-h-[44px] min-w-[44px] ${
                      formaPagamento === m.id
                        ? (m.color === 'emerald' ? 'bg-brand-success border-brand-success text-white shadow-[0_10px_25px_rgba(16,185,129,0.3)]' :
                           m.color === 'blue' ? 'bg-blue-600 border-blue-400 text-white shadow-[0_10px_25px_rgba(59,130,246,0.3)]' :
                           'bg-brand-pending border-amber-400 text-white shadow-[0_10px_25px_rgba(245,158,11,0.3)]')
                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500'
                    }`}
                  >
                    <div className={`p-2 rounded-xl ${formaPagamento === m.id ? 'bg-white/20' : 'bg-slate-700'}`}>
                      {m.icon}
                    </div>
                    <span className="font-black text-[9px] sm:text-[10px] uppercase tracking-widest">{m.label}</span>
                  </button>
                ))}
              </div>

              {formaPagamento === 'CASH' && (
                <div className="mb-8">
                  <input
                    type="number"
                    placeholder="Valor recebido (R$)"
                    className="w-full bg-slate-950 border border-slate-700 p-4 rounded-2xl font-bold text-2xl text-center text-white outline-none focus:border-emerald-500 transition-colors"
                    value={valorRecebido}
                    onChange={e => setValorRecebido(e.target.value)}
                  />
                  {valorRecebido && parseFloat(valorRecebido) >= totalComDesconto && (
                    <div className="mt-4 bg-emerald-900/30 border border-emerald-500/50 rounded-2xl p-4 text-center">
                      <p className="text-xs font-black text-emerald-400/70 uppercase tracking-widest mb-1">Troco a Devolver</p>
                      <p className="text-3xl font-black text-emerald-400">R$ {formatarMoeda(parseFloat(valorRecebido) - totalComDesconto)}</p>
                    </div>
                  )}
                </div>
              )}

              {formaPagamento === 'MIXED' && (
                <div className="space-y-4 mb-8 bg-gradient-to-br from-slate-950 to-slate-900 p-6 rounded-[2rem] border border-white/10">
                  <p className="text-xs text-slate-400 font-black uppercase tracking-[0.2em] text-center mb-4">Composição do Pagamento</p>

                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0 border border-blue-500/30"><Zap size={18} /></div>
                    <span className="text-white font-black uppercase w-20 text-xs">PIX</span>
                    <input type="number" placeholder="R$ 0,00" className="flex-1 bg-slate-900 border border-slate-700 p-3 rounded-xl text-white font-black text-right outline-none focus:border-blue-500 transition-colors text-lg" value={valorMisto.PIX} onChange={e => setValorMisto({...valorMisto, PIX: e.target.value})} />
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/30"><Wallet size={18} /></div>
                    <span className="text-white font-black uppercase w-20 text-xs">Créditos</span>
                    <input type="number" placeholder="R$ 0,00" className="flex-1 bg-slate-900 border border-slate-700 p-3 rounded-xl text-white font-black text-right outline-none focus:border-emerald-500 transition-colors text-lg" value={valorMisto.WALLET} onChange={e => setValorMisto({...valorMisto, WALLET: e.target.value})} />
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 border border-amber-500/30"><DollarSign size={18} /></div>
                    <span className="text-white font-black uppercase w-20 text-xs">Dinheiro</span>
                    <input type="number" placeholder="R$ 0,00" className="flex-1 bg-slate-900 border border-slate-700 p-3 rounded-xl text-white font-black text-right outline-none focus:border-amber-500 transition-colors text-lg" value={valorMisto.CASH} onChange={e => setValorMisto({...valorMisto, CASH: e.target.value})} />
                  </div>

                  <div className="pt-4 border-t border-slate-800 mt-2">
                    {(() => {
                      const sum = (parseFloat(valorMisto.PIX)||0) + (parseFloat(valorMisto.WALLET)||0) + (parseFloat(valorMisto.CASH)||0);
                      const missing = totalComDesconto - sum;
                      if (missing > 0) return <p className="text-red-400 text-sm text-center font-black uppercase">Faltam R$ {formatarMoeda(missing)}</p>;
                      if (missing < 0 && (parseFloat(valorMisto.CASH)||0) > 0) return <div className="text-center"><p className="text-emerald-400 text-lg font-black uppercase">Troco: R$ {formatarMoeda(Math.abs(missing))}</p><p className="text-[10px] text-slate-500 font-bold mt-1 uppercase">Troco subtraído do Dinheiro</p></div>;
                      if (missing < 0) return <p className="text-red-400 text-xs text-center font-black uppercase">Valor excedido (Dinheiro = 0, sem troco)</p>;
                      return <p className="text-emerald-400 text-lg text-center font-black uppercase">Valor Exato Atingido</p>;
                    })()}
                  </div>
                </div>
              )}

              <div className="flex gap-4">
                <button
                  onClick={() => setModalPagamento(false)}
                  className="flex-1 py-5 rounded-[2rem] font-black text-sm uppercase tracking-widest bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700 transition-all touch-target min-h-[44px]"
                >
                  Cancelar
                </button>
                <button
                  onClick={finalizar}
                  disabled={processando || (formaPagamento === 'MIXED' && ((parseFloat(valorMisto.PIX)||0) + (parseFloat(valorMisto.WALLET)||0) + (parseFloat(valorMisto.CASH)||0)) < totalComDesconto)}
                  className="flex-[2] py-5 rounded-[2rem] font-black text-sm uppercase tracking-widest bg-brand-success text-white hover:bg-emerald-500 transition-all shadow-[0_15px_30px_rgba(16,185,129,0.3)] disabled:opacity-50 disabled:grayscale active:scale-95 flex items-center justify-center gap-2 touch-target min-h-[44px]"
                >
                  {processando ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <UserCheck size={20} />}
                  {processando ? 'PROCESSANDO' : 'CONFIRMAR VENDA'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MODAL SUCESSO: VISUAL PREMIUM */}
      <AnimatePresence>
        {modalSucesso && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onLayoutAnimationComplete={() => {
                setTimeout(() => {
                    if (modalSucesso) {
                        setCarrinho([]);
                        setModalSucesso(false);
                        setCliente(null);
                        setCodigoBarras('');
                        inputRef.current?.focus();
                    }
                }, 5000);
            }}
            className="fixed inset-0 z-[800] flex items-center justify-center bg-emerald-600"
          >
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              className="text-center p-12"
            >
              <div className="w-32 h-32 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-8 shadow-2xl border border-white/30 animate-pulse">
                <CheckCircle size={64} className="text-white"/>
              </div>
              <h2 className="text-white font-black text-6xl tracking-tighter mb-4">VENDA REALIZADA!</h2>
              <div className="bg-black/10 backdrop-blur-md px-8 py-4 rounded-[2rem] inline-block border border-white/10 mb-8">
                <p className="text-white/90 text-xl font-bold uppercase">{cliente?.name || 'Cliente'}</p>
                <p className="text-white/80 text-xs font-bold uppercase tracking-widest mt-1">Pedido #{ultimoPedido?.id?.slice(-6).toUpperCase()}</p>
              </div>
              <div className="block">
                <button
                  onClick={() => { setCarrinho([]); setModalSucesso(false); setCliente(null); setCodigoBarras(''); inputRef.current?.focus(); }}
                  className="px-12 py-5 rounded-[2rem] font-black text-lg text-emerald-700 bg-white shadow-2xl hover:scale-105 active:scale-95 transition-all uppercase tracking-widest"
                >
                  Nova Venda
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
