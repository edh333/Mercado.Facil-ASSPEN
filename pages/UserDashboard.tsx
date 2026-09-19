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

import { generatePixPayload, formatarMoeda, compressImageFile, copiarTextoComFallback } from '../utils';
import { imprimirComPrioridadeFiscal } from '../utils/printUtils';
import { toDate } from '../utils/dateUtils';
import { collection, query, where, onSnapshot, orderBy, limit, getDocs, getDocsFromServer } from 'firebase/firestore';
import { db } from '../firebase';
import { QRCodeSVG } from 'qrcode.react';
import { motion, AnimatePresence } from 'framer-motion';
import { OnlineStatusIndicator } from '../components/OnlineStatusIndicator';
import { InstallButton } from '../components/InstallButton';
import { UninstallModal } from '../components/UninstallModal';
import { PageHeader, UiButton, ModalShell } from '../components/ui';

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
    const [cart, setCart] = useState<CartItem[]>(() => {
        // Carrinho persiste entre sessões: familiar fecha o app e não perde a compra.
        try {
            const raw = localStorage.getItem(`mf_cart_${currentUser?.id || 'anon'}`);
            const parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? parsed : [];
        } catch { return []; }
    });
    const [isMsgOpen, setIsMsgOpen] = useState(false);
    const [showUninstallModal, setShowUninstallModal] = useState(false);
    const [confirmarLimpar, setConfirmarLimpar] = useState(false);
    const [confirmarSair, setConfirmarSair] = useState(false);
    const [sortOpt, setSortOpt] = useState<'relevance' | 'price_asc' | 'price_desc' | 'name'>('relevance');
    const [catFilter, setCatFilter] = useState<string>('ALL');
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
        // Guarda: eventos que alteram o carrinho (clear/new) só fazem sentido
        // no modo PDV do admin e NUNCA com o foco num campo de digitação.
        const digitandoEmCampo = () => {
            const el = document.activeElement as HTMLElement | null;
            if (!el) return false;
            const tag = el.tagName;
            return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
        };
        const hClear = () => { if (isAdmin && !digitandoEmCampo()) setCart([]); };
        const hNew = () => { if (isAdmin && !digitandoEmCampo()) { setCart([]); setStage('cart'); } };
        const hOpen = () => { if (isAdmin && !digitandoEmCampo()) { setIsCheckoutModalOpen(true); setStage('cart'); } };
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
                    items.sort((a, b) => (toDate(b.createdAt || b.date)?.getTime() || 0) - (toDate(a.createdAt || a.date)?.getTime() || 0));
                    setMyOrders(items.slice(0, 20));
                    setLoadingOrders(false);
                }
            } catch { console.warn("order listener error"); /* silencioso — o servidor cobre */ }

            // 2. Refresh do servidor em segundo plano (dados frescos)
            try {
                const snapshot = await getDocsFromServer(q);
                const items = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as Order)).filter(o => (o as any).deleted !== true);
                items.sort((a, b) => (toDate(b.createdAt || b.date)?.getTime() || 0) - (toDate(a.createdAt || a.date)?.getTime() || 0));
                setMyOrders(items.slice(0, 20));
            } catch {
                try {
                    const qFallback = query(collection(db, 'orders'), where('userId', '==', currentUser.id), limit(100));
                    const snapshot = await getDocsFromServer(qFallback);
                    const items = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as Order)).filter(o => (o as any).deleted !== true);
                    items.sort((a, b) => (toDate(b.createdAt || b.date)?.getTime() || 0) - (toDate(a.createdAt || a.date)?.getTime() || 0));
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
                    items.sort((a, b) => (toDate(b.createdAt || b.date)?.getTime() || 0) - (toDate(a.createdAt || a.date)?.getTime() || 0));
                    setMyOrders(items.slice(0, 20));
                }, () => {});
            } catch { console.warn("orders snapshot error"); }
        }

        // === WALLET: extrato em TEMPO REAL (crédito entra sem recarregar) ===
        let unsubWallet: (() => void) | undefined;
        const qWallet = query(
            collection(db, 'wallet_transactions'),
            where('userId', '==', currentUser.id),
            orderBy('createdAt', 'desc'),
            limit(50)
        );
        const aplicarWallet = (snapshot: any) => {
            const items = snapshot.docs.map((d: any) => ({ ...d.data(), id: d.id } as WalletTransaction));
            items.sort((a: any, b: any) => (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0));
            setWalletTxs(items);
        };
        try {
            unsubWallet = onSnapshot(qWallet, (snapshot) => aplicarWallet(snapshot), async () => {
                try { setWalletTxs(await getWalletTransactions(currentUser.id)); } catch { console.warn("wallet txs fallback"); }
            });
        } catch {
            getWalletTransactions(currentUser.id).then(r => setWalletTxs(r)).catch(() => console.warn("wallet txs fetch"));
        }

        // === KEYBOARD ===
        // Guarda de foco: atalhos NÃO devem disparar enquanto o operador digita
        // num campo (busca de produto/cliente, senha, etc.) — F7 (cancelar) não
        // pode limpar a venda por acidente no meio de uma digitação.
        const digitandoEmCampo = () => {
            const el = document.activeElement as HTMLElement | null;
            if (!el) return false;
            const tag = el.tagName;
            return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            if (digitandoEmCampo() && e.key !== 'Escape') return;
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
                    cancelSale();
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
        // Atalhos de teclado (F2/F4/F6/F7/F8/F9): exclusivos do modo PDV do admin.
        // O familiar usa toque; atalhos globais só atrapalhariam no desktop.
        if (isAdmin) window.addEventListener('keydown', handleKeyDown);

        return () => {
            if (unsubOrders) unsubOrders();
            if (unsubWallet) unsubWallet();
            if (isAdmin) window.removeEventListener('keydown', handleKeyDown);
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
        const termo = (searchTerm || '').toLowerCase().trim();
        const base = safeProducts.filter(p => {
            if (p.available === false) return false;
            // Canal de vendas: usuário só vê produtos 'both' ou 'user'
            if (p.salesChannel && p.salesChannel !== 'both' && p.salesChannel !== 'user') return false;
            if (catFilter !== 'ALL' && (p.category || '').trim() !== catFilter) return false;
            if (!termo) return true;
            const alvo = `${p.name || ''} ${p.brand || ''} ${p.category || ''} ${p.description || ''}`.toLowerCase();
            return alvo.includes(termo);
        });
        const lista = [...base];
        const precoDe = (p: any) => {
            const prom = Number(p?.promoPrice) || 0;
            const normal = Number(p?.price) || 0;
            return prom > 0 && prom < normal ? prom : normal;
        };
        if (sortOpt === 'price_asc') lista.sort((a, b) => precoDe(a) - precoDe(b));
        else if (sortOpt === 'price_desc') lista.sort((a, b) => precoDe(b) - precoDe(a));
        else if (sortOpt === 'name') lista.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'));
        return lista;
    }, [safeProducts, searchTerm, catFilter, sortOpt]);

    const categorias = useMemo(() =>
        Array.from(new Set(safeProducts.filter(p => p.available !== false && (!p.salesChannel || p.salesChannel === 'both' || p.salesChannel === 'user')).map(p => (p.category || '').trim()).filter(Boolean)))
            .sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [safeProducts]);

    const myMessages = useMemo(() => {
        return safeMessages.filter(m => m.userId === currentUser?.id || m.userId === 'ALL');
    }, [safeMessages, currentUser]);

    const unreadMsg = useMemo(() => {
        return myMessages.filter(m => !m.read && m.fromAdmin).length;
    }, [myMessages]);

    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setSearchTerm(val);

        // Leitor de código de barras: exclusivo do modo PDV (admin).
        // O familiar navega pela vitrine e digita o nome do produto normalmente.
        if (!isAdmin) return;

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

    // Preço praticado: promoPrice ativo é a fonte da verdade (mesma regra do servidor).
    const precoEfetivo = (p: any): number => {
        const promo = Number(p?.promoPrice);
        return Number.isFinite(promo) && promo > 0 ? promo : Number(p?.price || 0);
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
                priceAtPurchase: precoEfetivo(product)
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
            // Dois toques no lugar do confirm nativo do navegador: sem janela feia,
            // com desarme automático e impossível de apagar o carrinho sem querer.
            if (cart.length > 0 && !confirmarLimpar) {
                setConfirmarLimpar(true);
                window.setTimeout(() => setConfirmarLimpar(false), 3500);
                return;
            }
            setConfirmarLimpar(false);
            setCart([]);
            setStage('cart');
            showNotification('Carrinho esvaziado!', 'success');
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
            const price = item.priceAtPurchase ?? (prod ? precoEfetivo(prod) : (item.price || 0));
            return acc + Math.round(price * 100) * (item.quantity || 0);
        }, 0);
        return cents / 100;
    })();

    const totalItensNoCarrinho = (cart || []).reduce((sum, item) => sum + (item.quantity || 0), 0);

    // Persistência do carrinho entre sessões
    useEffect(() => {
        try { localStorage.setItem(`mf_cart_${currentUser?.id || 'anon'}`, JSON.stringify(cart)); } catch { /* quota */ }
    }, [cart, currentUser?.id]);

    // Saneamento do carrinho persistido: remove itens de produtos APAGADOS do catálogo
    // (o checkout travava com erro "Produto não encontrado: <uuid>") e RE-PREÇA os demais
    // com o valor praticado atual — promoção entrou ou saiu, o total exibido acompanha.
    useEffect(() => {
        if (!safeProducts.length) return;
        const ids = new Set(safeProducts.map(p => String(p.id)));
        let removidos: string[] = [];
        setCart(prev => {
            const proximo: CartItem[] = [];
            for (const item of prev) {
                if (String(item.productId).startsWith('SERVICE-')) { proximo.push(item); continue; }
                const prod = safeProducts.find(p => String(p.id) === String(item.productId));
                if (!prod) { removidos.push(item.name || 'Item'); continue; }
                const novoPreco = precoEfetivo(prod);
                const inalterado = Math.round(novoPreco * 100) === Math.round(Number(item.priceAtPurchase ?? novoPreco) * 100);
                proximo.push(inalterado ? item : { ...item, priceAtPurchase: novoPreco });
            }
            const mudou = proximo.length !== prev.length || proximo.some((it, i) => it !== prev[i]);
            return mudou ? proximo : prev;
        });
        if (removidos.length) showNotification(`${removidos.length} ${removidos.length === 1 ? 'item saiu' : 'itens saíram'} do catálogo e ${removidos.length === 1 ? 'foi removido' : 'foram removidos'} do carrinho.`, 'error');
    }, [safeProducts]);

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

    const getStatusStyle = (status: string) => {
        const s = (status || '').toLowerCase();
        if (s.includes('cancel')) return 'bg-red-100 text-red-700';
        if (s.includes('deliver') || s.includes('entregue')) return 'bg-emerald-100 text-emerald-700';
        if (s === 'paid' || s.includes('pago')) return 'bg-green-100 text-green-700';
        if (s.includes('separa') || s.includes('prepar')) return 'bg-indigo-100 text-indigo-700';
        if (s.includes('saiu') || s.includes('delivery')) return 'bg-sky-100 text-sky-700';
        return 'bg-amber-100 text-amber-700';
    };

    const getWalletStatus = (tx: any) => {
        const s = String(tx?.status || '').toLowerCase();
        if (s.includes('approv') || s === 'paid' || s === 'pago') return { label: 'Aprovado', cls: 'bg-green-100 text-green-700' };
        if (s.includes('reject')) return { label: 'Rejeitado', cls: 'bg-red-100 text-red-700' };
        return { label: 'Pendente', cls: 'bg-amber-100 text-amber-700' };
    };

    const handleLogout = () => {
        // Dois toques no lugar do confirm nativo: desarma sozinho em 3,5s.
        if (!confirmarSair) {
            setConfirmarSair(true);
            window.setTimeout(() => setConfirmarSair(false), 3500);
            return;
        }
        setConfirmarSair(false);
        logout();
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
            showNotification("Saldo insuficiente. Envie crédito primeiro.", "error");
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
                        priceAtPurchase: p ? precoEfetivo(p) : (i.price || 0),
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
            showNotification("Erro ao enviar pedido: " + (e.message || "Falha na conexão"), "error");
        } finally {
            submittingRef.current = false;
            setIsSubmitting(false);
        }
    };

    const depositSubmittingRef = useRef(false);

    const depositToWalletAction = async () => {
        // Anti duplo-toque síncrono: dois depósitos com o mesmo comprovante
        // criavam duas pendências; se ambas fossem aprovadas, crédito duplicado.
        if (depositSubmittingRef.current) return;
        if (!proofFile) {
            showNotification("Por favor, anexe o comprovante PIX.", "error");
            return;
        }
        if (depositAmount <= 0) {
            showNotification("Informe o valor do depósito.", "error");
            return;
        }
        if (depositAmount > 100000) {
            // Mesmo teto do servidor (aprovarDeposito). Sem isso, o familiar pagava
            // um valor que o sistema é estruturalmente proibido de aprovar.
            showNotification("Valor acima do limite permitido por depósito (R$ 100.000,00).", "error");
            return;
        }
        depositSubmittingRef.current = true;
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
            depositSubmittingRef.current = false;
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
            // A chave PIX vai INTEIRA para o gerador (CPF/CNPJ/telefone/e-mail/EVP).
            // O strip de dígitos antigo mutilava chaves e-mail/EVP → pagamento ia pro lugar errado.
            const chavePix = (settings?.pixKeys?.[0] || settings?.cnpj || '').trim();
            if (!chavePix) return;
            const merchantName = settings?.appName || 'ASSOCIACAO ASSPEN MT';
            const cidade = 'PEIXOTO DE AZEVEDO';
            const payload = generatePixPayload(chavePix, merchantName, cidade, cartTotal, '***');
            setPixPayload(payload);
        }
    }, [isCheckoutModalOpen, cartPaymentMethod, cartTotal, settings]);

    // Geração do PIX para o modal de depósito (2 etapas)
    useEffect(() => {
        if (isDepositOpen && depositAmount > 0) {
            const chavePix = (settings?.pixKeys?.[0] || settings?.cnpj || '').trim();
            if (!chavePix) return;
            const merchantName = settings?.appName || 'ASSOCIACAO ASSPEN MT';
            const cidade = 'PEIXOTO DE AZEVEDO';
            const payload = generatePixPayload(chavePix, merchantName, cidade, depositAmount, 'DEPOSITO');
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
                                        <button onClick={() => updateQty(item.productId, 1)} className="w-6 h-6 rounded-full border bg-white shadow-sm flex items-center justify-center font-bold text-xs transition-all active:scale-95 text-slate-700 cursor-pointer hover:bg-emerald-50 hover:text-[var(--primary-color)] hover:border-emerald-300">+</button>
                                    </div>
                                </td>
                                <td className="text-slate-600 font-medium text-xs font-mono text-center py-2">R$ {formatarMoeda(displayPrice)}</td>
                                <td className="font-black text-slate-900 text-sm text-center font-mono py-2">R$ {formatarMoeda(displayPrice * item.quantity)}</td>
                                <td className="py-2 text-center">
                                    <button onClick={() => removeFromCart(item.productId)} className="text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition-all active:scale-95 text-xs font-black flex items-center justify-center gap-1 mx-auto cursor-pointer">
                                        <Trash2 size={12} className="inline-block mr-1" /> REMOVER
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
        <div style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: '16px', width: '100%', minWidth: 0, minHeight: 'calc(100vh - 140px)' }}>

            {/* PAINEL ESQUERDO — 35% — DESTAQUE DO ITEM ATUAL */}
            <div className="bg-slate-900 text-white rounded-2xl p-5 flex flex-col justify-between shadow-xl relative border border-slate-800 font-mono" style={{ width: '100%', maxWidth: '100%', flexGrow: 1, flexBasis: '280px', flexShrink: 1, minHeight: '320px' }}>
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
            <div style={{ flexGrow: 1, flexBasis: '300px', flexShrink: 1, minWidth: 0, display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: '16px' }}>

                {/* COLUNA DA TABELA + ATALHOS */}
                <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', minWidth: 0 }}>

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
                    <div className="max-h-[calc(100vh-320px)] overflow-x-auto overflow-y-auto border border-slate-200 rounded-xl bg-white" style={{ flex: 1, minHeight: 0 }}>
                        <table className="w-full text-[12px] font-mono">
                            <thead className="text-white font-black text-xs uppercase text-center tracking-wider sticky top-0 z-10 bg-[var(--primary-color)]">
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
                                                    <button onClick={() => updateQty(item.productId, -1)} className="w-9 h-9 rounded-full border bg-white shadow-sm flex items-center justify-center font-bold text-xs transition-all active:scale-95 text-slate-700 cursor-pointer hover:bg-red-50 hover:text-red-500 hover:border-red-300">−</button>
                                                    <span className="font-black text-sm text-slate-900 min-w-[28px] text-center">{item.quantity}</span>
                                                    <button onClick={() => updateQty(item.productId, 1)} className="w-9 h-9 rounded-full border bg-white shadow-sm flex items-center justify-center font-bold text-xs transition-all active:scale-95 text-slate-700 cursor-pointer hover:bg-emerald-50 hover:text-[var(--primary-color)] hover:border-emerald-300">+</button>
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
                        <button onClick={() => { if (cart.length > 0) setIsCheckoutModalOpen(true); }} disabled={cart.length === 0} className="flex-1 py-2.5 bg-[var(--primary-color)] hover:brightness-110 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-black rounded-xl text-[10px] uppercase tracking-wider transition-all active:scale-[0.98] cursor-pointer shadow-sm inline-flex items-center justify-center gap-1.5"><Banknote size={12} /> [F8] Checkout</button>
                    </div>
                </div>

                {/* SIDEBAR DIREITA — CLIENTE / TOTAL / CHECKOUT */}
                <div className="flex flex-col gap-3" style={{ flex: '1 1 220px', maxWidth: '100%' }}>
                    {/* CLIENTE NO TOPO */}
                    <div className="bg-white border border-slate-200 rounded-xl p-4">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Cliente</p>
                        <p className="font-black text-xs text-slate-900 uppercase truncate">{currentUser?.name || 'CONSUMIDOR'}</p>
                        <p className="text-[10px] text-slate-500 font-bold">Saldo: R$ {formatarMoeda(currentUser?.walletBalance || 0)}</p>
                    </div>

                    {/* TOTAL GERAL GIGANTE */}
                    <div className="bg-[var(--primary-color)] rounded-xl p-5 text-center shadow-sm flex-1 flex flex-col items-center justify-center">
                        <p className="text-[10px] font-black text-white/70 uppercase tracking-widest mb-2">TOTAL GERAL</p>
                        <p className="font-black text-4xl text-white tracking-tight leading-none">R$ {formatarMoeda(cartTotal)}</p>
                    </div>

                    {/* BOTÃO CHECKOUT VERDE — CHUMBADO NA BASE */}
                    <button
                        onClick={() => { if (cart.length > 0) setIsCheckoutModalOpen(true); }}
                        disabled={cart.length === 0}
                        className="w-full py-4 bg-[var(--primary-color)] hover:brightness-110 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-black rounded-xl text-xs uppercase tracking-wider transition-all active:scale-[0.98] shadow-sm"
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
                    <div className="mb-2 flex items-center gap-3 rounded-xl border border-[var(--primary-color)]/30 bg-[var(--primary-color)]/5 p-3">
                        {/* Saldo */}
                        <div className="flex-1 min-w-0 leading-tight">
                            <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Saldo</p>
                            <p className="text-lg font-bold tracking-tight text-slate-900">
                                <span className="text-[10px] font-semibold text-slate-500 mr-0.5">R$</span>
                                {formatarMoeda(currentUser?.walletBalance || 0)}
                            </p>
                        </div>

                        {/* Ícone de Mensagens */}
                        <button
                            onClick={() => setIsMsgOpen(!isMsgOpen)}
                            aria-label="Mensagens"
                            aria-expanded={isMsgOpen}
                            className="relative size-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-500 hover:border-[var(--primary-color)]/40 hover:text-[var(--primary-color)] active:scale-95 transition-all shrink-0"
                        >
                            <MessageSquare size={17} />
                            {unreadMsg > 0 && (
                                <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[8px] min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center font-bold border-2 border-white">{unreadMsg}</span>
                            )}
                        </button>

                        {/* Ícone de Instalar App */}
                        {!isStandalone && (
                            <InstallButton role="user" />
                        )}

                        {/* Botão Enviar Crédito */}
                        <button
                            onClick={() => { setIsDepositOpen(true); setStage('pay'); setDepositAmount(0); }}
                            className="bg-[var(--primary-color)] text-white px-3 py-2.5 rounded-xl font-semibold text-[11px] shadow-sm active:scale-95 hover:brightness-110 transition-all flex items-center gap-1 shrink-0"
                        >
                            <Plus size={14} />
                            <span>Crédito</span>
                        </button>
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
                        className="w-full pl-14 pr-12 py-4 rounded-2xl border-2 border-slate-300 focus:border-[var(--primary-color)] outline-none bg-slate-50 text-sm font-bold shadow-sm" 
                        placeholder="Buscar produto..." 
                        value={searchTerm} 
                        onChange={handleSearchChange}
                        autoComplete="off" 
                    />
                    {searchTerm && (
                        <button onClick={() => setSearchTerm('')} title="Limpar busca" aria-label="Limpar busca" className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-slate-400 transition-all active:scale-90">
                            <X size={16} />
                        </button>
                    )}
                </div>
            </div>

            {/* Chips de categoria */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
            {categorias.length > 1 && (
                <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 min-w-0" style={{ scrollbarWidth: 'none' }}>
                    {[{ id: 'ALL', label: `Tudo (${safeProducts.filter(p => p.available !== false).length})` },
                      ...categorias.map(c => ({ id: c, label: c }))]
                        .map(cat => (
                            <button
                                key={cat.id}
                                onClick={() => setCatFilter(cat.id)}
                                className={`shrink-0 px-4 py-2 rounded-full text-[11px] font-bold uppercase tracking-wide border transition-all active:scale-95 ${catFilter === cat.id ? 'bg-[var(--primary-color)] text-white border-[var(--primary-color)] shadow-sm' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}
                            >
                                {cat.label}
                            </button>
                        ))}
                </div>
            )}
            {filteredProducts.length > 1 && (
                <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                    <label htmlFor="sortSelect" className="text-[10px] font-bold uppercase tracking-wide text-slate-400 hidden sm:block">Ordenar</label>
                    <select
                        id="sortSelect"
                        value={sortOpt}
                        onChange={(e) => setSortOpt(e.target.value as any)}
                        aria-label="Ordenar produtos"
                        className="text-[11px] font-bold text-slate-600 bg-white border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-[var(--primary-color)] cursor-pointer"
                    >
                        <option value="relevance">Relevância</option>
                        <option value="price_asc">Menor preço</option>
                        <option value="price_desc">Maior preço</option>
                        <option value="name">Nome A-Z</option>
                    </select>
                </div>
            )}
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
                    const emOferta = Number(p?.promoPrice) > 0 && Number(p?.promoPrice) < Number(p?.price || 0);
                    return (
                        <div
                            key={p?.id || `prod-${idx}`}
                            className={`bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-slate-300 transition-all duration-200 p-3 flex flex-col justify-between h-full relative ${isOutOfStock ? 'opacity-60 grayscale' : 'cursor-pointer active:scale-[0.98]'}`}
                            onClick={() => { if (!isOutOfStock) addToCart(p); }}
                        >
                            <div className="w-full aspect-square rounded-lg overflow-hidden bg-slate-50 border border-slate-100 mb-2.5 relative">
                                <img src={p.imageUrl || 'https://placehold.co/200'} className="w-full h-full object-contain" alt={p.name} loading="lazy" />
                                {emOferta && !isOutOfStock && (
                                    <span className="absolute top-1.5 left-1.5 bg-red-500 text-white text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider shadow">Oferta</span>
                                )}
                                {isOutOfStock && (
                                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                        <span className="text-[10px] font-bold bg-white text-slate-900 px-3 py-1 rounded-full">Esgotado</span>
                                    </div>
                                )}
                            </div>
                            <div className="flex-1 flex flex-col justify-between">
                                <h4 className="text-slate-800 font-medium text-[13px] leading-snug line-clamp-2 mb-2">{p.name}</h4>
                                <div className="flex items-center justify-between gap-2">
                                    <div className="leading-none min-w-0">
                                        {emOferta && (
                                            <span className="block text-[10px] font-semibold text-slate-400 line-through mb-0.5">R$ {formatarMoeda(p.price)}</span>
                                        )}
                                        <span className={`font-bold text-sm ${emOferta ? 'text-red-600' : 'text-[var(--primary-color)]'}`}>R$ {formatarMoeda(precoEfetivo(p))}</span>
                                    </div>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); if (!isOutOfStock) addToCart(p); }}
                                        disabled={isOutOfStock}
                                        aria-label={`Adicionar ${p.name} ao carrinho`}
                                        className="bg-[var(--primary-color)] hover:brightness-110 text-white rounded-lg p-2 transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer shadow-sm shrink-0"
                                    >
                                        <Plus size={15} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
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

            <PageHeader
                zClass="z-[100]"
                icon={<ShoppingBag size={18} />}
                title={settings?.appName || 'Mercado Fácil'}
                subtitle={currentUser?.name || 'Visitante'}
                center={
                    (settings?.enablePrisonerWallet ?? true) && !isAdmin && (
                        <>
                            <div className="hidden sm:flex items-center gap-3 rounded-full border border-slate-200 bg-slate-50 px-4 py-2">
                                <div className="text-right leading-tight">
                                    <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">Saldo Disponível</p>
                                    <p className="text-sm font-bold tracking-tight text-[var(--primary-color)]">R$ {formatarMoeda(currentUser?.walletBalance || 0)}</p>
                                </div>
                                <UiButton
                                    size="sm"
                                    icon={<Plus size={15} />}
                                    onClick={() => { setIsDepositOpen(true); setStage('pay'); }}
                                >
                                    Enviar Crédito
                                </UiButton>
                            </div>
                            <div className="hidden md:flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
                                <button
                                    onClick={() => setActiveTab('store')}
                                    className={`flex items-center gap-2 rounded-md px-4 py-2 text-xs font-semibold transition-colors ${activeTab === 'store' ? 'bg-[var(--primary-color)] text-white shadow-sm' : 'text-slate-500 hover:bg-white hover:text-slate-900'}`}
                                >
                                    <ShoppingBag size={14} /> Loja
                                </button>
                                <button
                                    onClick={() => setActiveTab('orders')}
                                    className={`flex items-center gap-2 rounded-md px-4 py-2 text-xs font-semibold transition-colors ${activeTab === 'orders' ? 'bg-[var(--primary-color)] text-white shadow-sm' : 'text-slate-500 hover:bg-white hover:text-slate-900'}`}
                                >
                                    <Clock size={14} /> Pedidos
                                </button>
                            </div>
                        </>
                    )
                }
                actions={
                    <div className="flex gap-1.5 relative z-10">
                        <UiButton
                            size="sm"
                            icon={<Printer size={17} />}
                            onClick={() => {
                                if (myOrders.length > 0) {
                                    setViewingOrderCupom(myOrders[0]);
                                } else {
                                    showNotification('Nenhum pedido encontrado para reimpressão.', 'error');
                                }
                            }}
                            disabled={myOrders.length === 0}
                            title="Reimprimir Último Cupom"
                            aria-label="Reimprimir último cupom"
                            className="flex shrink-0 size-10 border border-slate-200 bg-white text-slate-500 items-center justify-center shadow-sm hover:border-[var(--primary-color)]/40 hover:text-[var(--primary-color)] disabled:opacity-70 disabled:shadow-none"
                        />
                        <UiButton
                            size="sm"
                            icon={<MessageSquare size={17} />}
                            onClick={() => setIsMsgOpen(!isMsgOpen)}
                            aria-label="Mensagens"
                            aria-expanded={isMsgOpen}
                            className={`relative flex shrink-0 size-11 border border-slate-200 bg-white text-slate-500 items-center justify-center shadow-sm hover:border-[var(--primary-color)]/40 hover:text-[var(--primary-color)] ${isMsgOpen ? 'border-[var(--primary-color)] text-[var(--primary-color)] shadow-md' : ''}`}
                        >
                            {unreadMsg > 0 && <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center font-bold border-2 border-white">{unreadMsg}</span>}
                        </UiButton>
                        {!isAdmin && !isStandalone && (
                            <span className="hidden sm:inline-flex"><InstallButton role="user" /></span>
                        )}
                        <UiButton
                            size="sm"
                            icon={<Trash2 size={17} />}
                            onClick={() => setShowUninstallModal(true)}
                            title="Desinstalar aplicativo"
                            aria-label="Desinstalar aplicativo"
                            className="flex shrink-0 size-11 border border-slate-200 bg-white text-slate-500 items-center justify-center shadow-sm hover:bg-red-50 hover:text-red-500 hover:border-red-200"
                        />
                        <UiButton
                            size="sm"
                            icon={<LogOut size={17} />}
                            onClick={handleLogout}
                            title={confirmarSair ? 'Toque de novo para confirmar' : 'Sair'}
                            aria-label={confirmarSair ? 'Confirmar saída: toque novamente' : 'Sair'}
                            className={`shrink-0 size-11 border border-red-200 bg-white text-red-500 flex items-center justify-center shadow-sm hover:bg-red-500 hover:text-white hover:border-red-500 ${confirmarSair ? 'ring-4 ring-red-200 animate-pulse bg-red-500 text-white border-red-500 shadow-lg' : ''}`}
                        />
                    </div>
                }
            />

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
                            className="fixed top-20 right-3 sm:right-6 z-50 w-[calc(100vw-1.5rem)] max-w-md bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden"
                        >
                            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200/80 bg-slate-50">
                                <div className="flex items-center gap-2">
                                    <MessageSquare size={16} className="text-[var(--primary-color)]" />
                                    <h3 className="font-bold text-sm tracking-tight text-[var(--text-main)]">Mensagens</h3>
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
                                                        {toDate(msg.date)?.toLocaleString('pt-BR') || ((msg as any).createdAt ? toDate((msg as any).createdAt)?.toLocaleString('pt-BR') || '' : '')}
                                                    </p>
                                                </div>
                                                {!msg.read && (
                                                    <button
                                                        onClick={() => markMessageRead(msg.id)}
                                                        className="shrink-0 text-[10px] font-black uppercase tracking-widest bg-[var(--primary-color)]/10 text-[var(--primary-color)] min-h-[44px] min-w-[44px] px-3 py-2 rounded-lg hover:opacity-80 transition-all cursor-pointer"
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
                                                    {pixPayload ? (
                                                        <QRCodeSVG value={pixPayload} size={144} className="w-36 h-36 bg-white p-2 rounded-lg" />
                                                    ) : (
                                                        <div className="w-36 h-36 flex items-center justify-center text-center p-2 bg-slate-900 rounded-lg border border-red-500/40">
                                                            <p className="text-[10px] font-bold text-red-400 uppercase">PIX indisponível. Fale com a administração.</p>
                                                        </div>
                                                    )}
                                                    <button onClick={() => { copiarTextoComFallback(pixPayload || ''); setPixCopied(true); setTimeout(() => setPixCopied(false), 2000); }} className={`w-full mt-3 py-2 rounded-lg font-bold text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${pixCopied ? 'bg-emerald-600 text-white' : 'bg-blue-500 text-white'}`}>
                                                        {pixCopied ? <><CheckCircle size={12} /> COPIADO!</> : <><RefreshCcw size={12} /> Copiar PIX</>}
                                                    </button>
                                                </div>
                                            )}
                                            <button onClick={() => { if (depositAmount <= 0) { showNotification('DIGITE O VALOR DO CRÉDITO.', 'error'); return; } if (depositAmount > 100000) { showNotification('VALOR ACIMA DO LIMITE POR DEPÓSITO (R$ 100.000,00).', 'error'); return; } setDepositStage('proof'); if (fileInputRef.current) fileInputRef.current.value = ''; }} disabled={depositAmount <= 0} className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg disabled:opacity-50 transition-all cursor-pointer">
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
<div className="mt-3 p-2.5 bg-red-500/10 border-2 border-red-500/40 rounded-xl flex items-start gap-2"><AlertCircle size={12} className="inline-block shrink-0 mt-0.5" /><p className="text-[10px] font-black text-red-400 text-left leading-snug">Enviar comprovantes falsos ou adulterados configura CRIME — Art. 171 (estelionato) e Art. 298 (falsificação de documento) do Código Penal. Ao prosseguir, você assume total responsabilidade civil e criminal.</p></div>
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
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
                        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex justify-between items-center">
                            <div>
                                <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5"><Clock size={22} className="text-[var(--primary-color)]"/> Histórico</h2>
                                <p className="text-xs text-slate-500 mt-0.5">Acompanhamento em tempo real</p>
                            </div>
                            {(settings?.enablePrisonerWallet ?? true) && (
                                <button onClick={() => setViewingWalletHistory(!viewingWalletHistory)} className={`text-xs font-semibold px-4 py-2 rounded-lg transition-all border ${viewingWalletHistory ? 'bg-slate-900 border-slate-900 text-white' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>Extrato</button>
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
                                walletTxs.map((tx: any) => {
                        const st = getWalletStatus(tx);
                        const tipoTx = tx.type === 'deposit' ? 'Depósito' : tx.type === 'withdrawal' ? 'Retirada' : 'Compra';
                        return (
                            <div key={tx.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex justify-between items-center gap-3 flex-wrap">
                                <div className="flex items-center gap-3">
                                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${tx.amount > 0 ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                                        {tx.amount > 0 ? <Plus size={18} /> : <ShoppingBag size={18} />}
                                    </div>
                                    <div>
                                        <p className="font-semibold text-[13px] text-slate-900 flex items-center gap-2 flex-wrap">
                                            {tipoTx}
                                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${st.cls}`}>{st.label}</span>
                                        </p>
                                        <p className="text-xs text-slate-400">{toDate(tx.createdAt)?.toLocaleString() || ''}</p>
                                        {tx.description && <p className="text-[11px] text-slate-500 mt-0.5">{tx.description}</p>}
                                        {tx.status === 'pending' && tx.type === 'deposit' && (tx.proofUrl === 'PENDENTE_UPLOAD_LOCAL_CACHE' || !tx.proofUrl) && (
                                            <button
                                                onClick={() => { setResendTarget({ kind: 'wallet_transactions', docId: tx.id }); resendInputRef.current?.click(); }}
                                                className="mt-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-white rounded-lg text-[11px] font-semibold transition-all"
                                            >
                                                Reenviar Comprovante
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <p className={`font-bold ${tx.amount > 0 ? 'text-green-600' : 'text-red-600'}`}>R$ {formatarMoeda(tx.amount)}</p>
                            </div>
                        );
                    })
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
                                    <div key={order.id} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                                        <div className="flex justify-between items-center mb-4 pb-4 border-b border-slate-100">
                                            <div>
                                                <span className="text-xs font-semibold text-slate-400">Pedido #{order.id.slice(0, 8)}</span>
                                                <p className="font-semibold text-[13px] text-slate-900 mt-0.5">{(() => { const d = toDate(order.createdAt || order.date); return d ? d.toLocaleString() : ''; })()}</p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {order.paymentMethod === 'WALLET' ? (
                                                    <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-[11px] font-semibold">Saldo</span>
                                                ) : (
                                                    <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-[11px] font-semibold">PIX</span>
                                                )}
                                                <span className={`px-3.5 py-1.5 rounded-full text-[11px] font-semibold ${getStatusStyle(order.status)}`}>{getStatusLabel(order.status)}</span>
                                            </div>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <p className="text-lg font-bold text-slate-900">R$ {formatarMoeda(order.total)}</p>
                                            <div className="flex gap-2">
                                                <button onClick={() => setViewingOrderCupom(order)} className="p-2.5 bg-slate-100 rounded-lg hover:bg-slate-200 transition-all text-slate-600"><Printer size={17}/></button>
                                                <button onClick={() => toggleOrderDetails(order.id)} className="px-4 py-2.5 bg-slate-100 rounded-lg hover:bg-slate-200 transition-all text-slate-600 font-semibold text-xs">VER {order?.items?.length || 0} ITENS</button>
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
                                                        <a href={order.paymentProofUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-[var(--primary-color)] hover:text-emerald-700 text-[10px] font-black uppercase">
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
                                                        <span className="flex items-center gap-2 text-[var(--primary-color)] text-[10px] font-black uppercase">
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
            <ModalShell
                open={showServicesModal}
                onClose={() => setShowServicesModal(false)}
                title="Outros Serviços"
                subtitle="Adicione um serviço avulso ao cupom"
                size="sm"
                tone="warning"
                icon={<Wrench size={20} />}
                footer={
                    <div className="flex gap-3 w-full">
                        <button onClick={addServiceItem} disabled={!serviceName.trim() || !serviceValue} className="flex-[2] py-3.5 bg-amber-600 hover:bg-amber-500 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-black rounded-xl text-xs uppercase tracking-wider transition-all active:scale-[0.98] flex items-center justify-center gap-2 shadow-sm cursor-pointer">
                            <Plus size={16} /> Adicionar ao Cupom
                        </button>
                        <button onClick={() => setShowServicesModal(false)} className="flex-1 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-black rounded-xl text-xs uppercase tracking-wider transition-all active:scale-[0.98] cursor-pointer">
                            Cancelar
                        </button>
                    </div>
                }
            >
                <div className="p-6 space-y-4">
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
            </ModalShell>

            {/* ADMIN PRODUCT CATALOG MODAL (F4) */}
            <ModalShell
                open={isAdmin && isProductsModalOpen}
                onClose={() => setIsProductsModalOpen(false)}
                title="Catálogo de Produtos"
                subtitle="Selecione para adicionar ao carrinho (F4 para fechar)"
                size="xl"
                icon={<Search size={20} />}
            >
                <div className="p-6 flex flex-col h-full" style={{ maxHeight: 'calc(90vh - 90px)' }}>
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
                                            {isOutOfStock && <div className="absolute inset-0 bg-black/60 flex items-center justify-center"><span className="text-[10px] font-black bg-white text-black px-3 py-1 rounded-lg uppercase">Esgotado</span></div>}
                                        </div>
                                        <div className="flex-1 flex flex-col justify-between font-mono">
                                            <h4 className="text-slate-800 font-bold text-xs tracking-wide line-clamp-2 uppercase mb-2">{p.name}</h4>
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="text-[var(--primary-color)] font-extrabold text-xs">R$ {formatarMoeda(p.price)}</span>
                                                <button onClick={() => addToCart(p)} disabled={isOutOfStock} className="bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg p-2 transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"><Plus size={16} /></button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </ModalShell>

            {/* MOBILE BOTTOM NAV */}
            <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-100 flex justify-around items-center h-16 z-50 shadow-lg modal-bottom-sheet" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
                {((settings?.allow_balance_purchases ?? true) === false && !isAdmin) ? (
                    <>
                        <button onClick={() => { setActiveTab('store'); }} className={`flex flex-col items-center justify-center h-full flex-1 transition-colors ${activeTab === 'store' ? 'text-[var(--primary-color)]' : 'text-slate-400'}`}>
                            <CreditCard size={20} />
                            <span className="text-[10px] font-black uppercase mt-0.5">ENVIAR PIX</span>
                        </button>
                        <button onClick={() => { setActiveTab('orders'); }} className={`flex flex-col items-center justify-center h-full flex-1 transition-colors ${activeTab === 'orders' ? 'text-[var(--primary-color)]' : 'text-slate-400'}`}>
                            <Clock size={20} />
                            <span className="text-[10px] font-black uppercase mt-0.5">HISTÓRICO</span>
                        </button>
                    </>
                ) : (
                    <>
                        <button onClick={() => { setActiveTab('store'); setMobileView('catalog'); }} className={`flex flex-col items-center justify-center h-full flex-1 transition-colors ${mobileView === 'catalog' ? 'text-[var(--primary-color)]' : 'text-slate-400'}`}>
                            <Package size={20} />
                            <span className="text-[10px] font-black uppercase mt-0.5">CATÁLOGO</span>
                        </button>
                        <button onClick={() => { setMobileView('cart'); setIsCartReviewOpen(true); }} className={`flex flex-col items-center justify-center h-full flex-1 transition-colors relative ${mobileView === 'cart' ? 'text-[var(--primary-color)]' : 'text-slate-400'}`}>
                            <ShoppingCart size={20} />
                            {totalItensNoCarrinho > 0 && <span className="absolute top-1 right-[calc(50%-24px)] bg-red-500 text-white text-[10px] w-auto min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center font-black border border-white">{totalItensNoCarrinho}</span>}
                            <span className="text-[10px] font-black uppercase mt-0.5">CUPOM</span>
                        </button>
                        <button onClick={() => { setActiveTab('store'); setMobileView('payment'); }} className={`flex flex-col items-center justify-center h-full flex-1 transition-colors ${mobileView === 'payment' ? 'text-[var(--primary-color)]' : 'text-slate-400'}`}>
                            <CreditCard size={20} />
                            <span className="text-[10px] font-black uppercase mt-0.5">PAGAMENTO</span>
                        </button>
                        <button onClick={() => { setActiveTab('orders'); }} className={`flex flex-col items-center justify-center h-full flex-1 transition-colors ${activeTab === 'orders' ? 'text-[var(--primary-color)]' : 'text-slate-400'}`}>
                            <Clock size={20} />
                            <span className="text-[10px] font-black uppercase mt-0.5">HISTÓRICO</span>
                        </button>
                    </>
                )}
            </nav>

            {/* CART REVIEW MODAL — PC e Mobile */}
            <ModalShell
                open={isCartReviewOpen}
                onClose={() => { setMobileView('catalog'); setIsCartReviewOpen(false); }}
                title="Revisão do Carrinho"
                subtitle="Confira os itens antes de pagar"
                size="md"
                icon={<ShoppingCart size={20} />}
                bodyClassName="bg-white"
                footer={
                    cart.length > 0 ? (
                        <div className="w-full space-y-3">
                            <div className="flex justify-between items-center py-1 border-t border-slate-100">
                                <span className="text-xs font-black text-slate-400 uppercase">Total Geral</span>
                                <span className="text-xl font-black text-slate-900">R$ {formatarMoeda(cartTotal)}</span>
                            </div>
                            <button onClick={() => { setIsCartReviewOpen(false); setIsCheckoutModalOpen(true); }} className="w-full py-3 bg-emerald-600 text-white font-black rounded-2xl uppercase text-xs shadow-lg active:scale-95 flex items-center justify-center gap-2 shrink-0">
                                <Banknote size={14} className="inline-block mr-1.5 -mt-0.5" /> AVANÇAR PARA PAGAMENTO
                            </button>
                        </div>
                    ) : undefined
                }
            >
                <div className="p-5">
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
                                            <button onClick={() => updateQty(item.productId, -1)} className="w-9 h-9 rounded-full border bg-white flex items-center justify-center font-bold text-xs shadow-sm transition-all active:scale-95 cursor-pointer hover:bg-red-50 hover:text-red-500 hover:border-red-300">−</button>
                                            <span className="font-black text-xs text-slate-900 min-w-[22px] text-center">{item.quantity}</span>
                                            <button onClick={() => updateQty(item.productId, 1)} className="w-9 h-9 rounded-full border bg-white flex items-center justify-center font-bold text-xs shadow-sm transition-all active:scale-95 cursor-pointer hover:bg-emerald-50 hover:text-[var(--primary-color)] hover:border-emerald-300">+</button>
                                        </div>
                                        <button onClick={() => removeFromCart(item.productId)} className="text-red-600 bg-red-50 hover:bg-red-100 px-3 min-h-[44px] py-2 rounded-lg text-[11px] font-black flex items-center gap-1 transition-all active:scale-95 shrink-0"><Trash2 size={12} /> RETIRAR</button>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </ModalShell>

            {/* MOBILE PAYMENT VIEW */}
            {mobileView === 'payment' && (
                <div className="md:hidden fixed inset-0 z-40 bg-black/40" onClick={() => setMobileView('catalog')}>
                    <div className="absolute bottom-16 left-0 right-0 bg-white rounded-t-3xl shadow-2xl max-h-[70vh] overflow-y-auto p-4 pb-8" style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }} onClick={e => e.stopPropagation()}>
                        <div className="w-12 h-1.5 bg-slate-300 rounded-full mx-auto mb-4"></div>
                        <p className="font-black text-xs uppercase text-slate-400 text-center tracking-widest mb-4"><Banknote size={12} className="inline-block mr-1.5 -mt-0.5" /> FINALIZAR PAGAMENTO</p>
                        <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 mb-4">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1">DADOS DO CLIENTE</p>
                            <p className="font-black text-sm text-slate-900 uppercase">{currentUser?.name || 'CONSUMIDOR FINAL'}</p>
                            <p className="text-[10px] text-slate-500 font-bold">Saldo: R$ {formatarMoeda(currentUser?.walletBalance || 0)}</p>
                        </div>
                        <div className="bg-emerald-50 rounded-xl p-6 border border-emerald-100 text-center mb-6">
                            <p className="text-[9px] font-black text-[var(--primary-color)] uppercase tracking-widest mb-2">TOTAL GERAL</p>
                            <p className="font-black text-3xl text-slate-900">R$ {formatarMoeda(cartTotal)}</p>
                        </div>
                        <button onClick={cancelSale} className={`w-full py-3.5 min-h-[44px] rounded-xl font-bold text-sm text-white active:scale-95 mb-2 flex items-center justify-center gap-2 transition-all ${!isAdmin && confirmarLimpar ? 'bg-red-600 ring-4 ring-red-200 animate-pulse' : 'bg-red-500'}`}>
                            <X size={14} className="inline-block mr-1.5 -mt-0.5" /> {isAdmin ? 'Cancelar' : (confirmarLimpar ? 'Toque de novo para confirmar' : 'Limpar Carrinho')}
                        </button>
                        {isAdmin && (
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
                        )}
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
            <ModalShell
                open={isDepositOpen}
                onClose={() => { setIsDepositOpen(false); setDepositStage('amount'); setProofFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                title="Enviar Crédito"
                subtitle="Depósito via PIX para a carteira do interno"
                icon={<Wallet size={20} />}
                size="sm"
                tone="success"
            >
                <div className="flex flex-col space-y-4">
                    {depositStage === 'amount' && (
                        <>
                            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Valor do Crédito (R$)</p>
                                <input type="number" className="w-full bg-transparent font-black text-2xl text-center outline-none text-[var(--text-main)]" value={depositAmount || ''} onChange={e => setDepositAmount(Number(e.target.value))} placeholder="0,00" />
                            </div>
                            {depositAmount > 0 && (
                                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col items-center">
                                    {pixPayload ? (
                                        <QRCodeSVG value={pixPayload} size={144} className="w-36 h-36 bg-white p-2 rounded-lg" />
                                    ) : (
                                        <div className="w-36 h-36 flex items-center justify-center text-center p-2 bg-slate-100 rounded-lg border border-red-500/40">
                                            <p className="text-[10px] font-bold text-red-500 uppercase">PIX indisponível. Fale com a administração.</p>
                                        </div>
                                    )}
                                    <UiButton
                                        size="sm"
                                        icon={pixCopied ? <CheckCircle size={12} /> : <RefreshCcw size={12} />}
                                        onClick={() => { copiarTextoComFallback(pixPayload || ''); setPixCopied(true); setTimeout(() => setPixCopied(false), 2000); }}
                                        className={`w-full mt-3 ${pixCopied ? 'bg-emerald-600' : 'bg-blue-500'}`}
                                    >
                                        {pixCopied ? 'COPIADO!' : 'Copiar PIX'}
                                    </UiButton>
                                </div>
                            )}
                            <UiButton
                                size="md"
                                icon={<Sparkles size={14} />}
                                onClick={() => {
                                    if (depositAmount <= 0) { showNotification('DIGITE O VALOR DO CRÉDITO.', 'error'); return; }
                                    if (depositAmount > 100000) { showNotification('VALOR ACIMA DO LIMITE POR DEPÓSITO (R$ 100.000,00).', 'error'); return; }
                                    setDepositStage('proof'); if (fileInputRef.current) fileInputRef.current.value = '';
                                }}
                                disabled={depositAmount <= 0}
                                className="w-full bg-emerald-600 hover:bg-emerald-700"
                            >
                                Já fiz o PIX do Crédito
                            </UiButton>
                        </>
                    )}

                    {depositStage === 'proof' && (
                        <>
                            <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 text-center">
                                <p className="font-black text-xs text-blue-700 uppercase tracking-wider mb-1">Comprovante de Pagamento</p>
                                <p className="text-[10px] text-blue-500 font-bold">Anexe a foto do comprovante PIX para confirmar o crédito</p>
                            </div>
                            <div onClick={() => fileInputRef.current?.click()} className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${proofFile ? 'border-emerald-500 bg-emerald-500/10' : 'border-blue-300 bg-slate-50 hover:border-blue-500 hover:bg-slate-100'}`}>
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
                                        <Upload size={28} className="mx-auto text-emerald-500 mb-2" />
                                        <p className="font-black text-[10px] text-emerald-700">{proofFile.name}</p>
                                        <p className="text-[9px] text-emerald-600 font-bold mt-1 uppercase">Arquivo anexado</p>
                                    </div>
                                ) : (
                                    <div>
                                        <Upload size={32} className="mx-auto mb-2 text-blue-400" />
                                        <p className="font-black text-[11px] text-blue-600 uppercase tracking-wider"><Paperclip size={12} className="inline-block mr-1" /> Clique aqui para selecionar o Comprovante</p>
                                    </div>
                                )}
                            </div>
                            <div className="p-2.5 bg-red-50 border-2 border-red-200 rounded-xl flex items-start gap-2"><AlertCircle size={12} className="inline-block shrink-0 mt-0.5" /><p className="text-[11px] font-black text-red-500 text-left leading-snug">Enviar comprovantes falsos ou adulterados configura CRIME — Art. 171 (estelionato) e Art. 298 (falsificação de documento) do Código Penal. Ao prosseguir, você assume total responsabilidade civil e criminal.</p></div>
                            <UiButton
                                size="md"
                                icon={isSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                                onClick={async () => { if (!proofFile) { showNotification('ANEXE O COMPROVANTE.', 'error'); return; } await depositToWalletAction(); setDepositStage('amount'); }}
                                disabled={isSubmitting || !proofFile}
                                loading={isSubmitting}
                                className="w-full bg-blue-500 hover:bg-blue-600"
                            >
                                {isSubmitting ? 'Enviando...' : 'Enviar Comprovante'}
                            </UiButton>
                        </>
                    )}
                </div>
            </ModalShell>

            <ModalShell
                open={isCheckoutModalOpen}
                onClose={() => { setIsCheckoutModalOpen(false); setProofFile(null); }}
                title="Finalizar Venda"
                subtitle="Confirme entrega e forma de pagamento"
                size="md"
                icon={<CreditCard size={20} />}
                bodyClassName="bg-white"
                footer={
                    <button onClick={handleFinish} disabled={isSubmitting || (cartPaymentMethod === 'PIX' && !proofFile)} className="w-full py-3 bg-slate-900 text-white font-black rounded-2xl uppercase text-xs shadow-xl active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shrink-0">
                        {isSubmitting ? <><Loader2 size={14} className="animate-spin" /> Processando...</> : (cartPaymentMethod === 'PIX' && !proofFile) ? <><Paperclip size={14} className="inline-block mr-1 -mt-0.5" /> Anexe o Comprovante para Confirmar</> : 'Confirmar Pedido'}
                    </button>
                }
            >
                <div className="p-4 sm:p-5 flex flex-col space-y-3">
                            <div>
                                <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Local de Entrega</p>
                                <div className="flex gap-2 mb-2">
                                    <button onClick={() => setDeliveryType('intern')} className={`flex-1 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-wide border-2 transition-all min-h-[44px] ${deliveryType === 'intern' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-500'}`}>
                                        <Home size={12} className="inline-block mr-1 -mt-0.5" /> Cela
                                    </button>
                                    <button onClick={() => setDeliveryType('worker')} className={`flex-1 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-wide border-2 transition-all min-h-[44px] ${deliveryType === 'worker' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-500'}`}>
                                        <HardHat size={12} className="inline-block mr-1 -mt-0.5" /> Trabalhador
                                    </button>
                                </div>
                                {deliveryType === 'intern' ? (
                                    <div className="flex flex-col gap-1">
                                        <div className="grid grid-cols-2 gap-2">
                                            <input className="min-w-0 bg-slate-50 py-2.5 px-3 rounded-xl border border-slate-200 font-bold text-sm min-h-[44px] truncate" placeholder="RAIO" value={location.ray} onChange={e => setLocation({...location, ray: e.target.value})} />
                                            <input className="min-w-0 bg-slate-50 py-2.5 px-3 rounded-xl border border-slate-200 font-bold text-sm min-h-[44px] truncate" placeholder="ALA" value={location.wing} onChange={e => setLocation({...location, wing: e.target.value})} />
                                        </div>
                                        <input className="w-full bg-slate-50 py-2.5 px-3 rounded-xl border border-slate-200 font-bold text-sm min-h-[44px] truncate" placeholder="CELA" value={location.cell} onChange={e => setLocation({...location, cell: e.target.value})} />
                                    </div>
                                ) : (
                                    <div className="flex flex-col gap-1">
                                        <div className="grid grid-cols-2 gap-2">
                                            {['Cozinha', 'Lavanderia', 'Horta', 'Oficina', 'Almoxarifado'].map(loc => (
                                                <button key={loc} onClick={() => setDeliveryFreeText(loc)} className={`min-h-[44px] py-2 rounded-xl font-black text-[10px] uppercase border-2 transition-all ${deliveryFreeText === loc ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'}`}>
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
                                    <button onClick={() => setCartPaymentMethod('WALLET')} disabled={!isAdmin} className={`min-h-[44px] py-3 rounded-xl font-black text-[11px] uppercase tracking-wide border-2 transition-all active:scale-95 ${cartPaymentMethod === 'WALLET' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'} ${!isAdmin ? 'opacity-40 cursor-not-allowed grayscale' : ''}`}>
                                        <Wallet size={12} className="inline-block mr-1.5 -mt-0.5" /> Saldo
                                    </button>
                                    <button onClick={() => setCartPaymentMethod('PIX')} className={`min-h-[44px] py-3 rounded-xl font-black text-[11px] uppercase tracking-wide border-2 transition-all active:scale-95 ${cartPaymentMethod === 'PIX' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}>
                                        <Smartphone size={12} className="inline-block mr-1.5 -mt-0.5" /> PIX
                                    </button>
                                </div>

                                {cartPaymentMethod === 'PIX' && (
                                    <div className="mt-3 p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl text-center space-y-2">
                                        {pixPayload && (
                                            <>
                                                <div>
                                                    <div className="flex items-center gap-2 justify-center mb-1">
                                                        <CreditCard size={12} className="text-[var(--primary-color)]" />
                                                        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--primary-color)]">Escaneie para Pagar</span>
                                                    </div>
                                                    <div className="bg-white rounded-xl p-2 inline-block shadow-lg">
                                                        <QRCodeSVG value={pixPayload} size={130} level="H" bgColor="#ffffff" fgColor="#022c22" includeMargin={true} />
                                                    </div>
                                                </div>
                                                {settings?.pixKeys?.[0] && (
                                                    <div className="bg-white rounded-xl p-2 border border-slate-200">
                                                        <p className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.3em] mb-1">Chave Copia e Cola</p>
                                                        <input readOnly value={pixPayload} className="w-full text-[10px] font-mono text-slate-500 bg-transparent outline-none text-center select-all mb-1 break-all" onClick={(e) => (e.target as HTMLInputElement).select()} />
                                                        <button
                                                            onClick={() => {
                                                                    copiarTextoComFallback(pixPayload);
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
                                            <p className="text-[10px] font-black text-slate-400 uppercase mb-2 text-left">Comprovante de Pagamento</p>
                                            <label className="flex items-center gap-2 bg-white p-3 rounded-xl border-2 border-dashed border-slate-300 cursor-pointer hover:border-emerald-400 hover:bg-emerald-50/30 transition-all active:scale-[0.98]">
                                                <Upload size={16} className="text-emerald-500 shrink-0" />
                                                <span className="text-[10px] font-bold text-slate-700 text-left leading-tight break-all">{proofFile ? proofFile.name : 'CLIQUE AQUI PARA ENVIAR O COMPROVANTE PIX'}</span>
                                                <input type="file" accept="image/*,.pdf" className="hidden" onChange={async e => {
                                                const f = e.target.files?.[0]; if (!f) return;
                                                // Mesmas regras do depósito: valida ANTES (falha tardia no
                                                // handleFinish frustrava o usuário no fim do fluxo).
                                                const okTipo = f.type.startsWith('image/') || f.type === 'application/pdf';
                                                if (!okTipo) { showNotification('Formato inválido. Envia imagem (JPG/PNG) ou PDF.', 'error'); e.target.value = ''; return; }
                                                if (f.size > 8 * 1024 * 1024) { showNotification('Arquivo muito grande. Máximo 8MB.', 'error'); e.target.value = ''; return; }
                                                try {
                                                    const compressed = await compressImageFile(f, 0.3, 600);
                                                    setProofFile(new File([compressed], f.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }));
                                            } catch { console.warn("compress fallback (fileInput 1)"); setProofFile(f); }
                                                e.target.value = '';
                                            }} />
                                            </label>
                                            {proofFile && (
                                                <p className="text-[10px] text-[var(--primary-color)] font-bold mt-1 text-left break-all">Arquivo selecionado: {proofFile.name}</p>
                                            )}
                                            <div className="mt-2 p-2.5 bg-red-500/10 border-2 border-red-500/40 rounded-xl flex items-start gap-2"><AlertCircle size={12} className="inline-block shrink-0 mt-0.5" /><p className="text-[11px] font-black text-red-600 text-left leading-snug">Enviar comprovantes falsos ou adulterados configura CRIME — Art. 171 (estelionato) e Art. 298 (falsificação de documento) do Código Penal. Ao confirmar, você assume total responsabilidade civil e criminal.</p></div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="flex justify-between items-center py-2 border-t border-slate-100">
                                <span className="text-xs font-black text-slate-400 uppercase">Total</span>
                                <span className="text-xl font-black text-slate-900">R$ {formatarMoeda(cartTotal)}</span>
                            </div>
                </div>
            </ModalShell>

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

            {/* MODAL DESINSTALAR APLICATIVO */}
            {showUninstallModal && (
                <UninstallModal isOpen={showUninstallModal} onClose={() => setShowUninstallModal(false)} />
            )}
        </div>
    );
};
