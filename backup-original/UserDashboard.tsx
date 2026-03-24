import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../context/StoreContext';
import { OrderStatus, ThemeOption, Order } from '../types';
import { ShoppingCart, LogOut, Search, Plus, X, MapPin, Upload, CheckCircle, MessageSquare, ArrowLeft, Trash2, List, Grid, Clock, FileText, Printer, Home, ShoppingBag, Loader2, Ban, ChevronDown, ChevronUp, Package, CreditCard, RefreshCcw, Download, AlertCircle } from 'lucide-react';
import { ASSPEN_INFO, THEME_COLORS } from '../constants';
import { CupomEntrega } from '../components/CupomEntrega';
import { generatePixPayload } from '../utils';
import { collection, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { motion, AnimatePresence } from 'framer-motion';

export const UserDashboard: React.FC = () => {
    const { currentUser, products, createOrder, compressImage, showNotification, logout, messages, markMessageRead, settings, getWalletTransactions } = useApp();

    // States de Navegação e Visualização
    const [activeTab, setActiveTab] = useState<'store' | 'orders'>('store');
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

    // States do Carrinho e Pedido
    const [cart, setCart] = useState<{ productId: string; quantity: number }[]>([]);
    const [isCartOpen, setIsCartOpen] = useState(false);
    const [isMsgOpen, setIsMsgOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [stage, setStage] = useState<'cart' | 'location' | 'pay' | 'proof'>('cart');
    const [location, setLocation] = useState({ ray: '', wing: '', cell: '' });
    const [proofFile, setProofFile] = useState<File | null>(null);
    const [depositAmount, setDepositAmount] = useState<number>(0);
    const [isDepositOpen, setIsDepositOpen] = useState(false);

    // Estado local para controlar o envio
    const [isSubmitting, setIsSubmitting] = useState(false);

    // States de Visualização de Pedidos Passados
    const [viewingOrderCupom, setViewingOrderCupom] = useState<Order | null>(null);
    const [expandedOrders, setExpandedOrders] = useState<string[]>([]);

    // *** CRITICAL UPDATE: USER SPECIFIC ORDERS ***
    // Modified to use client-side sorting to avoid requirement for composite indexes in Firestore.
    const [myOrders, setMyOrders] = useState<Order[]>([]);
    const [loadingOrders, setLoadingOrders] = useState(false);
    const [walletTxs, setWalletTxs] = useState<any[]>([]);
    const [viewingWalletHistory, setViewingWalletHistory] = useState(false);

    useEffect(() => {
        if (!currentUser) return;
        setLoadingOrders(true);

        const q = query(
            collection(db, 'orders'),
            where('userId', '==', currentUser.id)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const rawOrders = snapshot.docs.map(d => d.data() as Order);
            rawOrders.sort((a, b) => {
                const dateA = new Date(a.createdAt || a.date || 0).getTime();
                const dateB = new Date(b.createdAt || b.date || 0).getTime();
                return dateB - dateA;
            });
            setMyOrders(rawOrders.slice(0, 20));
            setLoadingOrders(false);
        }, (error) => {
            console.error("Error fetching user orders:", error);
            setLoadingOrders(false);
        });

        const fetchWallet = async () => {
            try {
                const txs = await getWalletTransactions(currentUser.id);
                setWalletTxs(txs);
            } catch (e) {
                console.error("Error fetching wallet txs:", e);
            }
        };
        fetchWallet();

        return () => unsubscribe();
    }, [currentUser]);
    // ********************************************

    // Get Theme with Fallback
    const theme = THEME_COLORS[settings?.theme] || THEME_COLORS[ThemeOption.POLICE_MT];

    // Safe Lists (Prevent Blank Screen on Load)
    const safeProducts = Array.isArray(products) ? products : [];
    const safeMessages = Array.isArray(messages) ? messages : [];

    // OPTIMIZATION: Filter items with useMemo to prevent lag on search
    const filteredProducts = useMemo(() => {
        return safeProducts.filter(p => {
            const matchName = (p.name || '').toLowerCase().includes(searchTerm.toLowerCase());
            const isAvailable = p.available !== false;
            return matchName && isAvailable;
        });
    }, [safeProducts, searchTerm]);

    const myMessages = useMemo(() => {
        return safeMessages.filter(m => m.userId === currentUser?.id || m.userId === 'ALL');
    }, [safeMessages, currentUser]);

    const unreadMsg = useMemo(() => {
        return myMessages.filter(m => !m.read && m.fromAdmin).length;
    }, [myMessages]);

    // Lógica do Carrinho com Validação de Estoque
    const addToCart = (pid: string) => {
        const product = safeProducts.find(p => p.id === pid);
        if (!product) return;

        if (product.stock <= 0) {
            showNotification('Produto esgotado no momento.', 'error');
            return;
        }

        setCart(prev => {
            const exists = prev.find(i => i.productId === pid);
            if (exists) {
                if (exists.quantity >= product.stock) {
                    showNotification(`Estoque máximo atingido (${product.stock} un).`, 'error');
                    return prev;
                }
                return prev.map(i => i.productId === pid ? { ...i, quantity: i.quantity + 1 } : i);
            }
            return [...prev, { productId: pid, quantity: 1 }];
        });
        showNotification('Produto adicionado!', 'success');
    };

    const removeFromCart = (pid: string) => {
        setCart(prev => prev.filter(i => i.productId !== pid));
    };

    const cartTotal = cart.reduce((acc, item) => acc + (safeProducts.find(p => p.id === item.productId)?.price || 0) * item.quantity, 0);

    const toggleOrderDetails = (orderId: string) => {
        setExpandedOrders(prev => prev.includes(orderId) ? prev.filter(id => id !== orderId) : [...prev, orderId]);
    };

    const getStatusLabel = (status: string) => {
        const s = (status || '').toLowerCase();
        if (s === 'pendente' || s === 'pending') return 'Esperando confirmação do pagamento';
        if (s === 'pending_payment' || s.includes('aguardando')) return 'Aguardando Pagamento';
        if (s.includes('paid') || s.includes('pago')) return 'Aprovado / Pago';
        if (s.includes('preparing') || s.includes('separa')) return 'Em Separação';
        if (s.includes('out_for_delivery') || s.includes('saiu')) return 'Saiu p/ Entrega';
        if (s.includes('delivered') || s.includes('entregue')) return 'Entregue';
        if (s.includes('cancel')) return 'Cancelado';
        return status;
    };

    const handleFinish = async () => {
        const isWalletPayment = stage === 'pay' && cartPaymentMethod === 'WALLET';
        
        if (!isWalletPayment && !proofFile) {
            return showNotification("Por favor, anexe o comprovante PIX antes de enviar.", "error");
        }

        setIsSubmitting(true);

        try {
            // 1. Upload da imagem (Apenas se for PIX)
            let url = '';
            if (!isWalletPayment && proofFile) {
                url = await compressImage(proofFile);
            }

            // 2. Prepara itens
            const items = cart.map(i => {
                const p = safeProducts.find(prod => prod.id === i.productId);
                return {
                    productId: i.productId,
                    quantity: i.quantity,
                    priceAtPurchase: p ? p.price : 0,
                    name: p ? p.name : 'Item Removido',
                    imageUrl: p ? p.imageUrl : ''
                };
            });

            // 3. Formata localização
            const formattedLocation = {
                raio: location.ray,
                ala: location.wing,
                cela: location.cell,
                ray: location.ray,
                wing: location.wing,
                cell: location.cell
            };

            // 4. Cria pedido
            await createOrder({
                id: Date.now().toString(),
                userId: currentUser!.id,
                items,
                total: cartTotal,
                status: isWalletPayment ? OrderStatus.PAID : OrderStatus.PENDING,
                date: new Date().toISOString(),
                unitId: currentUser!.unitId || '1',
                deliveryLocation: formattedLocation,
                inmateLocation: formattedLocation,
                paymentProofUrl: url,
                paymentMethod: isWalletPayment ? 'WALLET' : 'PIX'
            });

            // 5. Sucesso
            setCart([]);
            setProofFile(null);
            setStage('cart');
            setIsCartOpen(false);
            setActiveTab('store');
            showNotification(isWalletPayment ? 'Compra realizada com sucesso!' : 'Comprovante enviado com sucesso! Pedido em análise.', 'success');

        } catch (e: any) {
            console.error(e);
            showNotification("Erro ao enviar pedido: " + (e.message || "Falha na conexão"), "error");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeposit = async () => {
        if (!proofFile || depositAmount <= 0) return showNotification("Preencha o valor e anexe o comprovante.", "error");
        setIsSubmitting(true);
        try {
            await (useApp as any)().depositToWallet(depositAmount, proofFile);
            setIsDepositOpen(false);
            setProofFile(null);
            setDepositAmount(0);
            showNotification('Comprovante de depósito enviado com sucesso! Aguardando aprovação.', 'success');
        } catch (e: any) {
            showNotification(e.message, "error");
        } finally {
            setIsSubmitting(false);
        }
    };

    const [cartPaymentMethod, setCartPaymentMethod] = useState<'PIX' | 'WALLET'>('PIX');

    // GERAÇÃO DO PAYLOAD PIX DINÂMICO E TIMER
    const [pixPayload, setPixPayload] = useState('');
    const [timeLeft, setTimeLeft] = useState(15 * 60);

    useEffect(() => {
        let timer: NodeJS.Timeout;
        if (stage === 'pay') {
            setTimeLeft(15 * 60);
            timer = setInterval(() => {
                setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
            }, 1000);
        }
        return () => clearInterval(timer);
    }, [stage]);

    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    useEffect(() => {
        if (stage === 'pay') {
            let rawKey = settings?.pixKeys?.[0] || settings?.cnpj || ASSPEN_INFO.cnpj;
            const cleanKey = rawKey.replace(/[^0-9]/g, '');
            const merchantName = cleanKey;
            const merchantCity = 'PEIXOTO AZEVEDO';

            const payload = generatePixPayload(
                cleanKey,
                merchantName,
                merchantCity,
                isDepositOpen ? depositAmount : cartTotal,
                '***'
            );
            setPixPayload(payload);
        }
    }, [stage, cartTotal, settings, isDepositOpen, depositAmount]);

    const canViewCupom = (status: string) => {
        const s = (status || '').toLowerCase();
        return s.includes('paid') || s.includes('pago') || s.includes('delivery') || s.includes('entregue') || s.includes('separ');
    };

    const bgStyle = useMemo(() => {
        if (settings?.userDashboardBgType === 'image' && settings?.userDashboardBgUrl) {
            return {
                backgroundImage: `url(${settings.userDashboardBgUrl})`,
                backgroundSize: 'cover',
                backgroundAttachment: 'fixed',
                backgroundPosition: 'center'
            };
        }
        if (settings?.userDashboardBgType === 'color') {
            return { backgroundColor: settings.backgroundColor || '#f8fafc' };
        }
        return { backgroundColor: '#f8fafc' };
    }, [settings?.userDashboardBgType, settings?.userDashboardBgUrl, settings?.backgroundColor]);

    return (
        <div
            className="min-h-screen flex flex-col font-sans transition-all duration-500 overflow-x-hidden"
            style={bgStyle}
        >

            {/* HEADER THEMED - AGORA COM NAVEGAÇÃO DESKTOP */}
            <header className={`${theme.primary} p-6 sticky top-0 z-[100] shadow-[0_4px_20px_-5px_rgba(0,0,0,0.3)] flex justify-between items-center text-white overflow-hidden`}>
                <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-white/10 to-transparent pointer-events-none"></div>
                <div className="relative z-10 flex items-center gap-4">
                    <div>
                        <h1 className="font-black text-lg tracking-tight uppercase leading-none mb-1">{settings?.appName || 'App'}</h1>
                        <div className="flex items-center gap-1.5 opacity-80">
                            <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></div>
                            <p className="text-[10px] font-bold uppercase tracking-widest">{currentUser?.name.split(' ')[0]}</p>
                        </div>
                    </div>
                </div>

                {/* RELATIVE WALLET SUMMARY (Desktop) */}
                {settings?.enablePrisonerWallet && (
                    <div className="hidden lg:flex items-center gap-3 bg-white/10 backdrop-blur-md px-4 py-2 rounded-2xl border border-white/10 ml-6">
                        <div className="text-right">
                            <p className="text-[9px] font-black text-white/50 uppercase tracking-widest leading-none mb-1">Saldo do Interno</p>
                            <p className="text-sm font-black text-white tracking-tight leading-none">R$ {(currentUser?.walletBalance || 0).toFixed(2)}</p>
                        </div>
                        <button 
                            onClick={() => { setIsDepositOpen(true); setStage('pay'); }}
                            className="bg-white text-slate-900 w-8 h-8 rounded-xl flex items-center justify-center hover:scale-105 active:scale-90 transition-all shadow-lg"
                            title="Adicionar Créditos"
                        >
                            <Plus size={18} />
                        </button>
                    </div>
                )}

                {/* NAVEGAÇÃO DESKTOP CENTRALIZADA */}
                <div className="hidden md:flex items-center gap-2 absolute left-1/2 transform -translate-x-1/2 z-10 bg-black/20 backdrop-blur-xl p-1.5 rounded-2xl border border-white/10">
                    <button
                        onClick={() => setActiveTab('store')}
                        className={`flex items-center gap-2 px-6 py-2.5 rounded-xl transition-all text-xs font-black uppercase tracking-wider ${activeTab === 'store' ? 'bg-white text-slate-900 shadow-xl scale-105' : 'text-white/70 hover:bg-white/10'}`}
                    >
                        <ShoppingBag size={16} /> Loja
                    </button>
                    <button
                        onClick={() => setActiveTab('orders')}
                        className={`flex items-center gap-2 px-6 py-2.5 rounded-xl transition-all text-xs font-black uppercase tracking-wider ${activeTab === 'orders' ? 'bg-white text-slate-900 shadow-xl scale-105' : 'text-white/70 hover:bg-white/10'}`}
                    >
                        <Clock size={16} /> Pedidos
                    </button>
                </div>

                <div className="flex gap-2.5 relative z-10">
                    <button onClick={() => setIsMsgOpen(!isMsgOpen)} className="w-11 h-11 bg-white/10 border border-white/20 text-white rounded-2xl flex items-center justify-center hover:bg-white/20 transition-all active:scale-90 shadow-lg backdrop-blur-md">
                        <MessageSquare size={20} />
                        {unreadMsg > 0 && <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] w-5 h-5 rounded-full flex items-center justify-center font-black border-2 border-slate-900">{unreadMsg}</span>}
                    </button>
                    <button onClick={logout} className="w-11 h-11 bg-red-500/20 text-white border border-red-500/30 rounded-2xl flex items-center justify-center hover:bg-red-500/40 transition-all active:scale-90 shadow-lg backdrop-blur-md"><LogOut size={20} /></button>
                </div>
            </header>

            {/* MESSAGES DROPDOWN */}
            {isMsgOpen && (
                <div className="fixed top-20 right-4 w-80 bg-white rounded-2xl shadow-2xl z-50 border border-gray-100 p-4 max-h-96 overflow-y-auto animate-fadeIn">
                    <h3 className="font-bold text-sm mb-3 text-slate-800">Mensagens da Administração</h3>
                    {myMessages.length === 0 ? <p className="text-xs text-gray-400">Nenhuma mensagem.</p> : myMessages.map(m => (
                        <div key={m.id} className="bg-blue-50 p-3 rounded-xl mb-2 text-xs" onClick={() => markMessageRead(m.id)}>
                            <p className="font-bold text-blue-800 mb-1">{new Date(m.date).toLocaleDateString()}</p>
                            <p className="text-blue-900">{m.text}</p>
                        </div>
                    ))}
                </div>
            )}

            {/* --- CONTEÚDO PRINCIPAL --- */}
            <div className="max-w-2xl mx-auto">

                {/* ABA LOJA */}
                {activeTab === 'store' && (
                    <div className="animate-fadeIn">
                        {/* WALLET BAR FOR MOBILE */}
                        {settings?.enablePrisonerWallet && (
                            <div className="md:hidden px-5 pt-4">
                                <div className="bg-slate-900 border border-white/10 rounded-3xl p-5 shadow-xl flex justify-between items-center relative overflow-hidden group">
                                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform"><CreditCard size={60} className="text-white" /></div>
                                    <div className="relative z-10">
                                        <p className="text-sky-300 text-[9px] font-black uppercase tracking-widest mb-1.5">Créditos Disponíveis</p>
                                        <div className="flex items-baseline gap-1.5">
                                            <span className="text-white text-2xl font-black">R$ {(currentUser?.walletBalance || 0).toFixed(2)}</span>
                                            <span className="text-white/40 text-[10px] font-bold">/ R$ {(settings.weeklyWalletLimit || 300).toFixed(2)} sem.</span>
                                        </div>
                                        <div className="mt-3 w-32 h-1.5 bg-white/10 rounded-full overflow-hidden">
                                            <motion.div 
                                                className="h-full bg-sky-400" 
                                                initial={{ width: 0 }}
                                                animate={{ width: `${Math.min(100, ((currentUser?.weeklySpent || 0) / (settings.weeklyWalletLimit || 300)) * 100)}%` }}
                                            />
                                        </div>
                                    </div>
                                    <button 
                                        onClick={() => { setIsDepositOpen(true); setStage('pay'); setDepositAmount(0); }}
                                        className="relative z-10 bg-white text-slate-900 px-4 py-2.5 rounded-2xl font-black text-[10px] uppercase tracking-wider flex items-center gap-2 shadow-xl active:scale-95 transition-all"
                                    >
                                        <Plus size={14} /> Depositar
                                    </button>
                                </div>
                            </div>
                        )}
                        {/* Barra de Busca */}
                        <div className="p-5 sticky top-[80px] z-10 bg-slate-50/95 backdrop-blur-sm">
                            <div className="flex gap-2">
                                <div className="relative group flex-1">
                                    <Search className="absolute left-4 top-3.5 text-gray-400" size={20} />
                                    <input className="w-full pl-12 pr-4 py-3 rounded-2xl border border-gray-200 shadow-sm focus:ring-2 focus:ring-slate-300 outline-none bg-white placeholder:text-gray-400 transition-all" placeholder="Buscar produtos..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                                </div>
                                <div className="bg-white border border-gray-200 rounded-2xl flex items-center p-1 shadow-sm">
                                    <button onClick={() => setViewMode('grid')} className={`p-2.5 rounded-xl transition-all ${viewMode === 'grid' ? 'bg-slate-900 text-white shadow' : 'text-gray-400 hover:text-slate-600'}`}><Grid size={20} /></button>
                                    <button onClick={() => setViewMode('list')} className={`p-2.5 rounded-xl transition-all ${viewMode === 'list' ? 'bg-slate-900 text-white shadow' : 'text-gray-400 hover:text-slate-600'}`}><List size={20} /></button>
                                </div>
                            </div>
                        </div>

                        {/* Lista de Produtos */}
                        <div className="px-5 pb-20">
                            {filteredProducts.length === 0 ? (
                                <div className="text-center py-10 opacity-50">
                                    <ShoppingBag size={48} className="mx-auto mb-2" />
                                    <p>Nenhum produto encontrado.</p>
                                </div>
                            ) : viewMode === 'grid' ? (
                                <div className="grid grid-cols-2 gap-4">
                                    {filteredProducts.map(p => {
                                        const isOutOfStock = p.stock <= 0;
                                        return (
                                            <motion.div
                                                layout
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                key={p.id}
                                                className={`${theme.card} p-4 rounded-[2rem] shadow-sm border border-gray-100 flex flex-col h-full relative group transition-all duration-300 ${isOutOfStock ? 'opacity-80' : 'hover:shadow-xl hover:-translate-y-1'}`}
                                            >
                                                <div className="bg-slate-50 aspect-square rounded-[1.5rem] mb-4 overflow-hidden relative shadow-inner">
                                                    <img
                                                        src={p.imageUrl || 'https://placehold.co/150'}
                                                        onError={(e) => { e.currentTarget.src = 'https://placehold.co/150'; }}
                                                        className={`w-full h-full object-cover transition-transform duration-700 ${isOutOfStock ? 'grayscale' : 'group-hover:scale-110'}`}
                                                    />
                                                    {isOutOfStock && (
                                                        <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center">
                                                            <span className="bg-red-600 text-white text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-wider shadow-lg">Esgotado</span>
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="px-1">
                                                    <h3 className="font-bold text-sm text-slate-800 line-clamp-2 leading-snug mb-2 min-h-[2.8em]">{p.name}</h3>
                                                    <div className="mt-auto flex justify-between items-center bg-slate-50/50 p-2 rounded-2xl border border-slate-100/50">
                                                        <div className="flex flex-col">
                                                            {p.promoPrice ? (
                                                                <>
                                                                    <span className="text-[10px] text-gray-400 line-through leading-none">R$ {p.price.toFixed(2)}</span>
                                                                    <span className={`font-black ${theme.price} text-base tracking-tight`}>R$ {p.promoPrice.toFixed(2)}</span>
                                                                </>
                                                            ) : (
                                                                <span className={`font-black ${theme.price} text-base tracking-tight`}>R$ {p.price.toFixed(2)}</span>
                                                            )}
                                                        </div>
                                                        <button
                                                            disabled={isOutOfStock}
                                                            onClick={() => addToCart(p.id)}
                                                            className={`${isOutOfStock ? 'bg-gray-300' : theme.primary} text-white w-9 h-9 rounded-2xl flex items-center justify-center shadow-lg active:scale-90 transition-all hover:brightness-110`}
                                                        >
                                                            {isOutOfStock ? <Ban size={16} /> : <Plus size={20} />}
                                                        </button>
                                                    </div>
                                                </div>
                                            </motion.div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {filteredProducts.map(p => {
                                        const isOutOfStock = p.stock <= 0;
                                        return (
                                            <motion.div
                                                layout
                                                initial={{ opacity: 0, x: -10 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                key={p.id}
                                                className={`${theme.card} p-4 rounded-[1.5rem] shadow-sm border border-gray-100 flex items-center gap-4 transition-all duration-300 ${isOutOfStock ? 'opacity-75' : 'hover:shadow-md'}`}
                                            >
                                                <div className="w-20 h-20 bg-slate-50 rounded-2xl overflow-hidden flex-shrink-0 relative shadow-inner">
                                                    <img
                                                        src={p.imageUrl || 'https://placehold.co/150'}
                                                        onError={(e) => { e.currentTarget.src = 'https://placehold.co/150'; }}
                                                        className={`w-full h-full object-cover ${isOutOfStock ? 'grayscale' : ''}`}
                                                    />
                                                    {isOutOfStock && (
                                                        <div className="absolute inset-0 flex items-center justify-center bg-black/30 backdrop-blur-[1px]">
                                                            <span className="text-[8px] font-black bg-red-600 text-white px-2 py-0.5 rounded-full shadow-lg">ESGOTADO</span>
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex-1">
                                                    <h3 className="font-bold text-sm text-slate-800 mb-0.5">{p.name}</h3>
                                                    <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md ${theme.secondary} text-white inline-block`}>{p.category}</span>
                                                </div>
                                                <div className="flex flex-col items-end gap-2">
                                                    {p.promoPrice ? (
                                                        <div className="flex flex-col items-end">
                                                            <span className="text-[10px] text-gray-400 line-through leading-none">R$ {p.price.toFixed(2)}</span>
                                                            <span className={`font-black ${theme.price} text-base`}>R$ {p.promoPrice.toFixed(2)}</span>
                                                        </div>
                                                    ) : (
                                                        <span className={`font-black ${theme.price} text-base`}>R$ {p.price.toFixed(2)}</span>
                                                    )}
                                                    <button
                                                        disabled={isOutOfStock}
                                                        onClick={() => addToCart(p.id)}
                                                        className={`${isOutOfStock ? 'bg-gray-300' : theme.primary} text-white px-4 py-2 rounded-xl text-xs font-bold shadow-lg active:scale-95 transition-all flex items-center gap-2 hover:brightness-110`}
                                                    >
                                                        {isOutOfStock ? <Ban size={14} /> : <Plus size={14} />} {isOutOfStock ? 'Indisponível' : 'Adicionar'}
                                                    </button>
                                                </div>
                                            </motion.div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ABA MEUS PEDIDOS */}
                {activeTab === 'orders' && (
                    <div className="p-5 animate-fadeIn pb-24">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="font-bold text-xl text-slate-800 flex items-center gap-2">
                                <Clock className="text-slate-400" /> Histórico (Seus Pedidos)
                            </h2>
                            {settings?.enablePrisonerWallet && (
                                <button 
                                    onClick={() => setViewingWalletHistory(!viewingWalletHistory)}
                                    className={`text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-xl border-2 transition-all ${viewingWalletHistory ? 'bg-slate-900 border-slate-900 text-white' : 'border-slate-200 text-slate-500 hover:border-slate-400'}`}
                                >
                                    {viewingWalletHistory ? 'Ver Pedidos' : 'Ver Extrato Carteira'}
                                </button>
                            )}
                        </div>

                        {viewingWalletHistory ? (
                            <div className="space-y-4 animate-fadeIn">
                                {walletTxs.length === 0 ? (
                                    <div className="text-center py-10 opacity-50 bg-white rounded-3xl border border-dashed border-gray-300">
                                        <CreditCard size={48} className="mx-auto mb-2" />
                                        <p>Nenhuma movimentação na carteira.</p>
                                    </div>
                                ) : (
                                    walletTxs.map(tx => (
                                        <div key={tx.id} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex justify-between items-center">
                                            <div>
                                                <p className="font-bold text-slate-800 text-sm capitalize">{tx.type === 'deposit' ? 'Depósito PIX' : tx.type === 'purchase' ? 'Compra na Loja' : tx.type === 'withdrawal' ? 'Retirada Admin' : 'Ajuste'}</p>
                                                <p className="text-[10px] text-slate-400 font-bold">{new Date(tx.createdAt).toLocaleString()}</p>
                                                <p className="text-[10px] text-slate-500 mt-1">{tx.description}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className={`font-black text-sm ${tx.amount > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                    {tx.amount > 0 ? '+' : ''} R$ {Math.abs(tx.amount).toFixed(2)}
                                                </p>
                                                <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded ${tx.status === 'approved' ? 'bg-green-100 text-green-700' : tx.status === 'pending' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                                                    {tx.status === 'approved' ? 'Confirmado' : tx.status === 'pending' ? 'Pendente' : 'Recusado'}
                                                </span>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        ) : loadingOrders ? (
                            <div className="flex justify-center py-10"><Loader2 className="animate-spin text-slate-400" size={32} /></div>
                        ) : (
                            <div className="space-y-4">
                                {myOrders.length === 0 ? (
                                    <div className="text-center py-10 opacity-50 bg-white rounded-3xl border border-dashed border-gray-300">
                                        <FileText size={48} className="mx-auto mb-2" />
                                        <p>Nenhum pedido recente.</p>
                                    </div>
                                ) : (
                                    myOrders.map(order => (
                                        <div key={order.id} className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100 relative overflow-hidden">
                                            <div className="flex justify-between items-start mb-3">
                                                <div>
                                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Pedido #{order.id.slice(0, 6).toUpperCase()}</span>
                                                    <p className="font-bold text-slate-800 text-sm">{new Date(order.createdAt || order.date).toLocaleString()}</p>
                                                </div>
                                                <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase ${order.status.includes('paid') || order.status.includes('pago') ? 'bg-green-100 text-green-700' :
                                                    order.status.includes('cancel') ? 'bg-red-100 text-red-700' :
                                                        order.status.includes('deliver') ? 'bg-blue-100 text-blue-700' :
                                                            'bg-yellow-100 text-yellow-700'
                                                    }`}>
                                                    {getStatusLabel(order.status)}
                                                </span>
                                            </div>

                                            <div className="bg-slate-50 rounded-xl p-3 mb-3">
                                                <div className="flex justify-between text-xs mb-1">
                                                    <span className="text-slate-500">Resumo:</span>
                                                    <span className="font-bold text-slate-800">{order.items.length} produtos</span>
                                                </div>
                                                <div className="flex justify-between text-sm mb-2">
                                                    <span className="font-bold text-slate-600">Total:</span>
                                                    <span className="font-black text-slate-900">R$ {Number(order.total).toFixed(2)}</span>
                                                </div>

                                                {/* Botão para Expandir Itens */}
                                                <button
                                                    onClick={() => toggleOrderDetails(order.id)}
                                                    className="w-full bg-white border border-slate-200 rounded-lg py-2 text-xs font-bold text-slate-600 flex items-center justify-center gap-2 hover:bg-slate-50"
                                                >
                                                    {expandedOrders.includes(order.id) ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                                    {expandedOrders.includes(order.id) ? 'Ocultar Itens' : 'Ver Itens Comprados'}
                                                </button>

                                                {/* Lista Expansível */}
                                                {expandedOrders.includes(order.id) && (
                                                    <div className="mt-2 pt-2 border-t border-slate-200 animate-fadeIn space-y-2">
                                                        {order.items.map((item, i) => (
                                                            <div key={i} className="flex justify-between items-center text-xs">
                                                                <div className="flex items-center gap-2">
                                                                    <div className="w-6 h-6 bg-slate-200 rounded flex items-center justify-center text-slate-500">
                                                                        <Package size={12} />
                                                                    </div>
                                                                    <span className="text-slate-700 line-clamp-1 max-w-[150px]">{item.name}</span>
                                                                </div>
                                                                <div className="flex gap-2">
                                                                    <span className="font-bold bg-slate-100 px-1 rounded">x{item.quantity}</span>
                                                                    <span className="font-bold text-slate-900">R$ {(item.priceAtPurchase * item.quantity).toFixed(2)}</span>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>

                                            {canViewCupom(order.status) && (
                                                <button
                                                    onClick={() => setViewingOrderCupom(order)}
                                                    className="w-full py-3 bg-slate-900 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow hover:bg-black transition-all"
                                                >
                                                    <Printer size={16} /> VISUALIZAR CUPOM / RECIBO
                                                </button>
                                            )}
                                        </div>
                                    ))
                                )}
                            </div>
                        )}
                    </div>
                )}

            </div>

            {/* --- BOTÃO FLUTUANTE DE CARRINHO (FAB) --- */}
            {cart.length > 0 && activeTab === 'store' && !isCartOpen && (
                <div className="fixed bottom-24 right-5 z-40 animate-slideUp">
                    <button
                        onClick={() => { setIsCartOpen(true); setStage('cart'); }}
                        className={`${theme.primary} text-white px-6 py-4 rounded-full shadow-2xl flex items-center gap-3 font-bold hover:scale-105 transition-transform border-4 border-slate-50`}
                    >
                        <div className="relative">
                            <ShoppingCart size={24} />
                            <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] w-5 h-5 rounded-full flex items-center justify-center font-bold">{cart.length}</span>
                        </div>
                        <span className="text-sm">Finalizar R$ {cartTotal.toFixed(2)}</span>
                    </button>
                </div>
            )}

            {/* --- BARRA DE NAVEGAÇÃO INFERIOR PARA MOBILE (FLOATING GLASSMOPHISM) --- */}
            {!isCartOpen && (
                <div className="md:hidden fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] w-[90%] max-w-[400px] animate-slideUp">
                    <div className="bg-slate-900/90 backdrop-blur-2xl px-6 py-4 rounded-[2.5rem] flex justify-between items-center shadow-[0_20px_50px_rgba(0,0,0,0.4)] border border-white/10 relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-t from-white/5 to-transparent pointer-events-none"></div>

                        <button
                            onClick={() => setActiveTab('store')}
                            className={`flex flex-col items-center gap-1.5 transition-all relative z-10 ${activeTab === 'store' ? 'text-white' : 'text-white/40 hover:text-white/60'}`}
                        >
                            <div className={`p-2 rounded-2xl transition-all duration-300 ${activeTab === 'store' ? 'bg-white/20 shadow-lg scale-110' : ''}`}>
                                <Home size={22} strokeWidth={activeTab === 'store' ? 2.5 : 2} />
                            </div>
                            <span className="text-[9px] font-black uppercase tracking-widest">Início</span>
                        </button>

                        <button
                            onClick={() => setIsCartOpen(true)}
                            className="bg-white text-slate-900 p-5 rounded-[2rem] shadow-[0_10px_30px_rgba(255,255,255,0.2)] active:scale-95 transition-all -mt-12 border-[4px] border-slate-900 relative z-20 group"
                        >
                            <div className="relative">
                                <ShoppingCart size={24} strokeWidth={2.5} className="group-hover:scale-110 transition-transform" />
                                {cart.length > 0 && (
                                    <span className="absolute -top-3 -right-3 bg-red-500 text-white text-[10px] w-6 h-6 rounded-full flex items-center justify-center font-black border-2 border-slate-900 shadow-lg animate-bounce">
                                        {cart.reduce((a, b) => a + b.quantity, 0)}
                                    </span>
                                )}
                            </div>
                        </button>

                        <button
                            onClick={() => setActiveTab('orders')}
                            className={`flex flex-col items-center gap-1.5 transition-all relative z-10 ${activeTab === 'orders' ? 'text-white' : 'text-white/40 hover:text-white/60'}`}
                        >
                            <div className={`p-2 rounded-2xl transition-all duration-300 ${activeTab === 'orders' ? 'bg-white/20 shadow-lg scale-110' : ''}`}>
                                <Clock size={22} strokeWidth={activeTab === 'orders' ? 2.5 : 2} />
                            </div>
                            <span className="text-[9px] font-black uppercase tracking-widest">Meus Pedidos</span>
                        </button>
                    </div>
                </div>
            )}

            {/* --- MODAL DO CARRINHO / DEPÓSITO --- */}
            {(isCartOpen || isDepositOpen) && (
                <div className="fixed inset-0 z-50 flex justify-end">
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !isSubmitting && (setIsCartOpen(false) || setIsDepositOpen(false))}></div>
                    <div className="relative w-full md:max-w-md bg-white h-full shadow-2xl flex flex-col animate-slideInRight">
                        <div className={`p-6 border-b border-gray-100 flex justify-between items-center ${isDepositOpen ? 'bg-slate-900' : theme.primary} text-white`}>
                            <h2 className="font-bold text-xl">{isDepositOpen ? 'Adicionar Créditos' : 'Seu Carrinho'}</h2>
                            <button onClick={() => !isSubmitting && (setIsCartOpen(false) || setIsDepositOpen(false))} className="bg-white/10 p-2 rounded-full hover:bg-white/20"><X size={20} /></button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50">
                            {isDepositOpen && stage === 'cart' && setStage('pay')}

                            {/* ETAPA 1: ITENS */}
                            {stage === 'cart' && !isDepositOpen && (
                                cart.length === 0 ? <p className="text-center text-gray-400 mt-10">Carrinho vazio.</p> :
                                    <div className="space-y-3">
                                        {cart.map(i => {
                                            const p = safeProducts.find(x => x.id === i.productId);
                                            if (!p) return null;
                                            return (
                                                <div key={i.productId} className="bg-white p-3 rounded-2xl border border-gray-200 flex items-center gap-4 shadow-sm">
                                                    <img src={p.imageUrl || 'https://via.placeholder.com/50'} className="w-14 h-14 rounded-xl object-cover bg-gray-100" />
                                                    <div className="flex-1">
                                                        <p className="font-bold text-sm text-slate-800 line-clamp-1">{p.name}</p>
                                                        <p className={`font-bold text-xs ${theme.primary.replace('bg-', 'text-')}`}>R$ {p.price.toFixed(2)}</p>
                                                    </div>
                                                    <div className="flex flex-col items-end gap-2">
                                                        <span className="font-bold text-xs bg-gray-100 px-2 py-1 rounded text-slate-600">{i.quantity}un</span>
                                                        <button onClick={() => removeFromCart(i.productId)} className="text-red-400 hover:text-red-600 p-1 bg-red-50 rounded-lg">
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                            )}

                            {/* ETAPA 2: LOCALIZAÇÃO (Entrega) */}
                            {stage === 'location' && (
                                <div className="space-y-4 animate-fadeIn">
                                    <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl flex items-start gap-3">
                                        <MapPin className="text-blue-600 mt-1 flex-shrink-0" size={20} />
                                        <div>
                                            <h3 className="font-bold text-blue-900 text-sm">Onde o interno está?</h3>
                                            <p className="text-blue-700 text-xs mt-1">Essas informações são opcionais, mas ajudam na entrega.</p>
                                        </div>
                                    </div>

                                    <div className="space-y-3 pt-2">
                                        <div>
                                            <label className="text-xs font-bold text-slate-500 uppercase ml-1">Raio / Pavilhão (Opcional)</label>
                                            <input
                                                placeholder="Ex: Raio 3, Pavilhão A..."
                                                className="w-full p-4 bg-white border border-slate-200 rounded-xl focus:border-slate-400 outline-none font-bold text-slate-800 transition-colors shadow-sm"
                                                value={location.ray}
                                                onChange={e => setLocation({ ...location, ray: e.target.value })}
                                            />
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="text-xs font-bold text-slate-500 uppercase ml-1">Ala / Galeria</label>
                                                <input
                                                    placeholder="Ex: Ala B"
                                                    className="w-full p-4 bg-white border border-slate-200 rounded-xl focus:border-slate-400 outline-none font-bold text-slate-800 transition-colors shadow-sm"
                                                    value={location.wing}
                                                    onChange={e => setLocation({ ...location, wing: e.target.value })}
                                                />
                                            </div>
                                            <div>
                                                <label className="text-xs font-bold text-slate-500 uppercase ml-1">Cela</label>
                                                <input
                                                    placeholder="Ex: 04"
                                                    className="w-full p-4 bg-white border border-slate-200 rounded-xl focus:border-slate-400 outline-none font-bold text-slate-800 transition-colors shadow-sm"
                                                    value={location.cell}
                                                    onChange={e => setLocation({ ...location, cell: e.target.value })}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* ETAPA 3: PAGAMENTO */}
                            {stage === 'pay' && (
                                <motion.div
                                    key="pay"
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.95 }}
                                    transition={{ duration: 0.3 }}
                                    className="text-center space-y-6"
                                >
                                    <div className={`glass-dark text-white p-6 rounded-3xl shadow-xl relative overflow-hidden transition-colors`}>
                                        <div className="absolute top-0 left-0 w-full h-1 bg-white/20">
                                            <motion.div
                                                className="h-full bg-green-400"
                                                initial={{ width: '100%' }}
                                                animate={{ width: `${(timeLeft / (15 * 60)) * 100}%` }}
                                                transition={{ duration: 1, ease: 'linear' }}
                                            />
                                        </div>
                                        <p className="text-white/80 text-xs font-bold uppercase tracking-wider mb-2 flex justify-center items-center gap-2">
                                            <Clock size={16} className={timeLeft < 300 ? 'text-red-400 animate-pulse' : 'text-green-400'} />
                                            Tempo Restante: <span className={timeLeft < 300 ? 'text-red-400' : ''}>{formatTime(timeLeft)}</span>
                                        </p>
                                        <p className="font-bold text-4xl mb-1">R$ {(isDepositOpen ? depositAmount : cartTotal).toFixed(2)}</p>
                                        <p className="text-white/60 text-[10px] uppercase">{isDepositOpen ? 'Valor a Ser Creditado' : 'Garantia de Preço'}</p>
                                    </div>

                                    {isDepositOpen && (
                                        <div className="px-2">
                                            <label className="text-xs font-black text-slate-500 uppercase block mb-1.5 tracking-wider">Quantia do Depósito (R$)</label>
                                            <input 
                                                type="number"
                                                className="w-full p-4 border-2 border-slate-200 rounded-2xl bg-white text-slate-900 font-black text-center text-xl focus:border-blue-500 focus:bg-white outline-none transition-all shadow-inner" 
                                                value={depositAmount || ''} 
                                                onChange={e => setDepositAmount(Number(e.target.value))} 
                                                placeholder="Ex: 100.00"
                                            />
                                        </div>
                                    )}

                                    <div className="flex justify-center flex-col items-center gap-4">
                                        <div className="bg-white p-4 rounded-3xl shadow-xl border border-gray-100 flex items-center justify-center relative group">
                                            <div className="absolute inset-0 bg-gradient-to-tr from-blue-50 to-emerald-50 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                            <div className="bg-white p-2 rounded-2xl relative z-10 shadow-sm border border-gray-50">
                                                <img
                                                    src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(pixPayload)}`}
                                                    alt="QR Code PIX"
                                                    className="w-[200px] h-[200px] object-contain transition-transform group-hover:scale-105 duration-500"
                                                />
                                            </div>
                                        </div>
                                        <div className="bg-emerald-50 text-emerald-700 px-6 py-2 rounded-full font-black text-lg shadow-sm border border-emerald-100 animate-pulse">
                                            VALOR: R$ {(isDepositOpen ? depositAmount : cartTotal).toFixed(2)}
                                        </div>
                                    </div>

                                    <div className="space-y-3 px-2">
                                        <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Pix Copia e Cola</p>
                                        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 shadow-inner break-all text-left relative overflow-hidden group">
                                            <p className="text-[11px] text-slate-500 font-mono pr-8 line-clamp-2 leading-relaxed">{pixPayload}</p>
                                            <div className="absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-slate-50 to-transparent"></div>
                                        </div>

                                        <button
                                            className={`w-full py-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all shadow-md active:scale-95 ${theme.primary} text-white hover:brightness-110`}
                                            onClick={() => {
                                                const copyText = (text: string) => {
                                                    if (navigator.clipboard && window.isSecureContext) {
                                                        return navigator.clipboard.writeText(text);
                                                    } else {
                                                        const textArea = document.createElement("textarea");
                                                        textArea.value = text;
                                                        textArea.style.position = "fixed";
                                                        textArea.style.left = "-9999px";
                                                        textArea.style.top = "0";
                                                        document.body.appendChild(textArea);
                                                        textArea.focus();
                                                        textArea.select();
                                                        return new Promise((res, rej) => {
                                                            document.execCommand('copy') ? res(null) : rej();
                                                            textArea.remove();
                                                        });
                                                    }
                                                };

                                                copyText(pixPayload)
                                                    .then(() => showNotification('Código Copiado com Sucesso!', 'success'))
                                                    .catch(() => showNotification('Erro ao copiar. Tente selecionar manualmente.', 'error'));
                                            }}
                                        >
                                            <FileText size={18} /> Copiar Código PIX
                                        </button>
                                    </div>
                                </motion.div>
                            )}

                            {/* ETAPA 4: COMPROVANTE */}
                            {stage === 'proof' && (
                                <motion.div
                                    key="proof"
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -20 }}
                                    transition={{ duration: 0.3 }}
                                    className="space-y-6"
                                >
                                    <div className="text-center mb-2">
                                        <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4 scale-110 shadow-inner">
                                            <Upload size={30} />
                                        </div>
                                        <h3 className="font-bold text-xl text-slate-800 tracking-tight">Anexar Comprovante</h3>
                                        <p className="text-sm text-slate-500 mt-1 max-w-[250px] mx-auto">Precisamos do recibo do PIX para validar o pagamento.</p>
                                    </div>

                                    <div onClick={() => document.getElementById('f')?.click()} className={`border-2 border-dashed p-8 rounded-3xl text-center cursor-pointer transition-all relative group overflow-hidden ${proofFile ? 'border-emerald-500 bg-emerald-50 shadow-emerald-100/50' : 'border-slate-300 bg-slate-50 hover:bg-slate-100 hover:border-slate-400 hover:shadow-lg'}`}>
                                        <input type="file" id="f" className="hidden" accept="image/*" onChange={e => {
                                            const file = e.target.files?.[0];
                                            if (file) {
                                                if (file.size > 5 * 1024 * 1024) {
                                                    showNotification('A imagem é muito grande. Escolha uma foto menor.', 'error');
                                                    e.target.value = '';
                                                    return;
                                                }
                                                setProofFile(file);
                                            }
                                        }} />

                                        <AnimatePresence mode="wait">
                                            {proofFile ? (
                                                <motion.div
                                                    key="has-file"
                                                    initial={{ scale: 0.8, opacity: 0 }}
                                                    animate={{ scale: 1, opacity: 1 }}
                                                    className="flex flex-col items-center relative z-10"
                                                >
                                                    <div className="w-20 h-20 rounded-2xl overflow-hidden mb-4 shadow-md border-4 border-white bg-white">
                                                        <img src={URL.createObjectURL(proofFile)} alt="Preview" className="w-full h-full object-cover" />
                                                    </div>
                                                    <CheckCircle size={28} className="text-emerald-500 mb-2" />
                                                    <span className="font-bold text-sm text-emerald-700 block line-clamp-1 break-all px-4">{proofFile.name}</span>
                                                    <span className="text-[10px] text-emerald-600/70 uppercase mt-1">Toque para trocar a foto</span>
                                                </motion.div>
                                            ) : (
                                                <motion.div
                                                    key="no-file"
                                                    initial={{ scale: 0.8, opacity: 0 }}
                                                    animate={{ scale: 1, opacity: 1 }}
                                                    className="flex flex-col items-center relative z-10 opacity-70 group-hover:opacity-100 transition-opacity"
                                                >
                                                    <Package className="mx-auto text-slate-400 mb-4 transition-transform group-hover:scale-110 group-hover:text-blue-500" size={48} strokeWidth={1.5} />
                                                    <span className="font-bold text-sm text-slate-600 mb-1">Escolher da Galeria</span>
                                                    <span className="text-xs text-slate-400">Suporta JPG, PNG (Max 5MB)</span>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                </motion.div>
                            )}
                        </div>

                        {/* FOOTER NAVEGAÇÃO DO WIZARD */}
                        <div className="p-6 border-t bg-white">
                            {stage === 'cart' && cart.length > 0 && (
                                <button onClick={() => setStage('location')} className={`w-full ${theme.primary} text-white py-4 rounded-xl font-bold shadow-lg flex justify-between px-6 items-center transition-colors hover:opacity-90`}>
                                    <span>Continuar Compra</span>
                                    <span>R$ {cartTotal.toFixed(2)}</span>
                                </button>
                            )}

                            {stage === 'location' && (
                                <div className="flex gap-3">
                                    <button onClick={() => setStage('cart')} className="px-4 py-4 rounded-xl font-bold text-slate-500 hover:bg-gray-100"><ArrowLeft /></button>
                                    <button 
                                        onClick={() => {
                                            if (cartPaymentMethod === 'WALLET') {
                                                handleFinish();
                                            } else {
                                                setStage('pay');
                                            }
                                        }} 
                                        className={`flex-1 ${cartPaymentMethod === 'WALLET' ? 'bg-emerald-600' : theme.primary} text-white py-4 rounded-xl font-bold shadow-lg hover:opacity-90 flex items-center justify-center gap-2`}
                                    >
                                        {cartPaymentMethod === 'WALLET' ? (isSubmitting ? <Loader2 className="animate-spin" size={20} /> : <CheckCircle size={20} />) : null}
                                        {cartPaymentMethod === 'WALLET' ? (isSubmitting ? 'Processando...' : 'Pagar Agora') : 'Ir para Pagamento'}
                                    </button>
                                </div>
                            )}

                            {stage === 'pay' && (
                                <div className="flex gap-3">
                                    <button onClick={() => { 
                                        if (isDepositOpen) {
                                            setIsDepositOpen(false);
                                            setIsCartOpen(false);
                                        } else {
                                            setStage('location');
                                        }
                                    }} className="px-4 py-4 rounded-xl font-bold text-slate-500 hover:bg-gray-100"><ArrowLeft /></button>
                                    <button onClick={() => {
                                        if (isDepositOpen && depositAmount <= 0) return showNotification("Informe o valor do depósito.", "error");
                                        setStage('proof');
                                    }} className={`flex-1 ${theme.primary} text-white py-4 rounded-xl font-bold shadow-lg hover:opacity-90 uppercase text-xs tracking-widest`}>
                                        Já fiz o PIX
                                    </button>
                                </div>
                            )}

                            {stage === 'proof' && (
                                <div className="flex gap-3">
                                    <button disabled={isSubmitting} onClick={() => setStage('pay')} className="px-4 py-4 rounded-xl font-bold text-slate-500 hover:bg-gray-100"><ArrowLeft /></button>
                                    <button disabled={isSubmitting} onClick={isDepositOpen ? handleDeposit : handleFinish} className={`flex-1 ${isDepositOpen ? 'bg-blue-600' : 'bg-green-600'} text-white py-4 rounded-xl font-bold shadow-lg hover:brightness-110 flex items-center justify-center gap-2 uppercase tracking-widest text-[10px]`}>
                                        {isSubmitting ? <Loader2 className="animate-spin" size={20} /> : <CheckCircle size={20} />}
                                        {isSubmitting ? 'Processando...' : (isDepositOpen ? 'Enviar Comprovante de Depósito' : 'Enviar Comprovante de Pedido')}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* --- MODAL DE VISUALIZAÇÃO DO CUPOM --- */}
            {viewingOrderCupom && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fadeIn">
                    <div className="bg-white rounded-lg shadow-2xl flex flex-col items-center max-h-[90vh] overflow-hidden w-full max-w-[350px] relative">
                        <div className="w-full bg-slate-900 text-white p-4 flex justify-between items-center shrink-0 no-print">
                            <h3 className="font-bold text-sm">Cupom do Pedido</h3>
                            <button onClick={() => setViewingOrderCupom(null)} className="text-white hover:text-red-400"><X size={20} /></button>
                        </div>
                        <div className="overflow-y-auto p-4 bg-gray-200 w-full flex justify-center flex-1">
                            <div id="userPrintArea" className="bg-white shadow-xl scale-100 origin-top">
                                <CupomEntrega
                                    order={viewingOrderCupom}
                                    printerName="Visualização Usuário"
                                    customText={settings.customReceiptText}
                                    title={settings.customReceiptTitle}
                                    subtitle={settings.customReceiptSubtitle}
                                    docName={settings.customReceiptDocName}
                                    remainingBalance={viewingOrderCupom.walletBalanceAfter}
                                />
                            </div>
                        </div>
                        <div className="w-full p-4 bg-white border-t border-gray-200 flex gap-3 no-print shrink-0">
                            <button onClick={() => window.print()} className="flex-1 bg-slate-900 text-white py-3 rounded-lg font-bold shadow-lg hover:bg-black flex items-center justify-center gap-2 text-xs"><Printer size={16} /> IMPRIMIR / SALVAR</button>
                        </div>
                        <style>{`
                        @media print {
                            body * { visibility: hidden; }
                            #userPrintArea, #userPrintArea * { visibility: visible; }
                            #userPrintArea { position: absolute; left: 0; top: 0; width: 100%; margin: 0; padding: 0; box-shadow: none; }
                            .no-print { display: none !important; }
                        }
                    `}</style>
                    </div>
                </div>
            )}
        </div>
    );
};