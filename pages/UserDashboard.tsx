import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useApp } from '../context/StoreContext';
import { useTheme } from '../context/ThemeContext';
import { OrderStatus, ThemeOption, Order, Product, CartItem, WalletTransaction } from '../types';
import { 
    ShoppingCart, LogOut, Search, Plus, X, Upload, CheckCircle, 
    MessageSquare, Clock, FileText, 
    Printer, ShoppingBag, Loader2, Package, CreditCard, RefreshCcw, AlertCircle, Sparkles, Lock,
    Trash2, Wrench, Banknote, Paperclip, Home, HardHat, Wallet, ShieldCheck, Smartphone
} from 'lucide-react';
import { CupomEntrega } from '../components/CupomEntrega';
import { NotificationSystem } from '../components/NotificationSystem';

import { generatePixPayload, formatarMoeda, compressImageFile } from '../utils';
import { imprimirComPrioridadeFiscal } from '../utils/printUtils';
import { collection, query, where, onSnapshot, orderBy, limit, getDocs, getDocsFromServer } from 'firebase/firestore';
import { db } from '../firebase';
import { QRCodeSVG } from 'qrcode.react';
import { motion, AnimatePresence } from 'framer-motion';
import { OnlineStatusIndicator } from '../components/OnlineStatusIndicator';
import { InstallButton } from '../components/InstallButton';
import { AppDownloadButton } from '../components/AppDownloadModal';

export const UserDashboard: React.FC = () => {
    const { 
        currentUser, products, createOrder, showNotification, 
        logout, messages, markMessageRead, settings, getWalletTransactions, depositToWallet,
        serverTime, reenviarComprovante
    } = useApp();
    const { isDark, primaryColor } = useTheme();

    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;
    const isAdmin = (currentUser?.role === 'ADMIN' || currentUser?.role === 'MASTER') && !isStandalone;

    // States de Navegação e Visualização
    const [activeTab, setActiveTab] = useState<'store' | 'orders'>('store');
    const [mobileView, setMobileView] = useState<'catalog' | 'cart' | 'payment'>('catalog');

    // States do Carrinho e Pedido
    const [cart, setCart] = useState<CartItem[]>([]);
    const [isMsgOpen, setIsMsgOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [stage, setStage] = useState<'cart' | 'location' | 'pay' | 'proof'>('cart');
    const [location, setLocation] = useState({ ray: '', wing: '', cell: '' });
    const [deliveryType, setDeliveryType] = useState<'intern' | 'worker'>('intern');
    const [deliveryFreeText, setDeliveryFreeText] = useState('');

    const cartRef = useRef(cart);
    // Token de idempotência do checkout: reenvios da MESMA tentativa reutilizam o
    // token (o servidor devolve o pedido já criado, sem debitar 2x). Só muda
    // quando o carrinho muda — uma nova compra ganha um token novo.
    const checkoutTokenRef = useRef<string>(crypto.randomUUID());
    useEffect(() => {
        checkoutTokenRef.current = crypto.randomUUID();
    }, [cart]);
    const [proofFile, setProofFile] = useState<File | null>(null);
    const [depositAmount, setDepositAmount] = useState<number>(0);
    const [isDepositOpen, setIsDepositOpen] = useState(false);
    const [depositStage, setDepositStage] = useState<'amount' | 'proof'>('amount');
    const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const submittingRef = useRef(false);
    const [pixCopied, setPixCopied] = useState(false);
    const [isCartReviewOpen, setIsCartReviewOpen] = useState(false);
    const [isProductsModalOpen, setIsProductsModalOpen] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // States de Serviços (Admin PDV)
    const [showServicesModal, setShowServicesModal] = useState(false);
    const [serviceName, setServiceName] = useState('');
    const [serviceValue, setServiceValue] = useState('');

    // States de Visualização de Pedidos
    const [viewingOrderCupom, setViewingOrderCupom] = useState<Order | null>(null);
    const [expandedOrders, setExpandedOrders] = useState<string[]>([]);
    const [myOrders, setMyOrders] = useState<Order[]>([]);
    const [loadingOrders, setLoadingOrders] = useState(false);
    const [walletTxs, setWalletTxs] = useState<WalletTransaction[]>([]);
    const [viewingWalletHistory, setViewingWalletHistory] = useState(false);

    const isMobile = useMemo(() => typeof navigator !== 'undefined' && /android|iphone|ipad|ipod/i.test(navigator.userAgent), []);

    const resendInputRef = useRef<HTMLInputElement>(null);
    const [resendTarget, setResendTarget] = useState<{ kind: 'orders' | 'wallet_transactions'; docId: string } | null>(null);

    const handleResendProofFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        const target = resendTarget;
        e.target.value = '';
        setResendTarget(null);
        if (!file || !target) return;
        try {
            const url = await reenviarComprovante(target.kind, target.docId, file);
            if (url && url !== 'PENDENTE_UPLOAD_LOCAL_CACHE') {
                if (target.kind === 'orders') {
                    setMyOrders(prev => prev.map(o => o.id === target.docId ? { ...o, paymentProofUrl: url } : o));
                } else {
                    setWalletTxs(prev => prev.map(t => t.id === target.docId ? { ...t, proofUrl: url } : t));
                }
            }
        } catch (err: any) {
            showNotification(err?.message || 'Erro ao reenviar comprovante. Tente novamente.', 'error');
        }
    };

    useEffect(() => {
        window.dispatchEvent(new CustomEvent('opencode:cart-update', { detail: { count: totalItensNoCarrinho } }));
    }, [cart]);

    useEffect(() => {
        cartRef.current = cart;
    }, [cart]);

    useEffect(() => {
        const hClear = () => setCart([]);
        const hNew = () => { setCart([]); setStage('cart'); };
        const hOpen = () => { setIsCheckoutModalOpen(true); setStage('cart'); };
        window.addEventListener('opencode:clear-cart', hClear);
        window.addEventListener('opencode:new-sale', hNew);
        window.addEventListener('opencode:open-cart', hOpen);
        return () => {
            window.removeEventListener('opencode:clear-cart', hClear);
            window.removeEventListener('opencode:new-sale', hNew);
            window.removeEventListener('opencode:open-cart', hOpen);
        };
    }, []);

    useEffect(() => {
        if (!currentUser?.id) return;

        let unsubOrders: (() => void) | undefined;

        // === ORDERS: offline-first (cache local instantâneo + refresh servidor silencioso) ===
        setLoadingOrders(true);
        const q = query(
            collection(db, 'orders'),
            where('userId', '==', currentUser.id),
            orderBy('createdAt', 'desc'),
            limit(100)
        );

        const loadOrders = async () => {
            // 1. Tenta cache local primeiro (0ms, funciona offline)
            try {
                const snapshot = await getDocs(q);
                if (!snapshot.empty) {
                    const items = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as Order)).filter(o => (o as any).deleted !== true);
                    items.sort((a, b) => new Date(b.createdAt || b.date || 0).getTime() - new Date(a.createdAt || a.date || 0).getTime());
                    setMyOrders(items.slice(0, 20));
                    setLoadingOrders(false);
                }
            } catch { console.warn("order listener error"); /* silencioso — o servidor cobre */ }

            // 2. Refresh do servidor em segundo plano (dados frescos)
            try {
                const snapshot = await getDocsFromServer(q);
                const items = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as Order)).filter(o => (o as any).deleted !== true);
                items.sort((a, b) => new Date(b.createdAt || b.date || 0).getTime() - new Date(a.createdAt || a.date || 0).getTime());
                setMyOrders(items.slice(0, 20));
            } catch {
                try {
                    const qFallback = query(collection(db, 'orders'), where('userId', '==', currentUser.id), limit(100));
                    const snapshot = await getDocsFromServer(qFallback);
                    const items = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as Order)).filter(o => (o as any).deleted !== true);
                    items.sort((a, b) => new Date(b.createdAt || b.date || 0).getTime() - new Date(a.createdAt || a.date || 0).getTime());
                    setMyOrders(items.slice(0, 20));
                } catch { console.warn("orders fetch fallback"); setLoadingOrders(false); /* offline sem cache — lista vazia */ }
            }
            setLoadingOrders(false);
        };
        loadOrders();

        // Real-time subscription com sincronização multi-aba (desktop only)
        if (!isMobile) {
            try {
                unsubOrders = onSnapshot(q, { includeMetadataChanges: true }, (snapshot) => {
                    const items = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as Order)).filter(o => (o as any).deleted !== true);
                    items.sort((a, b) => new Date(b.createdAt || b.date || 0).getTime() - new Date(a.createdAt || a.date || 0).getTime());
                    setMyOrders(items.slice(0, 20));
                }, () => {});
            } catch { console.warn("orders snapshot error"); }
        }

        // === WALLET ===
        const fetchWallet = async () => {
            try { setWalletTxs(await getWalletTransactions(currentUser.id)); } catch { console.warn("wallet txs fetch"); }
        };
        fetchWallet();

        // === KEYBOARD ===
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'F2') {
                e.preventDefault();
                searchInputRef.current?.focus();
            }
            if (e.key === 'F4') {
                e.preventDefault();
                setIsProductsModalOpen(prev => !prev);
            }
            if (e.key === 'F6' && isAdmin) {
                e.preventDefault();
                setShowServicesModal(prev => !prev);
            }
            if (e.key === 'F7') {
                e.preventDefault();
                if (isAdmin) {
                    setCart([]);
                    searchInputRef.current?.focus();
                    showNotification('Venda cancelada!', 'success');
                } else {
                    if (cartRef.current.length > 0 && !window.confirm('Deseja cancelar a venda e limpar o carrinho?')) return;
                    setCart([]);
                    setStage('cart');
                    showNotification('Venda cancelada!', 'success');
                }
            }
            if (e.key === 'F8') {
                e.preventDefault();
                if (isAdmin && cartRef.current.length > 0) {
                    setIsCheckoutModalOpen(true);
                }
            }
            if (e.key === 'F9') {
                e.preventDefault();
                if (isAdmin) {
                    const cartNow = cartRef.current;
                    if (cartNow.length > 0) {
                        const lastItem = cartNow[cartNow.length - 1];
                        setCart(prev => prev.filter(i => String(i.productId) !== String(lastItem.productId)));
                        showNotification('Último item removido!', 'success');
                    }
                } else {
                    if (cartRef.current.length > 0) {
                        setIsCheckoutModalOpen(true);
                    }
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);

        return () => {
            if (unsubOrders) unsubOrders();
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [currentUser?.id]);

    useEffect(() => {
        if (activeTab === 'store') {
            const id = setTimeout(() => {
                searchInputRef.current?.focus();
            }, 100);
            return () => clearTimeout(id);
        }
    }, [activeTab]);

    // Safe Lists
    const safeProducts = Array.isArray(products) ? products : [];
    const safeMessages = Array.isArray(messages) ? messages : [];

    const filteredProducts = useMemo(() => {
        const termo = (searchTerm || '').toLowerCase();
        return safeProducts.filter(p => {
            const matchName = (p.name || '').toLowerCase().includes(termo);
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

    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setSearchTerm(val);

        const code = val.trim();
        if (code) {
            const matchedPrd = safeProducts.find(p => 
                p.available !== false && 
                (p.barcode?.trim() === code || p.ean?.trim() === code || String(p.id) === code)
            );
            if (matchedPrd) {
                addToCart(matchedPrd);
                setSearchTerm('');
                showNotification(`Produto adicionado: ${matchedPrd.name}!`, 'success');
            }
        }
    };

    const searchInputRef = useRef<HTMLInputElement>(null);

    const addToCart = (product: Product) => {
        if (!product) return;

        if ((product.stock ?? 1) <= 0) {
            showNotification('Produto esgotado no momento.', 'error');
            return;
        }

        setCart(prevCart => {
            const cartArray = prevCart || [];
            const itemExistente = cartArray.find(item => String(item.productId) === String(product.id));

            if (itemExistente) {
                return cartArray.map(item =>
                    String(item.productId) === String(product.id)
                        ? { ...item, quantity: item.quantity + 1 }
                        : item
                );
            }

            return [...cartArray, {
                ...product,
                productId: product.id,
                quantity: 1,
                priceAtPurchase: product.price
            }];
        });
    };

    const updateQty = (pid: string, delta: number) => {
        setCart(prev => {
            const item = prev.find(i => String(i.productId) === String(pid));
            if (!item) return prev;
            const newQty = item.quantity + delta;
            if (newQty <= 0) return prev.filter(i => String(i.productId) !== String(pid));
            return prev.map(i => String(i.productId) === String(pid) ? { ...i, quantity: newQty } : i);
        });
    };

    const removeFromCart = (pid: string) => {
        setCart(prev => prev.filter(item => String(item.productId) !== String(pid)));
    };

    const cancelSale = () => {
        if (isAdmin) {
            setCart([]);
            searchInputRef.current?.focus();
            showNotification('Venda cancelada!', 'success');
        } else {
            if (cart.length > 0 && !window.confirm('Deseja cancelar a venda e limpar o carrinho?')) return;
            setCart([]);
            setStage('cart');
            showNotification('Venda cancelada!', 'success');
        }
    };

    const addServiceItem = () => {
        const name = serviceName.trim();
        const value = parseFloat(serviceValue.replace(',', '.'));
        if (!name) { showNotification('Informe o nome do serviço.', 'error'); return; }
        if (isNaN(value) || value <= 0) { showNotification('Informe um valor válido.', 'error'); return; }

        const serviceId = 'SERVICE-' + Date.now();
        const serviceCartItem: CartItem = {
            id: serviceId,
            productId: serviceId,
            name: name,
            description: name,
            price: value,
            costPrice: 0,
            margin: 100,
            category: 'Serviços',
            imageUrl: '',
            stock: 999,
            restricted: false,
            available: true,
            quantity: 1,
            priceAtPurchase: value
        };
        setCart(prev => [...prev, serviceCartItem]);
        setShowServicesModal(false);
        setServiceName('');
        setServiceValue('');
        showNotification(`Serviço "${name}" adicionado!`, 'success');
        searchInputRef.current?.focus();
    };

    const cartTotal = (() => {
        const cents = cart.reduce((acc, item) => {
            const prod = safeProducts.find(p => String(p.id) === String(item.productId));
            const price = item.priceAtPurchase ?? (prod ? prod.price : (item.price || 0));
            return acc + Math.round(price * 100) * (item.quantity || 0);
        }, 0);
        return cents / 100;
    })();

    const totalItensNoCarrinho = (cart || []).reduce((sum, item) => sum + (item.quantity || 0), 0);

    const toggleOrderDetails = (orderId: string) => {
        setExpandedOrders(prev => prev.includes(orderId) ? prev.filter(id => id !== orderId) : [...prev, orderId]);
    };

    const getStatusLabel = (status: string) => {
        const s = (status || '').toLowerCase();
        if (s === 'pendente' || s === 'pending') return 'Esperando confirmação';
        if (s.includes('paid') || s.includes('pago')) return 'Aprovado / Pago';
        if (s.includes('preparing') || s.includes('separa')) return 'Em Separação';
        if (s.includes('out_for_delivery') || s.includes('saiu')) return 'Saiu p/ Entrega';
        if (s.includes('delivered') || s.includes('entregue')) return 'Entregue';
        if (s.includes('cancel')) return 'Cancelado';
        return status;
    };

    const handleFinish = async () => {
        // Anti duplo clique: o setState ainda não re-renderizou o botão disabled.
        if (submittingRef.current) return;
        submittingRef.current = true;
        const isWalletPayment = cartPaymentMethod === 'WALLET';

        if (!isWalletPayment && !proofFile) {
            submittingRef.current = false;
            showNotification("Por favor, anexe o comprovante PIX.", "error");
            return;
        }

        if (isWalletPayment && (currentUser?.walletBalance || 0) < cartTotal) {
            submittingRef.current = false;
            showNotification("Saldo insuficiente. Envie credito primeiro.", "error");
            return;
        }

        setIsSubmitting(true);
        try {
            const formattedLocation = {
                raio: location.ray, ala: location.wing, cela: location.cell,
                ray: location.ray, wing: location.wing, cell: location.cell,
                deliveryType,
                deliveryFreeText: deliveryType === 'worker' ? deliveryFreeText : ''
            };

            if (isWalletPayment) {
                const items = cart.map(i => {
                    const p = safeProducts.find(prod => String(prod.id) === String(i.productId));
                    return {
                        productId: i.productId,
                        quantity: i.quantity,
                        priceAtPurchase: p ? p.price : (i.price || 0),
                        name: p ? (p?.name || 'Item Removido') : (i.name || 'Item Removido'),
                        imageUrl: p ? p.imageUrl : ''
                    };
                });

                await createOrder({
                    id: Date.now().toString(),
                    userId: currentUser!.id,
                    items,
                    total: cartTotal,
                    status: OrderStatus.PAID,
                    date: new Date().toISOString(),
                    unitId: currentUser!.unitId || '1',
                    deliveryLocation: formattedLocation,
                    inmateLocation: formattedLocation,
                    paymentProofUrl: '',
                    paymentMethod: 'WALLET'
                }, undefined, checkoutTokenRef.current, cart);
            } else {
                // Prepara o arquivo ANTES de enviar o pedido — createOrder é chamado
                // UMA única vez (reenvio automático aqui gerava pedido duplicado).
                let arquivo: File;
                const original = proofFile!;
                if (original.type === 'application/pdf') {
                    arquivo = original;
                } else {
                    try {
                        arquivo = new File(
                            [await compressImageFile(original, 0.3, 600)],
                            original.name.replace(/\.[^/.]+$/, '') + '.jpg',
                            { type: 'image/jpeg' }
                        );
                    } catch (err: any) {
                        console.warn("Compressão do comprovante falhou, enviando original. Motivo:", err?.message || err);
                        arquivo = original;
                    }
                }
                await createOrder(arquivo, formattedLocation, checkoutTokenRef.current, cart);
            }

            setCart([]);
            setProofFile(null);
            setStage('cart');
            setActiveTab('store');
            setIsCheckoutModalOpen(false);
            showNotification(isWalletPayment ? 'Pedido finalizado com sucesso pelo saldo!' : 'Pedido enviado com sucesso para análise!', 'success');
 
         } catch (e: any) {
            showNotification("Erro ao enviar pedido: " + (e.message || "Falha na conexao"), "error");
        } finally {
            submittingRef.current = false;
            setIsSubmitting(false);
        }
    };

    const depositToWalletAction = async () => {
        if (!proofFile) {
            showNotification("Por favor, anexe o comprovante PIX.", "error");
            return;
        }
        if (depositAmount <= 0) {
            showNotification("Informe o valor do deposito.", "error");
            return;
        }
        setIsSubmitting(true);
        try {
            await depositToWallet(depositAmount, proofFile);
            setIsDepositOpen(false);
            setProofFile(null);
            setDepositAmount(0);
            showNotification('Crédito enviado com sucesso para análise!', 'success');
        } catch (e: any) {
            showNotification(e?.message || 'Erro ao enviar comprovante de crédito. Tente novamente.', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const [cartPaymentMethod, setCartPaymentMethod] = useState<'PIX' | 'WALLET'>('PIX');

    useEffect(() => {
        if (isAdmin) {
            setCartPaymentMethod('WALLET');
        }
    }, [isAdmin]);
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

    useEffect(() => {
        if (isCheckoutModalOpen && cartPaymentMethod === 'PIX') {
            const chavePix = (settings?.pixKeys?.[0] || settings?.cnpj || '').trim();
            if (!chavePix) return;
            const cleanKey = chavePix.replace(/[^0-9]/g, '');
            const merchantName = settings?.appName || 'ASSOCIACAO ASSPEN MT';
            const cidade = 'PEIXOTO DE AZEVEDO';
            const payload = generatePixPayload(cleanKey, merchantName, cidade, cartTotal, '***');
            setPixPayload(payload);
        }
    }, [isCheckoutModalOpen, cartPaymentMethod, cartTotal, settings]);

    // Geração do PIX para o modal de depósito (2 etapas)
    useEffect(() => {
        if (isDepositOpen && depositAmount > 0) {
            const chavePix = (settings?.pixKeys?.[0] || settings?.cnpj || '').trim();
            if (!chavePix) return;
            const cleanKey = chavePix.replace(/[^0-9]/g, '');
            const merchantName = settings?.appName || 'ASSOCIACAO ASSPEN MT';
            const cidade = 'PEIXOTO DE AZEVEDO';
            const payload = generatePixPayload(cleanKey, merchantName, cidade, depositAmount, 'DEPOSITO');
            setPixPayload(payload);
        }
    }, [isDepositOpen, depositAmount, settings]);

    const hasCustomBg = settings?.userDashboardBgType === 'image' && settings?.userDashboardBgUrl;

    const renderCartTable = () => (
        <div className="max-h-[calc(100vh-420px)] overflow-y-auto border border-slate-200 rounded-xl bg-white font-mono">
            <table className="w-full text-[11px]">
                <thead className="bg-emerald-700 text-white font-black text-xs uppercase text-center tracking-wider sticky top-0 z-10">
                    <tr>
                        <th className="py-2.5 pl-3 text-left">PRODUTO</th>
                        <th className="py-2.5">QTD</th>
                        <th className="py-2.5">V. UNITÁRIO</th>
                        <th className="py-2.5">SUBTOTAL</th>
                        <th className="py-2.5">AÇÃO</th>
                    </tr>
                </thead>
                <tbody>
                    {(cart || []).map((item: any, idx: number) => {
                        const prod = safeProducts.find(p => String(p.id) === String(item.productId));
                        const displayName = prod ? prod.name : (item.name || 'Item');
                        const displayPrice = item.priceAtPurchase ?? (prod ? prod.price : (item.price || 0));
                        return (
                            <tr key={item.productId} className={`${idx % 2 === 0 ? 'bg-slate-50' : 'bg-white'} border-b border-slate-100`}>
                                <td className="text-slate-800 font-bold text-xs uppercase text-left pl-3 py-2">{displayName}</td>
                                <td className="py-2 text-center">
                                    <div className="inline-flex items-center gap-1">
                                        <button onClick={() => updateQty(item.productId, -1)} className="w-6 h-6 rounded-full border bg-white shadow-sm flex items-center justify-center font-bold text-xs transition-all active:scale-95 text-slate-700 cursor-pointer hover:bg-red-50 hover:text-red-500 hover:border-red-300">−</button>
                                        <span className="font-black text-xs text-slate-900 min-w-[22px] text-center">{item.quantity}</span>
                                        <button onClick={() => updateQty(item.productId, 1)} className="w-6 h-6 rounded-full border bg-white shadow-sm flex items-center justify-center font-bold text-xs transition-all active:scale-95 text-slate-700 cursor-pointer hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-300">+</button>
                                    </div>
                                </td>
                                <td className="text-slate-600 font-medium text-xs font-mono text-center py-2">R$ {formatarMoeda(displayPrice)}</td>
                                <td className="font-black text-slate-900 text-sm text-center font-mono py-2">R$ {formatarMoeda(displayPrice * item.quantity)}</td>
                                <td className="py-2 text-center">
                                    <button onClick={() => removeFromCart(item.productId)} className="text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition-all active:scale-95 text-xs font-black flex items-center justify-center gap-1 mx-auto cursor-pointer">
                                        <Trash2 size={12} className="inline-block mr-1" /> CANCELAR ITEM
                                    </button>
                                </td>
                            </tr>
                        );
                    })}
                    {cart.length === 0 && (
                        <tr><td colSpan={5} className="text-center py-8 text-slate-400 font-bold text-xs uppercase">Nenhum item no carrinho</td></tr>
                    )}
                </tbody>
            </table>
        </div>
    );

    const renderAdminStore = () => {
        const lastItem = cart.length > 0 ? cart[cart.length - 1] : null;
        const lastProd = lastItem ? safeProducts.find(p => String(p.id) === String(lastItem.productId)) : null;
        const lastQty = lastItem?.quantity || 0;
        const lastSubtotal = (lastItem?.priceAtPurchase ?? (lastProd ? (lastProd.price || 0) : (lastItem?.price || 0))) * lastQty;
        return (
        <div className="overflow-x-auto custom-scrollbar" style={{ width: '100%' }}>
        <div style={{ display: 'flex', flexDirection: 'row', gap: '16px', width: '100%', minWidth: '1100px', height: 'calc(100vh - 140px)' }}>

            {/* PAINEL ESQUERDO — 35% — DESTAQUE DO ITEM ATUAL */}
            <div className="bg-slate-900 text-white rounded-2xl p-5 flex flex-col justify-between shadow-xl relative border border-slate-800 font-mono" style={{ width: '35%', flexShrink: 0, height: 'calc(100vh - 260px)' }}>
                {lastProd || lastItem ? (
                    <>
                        <div className="flex-1 flex flex-col items-center justify-center relative">
                            <img
                                src={lastProd?.imageUrl || 'https://placehold.co/600?text=PRODUTO'}
                                className="w-full h-44 object-contain rounded-xl bg-white p-2 border border-slate-700"
                                alt={lastProd?.name || lastItem?.name || ''}
                            />
                            {lastQty > 1 && (
                                <span className="absolute top-20 left-8 bg-red-600 text-white font-black px-3 py-1.5 rounded-lg text-lg animate-pulse">
                                    X{lastQty}
                                </span>
                            )}
                        </div>
                        <div className="mt-4">
                            <p className="font-black text-base uppercase tracking-tight leading-tight truncate">{lastProd?.name || lastItem?.name || ''}</p>
                            {lastProd?.barcode && <p className="text-[10px] font-mono text-slate-500 mt-1">Cód: {lastProd.barcode}</p>}
                            <p className="text-sm font-bold text-emerald-400 mt-2">Preço Unit: R$ {formatarMoeda(lastProd?.price || lastItem?.price || 0)}</p>
                            <div className="mt-3 pt-3 border-t border-slate-800">
                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Subtotal Item</p>
                                <p className="font-black text-3xl text-white">R$ {formatarMoeda(lastSubtotal)}</p>
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-center">
                        <div className="w-32 h-32 rounded-full bg-slate-800 flex items-center justify-center mb-6 border border-slate-700">
                            <ShoppingCart size={48} className="text-slate-600" />
                        </div>
                        <p className="font-black text-base text-slate-500 uppercase tracking-wide">Mercado Facil</p>
                        <p className="text-[11px] font-bold text-slate-600 mt-2">Bipe ou busque um produto</p>
                    </div>
                )}
            </div>

            {/* PAINEL CENTRAL + SIDEBAR — 65% */}
            <div style={{ width: '65%', flexShrink: 0, display: 'flex', flexDirection: 'row', gap: '16px', minWidth: 0 }}>

                {/* COLUNA DA TABELA + ATALHOS */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

                    {/* BARRA DE PESQUISA */}
                    <div style={{ flexShrink: 0, marginBottom: '8px' }}>
                        <div style={{ position: 'relative' }}>
                            <div style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none' }}>
                                <Search size={22} />
                            </div>
                            <input
                                id="searchInput"
                                ref={searchInputRef}
                                style={{ width: '100%', paddingLeft: '56px', paddingRight: '24px', paddingTop: '14px', paddingBottom: '14px', borderRadius: '16px', border: '2px solid #cbd5e1', backgroundColor: '#f8fafc', fontSize: '14px', fontWeight: 700, boxShadow: '0 1px 3px rgba(0,0,0,0.1)', outline: 'none' }}
                                placeholder="Bipe o código de barras ou digite o nome..."
                                value={searchTerm}
                                onChange={handleSearchChange}
                            />
                        </div>
                    </div>

                    {/* TABELA ZEBRADA CUPOM FISCAL */}
                    <div className="max-h-[calc(100vh-320px)] overflow-y-auto border border-slate-200 rounded-xl bg-white" style={{ flex: 1, minHeight: 0 }}>
                        <table className="w-full text-[12px] font-mono">
                            <thead className="bg-emerald-700 text-white font-black text-xs uppercase text-center tracking-wider sticky top-0 z-10">
                                <tr>
                                    <th className="py-3 pl-4 text-left">PRODUTO</th>
                                    <th className="py-3 w-20">QTD</th>
                                    <th className="py-3 w-28">V. UNIT.</th>
                                    <th className="py-3 w-32">SUBTOTAL</th>
                                    <th className="py-3 w-24">AÇÃO</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(cart || []).map((item: any, idx: number) => {
                                    const prod = safeProducts.find(p => String(p.id) === String(item.productId));
                                    const displayName = prod ? prod.name : (item.name || 'Item');
                                    const displayPrice = item.priceAtPurchase ?? (prod ? prod.price : (item.price || 0));
                                    return (
                                        <tr key={item.productId} className={`${idx % 2 === 0 ? 'bg-slate-50' : 'bg-white'} border-b border-slate-100 hover:bg-emerald-50/50 transition-colors`}>
                                            <td className="text-slate-800 font-bold text-xs uppercase text-left pl-4 py-3">{displayName}</td>
                                            <td className="py-3 text-center">
                                                <div className="inline-flex items-center gap-1 mx-auto">
                                                    <button onClick={() => updateQty(item.productId, -1)} className="w-7 h-7 rounded-full border bg-white shadow-sm flex items-center justify-center font-bold text-xs transition-all active:scale-95 text-slate-700 cursor-pointer hover:bg-red-50 hover:text-red-500 hover:border-red-300">−</button>
                                                    <span className="font-black text-sm text-slate-900 min-w-[28px] text-center">{item.quantity}</span>
                                                    <button onClick={() => updateQty(item.productId, 1)} className="w-7 h-7 rounded-full border bg-white shadow-sm flex items-center justify-center font-bold text-xs transition-all active:scale-95 text-slate-700 cursor-pointer hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-300">+</button>
                                                </div>
                                            </td>
                                            <td className="text-slate-600 font-medium text-xs font-mono text-center py-3">R$ {formatarMoeda(displayPrice)}</td>
                                            <td className="font-black text-slate-900 text-base text-center font-mono py-3">R$ {formatarMoeda(displayPrice * item.quantity)}</td>
                                            <td className="py-3 text-center">
                                                <button onClick={() => removeFromCart(item.productId)} className="text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition-all active:scale-95 text-xs font-black flex items-center justify-center gap-1 mx-auto cursor-pointer">
                                                    <Trash2 size={12} className="inline-block mr-1" /> CANCELAR ITEM
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                                {cart.length === 0 && (
                                    <tr><td colSpan={5} className="text-center py-12 text-slate-400 font-bold text-xs uppercase">Nenhum item no cupom</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* BARRA DE ATALHOS — [F2] [F6] [F7] [F8] */}
                    <div className="flex gap-2 mt-2" style={{ flexShrink: 0 }}>
                        <button onClick={() => searchInputRef.current?.focus()} className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-black rounded-xl text-[10px] uppercase tracking-wider transition-all active:scale-[0.98] cursor-pointer shadow-sm inline-flex items-center justify-center gap-1.5"><Search size={12} /> [F2] Produto</button>
                        <button onClick={() => setShowServicesModal(true)} className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-500 text-white font-black rounded-xl text-[10px] uppercase tracking-wider transition-all active:scale-[0.98] cursor-pointer shadow-sm inline-flex items-center justify-center gap-1.5"><Wrench size={12} /> [F6] Serviços</button>
                        <button onClick={cancelSale} className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 text-white font-black rounded-xl text-[10px] uppercase tracking-wider transition-all active:scale-[0.98] cursor-pointer shadow-sm inline-flex items-center justify-center gap-1.5"><X size={12} /> [F7] Cancelar</button>
                        <button onClick={() => { if (cart.length > 0) setIsCheckoutModalOpen(true); }} disabled={cart.length === 0} className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-black rounded-xl text-[10px] uppercase tracking-wider transition-all active:scale-[0.98] cursor-pointer shadow-sm inline-flex items-center justify-center gap-1.5"><Banknote size={12} /> [F8] Checkout</button>
                    </div>
                </div>

                {/* SIDEBAR DIREITA — CLIENTE / TOTAL / CHECKOUT */}
                <div className="flex flex-col gap-3" style={{ width: '220px', flexShrink: 0 }}>
                    {/* CLIENTE NO TOPO */}
                    <div className="bg-white border border-slate-200 rounded-xl p-4">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Cliente</p>
                        <p className="font-black text-xs text-slate-900 uppercase truncate">{currentUser?.name || 'CONSUMIDOR'}</p>
                        <p className="text-[10px] text-slate-500 font-bold">Saldo: R$ {formatarMoeda(currentUser?.walletBalance || 0)}</p>
                    </div>

                    {/* TOTAL GERAL GIGANTE */}
                    <div className="bg-emerald-600 rounded-2xl p-5 text-center shadow-xl flex-1 flex flex-col items-center justify-center">
                        <p className="text-[10px] font-black text-emerald-100 uppercase tracking-widest mb-2">TOTAL GERAL</p>
                        <p className="font-black text-4xl text-white tracking-tight leading-none">R$ {formatarMoeda(cartTotal)}</p>
                    </div>

                    {/* BOTÃO CHECKOUT VERDE — CHUMBADO NA BASE */}
                    <button
                        onClick={() => { if (cart.length > 0) setIsCheckoutModalOpen(true); }}
                        disabled={cart.length === 0}
                        className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-black rounded-2xl text-xs uppercase tracking-wider transition-all active:scale-[0.98] shadow-lg"
                    >
                        <Banknote size={14} /> CONCLUIR VENDA
                    </button>
                </div>
            </div>
        </div>
        </div>
    );};

    const renderFamilyStore = () => (
        <div className="space-y-8">
            {(settings?.enablePrisonerWallet ?? true) && (
                <div className="sm:hidden">
                    <div className="bg-gradient-to-br from-white via-white to-slate-50 rounded-[3rem] p-7 shadow-[0_20px_50px_rgba(0,0,0,0.4)] relative overflow-hidden group border border-slate-200">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--primary-color)] opacity-20 blur-[50px] mr-0 mt-0"></div>
                        <div className="absolute bottom-0 left-0 w-32 h-32 bg-blue-500 opacity-10 blur-[50px] ml-0 mb-0"></div>
                        <div className="relative z-10 flex justify-between items-center">
                            <div>
                                <div className="flex items-center gap-2 mb-3">
                                    <div className="w-5 h-5 bg-white/10 rounded-full flex items-center justify-center border border-slate-200">
                                        <Sparkles size={10} className="text-[var(--primary-color)]" />
                                    </div>
                                    <p className="text-slate-800 text-[9px] font-black uppercase tracking-[0.3em]">Carteira Interna</p>
                                </div>
                                <p className="text-slate-900 text-2xl font-black tracking-tighter mb-1">
                                    <span className="text-slate-800 text-[10px] font-bold mr-1">R$</span>
                                    {formatarMoeda(currentUser?.walletBalance || 0)}
                                </p>
                            </div>
                            <button 
                                onClick={() => { setIsDepositOpen(true); setStage('pay'); setDepositAmount(0); }}
                                className="bg-white text-slate-900 px-6 py-5 rounded-[2rem] font-black text-[10px] uppercase tracking-[0.2em] shadow-[0_15px_30px_rgba(255,255,255,0.2)] active:scale-95 hover:scale-105 transition-all flex flex-col items-center gap-2"
                            >
                                <div className="w-8 h-8 bg-black/5 rounded-xl flex items-center justify-center">
                                    <Plus size={20} />
                                </div>
                                <span>Enviar</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 items-center">
                <div className="relative w-full">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                        <Search size={20} />
                    </div>
                    <input 
                        id="searchInput"
                        ref={searchInputRef}
                        className="w-full pl-14 pr-6 py-4 rounded-2xl border-2 border-slate-300 focus:border-[var(--primary-color)] outline-none bg-slate-50 text-sm font-bold shadow-sm" 
                        placeholder="Bipe o código de barras ou digite o nome..." 
                        value={searchTerm} 
                        onChange={handleSearchChange} 
                    />
                </div>
            </div>

            {/* Vitrine Premium — Grid 2 colunas */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {filteredProducts.length === 0 ? (
                    <div className="col-span-full text-center py-20 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                        <ShoppingBag size={40} className="mx-auto mb-4 opacity-25 text-slate-400" />
                        <p className="font-black uppercase tracking-wider text-xs text-slate-400">Nenhum produto encontrado</p>
                    </div>
                ) : filteredProducts.map((p: any, idx: number) => {
                    const isOutOfStock = (p?.stock || 0) <= 0;
                    return (
                        <div
                            key={p?.id || `prod-${idx}`}
                            className={`bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all duration-200 p-4 flex flex-col justify-between h-full relative ${isOutOfStock ? 'opacity-60 grayscale' : 'cursor-pointer active:scale-[0.98]'}`}
                            onClick={() => { if (!isOutOfStock) addToCart(p); }}
                        >
                            <div className="w-full aspect-square rounded-xl overflow-hidden bg-slate-50 mb-3 relative">
                                <img src={p.imageUrl || 'https://placehold.co/200'} className="w-full h-full object-contain" alt={p.name} loading="lazy" />
                                {isOutOfStock && (
                                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                        <span className="text-[8px] font-black bg-white text-black px-3 py-1 rounded-lg uppercase">Esgotado</span>
                                    </div>
                                )}
                            </div>
                            <div className="flex-1 flex flex-col justify-between font-mono">
                                <h4 className="text-slate-800 font-bold text-xs tracking-wide line-clamp-2 uppercase mb-2">{p.name}</h4>
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-emerald-600 font-extrabold text-xs">R$ {formatarMoeda(p.price)}</span>
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); if (!isOutOfStock) addToCart(p); }} 
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

            {/* Product Catalog Modal (F4) */}
            {isProductsModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn" onClick={() => setIsProductsModalOpen(false)}>
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.95 }} 
                        animate={{ opacity: 1, scale: 1 }} 
                        className="bg-white rounded-3xl p-6 shadow-2xl max-w-5xl w-full max-h-[85vh] overflow-hidden flex flex-col border border-slate-200"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex justify-between items-center pb-4 border-b border-slate-100 mb-4 shrink-0">
                            <div>
                                <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight"><Search size={18} className="inline-block mr-1.5 -mt-0.5 text-emerald-600" />Catálogo de Produtos</h3>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Selecione os produtos para adicionar ao carrinho (F4 para fechar)</p>
                            </div>
                            <button 
                                onClick={() => setIsProductsModalOpen(false)}
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
                                className="w-full pl-12 pr-6 py-2.5 rounded-xl border border-slate-200 focus:border-[var(--primary-color)] outline-none bg-slate-50 text-sm font-bold shadow-inner" 
                                placeholder="Filtrar produtos no catálogo..." 
                                value={searchTerm} 
                                onChange={e => setSearchTerm(e.target.value)} 
                            />
                        </div>

                        <div className="flex-1 overflow-y-auto pr-1">
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                                {filteredProducts.length === 0 ? (
                                    <div className="col-span-full text-center py-20 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                                        <ShoppingBag size={40} className="mx-auto mb-4 opacity-25 text-slate-400" />
                                        <p className="font-black uppercase tracking-wider text-xs text-slate-400">Nenhum produto cadastrado</p>
                                    </div>
                                ) : filteredProducts.map((p: any, idx: number) => {
                                    const isOutOfStock = (p?.stock || 0) <= 0;
                                    return (
                                        <div
                                            key={p?.id || `modal-produto-${idx}`}
                                            className={`bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all duration-200 p-4 flex flex-col justify-between h-full relative ${isOutOfStock ? 'opacity-60 grayscale' : ''}`}
                                        >
                                            <div className="w-full aspect-square rounded-xl overflow-hidden bg-slate-50 mb-3 relative">
                                                <img src={p.imageUrl || 'https://placehold.co/200'} className="w-full h-full object-contain" alt={p.name} loading="lazy" />
                                                {isOutOfStock && (
                                                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                                        <span className="text-[8px] font-black bg-white text-black px-3 py-1 rounded-lg uppercase">Esgotado</span>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex-1 flex flex-col justify-between font-mono">
                                                <h4 className="text-slate-800 font-bold text-xs tracking-wide line-clamp-2 uppercase mb-2">{p.name}</h4>
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="text-emerald-600 font-extrabold text-xs">R$ {formatarMoeda(p.price)}</span>
                                                    <button 
                                                        onClick={() => addToCart(p)} 
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
        </div>
    );

    return (
        <div className="min-h-screen flex flex-col justify-start items-stretch pt-0 mt-0 w-full font-sans transition-all duration-500 overflow-x-hidden relative bg-[var(--bg-main)] text-[var(--text-main)]">
            <NotificationSystem />
            <OnlineStatusIndicator />
            {hasCustomBg && (
                <div className="fixed inset-0 pointer-events-none z-0">
                    <div 
                        className="absolute inset-0"
                        style={{
                            backgroundImage: `url(${settings.userDashboardBgUrl})`,
                            backgroundSize: 'cover',
                            backgroundPosition: 'center',
                            filter: `blur(${settings.userDashboardBgBlur || 0}px)`,
                            transform: `scale(${settings.userDashboardBgBlur && settings.userDashboardBgBlur > 0 ? 1.05 : 1})`
                        }}
                    ></div>
                    <div className="absolute inset-0 bg-black" style={{ opacity: (settings.userDashboardBgOpacity ?? 50) / 100 }}></div>
                </div>
            )}

            <header className="sticky top-0 z-[100] px-4 sm:px-6 md:px-8 py-3 sm:py-4 md:py-5 backdrop-blur-2xl border-b border-slate-200 bg-[var(--bg-card)]/80 shadow-[0_10px_40px_rgba(0,0,0,0.1)] flex flex-wrap items-center justify-between gap-y-3 overflow-visible">
                <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-[var(--primary-color)]/10 via-transparent to-transparent pointer-events-none"></div>
                
                <div className="relative z-10 flex items-center gap-2 sm:gap-3 md:gap-4">
                    <div className="p-2 sm:p-2.5 md:p-3 bg-gradient-to-tr from-[var(--primary-color)] to-[var(--secondary-color)] rounded-xl sm:rounded-xl md:rounded-2xl shadow-xl shadow-[var(--primary-color)]/20 animate-float">
                        <ShoppingBag className="text-white" size={18} />
                    </div>
                    <div>
                        <h1 className="font-black text-sm sm:text-base md:text-xl tracking-tight uppercase leading-none mb-0.5">{settings?.appName || 'Mercado Fácil'}</h1>
                        <div className="flex items-center gap-1">
                            <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(34,197,94,0.5)]"></div>
                            <p className="text-[8px] sm:text-[9px] text-slate-700 font-bold uppercase tracking-[0.15em] sm:tracking-[0.2em]">{(currentUser?.name || 'Visitante').split(' ')[0]}</p>
                        </div>
                    </div>
                </div>

                <div className="sm:hidden flex items-center gap-2 bg-[var(--primary-color)]/10 px-3 py-2 rounded-xl border border-[var(--primary-color)]/20">
                    <p className="text-[11px] font-black text-[var(--primary-color)]">R$ {formatarMoeda(currentUser?.walletBalance || 0)}</p>
                </div>

                {(settings?.enablePrisonerWallet ?? true) && !isAdmin && (
                    <div className="hidden sm:flex items-center gap-6 bg-white/5 backdrop-blur-md px-6 py-2.5 rounded-[2.5rem] border border-slate-200 shadow-inner hover:bg-white/10 transition-all duration-500 group">
                        <div className="text-right">
                            <p className="text-[7px] font-black text-[var(--text-muted)] uppercase tracking-[0.4em] leading-none mb-1.5 opacity-90">Saldo Disponível</p>
                            <p className="text-xl font-black tracking-tighter leading-none text-[var(--primary-color)] group-hover:scale-105 transition-transform">R$ {formatarMoeda(currentUser?.walletBalance || 0)}</p>
                        </div>
                        <button 
                            onClick={() => { setIsDepositOpen(true); setStage('pay'); }}
                            className="bg-[var(--primary-color)] text-white px-5 py-3 rounded-2xl flex items-center gap-2 hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-[var(--primary-color)]/30 group"
                        >
                            <Plus size={18} className="group-hover:rotate-90 transition-transform duration-500" />
                            <span className="text-[9px] font-black uppercase tracking-widest">Enviar Crédito</span>
                        </button>
                    </div>
                )}

                <div className={`hidden md:flex items-center gap-1.5 bg-black/5 dark:bg-white/5 backdrop-blur-xl p-1.5 rounded-[2rem] border border-slate-100`}>
                    <button
                        onClick={() => setActiveTab('store')}
                        className={`flex items-center gap-2 px-6 py-2.5 rounded-2xl transition-all text-[9px] font-black uppercase tracking-[0.2em] ${activeTab === 'store' ? 'bg-[var(--primary-color)] text-white shadow-xl scale-105' : 'text-[var(--text-muted)] hover:bg-[var(--primary-color)]/10'}`}
                    >
                        <ShoppingBag size={14} /> Loja
                    </button>
                    <button
                        onClick={() => setActiveTab('orders')}
                        className={`flex items-center gap-2 px-6 py-2.5 rounded-2xl transition-all text-[9px] font-black uppercase tracking-[0.2em] ${activeTab === 'orders' ? 'bg-[var(--primary-color)] text-white shadow-xl scale-105' : 'text-[var(--text-muted)] hover:bg-[var(--primary-color)]/10'}`}
                    >
                        <Clock size={14} /> Pedidos
                    </button>
                </div>

                <div className="flex gap-2 relative z-10">
                    <button
                        onClick={() => {
                            if (myOrders.length > 0) {
                                setViewingOrderCupom(myOrders[0]);
                            } else {
                                showNotification('Nenhum pedido encontrado para reimpressão.', 'error');
                            }
                        }}
                        disabled={myOrders.length === 0}
                        className="hidden sm:flex w-10 h-10 sm:w-12 sm:h-12 bg-[var(--bg-main)]/50 backdrop-blur-md border border-slate-200 text-[var(--text-main)] rounded-2xl items-center justify-center hover:bg-emerald-500/20 hover:text-emerald-500 hover:border-emerald-500/30 transition-all active:scale-90 shadow-sm disabled:opacity-30"
                        title="Reimprimir Último Cupom"
                    >
                        <Printer size={18} />
                    </button>
                    <button onClick={() => setIsMsgOpen(!isMsgOpen)} className="w-10 h-10 sm:w-12 sm:h-12 bg-[var(--bg-main)]/50 backdrop-blur-md border border-slate-200 text-[var(--text-main)] rounded-2xl flex items-center justify-center hover:bg-[var(--primary-color)]/10 transition-all active:scale-90 shadow-sm relative">
                        <MessageSquare size={18} />
                        {unreadMsg > 0 && <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] w-5 h-5 rounded-full flex items-center justify-center font-black border-2 border-[var(--bg-card)] animate-bounce shadow-lg shadow-red-500/40">{unreadMsg}</span>}
                    </button>
                    <span className="hidden sm:inline"><InstallButton role={isAdmin ? 'admin' : 'user'} /></span>
                    <span className="hidden sm:inline"><AppDownloadButton className="!w-8 !h-8 sm:!w-9 sm:!h-9" /></span>
                    <button onClick={logout} className="w-10 h-10 sm:w-12 sm:h-12 bg-red-500/10 text-red-500 border border-red-500/20 rounded-2xl flex items-center justify-center hover:bg-red-500 hover:text-white transition-all active:scale-90 shadow-sm"><LogOut size={18} /></button>
                </div>
            </header>

            {/* Painel de Mensagens (Sino) */}
            <AnimatePresence>
                {isMsgOpen && (
                    <>
                        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40" onClick={() => setIsMsgOpen(false)} />
                        <motion.div
                            initial={{ opacity: 0, y: -12, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -12, scale: 0.98 }}
                            transition={{ duration: 0.2 }}
                            className="fixed top-20 right-3 sm:right-6 z-50 w-[calc(100vw-1.5rem)] max-w-md bg-[var(--bg-card)] border border-slate-200 rounded-3xl shadow-2xl overflow-hidden"
                        >
                            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200/80 bg-[var(--bg-main)]/60">
                                <div className="flex items-center gap-2">
                                    <MessageSquare size={16} className="text-[var(--primary-color)]" />
                                    <h3 className="font-black text-[11px] uppercase tracking-widest text-[var(--text-main)]">Mensagens</h3>
                                </div>
                                <button onClick={() => setIsMsgOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-200/60 text-[var(--text-muted)] transition-all cursor-pointer"><X size={16} /></button>
                            </div>
                            <div className="max-h-[55vh] overflow-y-auto">
                                {myMessages.length === 0 ? (
                                    <div className="py-12 text-center px-6">
                                        <MessageSquare size={28} className="mx-auto mb-3 text-slate-300" />
                                        <p className="text-[11px] font-bold text-[var(--text-muted)]">Nenhuma mensagem recebida.</p>
                                    </div>
                                ) : (
                                    myMessages.map(msg => (
                                        <div key={msg.id} className={`px-5 py-4 border-b border-slate-100 last:border-0 ${msg.read ? 'opacity-60' : ''}`}>
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="flex-1 min-w-0">
                                                    <p className={`text-[11px] leading-relaxed text-[var(--text-main)] ${msg.read ? '' : 'font-bold'}`}>{msg.text || (msg as any).message}</p>
                                                    <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)] mt-1.5">
                                                        {msg.date ? new Date(msg.date).toLocaleString('pt-BR') : ((msg as any).createdAt ? new Date((msg as any).createdAt).toLocaleString('pt-BR') : '')}
                                                    </p>
                                                </div>
                                                {!msg.read && (
                                                    <button
                                                        onClick={() => markMessageRead(msg.id)}
                                                        className="shrink-0 text-[9px] font-black uppercase tracking-widest bg-[var(--primary-color)]/10 text-[var(--primary-color)] px-2.5 py-1.5 rounded-lg hover:opacity-80 transition-all cursor-pointer"
                                                    >
                                                        Lida
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            <main className={`flex-1 min-h-0 w-full px-4 sm:px-6 py-6 md:py-8 pb-24 z-10 relative ${isAdmin ? 'max-w-7xl' : 'max-w-5xl mx-auto'}`}>
                {activeTab === 'store' && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                        {(settings?.allow_user_purchases ?? true) === false && !isAdmin ? (
                            <div className="flex flex-col items-center justify-center py-20 text-center">
                                <div className="bg-red-500/10 border-2 border-red-500/20 rounded-[3rem] p-12 max-w-md w-full shadow-2xl">
                                    <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                                        <Lock size={36} className="text-red-500" />
                                    </div>
                                    <p className="font-black text-lg uppercase tracking-tight text-slate-900 mb-4"><Lock size={16} className="inline-block mr-1.5 -mt-0.5 text-red-500" />MÓDULO DE COMPRAS SUSPENSO</p>
                                    <p className="text-sm font-bold text-slate-500 leading-relaxed">
                                        Módulo de Compras Suspenso no Momento. Utilize esta tela exclusivamente para enviar crédito via PIX para a custódia do interno.
                                    </p>
                                </div>
                            </div>
                        ) : (settings?.allow_balance_purchases ?? true) === false && !isAdmin ? (
                            <div className="max-w-md mx-auto bg-slate-900 rounded-3xl border border-slate-700 shadow-xl p-8 text-white space-y-6">
                                <div className="text-center">
                                    <span className="bg-amber-500/10 text-amber-500 border border-amber-500/20 px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest animate-pulse">Compras Suspensas</span>
                                    <h3 className="text-lg font-black mt-3 uppercase tracking-tight text-white">COMPRAS POR SALDO SUSPENSAS</h3>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1">Você só pode enviar crédito/saldo via PIX neste momento.</p>
                                </div>
                                <div className="border-t border-slate-800 pt-6">
                                    {depositStage === 'amount' ? (
                                        <div className="flex flex-col space-y-4">
                                            <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
                                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 text-center">Valor do Crédito (R$)</p>
                                                <input type="number" className="w-full bg-transparent font-black text-2xl text-center outline-none text-white placeholder-slate-600" value={depositAmount || ''} onChange={e => setDepositAmount(Number(e.target.value))} placeholder="0,00" />
                                            </div>
                                            {depositAmount > 0 && (
                                                <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 flex flex-col items-center">
                                                    <img src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(pixPayload || 'mercadofacil')}`} className="w-36 h-36 object-contain" alt="QR PIX" />
                                                    <button onClick={() => { navigator.clipboard.writeText(pixPayload || ''); setPixCopied(true); setTimeout(() => setPixCopied(false), 2000); }} className={`w-full mt-3 py-2 rounded-lg font-bold text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${pixCopied ? 'bg-emerald-600 text-white' : 'bg-blue-500 text-white'}`}>
                                                        {pixCopied ? <><CheckCircle size={12} /> COPIADO!</> : <><RefreshCcw size={12} /> Copiar PIX</>}
                                                    </button>
                                                </div>
                                            )}
                                            <button onClick={() => { if (depositAmount <= 0) { showNotification('DIGITE O VALOR DO CRÉDITO.', 'error'); return; } setDepositStage('proof'); if (fileInputRef.current) fileInputRef.current.value = ''; }} disabled={depositAmount <= 0} className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg disabled:opacity-50 transition-all cursor-pointer">
                                                <Sparkles size={14} /> Já fiz o PIX do Crédito
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col space-y-4">
                                            <div className="bg-blue-900/30 p-4 rounded-xl border border-blue-800 text-center">
                                                <p className="font-black text-xs text-blue-300 uppercase tracking-wider mb-1">Comprovante de Pagamento</p>
                                                <p className="text-[10px] text-blue-400 font-bold">Anexe a foto do comprovante PIX para confirmar o crédito</p>
                                            </div>
                                            <div onClick={() => fileInputRef.current?.click()} className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${proofFile ? 'border-emerald-500 bg-emerald-500/10' : 'border-blue-700 bg-slate-800 hover:border-blue-500 hover:bg-slate-700'}`}>
                                                <input type="file" ref={fileInputRef} className="hidden" accept="image/*,.pdf" onChange={async e => {
                                                    const f = e.target.files?.[0]; if (!f) return;
                                                    if (f.size > 10 * 1024 * 1024) { showNotification('Arquivo muito grande. Máximo 10MB.', 'error'); e.target.value = ''; return; }
                                                    try {
                                                        if (f.type.startsWith('image/')) {
                                                            const compressed = await compressImageFile(f, 0.3, 600);
                                                            if (compressed.size > 300 * 1024) {
                                                                const recompress = await compressImageFile(new File([compressed], f.name, { type: 'image/jpeg' }), 0.2, 500);
                                                                setProofFile(new File([recompress], f.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }));
                                                            } else {
                                                                setProofFile(new File([compressed], f.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }));
                                                            }
                                                        } else {
                                                            setProofFile(f);
                                                        }
                                        } catch { console.warn("compress fallback (fileInput 2)"); setProofFile(f); }
                                                    e.target.value = '';
                                                }} />
                                                {proofFile ? (
                                                    <div>
                                                        <Upload size={28} className="mx-auto text-emerald-400 mb-2" />
                                                        <p className="font-black text-[10px] text-emerald-300">{proofFile.name}</p>
                                                        <p className="text-[9px] text-emerald-400 font-bold mt-1 uppercase">Arquivo anexado</p>
                                                    </div>
                                                ) : (
                                                    <div>
                                                        <Upload size={32} className="mx-auto mb-2 text-blue-400" />
                                                        <p className="font-black text-[11px] text-blue-300 uppercase tracking-wider"><Paperclip size={12} className="inline-block mr-1" /> Clique aqui para selecionar o Comprovante</p>
                                                    </div>
                                                )}
                                            </div>
<p className="text-[7px] font-bold text-red-400 text-center mt-2 leading-tight"><AlertCircle size={10} className="inline-block mr-1 -mt-0.5" />Enviar comprovantes falsos ou adulterados configura CRIME (Art. 171 e 298 CP). Ao prosseguir, você assume total responsabilidade civil e criminal.</p>
                                            <button onClick={async () => { if (!proofFile) { showNotification('ANEXE O COMPROVANTE.', 'error'); return; } await depositToWalletAction(); setDepositStage('amount'); }} disabled={isSubmitting || !proofFile} className="w-full py-3.5 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg disabled:opacity-50 transition-all cursor-pointer">
                                                {isSubmitting ? <><Loader2 size={14} className="animate-spin" /> Enviando...</> : <><Upload size={14} /> Enviar Comprovante</>}
                                            </button>
                                            <button onClick={() => { setDepositStage('amount'); setProofFile(null); }} className="w-full py-2 bg-slate-800 text-slate-400 rounded-xl font-black text-[10px] uppercase tracking-widest text-center hover:bg-slate-700 transition-all cursor-pointer">
                                                Voltar
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : isAdmin ? (
                            renderAdminStore()
                        ) : (
                            renderFamilyStore()
                        )}
                    </motion.div>
                )}

                {activeTab === 'orders' && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                        <div className="bg-[var(--bg-card)] p-8 rounded-[3rem] border border-slate-200 shadow-sm flex justify-between items-center">
                            <div>
                                <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter flex items-center gap-3"><Clock size={32} className="text-[var(--primary-color)]"/> Histórico</h2>
                                <p className="text-[10px] text-slate-400 font-black uppercase mt-1">Acompanhamento em tempo real</p>
                            </div>
                            {(settings?.enablePrisonerWallet ?? true) && (
                                <button onClick={() => setViewingWalletHistory(!viewingWalletHistory)} className={`text-[10px] font-black uppercase px-6 py-3 rounded-2xl transition-all border-2 ${viewingWalletHistory ? 'bg-slate-900 border-slate-900 text-white' : 'border-slate-200 text-slate-400'}`}>Extrato</button>
                            )}
                        </div>

                        {viewingWalletHistory ? (
                            <div className="space-y-4">
                                {walletTxs.length === 0 ? (
                                    <div className="bg-[var(--bg-card)] p-10 rounded-3xl border border-slate-200 shadow-sm flex flex-col items-center gap-3 text-center">
                                        <Wallet size={32} className="text-slate-300" />
                                        <p className="font-black text-xs uppercase text-slate-400">Nenhuma movimentação</p>
                                        <p className="text-[10px] text-slate-400 font-bold">Seus depósitos e compras aparecerão aqui.</p>
                                    </div>
                                ) : (
                                walletTxs.map((tx: any) => (
                                    <div key={tx.id} className="bg-[var(--bg-card)] p-4 rounded-3xl border border-slate-200 shadow-sm flex justify-between items-center gap-3 flex-wrap">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${tx.amount > 0 ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                                                {tx.amount > 0 ? <Plus size={18} /> : <ShoppingBag size={18} />}
                                            </div>
                                            <div>
                                                <p className="font-black text-xs uppercase">{tx.type === 'deposit' ? 'Depósito' : 'Compra'}</p>
                                                <p className="text-[9px] font-bold text-slate-400 uppercase">{new Date(tx.createdAt).toLocaleString()}</p>
                                                {tx.status === 'pending' && tx.type === 'deposit' && (tx.proofUrl === 'PENDENTE_UPLOAD_LOCAL_CACHE' || !tx.proofUrl) && (
                                                    <button
                                                        onClick={() => { setResendTarget({ kind: 'wallet_transactions', docId: tx.id }); resendInputRef.current?.click(); }}
                                                        className="mt-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-white rounded-xl text-[8px] font-black uppercase tracking-wider transition-all"
                                                    >
                                                        Reenviar Comprovante
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                        <p className={`font-black ${tx.amount > 0 ? 'text-green-600' : 'text-red-600'}`}>R$ {formatarMoeda(tx.amount)}</p>
                                    </div>
                                ))
                                )}
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {loadingOrders && (
                                    <div className="bg-[var(--bg-card)] p-10 rounded-3xl border border-slate-200 shadow-sm flex flex-col items-center gap-3">
                                        <Loader2 size={28} className="text-[var(--primary-color)] animate-spin" />
                                        <p className="font-black text-xs uppercase text-slate-400">Carregando pedidos...</p>
                                    </div>
                                )}
                                {!loadingOrders && myOrders.length === 0 && (
                                    <div className="bg-[var(--bg-card)] p-10 rounded-3xl border border-slate-200 shadow-sm flex flex-col items-center gap-3 text-center">
                                        <Package size={32} className="text-slate-300" />
                                        <p className="font-black text-xs uppercase text-slate-400">Nenhum pedido ainda</p>
                                        <p className="text-[10px] text-slate-400 font-bold">Seus pedidos aparecerão aqui assim que você fizer uma compra.</p>
                                    </div>
                                )}
                                {!loadingOrders && myOrders.map((order: any) => (
                                    <div key={order.id} className="bg-[var(--bg-card)] p-6 rounded-3xl border border-slate-200 shadow-sm">
                                        <div className="flex justify-between items-center mb-4 pb-4 border-b border-slate-100">
                                            <div>
                                                <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Pedido #{order.id.slice(0, 8)}</span>
                                                <p className="font-black text-xs uppercase mt-0.5">{(() => { const d = new Date(order.createdAt || order.date); return isNaN(d.getTime()) ? '' : d.toLocaleString(); })()}</p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {order.paymentMethod === 'WALLET' ? (
                                                    <span className="px-3 py-1 bg-emerald-100 text-emerald-600 rounded-full text-[8px] font-black uppercase">Saldo</span>
                                                ) : (
                                                    <span className="px-3 py-1 bg-blue-100 text-blue-600 rounded-full text-[8px] font-black uppercase">PIX</span>
                                                )}
                                                <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase ${order.status === 'paid' ? 'bg-green-100 text-green-600' : 'bg-amber-100 text-amber-600'}`}>{order.status}</span>
                                            </div>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <p className="text-lg font-black text-slate-900">R$ {formatarMoeda(order.total)}</p>
                                            <div className="flex gap-2">
                                                <button onClick={() => setViewingOrderCupom(order)} className="p-3 bg-slate-100 rounded-xl hover:bg-slate-200 transition-all text-slate-700"><Printer size={18}/></button>
                                                <button onClick={() => toggleOrderDetails(order.id)} className="px-4 py-3 bg-slate-100 rounded-xl hover:bg-slate-200 transition-all text-slate-700 font-black text-[10px] uppercase tracking-wider">VER {order?.items?.length || 0} ITENS COMPRADOS</button>
                                            </div>
                                        </div>
                                        {expandedOrders.includes(order.id) && (
                                            <div className="mt-4 space-y-2">
                                                {order.items.map((it: any, i: number) => (
                                                    <div key={i} className="flex justify-between text-[10px] font-bold text-slate-500 uppercase">
                                                        <span>{it.name} x{it.quantity}</span>
                                                        <span>R$ {formatarMoeda((it.priceAtPurchase || 0) * (it.quantity || 0))}</span>
                                                    </div>
                                                ))}
                                                {order.paymentMethod !== 'WALLET' && order.paymentProofUrl && order.paymentProofUrl !== 'PENDENTE_UPLOAD_LOCAL_CACHE' && (
                                                    <div className="mt-3 pt-3 border-t border-slate-100">
                                                        <a href={order.paymentProofUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-emerald-600 hover:text-emerald-700 text-[10px] font-black uppercase">
                                                            <FileText size={14} /> Comprovante Anexado — Clique para Abrir
                                                        </a>
                                                    </div>
                                                )}
                                                {order.paymentMethod !== 'WALLET' && order.paymentProofUrl === 'PENDENTE_UPLOAD_LOCAL_CACHE' && (
                                                    <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap">
                                                        <span className="flex items-center gap-2 text-amber-600 text-[10px] font-black uppercase">
                                                            <AlertCircle size={14} /> Comprovante Pendente de Upload
                                                        </span>
                                                        {String(order.status || '').toLowerCase() === 'pending' && (
                                                            <button
                                                                onClick={() => { setResendTarget({ kind: 'orders', docId: order.id }); resendInputRef.current?.click(); }}
                                                                className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-white rounded-xl text-[9px] font-black uppercase tracking-wider transition-all"
                                                            >
                                                                Reenviar Comprovante
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
                                                {order.paymentMethod === 'WALLET' && (
                                                    <div className="mt-3 pt-3 border-t border-slate-100">
                                                        <span className="flex items-center gap-2 text-emerald-600 text-[10px] font-black uppercase">
                                                            <CheckCircle size={14} /> Pagamento via Saldo Interno
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </motion.div>
                )}
            </main>

            {/* F6 SERVICES MODAL */}
            {showServicesModal && (
                <div className="fixed inset-0 z-[999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowServicesModal(false)}>
                    <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 border border-slate-200" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-5">
                            <h3 className="font-black text-base uppercase tracking-tight text-slate-900"><Wrench size={16} className="inline-block mr-1.5 -mt-0.5 text-amber-500" />Outros Serviços</h3>
                            <button onClick={() => setShowServicesModal(false)} className="w-8 h-8 bg-slate-100 rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-all"><X size={18}/></button>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5 block">Nome do Serviço</label>
                                <input
                                    className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 focus:border-amber-500 outline-none bg-slate-50 text-sm font-bold"
                                    placeholder="Ex: Taxa ASSPEN, Entrega"
                                    value={serviceName}
                                    onChange={e => setServiceName(e.target.value)}
                                    autoFocus
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5 block">Valor (R$)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 focus:border-amber-500 outline-none bg-slate-50 text-sm font-bold"
                                    placeholder="0,00"
                                    value={serviceValue}
                                    onChange={e => setServiceValue(e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="flex gap-3 mt-6">
                            <button onClick={addServiceItem} disabled={!serviceName.trim() || !serviceValue} className="flex-[2] py-3.5 bg-amber-600 hover:bg-amber-500 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-black rounded-xl text-xs uppercase tracking-wider transition-all active:scale-[0.98] flex items-center justify-center gap-2 shadow-sm cursor-pointer">
                                <Plus size={16} /> Adicionar ao Cupom
                            </button>
                            <button onClick={() => setShowServicesModal(false)} className="flex-1 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-black rounded-xl text-xs uppercase tracking-wider transition-all active:scale-[0.98] cursor-pointer">
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ADMIN PRODUCT CATALOG MODAL (F4) */}
            {isAdmin && isProductsModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn" onClick={() => setIsProductsModalOpen(false)}>
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.95 }} 
                        animate={{ opacity: 1, scale: 1 }} 
                        className="bg-white rounded-3xl p-6 shadow-2xl max-w-5xl w-full max-h-[85vh] overflow-hidden flex flex-col border border-slate-200"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex justify-between items-center pb-4 border-b border-slate-100 mb-4 shrink-0">
                            <div>
                                <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight"><Search size={18} className="inline-block mr-1.5 -mt-0.5 text-emerald-600" />Catálogo de Produtos</h3>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Selecione para adicionar ao carrinho (F4 para fechar)</p>
                            </div>
                            <button onClick={() => setIsProductsModalOpen(false)} className="p-2 text-slate-400 hover:text-red-500 rounded-xl transition-all"><X size={24} /></button>
                        </div>
                        <div className="relative mb-4 shrink-0">
                            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"><Search size={18} /></div>
                            <input className="w-full pl-12 pr-6 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-600 outline-none bg-slate-50 text-sm font-bold shadow-inner" placeholder="Filtrar produtos..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                        </div>
                        <div className="flex-1 overflow-y-auto pr-1">
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                                {filteredProducts.length === 0 ? (
                                    <div className="col-span-full text-center py-20 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                                        <ShoppingBag size={40} className="mx-auto mb-4 opacity-25 text-slate-400" />
                                        <p className="font-black uppercase tracking-wider text-xs text-slate-400">Nenhum produto cadastrado</p>
                                    </div>
                                ) : filteredProducts.map((p: any, idx: number) => {
                                    const isOutOfStock = (p?.stock || 0) <= 0;
                                    return (
                                        <div key={p?.id || `cat-${idx}`} className={`bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all duration-200 p-4 flex flex-col justify-between h-full relative ${isOutOfStock ? 'opacity-60 grayscale' : ''}`}>
                                            <div className="w-full aspect-square rounded-xl overflow-hidden bg-slate-50 mb-3 relative">
                                                <img src={p.imageUrl || 'https://placehold.co/200'} className="w-full h-full object-contain" alt={p.name} loading="lazy" />
                                                {isOutOfStock && <div className="absolute inset-0 bg-black/60 flex items-center justify-center"><span className="text-[8px] font-black bg-white text-black px-3 py-1 rounded-lg uppercase">Esgotado</span></div>}
                                            </div>
                                            <div className="flex-1 flex flex-col justify-between font-mono">
                                                <h4 className="text-slate-800 font-bold text-xs tracking-wide line-clamp-2 uppercase mb-2">{p.name}</h4>
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="text-emerald-600 font-extrabold text-xs">R$ {formatarMoeda(p.price)}</span>
                                                    <button onClick={() => addToCart(p)} disabled={isOutOfStock} className="bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg p-2 transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"><Plus size={16} /></button>
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

            {/* MOBILE BOTTOM NAV */}
            <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-100 flex justify-around items-center h-16 z-50 shadow-lg modal-bottom-sheet" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
                {((settings?.allow_balance_purchases ?? true) === false && !isAdmin) ? (
                    <>
                        <button onClick={() => { setActiveTab('store'); }} className={`flex flex-col items-center justify-center h-full flex-1 transition-colors ${activeTab === 'store' ? 'text-emerald-600' : 'text-slate-400'}`}>
                            <CreditCard size={20} />
                            <span className="text-[8px] font-black uppercase mt-0.5">ENVIAR PIX</span>
                        </button>
                        <button onClick={() => { setActiveTab('orders'); }} className={`flex flex-col items-center justify-center h-full flex-1 transition-colors ${activeTab === 'orders' ? 'text-emerald-600' : 'text-slate-400'}`}>
                            <Clock size={20} />
                            <span className="text-[8px] font-black uppercase mt-0.5">HISTÓRICO</span>
                        </button>
                    </>
                ) : (
                    <>
                        <button onClick={() => { setActiveTab('store'); setMobileView('catalog'); }} className={`flex flex-col items-center justify-center h-full flex-1 transition-colors ${mobileView === 'catalog' ? 'text-emerald-600' : 'text-slate-400'}`}>
                            <Package size={20} />
                            <span className="text-[8px] font-black uppercase mt-0.5">CATÁLOGO</span>
                        </button>
                        <button onClick={() => { setIsCartReviewOpen(true); }} className={`flex flex-col items-center justify-center h-full flex-1 transition-colors relative ${mobileView === 'cart' ? 'text-emerald-600' : 'text-slate-400'}`}>
                            <ShoppingCart size={20} />
                            {totalItensNoCarrinho > 0 && <span className="absolute top-1 right-[calc(50%-24px)] bg-red-500 text-white text-[8px] w-auto min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center font-black border border-white">{totalItensNoCarrinho}</span>}
                            <span className="text-[8px] font-black uppercase mt-0.5">CUPOM</span>
                        </button>
                        <button onClick={() => { setActiveTab('store'); setMobileView('payment'); }} className={`flex flex-col items-center justify-center h-full flex-1 transition-colors ${mobileView === 'payment' ? 'text-emerald-600' : 'text-slate-400'}`}>
                            <CreditCard size={20} />
                            <span className="text-[8px] font-black uppercase mt-0.5">PAGAMENTO</span>
                        </button>
                        <button onClick={() => { setActiveTab('orders'); }} className={`flex flex-col items-center justify-center h-full flex-1 transition-colors ${activeTab === 'orders' ? 'text-emerald-600' : 'text-slate-400'}`}>
                            <Clock size={20} />
                            <span className="text-[8px] font-black uppercase mt-0.5">HISTÓRICO</span>
                        </button>
                    </>
                )}
            </nav>

            {/* CART REVIEW MODAL — PC e Mobile */}
            {isCartReviewOpen && (
                <div className="fixed inset-0 z-[999] bg-black/60 backdrop-blur-sm" onClick={() => setIsCartReviewOpen(false)}>
                    <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 md:max-w-md md:mx-auto bg-white rounded-2xl shadow-2xl p-5 max-h-[80vh] overflow-y-auto flex flex-col space-y-4 z-50 border border-slate-100" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center shrink-0">
                            <h3 className="font-black text-base uppercase tracking-tight"><ShoppingCart size={16} className="inline-block mr-1.5 -mt-0.5 text-emerald-600" />Revisão do Carrinho</h3>
                            <button onClick={() => setIsCartReviewOpen(false)} className="w-7 h-7 bg-slate-100 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-200"><X size={16}/></button>
                        </div>

                        {cart.length === 0 ? (
                            <p className="text-center text-slate-400 font-bold text-xs uppercase py-8">Carrinho vazio</p>
                        ) : (
                            <div className="flex flex-col space-y-3">
                                {(cart || []).map(item => {
                                    const prod = safeProducts.find(p => String(p.id) === String(item.productId));
                                    const displayName = prod ? prod.name : (item.name || 'Item');
                                    const displayPrice = item.priceAtPurchase ?? (prod ? prod.price : (item.price || 0));
                                    if (!prod && !item.name) return null;
                                    const subtotal = displayPrice * item.quantity;
                                    return (
                                        <div key={item.productId} className="flex items-center gap-3 bg-slate-50 rounded-xl p-3 border border-slate-100">
                                            {prod && <img src={prod.imageUrl || 'https://placehold.co/40x48'} className="w-10 h-12 object-cover rounded-md border border-slate-200 shrink-0" alt={displayName} />}
                                            <div className="flex-1 min-w-0">
                                                <p className="font-bold text-xs uppercase text-slate-800 truncate">{displayName}</p>
                                                <p className="font-black text-sm text-slate-900">R$ {formatarMoeda(subtotal)}</p>
                                            </div>
                                            <div className="flex items-center gap-1 shrink-0">
                                                <button onClick={() => updateQty(item.productId, -1)} className="w-7 h-7 rounded-full border bg-white flex items-center justify-center font-bold text-xs shadow-sm transition-all active:scale-95 cursor-pointer hover:bg-red-50 hover:text-red-500 hover:border-red-300">−</button>
                                                <span className="font-black text-xs text-slate-900 min-w-[22px] text-center">{item.quantity}</span>
                                                <button onClick={() => updateQty(item.productId, 1)} className="w-7 h-7 rounded-full border bg-white flex items-center justify-center font-bold text-xs shadow-sm transition-all active:scale-95 cursor-pointer hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-300">+</button>
                                            </div>
                                            <button onClick={() => removeFromCart(item.productId)} className="text-red-600 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg text-[10px] font-black flex items-center gap-1 transition-all active:scale-95 shrink-0"><Trash2 size={12} /> RETIRAR</button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {cart.length > 0 && (
                            <>
                                <div className="flex justify-between items-center py-3 border-t border-slate-100">
                                    <span className="text-xs font-black text-slate-400 uppercase">Total Geral</span>
                                    <span className="text-xl font-black text-slate-900">R$ {formatarMoeda(cartTotal)}</span>
                                </div>
                                <button onClick={() => { setIsCartReviewOpen(false); setIsCheckoutModalOpen(true); }} className="w-full py-3 bg-emerald-600 text-white font-black rounded-2xl uppercase text-xs shadow-lg active:scale-95 flex items-center justify-center gap-2 shrink-0">
                                    <Banknote size={14} className="inline-block mr-1.5 -mt-0.5" /> AVANÇAR PARA PAGAMENTO (F9)
                                </button>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* MOBILE PAYMENT VIEW */}
            {mobileView === 'payment' && (
                <div className="md:hidden fixed inset-0 z-40 bg-black/40" onClick={() => setMobileView('catalog')}>
                    <div className="absolute bottom-16 left-0 right-0 bg-white rounded-t-3xl shadow-2xl max-h-[70vh] overflow-y-auto p-4 pb-8" onClick={e => e.stopPropagation()}>
                        <div className="w-12 h-1.5 bg-slate-300 rounded-full mx-auto mb-4"></div>
                        <p className="font-black text-xs uppercase text-slate-400 text-center tracking-widest mb-4"><Banknote size={12} className="inline-block mr-1.5 -mt-0.5" /> FINALIZAR PAGAMENTO</p>
                        <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 mb-4">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1">DADOS DO CLIENTE</p>
                            <p className="font-black text-sm text-slate-900 uppercase">{currentUser?.name || 'CONSUMIDOR FINAL'}</p>
                            <p className="text-[10px] text-slate-500 font-bold">Saldo: R$ {formatarMoeda(currentUser?.walletBalance || 0)}</p>
                        </div>
                        <div className="bg-emerald-50 rounded-xl p-6 border border-emerald-100 text-center mb-6">
                            <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest mb-2">TOTAL GERAL</p>
                            <p className="font-black text-3xl text-slate-900">R$ {formatarMoeda(cartTotal)}</p>
                        </div>
                        <button onClick={cancelSale} className="w-full py-3 rounded-xl font-bold text-sm bg-red-500 text-white active:scale-95 mb-2 flex items-center justify-center gap-2">
                            <X size={14} className="inline-block mr-1.5 -mt-0.5" /> Cancelar (F7)
                        </button>
                        <button onClick={() => {
                            const cartNow = cartRef.current;
                            if (cartNow.length > 0) {
                                const lastItem = cartNow[cartNow.length - 1];
                                setCart(prev => prev.filter(i => String(i.productId) !== String(lastItem.productId)));
                                showNotification('Último item removido!', 'success');
                            }
                        }} className="w-full py-3 rounded-xl font-bold text-sm bg-orange-500 text-white active:scale-95 mb-4 flex items-center justify-center gap-2">
                            <RefreshCcw size={14} className="inline-block mr-1.5 -mt-0.5" /> Estorno (F9)
                        </button>
                        <button onClick={() => setIsCheckoutModalOpen(true)} disabled={cart.length === 0} className="w-full py-4 rounded-xl text-white font-black text-lg bg-emerald-600 active:scale-95 shadow-md disabled:bg-slate-300 disabled:cursor-not-allowed disabled:text-slate-500 transition-all">
                            FINALIZAR COMPRA
                        </button>
                    </div>
                </div>
            )}

            {totalItensNoCarrinho > 0 && (
                <button onClick={() => setIsCartReviewOpen(true)} className="hidden md:flex fixed bottom-6 right-6 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 px-5 rounded-full shadow-2xl flex items-center gap-2 z-50 transition-all active:scale-95 cursor-pointer">
                    <span className="relative">
                        <ShoppingCart size={20} />
                        <span className="absolute -top-2 -right-2 w-auto min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[9px] font-black rounded-full flex items-center justify-center border border-white">{totalItensNoCarrinho}</span>
                    </span>
                    <span className="text-sm font-black">R$ {formatarMoeda(cartTotal)}</span>
                </button>
            )}

            {/* DEPOSIT MODAL — 2 etapas */}
            {isDepositOpen && (
                <div className="fixed inset-0 z-[999] bg-black/60 backdrop-blur-sm" onClick={() => { setIsDepositOpen(false); setDepositStage('amount'); setProofFile(null); }}>
                    <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 md:max-w-md md:mx-auto bg-slate-900 rounded-2xl shadow-2xl p-5 max-h-[85vh] overflow-y-auto flex flex-col space-y-4 z-50 border border-slate-700" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center shrink-0">
                            <h3 className="font-black text-base uppercase tracking-tight text-white">Enviar Crédito</h3>
                            <button onClick={() => { setIsDepositOpen(false); setDepositStage('amount'); setProofFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }} className="w-7 h-7 bg-slate-700 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-600"><X size={16}/></button>
                        </div>

                        {depositStage === 'amount' && (
                            <div className="flex flex-col space-y-4">
                                <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Valor do Crédito (R$)</p>
                                    <input type="number" className="w-full bg-transparent font-black text-2xl text-center outline-none text-white" value={depositAmount || ''} onChange={e => setDepositAmount(Number(e.target.value))} placeholder="0,00" />
                                </div>
                                {depositAmount > 0 && (
                                    <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 flex flex-col items-center">
                                        <img src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(pixPayload || 'mercadofacil')}`} className="w-36 h-36 object-contain" alt="QR PIX" />
                                        <button onClick={() => { navigator.clipboard.writeText(pixPayload || ''); setPixCopied(true); setTimeout(() => setPixCopied(false), 2000); }} className={`w-full mt-3 py-2 rounded-lg font-bold text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${pixCopied ? 'bg-emerald-600 text-white' : 'bg-blue-500 text-white'}`}>
                                            {pixCopied ? <><CheckCircle size={12} /> COPIADO!</> : <><RefreshCcw size={12} /> Copiar PIX</>}
                                        </button>
                                    </div>
                                )}
                                <button onClick={() => { if (depositAmount <= 0) { showNotification('DIGITE O VALOR DO CRÉDITO.', 'error'); return; } setDepositStage('proof'); if (fileInputRef.current) fileInputRef.current.value = ''; }} disabled={depositAmount <= 0} className="w-full py-3 bg-emerald-600 text-white rounded-xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg disabled:opacity-50">
                                    <Sparkles size={14} /> Já fiz o PIX do Crédito
                                </button>
                            </div>
                        )}

                        {depositStage === 'proof' && (
                            <div className="flex flex-col space-y-4">
                                <div className="bg-blue-900/30 p-4 rounded-xl border border-blue-800 text-center">
                                    <p className="font-black text-xs text-blue-300 uppercase tracking-wider mb-1">Comprovante de Pagamento</p>
                                    <p className="text-[10px] text-blue-400 font-bold">Anexe a foto do comprovante PIX para confirmar o crédito</p>
                                </div>
                                <div onClick={() => fileInputRef.current?.click()} className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${proofFile ? 'border-emerald-500 bg-emerald-500/10' : 'border-blue-700 bg-slate-800 hover:border-blue-500 hover:bg-slate-700'}`}>
                                    <input type="file" ref={fileInputRef} className="hidden" accept="image/*,.pdf" onChange={async e => {
                                        const f = e.target.files?.[0]; if (!f) return;
                                        if (f.size > 10 * 1024 * 1024) { showNotification('Arquivo muito grande. Máximo 10MB.', 'error'); e.target.value = ''; return; }
                                        try {
                                            if (f.type.startsWith('image/')) {
                                                const compressed = await compressImageFile(f, 0.3, 600);
                                                if (compressed.size > 300 * 1024) {
                                                    const recompress = await compressImageFile(new File([compressed], f.name, { type: 'image/jpeg' }), 0.2, 500);
                                                    setProofFile(new File([recompress], f.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }));
                                                } else {
                                                    setProofFile(new File([compressed], f.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }));
                                                }
                                            } else {
                                                setProofFile(f);
                                            }
                                                        } catch { console.warn("compress fallback (fileInput 3)"); setProofFile(f); }
                                        e.target.value = '';
                                    }} />
                                    {proofFile ? (
                                        <div>
                                            <Upload size={28} className="mx-auto text-emerald-400 mb-2" />
                                            <p className="font-black text-[10px] text-emerald-300">{proofFile.name}</p>
                                            <p className="text-[9px] text-emerald-400 font-bold mt-1 uppercase">Arquivo anexado</p>
                                        </div>
                                    ) : (
                                        <div>
                                            <Upload size={32} className="mx-auto mb-2 text-blue-400" />
                                            <p className="font-black text-[11px] text-blue-300 uppercase tracking-wider"><Paperclip size={12} className="inline-block mr-1" /> Clique aqui para selecionar o Comprovante</p>
                                        </div>
                                    )}
                                </div>
<p className="text-[11px] font-bold text-red-400 text-center mt-2 leading-tight"><AlertCircle size={12} className="inline-block mr-1 -mt-0.5" />Enviar comprovantes falsos ou adulterados configura CRIME (Art. 171 e 298 CP). Ao prosseguir, você assume total responsabilidade civil e criminal.</p>
                                <button onClick={async () => { if (!proofFile) { showNotification('ANEXE O COMPROVANTE.', 'error'); return; } await depositToWalletAction(); setDepositStage('amount'); }} disabled={isSubmitting || !proofFile} className="w-full py-3 bg-blue-500 text-white rounded-xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg disabled:opacity-50">
                                    {isSubmitting ? <><Loader2 size={14} className="animate-spin" /> Enviando...</> : <><Upload size={14} /> Enviar Comprovante</>}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {isCheckoutModalOpen && (
                <div className="fixed inset-0 z-[999] bg-black/60 backdrop-blur-sm" onClick={() => setIsCheckoutModalOpen(false)}>
                    <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 md:max-w-lg md:mx-auto bg-white rounded-2xl shadow-2xl p-4 max-h-[82vh] overflow-y-auto overflow-x-hidden flex flex-col space-y-3 z-50 border border-slate-100 font-sans" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center shrink-0">
                            <h3 className="font-black text-base uppercase tracking-tight">Finalizar Venda</h3>
                            <button onClick={() => setIsCheckoutModalOpen(false)} className="w-7 h-7 bg-slate-100 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-200"><X size={16}/></button>
                        </div>

                        <div className="flex flex-col space-y-3">
                            <div>
                                <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Local de Entrega</p>
                                <div className="flex gap-2 mb-2">
                                    <button onClick={() => setDeliveryType('intern')} className={`flex-1 py-2 rounded-xl font-black text-[10px] uppercase tracking-wide border-2 transition-all ${deliveryType === 'intern' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-500'}`}>
                                        <Home size={12} className="inline-block mr-1.5 -mt-0.5" /> Interno em Cela
                                    </button>
                                    <button onClick={() => setDeliveryType('worker')} className={`flex-1 py-2 rounded-xl font-black text-[10px] uppercase tracking-wide border-2 transition-all ${deliveryType === 'worker' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-500'}`}>
                                        <HardHat size={12} className="inline-block mr-1.5 -mt-0.5" /> Trabalhador
                                    </button>
                                </div>
                                {deliveryType === 'intern' ? (
                                    <div className="flex flex-col gap-1">
                                        <div className="flex gap-2">
                                            <input className="flex-1 bg-slate-50 py-2 px-3 rounded-xl border border-slate-200 font-bold text-sm" placeholder="RAIO" value={location.ray} onChange={e => setLocation({...location, ray: e.target.value})} />
                                            <input className="flex-1 bg-slate-50 py-2 px-3 rounded-xl border border-slate-200 font-bold text-sm" placeholder="ALA" value={location.wing} onChange={e => setLocation({...location, wing: e.target.value})} />
                                        </div>
                                        <input className="w-full bg-slate-50 py-2 px-3 rounded-xl border border-slate-200 font-bold text-sm" placeholder="CELA" value={location.cell} onChange={e => setLocation({...location, cell: e.target.value})} />
                                    </div>
                                ) : (
                                    <div className="flex flex-col gap-1">
                                        <div className="grid grid-cols-2 gap-2">
                                            {['Cozinha', 'Lavanderia', 'Horta', 'Oficina', 'Almoxarifado'].map(loc => (
                                                <button key={loc} onClick={() => setDeliveryFreeText(loc)} className={`py-2 rounded-xl font-black text-[10px] uppercase border-2 transition-all ${deliveryFreeText === loc ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'}`}>
                                                    {loc}
                                                </button>
                                            ))}
                                        </div>
                                        <input className="w-full bg-slate-50 py-2 px-3 rounded-xl border border-slate-200 font-bold text-sm" placeholder="Outro local de trabalho..." value={deliveryFreeText} onChange={e => setDeliveryFreeText(e.target.value)} />
                                    </div>
                                )}
                            </div>

                            <div>
                                <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Forma de Pagamento</p>
                                <div className="grid grid-cols-2 gap-2">
                                    <button onClick={() => setCartPaymentMethod('WALLET')} disabled={!isAdmin} className={`p-3 rounded-xl font-black text-[11px] uppercase tracking-wide border-2 transition-all active:scale-95 ${cartPaymentMethod === 'WALLET' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'} ${!isAdmin ? 'opacity-40 cursor-not-allowed grayscale' : ''}`}>
                                        <Wallet size={12} className="inline-block mr-1.5 -mt-0.5" /> Saldo
                                    </button>
                                    <button onClick={() => setCartPaymentMethod('PIX')} className={`p-3 rounded-xl font-black text-[11px] uppercase tracking-wide border-2 transition-all active:scale-95 ${cartPaymentMethod === 'PIX' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}>
                                        <Smartphone size={12} className="inline-block mr-1.5 -mt-0.5" /> PIX
                                    </button>
                                </div>

                                {cartPaymentMethod === 'PIX' && (
                                    <div className="mt-3 p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl text-center space-y-2">
                                        {pixPayload && (
                                            <>
                                                <div>
                                                    <div className="flex items-center gap-2 justify-center mb-1">
                                                        <CreditCard size={12} className="text-emerald-600" />
                                                        <span className="text-[8px] font-black uppercase tracking-[0.3em] text-emerald-600">Escaneie para Pagar</span>
                                                    </div>
                                                    <div className="bg-white rounded-xl p-2 inline-block shadow-lg">
                                                        <QRCodeSVG value={pixPayload} size={130} level="H" bgColor="#ffffff" fgColor="#022c22" includeMargin={true} />
                                                    </div>
                                                </div>
                                                {settings?.pixKeys?.[0] && (
                                                    <div className="bg-white rounded-xl p-2 border border-slate-200">
                                                        <p className="text-[7px] font-black text-emerald-500 uppercase tracking-[0.3em] mb-1">Chave Copia e Cola</p>
                                                        <input readOnly value={pixPayload} className="w-full text-[10px] font-mono text-slate-500 bg-transparent outline-none text-center select-all mb-1 break-all" onClick={(e) => (e.target as HTMLInputElement).select()} />
                                                        <button
                                                            onClick={() => {
                                                                navigator.clipboard.writeText(pixPayload);
                                                                setPixCopied(true);
                                                                setTimeout(() => setPixCopied(false), 2000);
                                                            }}
                                                            className="w-full py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-lg text-xs transition-all active:scale-95 flex items-center justify-center gap-2"
                                                        >
                                                            {pixCopied ? 'CÓDIGO COPIADO COM SUCESSO!' : 'COPIAR CHAVE PIX COPIA E COLA'}
                                                        </button>
                                                    </div>
                                                )}
                                            </>
                                        )}
                                        {!pixPayload && (
                                            <p className="text-[10px] font-black text-amber-600 uppercase tracking-wider text-left"><AlertCircle size={12} className="inline-block mr-1 -mt-0.5" />Chave PIX ainda não cadastrada — o pagamento será confirmado com o comprovante anexado.</p>
                                        )}
                                        <div className="bg-slate-50 rounded-xl border border-slate-200 p-3">
                                            <p className="text-[8px] font-black text-slate-400 uppercase mb-2 text-left">Comprovante de Pagamento</p>
                                            <label className="flex items-center gap-2 bg-white p-3 rounded-xl border-2 border-dashed border-slate-300 cursor-pointer hover:border-emerald-400 hover:bg-emerald-50/30 transition-all active:scale-[0.98]">
                                                <Upload size={16} className="text-emerald-500 shrink-0" />
                                                <span className="text-[10px] font-bold text-slate-700 text-left leading-tight break-all">{proofFile ? proofFile.name : 'CLIQUE AQUI PARA ENVIAR O COMPROVANTE PIX'}</span>
                                                <input type="file" accept="image/*,.pdf" className="hidden" onChange={async e => {
                                                const f = e.target.files?.[0]; if (!f) return;
                                                try {
                                                    const compressed = await compressImageFile(f, 0.3, 600);
                                                    setProofFile(new File([compressed], f.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }));
                                            } catch { console.warn("compress fallback (fileInput 1)"); setProofFile(f); }
                                                e.target.value = '';
                                            }} />
                                            </label>
                                            {proofFile && (
                                                <p className="text-[8px] text-emerald-600 font-bold mt-1 text-left break-all">Arquivo selecionado: {proofFile.name}</p>
                                            )}
                                            <p className="text-[11px] font-bold text-red-600 text-center mt-2 leading-tight"><AlertCircle size={12} className="inline-block mr-1 -mt-0.5" />Enviar comprovantes falsos ou adulterados configura CRIME (Art. 171 e 298 CP). Ao confirmar, você assume total responsabilidade civil e criminal.</p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="flex justify-between items-center py-2 border-t border-slate-100">
                                <span className="text-xs font-black text-slate-400 uppercase">Total</span>
                                <span className="text-xl font-black text-slate-900">R$ {formatarMoeda(cartTotal)}</span>
                            </div>

                            <button onClick={handleFinish} disabled={isSubmitting || (cartPaymentMethod === 'PIX' && !proofFile)} className="w-full py-3 bg-slate-900 text-white font-black rounded-2xl uppercase text-xs shadow-xl active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shrink-0">
                                {isSubmitting ? <><Loader2 size={14} className="animate-spin" /> Processando...</> : (cartPaymentMethod === 'PIX' && !proofFile) ? <><Paperclip size={14} className="inline-block mr-1 -mt-0.5" /> Anexe o Comprovante para Confirmar</> : 'Confirmar Pedido'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {viewingOrderCupom && (
                <div className="fixed inset-0 z-[5000] flex items-center justify-center bg-black/60 backdrop-blur-md p-4 print:p-0 print:bg-white" onClick={() => setViewingOrderCupom(null)}>
                    <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden print:shadow-none print:w-[76mm] print:mx-auto" onClick={e => e.stopPropagation()}>
                        <div className="p-4 border-b border-slate-100 flex justify-between items-center print:hidden">
                            <span className="font-black text-xs uppercase">Recibo</span>
                            <button onClick={() => setViewingOrderCupom(null)} className="text-slate-400"><X size={20}/></button>
                        </div>
                        <div className="p-6 bg-slate-50 flex justify-center">
                            <CupomEntrega
                                order={viewingOrderCupom}
                                printerName="Térmica 80mm"
                                customText={settings.customReceiptText}
                                title={settings.customReceiptTitle}
                                subtitle={settings.customReceiptSubtitle}
                                docName={settings.customReceiptDocName}
                                remainingBalance={viewingOrderCupom.walletBalanceAfter}
                            />
                        </div>
                        <div className="p-4 bg-white border-t border-slate-100 print:hidden">
                            <button onClick={() => imprimirComPrioridadeFiscal({ type: 'CUPOM', data: viewingOrderCupom }, settings).catch(console.error)} className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-black text-xs uppercase shadow-lg shadow-emerald-500/20">Imprimir Comprovante</button>
                        </div>
                        <style>{`
                          @media print {
                            body { background: white !important; }
                            @page { margin: 0 !important; }
                            .print\\:hidden { display: none !important; }
                          }
                        `}</style>
                    </div>
                </div>
            )}

            <input
                ref={resendInputRef}
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={handleResendProofFile}
            />
        </div>
    );
};
