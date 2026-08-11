import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    X, Trash2, MapPin, CheckCircle, Upload, Loader2, ShoppingBag,
    CreditCard, Plus, Minus, ArrowLeft, Sparkles,
    AlertCircle, FileText, RefreshCw, ChevronRight, Printer
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Product } from '../../types';
import { formatarMoeda } from '../../utils';

interface UserCartModalProps {
    isCartOpen: boolean;
    isDepositOpen: boolean;
    setIsCartOpen: (val: boolean) => void;
    setIsDepositOpen: (val: boolean) => void;
    isSubmitting: boolean;
    setIsSubmitting: (val: boolean) => void;
    stage: 'cart' | 'location' | 'pay' | 'proof';
    setStage: (s: 'cart' | 'location' | 'pay' | 'proof') => void;
    cart: { productId: string; quantity: number }[];
    setCart: React.Dispatch<React.SetStateAction<{ productId: string; quantity: number }[]>>;
    safeProducts: Product[];
    removeFromCart: (pid: string) => void;
    cartTotal: number;
    location: { ray: string; wing: string; cell: string };
    setLocation: (loc: any) => void;
    cartPaymentMethod: 'PIX' | 'WALLET';
    setCartPaymentMethod: (m: 'PIX' | 'WALLET') => void;
    currentUser: any;
    pixPayload: string;
    timeLeft: number;
    formatTime: (s: number) => string;
    depositAmount: number;
    setDepositAmount: (a: number) => void;
    proofFile: File | null;
    setProofFile: (f: File | null) => void;
    handleFinish: () => Promise<void>;
    handleDeposit: () => Promise<void>;
    showNotification: (m: string, t: string) => void;
    walletBalance: number;
    settings?: any;
    myOrders?: any[];
    limiteSemanal?: number;
    serverTime?: Date;
}

export const UserCartModal: React.FC<UserCartModalProps> = ({
    isCartOpen, isDepositOpen, setIsCartOpen, setIsDepositOpen, isSubmitting,
    setIsSubmitting, stage, setStage, cart, setCart, safeProducts, removeFromCart,
    cartTotal, location, setLocation, cartPaymentMethod, setCartPaymentMethod,
    currentUser, pixPayload, timeLeft, formatTime, depositAmount, setDepositAmount,
    proofFile, setProofFile, handleFinish, handleDeposit, showNotification,
    walletBalance, settings, myOrders, limiteSemanal, serverTime
}) => {
    const weeklySpend = React.useMemo(() => {
        // Agora usamos o valor real do banco de dados que resetamos toda segunda-feira
        return (currentUser?.weeklySpent || 0);
    }, [currentUser?.weeklySpent]);

    const isOverWeeklyLimit = limiteSemanal && !currentUser?.autorizacaoExcepcional && (weeklySpend + cartTotal) > limiteSemanal;
    const isSaldoInsuficiente = cartPaymentMethod === 'WALLET' && walletBalance < cartTotal;
    const blockReason = isSaldoInsuficiente ? 'SALDO INSUFICIENTE' : isOverWeeklyLimit ? 'LIMITE EXCEDIDO' : null;
    const [showSuccess, setShowSuccess] = useState(false);
    const [orderId, setOrderId] = useState('');
    const [lastPrintPayload, setLastPrintPayload] = useState<{ items: any[]; total: number; method: string } | null>(null);
    const [stockWarning, setStockWarning] = useState<string | null>(null);
    const [localProofFile, setLocalProofFile] = useState<File | null>(proofFile);
    const [isLoading, setIsLoading] = useState(false);
    const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth < 768 : true);
    const [showBackdrop, setShowBackdrop] = useState(false);
    const [showContent, setShowContent] = useState(false);
    const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const isVisible = isCartOpen || isDepositOpen;

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        handleResize();
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        if (isVisible) {
            setShowBackdrop(true);
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    setShowContent(true);
                });
            });
        } else {
            setShowContent(false);
            setTimeout(() => setShowBackdrop(false), 300);
        }
    }, [isVisible]);

    useEffect(() => {
        setLocalProofFile(proofFile);
    }, [proofFile]);

    // BLOQUEIO ABSOLUTO: sincronizacao entre localProofFile e proofFile
    // Garante que ambas variaveis estao sempre identicas
    useEffect(() => {
        if (proofFile !== localProofFile) {
            setLocalProofFile(proofFile);
        }
    }, [proofFile, localProofFile]);

    // SEMPRE que o fluxo de deposito for aberto, forca etapa inicial
    // Evita tela em branco quando o modal abre sem stage definido
    useEffect(() => {
        if (isDepositOpen) {
            setStage('cart');
        }
    }, [isDepositOpen, setStage]);

    useEffect(() => {
        return () => {
            if (loadingTimeoutRef.current) {
                clearTimeout(loadingTimeoutRef.current);
            }
        };
    }, []);

    const updateQuantity = (productId: string, delta: number) => {
        setCart(prev => {
            const item = prev.find(i => String(i.productId) === String(productId));
            const product = safeProducts.find(p => String(p.id) === String(productId));
            if (!item || !product) return prev;

            const newQty = item.quantity + delta;

            if (delta > 0 && newQty > product.stock) {
                showNotification(`Limite de estoque atingido (${product.stock} un)`, 'error');
                return prev;
            }

            if (newQty <= 0) {
                return prev.filter(i => String(i.productId) !== String(productId));
            }

            return prev.map(i =>
                String(i.productId) === String(productId) ? { ...i, quantity: newQty } : i
            );
        });
    };

    const handleClose = useCallback(() => {
        if (isSubmitting || isLoading) return;
        setIsCartOpen(false);
        setIsDepositOpen(false);
        setStage('cart');
        setLocalProofFile(null);
        setProofFile(null);
        setDepositAmount(0);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    }, [isSubmitting, isLoading, setIsCartOpen, setIsDepositOpen, setStage, setProofFile, setDepositAmount]);

    const handleCancelLoading = () => {
        if (loadingTimeoutRef.current) {
            clearTimeout(loadingTimeoutRef.current);
        }
        setIsLoading(false);
        setIsSubmitting(false);
        showNotification('Operação cancelada', 'error');
    };

    const triggerAutoPrint = (orderIdVal: string, orderItems: any[], totalVal: number, method: string) => {
        try {
            const printPayload = {
                type: 'CUPOM',
                data: {
                    id: orderIdVal,
                    items: orderItems,
                    total: totalVal,
                    paymentMethod: method === 'WALLET' ? 'WALLET' : 'PIX',
                    userName: currentUser?.name || '',
                    inmateName: currentUser?.inmateName || currentUser?.prisonerName || '',
                    inmateLocation: location,
                    deliveryLocation: location,
                    createdAt: new Date().toISOString(),
                    walletBalanceAfter: currentUser?.walletBalance || 0,
                    operatorName: currentUser?.name || 'ADMIN'
                }
            };
            localStorage.setItem('printItem', JSON.stringify(printPayload));
            localStorage.setItem('appSettings', JSON.stringify(settings || {}));
            const printWindow = window.open('/print', '_blank', 'width=400,height=600');
            if (!printWindow) {
                showNotification('Popup bloqueado. Permita popups para impressão automática.', 'error');
            }
        } catch (e) {
            console.warn('Auto-print falhou:', e);
        }
    };

    const handleConfirmFinish = async () => {
        if (cartPaymentMethod === 'PIX') {
            const fileCheck = localProofFile || proofFile;
            if (!fileCheck) {
                showNotification('POR FAVOR, ANEXE O COMPROVANTE PIX.', 'error');
                return;
            }
        }

        setIsLoading(true);
        setIsSubmitting(true);

        loadingTimeoutRef.current = setTimeout(() => {
            handleCancelLoading();
            showNotification('Tempo limite excedido. Tente novamente.', 'error');
        }, 30000);

        try {
            const snapshotCart = (cart || []).map((item: any) => {
                const p = safeProducts.find((x: any) => String(x.id) === String(item.productId));
                return {
                    name: p ? p.name : (item.name || 'Item'),
                    quantity: item.quantity,
                    priceAtPurchase: p ? p.price : (item.price || 0)
                };
            });
            const snapshotTotal = cartTotal;

            await handleFinish();

            if (loadingTimeoutRef.current) {
                clearTimeout(loadingTimeoutRef.current);
            }

            const newOrderId = Date.now().toString().slice(-8);
            setOrderId(newOrderId);

            if (settings?.autoPrint) {
                triggerAutoPrint(newOrderId, snapshotCart, snapshotTotal, cartPaymentMethod);
            }

            setLastPrintPayload({ items: snapshotCart, total: snapshotTotal, method: cartPaymentMethod });
            setShowSuccess(true);
            setCart([]);
            setLocalProofFile(null);
            setProofFile(null);

            try {
                const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2teleVcQNpHW+NueZVQ1Wq/w/5RmP0x0q+vkfGI1UoCv8v+SZU5NgrLt/45fR0J3sO78f2E1TXqr8/+OX0lFfbPx/4pdS0R8tPL/iV5MR3+18/+HXUxIgbTz/4dcTkmCtPP/h11OSoS08/+GXE9KhLTz/4VbT0qFtfP/hVpQS4a18/+FWlFMh7Xz/4RaUUyItfP/hFpRTYm18/+DWlJNiLXz/4NaUkyJtfP/gllSTYm18/+CWlNMirXz/4JZU02LtfP/gllTTYq18/+BWVRNjLXz/4FZVE6MtfP/gVlVToy18/+BWVVOjLXz/4FZVU+NtfP/gFlWT4618/+AWVZPj7Xz/39ZVlCQtPP/f1lXUJG08/9+WliRtPP/flpYkbTz/35aWJG28/9+WlmStvP/fllZkrXz/35ZWZO28/9+WVmTtvP/flpZlLfz/35ZWZS38/9+WVmVufP/fllZlrjz/35ZWZe58/9+WVmXufP/flpZmLnz/35ZWZm5uPT/fllZmbn06/9+WVmZuvTq/35ZWZq69Or/fllam7v06v9+WVqbu/Tq/35ZWpu89Or/fllam7z06v9+WVqbvPTq/35aW5y89Or/flpbnLz06v9+WludvPTq/35aW5289Or/fltcnbz06v9+XF2dvfTq/35cXZ2+9Or/flxeoL70//5+YKC//f7+/n5hoL/+//7+fWGhQP///v59YaFA////////f2GiQP////////9/oqL//////////////////////////////////////////////////////////w==');
                audio.volume = 0.3;
                audio.play().catch(() => {});
            } catch (e) {}
        } catch (e: any) {
            if (loadingTimeoutRef.current) {
                clearTimeout(loadingTimeoutRef.current);
            }
            showNotification(e.message || 'Erro ao finalizar', 'error');
        } finally {
            setIsLoading(false);
            setIsSubmitting(false);
        }
    };

    const title = isDepositOpen ? 'Enviar Crédito' : 'Seu Carrinho';

    if (!showBackdrop && !showSuccess) return null;

    return (
       <>
            {/* BACKDROP */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: showContent ? 1 : 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 z-[200]"
                style={{ backgroundColor: 'rgba(15, 23, 42, 0.7)', backdropFilter: 'blur(8px)' }}
                onClick={handleClose}
            />

            {/* MODAL - Dynamic height, adapts to viewport */}
            <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: showContent ? 1 : 0, y: 0 }}
                exit={{ opacity: 0, y: 30 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                className={isMobile
                    ? 'fixed inset-x-0 bottom-0 z-[201] w-full max-h-[92vh] flex flex-col rounded-t-3xl shadow-2xl overflow-hidden'
                    : 'fixed inset-0 m-auto z-[201] w-full max-w-[520px] max-h-[calc(100vh-100px)] flex flex-col rounded-2xl shadow-2xl overflow-hidden'
                }
                style={isMobile ? { maxHeight: '92vh', height: '92vh' } : {}}
            >
                {/* HEADER - Fixed at top, NEVER scrolls */}
                <div className="shrink-0 p-4 border-b border-slate-700/50 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 flex justify-between items-center">
                    <div>
                        <h2 className="font-black text-lg uppercase tracking-tight text-white">{title}</h2>
                        <p className="text-[9px] opacity-70 font-bold uppercase tracking-widest text-slate-300">
                            {isDepositOpen ? 'Abastecimento' : `${(cart || []).reduce((s, i) => s + (i.quantity || 0), 0)} itens`}
                        </p>
                    </div>
                    <button
                        onClick={handleClose}
                        disabled={isLoading}
                        className="w-10 h-10 bg-white/10 hover:bg-white/20 disabled:opacity-50 rounded-xl flex items-center justify-center transition-all text-white"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* BODY - Scrollable area, ONLY this section scrolls */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">

                    {/* Loading Overlay */}
                    {isLoading && (
                        <div className="absolute inset-0 z-10 bg-slate-900/95 backdrop-blur-sm flex flex-col items-center justify-center rounded-b-2xl">
                            <div className="w-12 h-12 border-4 border-emerald-800 border-t-emerald-400 rounded-full animate-spin mb-3"></div>
                            <p className="font-black text-sm text-white uppercase tracking-wider mb-3">Processando...</p>
                            <button
                                onClick={handleCancelLoading}
                                className="px-5 py-2 bg-red-500 text-white rounded-lg font-bold text-xs uppercase tracking-widest"
                            >
                                Cancelar
                            </button>
                        </div>
                    )}

                    {/* STOCK WARNING */}
                    {stockWarning && (
                        <div className="bg-amber-900/30 border border-amber-700 text-amber-300 px-3 py-2 rounded-lg flex items-center gap-2 text-[10px] font-bold">
                            <AlertCircle size={14} />
                            {stockWarning}
                        </div>
                    )}

{isDepositOpen ? (
                        /* DEPOSIT STAGE */
                        <div className="space-y-3">
                            {/* ETAPA 1: Valor + QR Code (quando stage = 'cart' ou inicial) */}
                            {stage === 'cart' && (
                                <>
                                    <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Valor do Crédito (R$)</p>
                                        <input
                                            type="number"
                                            className="w-full bg-transparent font-black text-2xl text-center outline-none text-white"
                                            value={depositAmount || ''}
                                            onChange={e => setDepositAmount(Number(e.target.value))}
                                            placeholder="0,00"
                                        />
                                    </div>

                                    {depositAmount > 0 && (
                                        <div className="bg-slate-800 p-4 rounded-xl shadow border border-slate-700 flex flex-col items-center">
                                            <img
                                                src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(pixPayload)}`}
                                                className="w-36 h-36 object-contain"
                                                alt="QR PIX"
                                            />
                                            <button
                                                onClick={() => {
                                                    navigator.clipboard.writeText(pixPayload);
                                                    showNotification('Codigo copiado!', 'success');
                                                }}
                                                className="w-full mt-3 py-2 bg-blue-500 text-white rounded-lg font-bold text-[10px] uppercase tracking-widest flex items-center justify-center gap-2"
                                            >
                                                <RefreshCw size={12} /> Copiar PIX
                                            </button>
                                        </div>
                                    )}
                                </>
                            )}

                            {/* ETAPA 2: Upload do Comprovante (quando stage = 'proof') */}
                            {stage === 'proof' && (
                                <div className="space-y-3">
                                    <div className="bg-blue-900/30 p-4 rounded-xl border border-blue-800 text-center">
                                        <p className="font-black text-xs text-blue-300 uppercase tracking-wider mb-1">Comprovante de Pagamento</p>
                                        <p className="text-[10px] text-blue-400 font-bold">Anexe a foto do comprovante PIX para confirmar o crédito</p>
                                        <p className="text-[8px] text-red-400 font-black mt-2 uppercase tracking-wider">AVISO LEGAL: Comprovante falso é CRIME — Estelionato (Art. 171) e Falsificação (Art. 297 do CP)</p>
                                    </div>

                                    <div
                                        onClick={() => document.getElementById('proof-upload')?.click()}
                                        className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${localProofFile ? 'border-emerald-500 bg-emerald-500/10' : 'border-blue-700 bg-slate-800 hover:border-blue-500 hover:bg-slate-700'}`}
                                    >
                                        <input
                                            type="file"
                                            id="proof-upload"
                                            ref={fileInputRef}
                                            className="hidden"
                                            accept="image/*,.pdf"
                                            onChange={e => {
                                                const file = e.target.files?.[0];
                                                if (file) {
                                                    const MAX_SIZE = 5 * 1024 * 1024;
                                                    const ALLOWED = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
                                                    const ALLOWED_EXT = ['.jpg', '.jpeg', '.png', '.pdf'];
                                                    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
                                                    if (file.size > MAX_SIZE) {
                                                        showNotification(`Arquivo muito grande (${(file.size / 1024 / 1024).toFixed(1)}MB). Máximo 5MB.`, 'error');
                                                        e.target.value = '';
                                                        return;
                                                    }
                                                    if (!ALLOWED_EXT.includes(ext) || !ALLOWED.includes(file.type)) {
                                                        showNotification('Formato não permitido. Use JPG, PNG ou PDF.', 'error');
                                                        e.target.value = '';
                                                        return;
                                                    }
                                                    setLocalProofFile(file);
                                                    setProofFile(file);
                                                }
                                                e.target.value = '';
                                            }}
                                        />
                                        {localProofFile ? (
                                            <div>
                                                <FileText className="mx-auto text-emerald-400 mb-2" size={28} />
<p className="font-black text-[10px] text-emerald-300">{localProofFile?.name || 'Comprovante'}</p>
                                                <p className="text-[9px] text-emerald-400 font-bold mt-1 uppercase">Arquivo anexado</p>
                                            </div>
                                        ) : (
                                            <div>
                                                <Upload className="mx-auto mb-2 text-blue-400" size={32} />
                                                <p className="font-black text-[11px] text-blue-300 uppercase tracking-wider">Clique aqui para selecionar o Comprovante</p>
                                                <p className="text-[9px] text-blue-400 mt-1">Formatos: JPG, PNG, PDF</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : stage === 'cart' ? (
                        <div className="flex-1 overflow-y-auto min-h-0 max-h-[200px] space-y-2 pr-1 scrollbar-thin">
                            {cart?.length > 0 ? cart.map(item => {
                                const p = safeProducts.find(x => String(x.id) === String(item.productId));
                                if (!p) return null;
                                return (
                                    <div key={item.productId} className="bg-slate-800 p-3 rounded-xl border border-slate-700 shadow-sm">
                                        <div className="flex items-center gap-3">
                                            <img
                                                src={p?.imageUrl || 'https://placehold.co/60'}
                                                className="w-12 h-12 rounded-lg object-cover shadow shrink-0"
                                                alt={p?.name || 'Produto'}
                                            />
                                            <div className="flex-1 min-w-0">
                                                <p className="font-black text-[10px] text-slate-200 uppercase tracking-tight line-clamp-2 leading-tight">{p?.name || 'Produto'}</p>
                                                <p className="font-black text-[9px] text-emerald-400 mt-0.5">R$ {formatarMoeda(p.price)}</p>
                                            </div>
                                            <div className="flex items-center gap-1 bg-slate-700 rounded-lg p-1 shrink-0">
                                                <button
                                                    onClick={() => updateQuantity(item.productId, -1)}
                                                    disabled={isLoading}
                                                    className="w-7 h-7 rounded bg-slate-600 flex items-center justify-center text-emerald-400 hover:bg-emerald-600 disabled:opacity-50"
                                                >
                                                    <Minus size={12} />
                                                </button>
                                                <span className="w-6 text-center font-black text-xs text-white">{item.quantity}</span>
                                                <button
                                                    onClick={() => updateQuantity(item.productId, 1)}
                                                    disabled={isLoading}
                                                    className="w-7 h-7 rounded bg-slate-600 flex items-center justify-center text-emerald-400 hover:bg-emerald-600 disabled:opacity-50"
                                                >
                                                    <Plus size={12} />
                                                </button>
                                            </div>
                                            <p className="font-black text-xs text-slate-200 shrink-0 w-14 text-right">R$ {formatarMoeda(p.price * item.quantity)}</p>
                                            <button
                                                onClick={() => removeFromCart(item.productId)}
                                                disabled={isLoading}
                                                className="w-7 h-7 rounded bg-red-900/30 text-red-400 flex items-center justify-center hover:bg-red-800/50 disabled:opacity-50 shrink-0"
                                            >
                                                <X size={12} />
                                            </button>
                                        </div>
                                    </div>
                                );
                            }) : (
                                <div className="text-center py-10 opacity-50">
                                    <ShoppingBag className="mx-auto mb-2" size={32}/>
                                    <p className="text-[10px] font-black uppercase">Nenhum item no carrinho</p>
                                </div>
                            )}
                        </div>
                    ) : stage === 'location' ? (
                        /* LOCATION STAGE */
                        <div className="space-y-3">
                            <div className="bg-blue-900/30 border border-blue-800 p-3 rounded-lg flex items-start gap-2">
                                <MapPin className="text-blue-400 shrink-0 mt-0.5" size={16} />
                                <div>
                                    <p className="font-bold text-xs text-blue-300 uppercase">Local de Entrega</p>
                                    <p className="text-[9px] text-blue-400 mt-0.5">Informe a cela</p>
                                </div>
                            </div>
                            <div className="bg-slate-800 p-3 rounded-xl border border-slate-700">
                                <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Pavilhão / Raio</p>
                                <input className="w-full bg-transparent font-bold text-sm outline-none uppercase text-white" value={location.ray} onChange={e => setLocation({ ...location, ray: e.target.value.toUpperCase() })} placeholder="RAIO 03" />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div className="bg-slate-800 p-3 rounded-xl border border-slate-700">
                                    <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Ala</p>
                                    <input className="w-full bg-transparent font-bold text-sm outline-none uppercase text-white" value={location.wing} onChange={e => setLocation({ ...location, wing: e.target.value.toUpperCase() })} placeholder="ALA B" />
                                </div>
                                <div className="bg-slate-800 p-3 rounded-xl border border-slate-700">
                                    <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Cela</p>
                                    <input className="w-full bg-transparent font-bold text-sm outline-none uppercase text-white" value={location.cell} onChange={e => setLocation({ ...location, cell: e.target.value.toUpperCase() })} placeholder="04" />
                                </div>
                            </div>
                            <div className="bg-slate-800 p-3 rounded-xl border border-slate-700">
                                <p className="text-[9px] font-black text-slate-400 uppercase mb-2">Pagamento</p>
                                <div className="flex gap-2">
                                    <button onClick={() => setCartPaymentMethod('WALLET')} className={`flex-1 p-3 rounded-lg border-2 transition-all flex flex-col items-center gap-1 ${cartPaymentMethod === 'WALLET' ? 'border-emerald-500 bg-emerald-500/10' : 'border-transparent bg-slate-700'}`}>
                                        <CreditCard size={16} className={cartPaymentMethod === 'WALLET' ? 'text-emerald-400' : 'text-slate-400'} />
                                        <span className="text-[9px] font-black uppercase text-slate-300">Saldo</span>
                                    </button>
                                    <button onClick={() => setCartPaymentMethod('PIX')} className={`flex-1 p-3 rounded-lg border-2 transition-all flex flex-col items-center gap-1 ${cartPaymentMethod === 'PIX' ? 'border-emerald-500 bg-emerald-500/10' : 'border-transparent bg-slate-700'}`}>
                                        <Sparkles size={16} className={cartPaymentMethod === 'PIX' ? 'text-emerald-400' : 'text-slate-400'} />
                                        <span className="text-[9px] font-black uppercase text-slate-300">PIX</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    ) : stage === 'pay' ? (
                        /* PAYMENT STAGE */
                        <div className="space-y-3">
                            <div className="bg-emerald-900/30 p-4 rounded-xl border border-emerald-800">
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-[9px] font-black text-slate-400 uppercase">Total</span>
                                    <span className="text-[9px] font-bold text-slate-400">Expira {formatTime(timeLeft)}</span>
                                </div>
                                <p className="text-2xl font-black text-emerald-400">R$ {formatarMoeda(cartTotal)}</p>
                            </div>
                            {cartPaymentMethod === 'PIX' && (
                                <div className="bg-slate-800 p-4 rounded-xl shadow border border-slate-700 flex flex-col items-center">
                                    <img src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(pixPayload)}`} className="w-36 h-36 object-contain" alt="QR PIX" />
                                    <button onClick={() => { navigator.clipboard.writeText(pixPayload); showNotification('Código copiado!', 'success'); }} className="w-full mt-3 py-2 bg-blue-600 text-white rounded-lg font-bold text-[10px] uppercase tracking-widest flex items-center justify-center gap-2">
                                        <RefreshCw size={12} /> Copiar PIX
                                    </button>
                                </div>
                            )}
                            {cartPaymentMethod === 'WALLET' && (
                                <div className="bg-slate-800 p-4 rounded-xl text-center border border-slate-700">
                                    <p className="text-[9px] font-black text-slate-400 uppercase">Saldo</p>
                                    <p className="text-xl font-black text-emerald-400 mt-1">R$ {formatarMoeda(walletBalance)}</p>
                                    {walletBalance < cartTotal && <p className="text-[9px] font-bold text-red-400 mt-1">Saldo insuficiente.</p>}
                                </div>
                            )}
                        </div>
                    ) : stage === 'proof' ? (
                        /* PROOF STAGE */
                        <div className="space-y-3">
                            {cartPaymentMethod === 'PIX' ? (
                                <><p className="text-[8px] text-red-400 font-black text-center uppercase tracking-wider">AVISO LEGAL: Comprovante falso é CRIME — Estelionato (Art. 171) e Falsificação (Art. 297 do CP)</p>
                                <div onClick={() => document.getElementById('proof-upload')?.click()} className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${localProofFile ? 'border-emerald-500 bg-emerald-500/10' : 'border-slate-700 bg-slate-800 hover:border-emerald-400'}`}>
                                    <input type="file" id="proof-upload" ref={fileInputRef} className="hidden" accept="image/*,.pdf" onChange={e => {
                                        const file = e.target.files?.[0];
                                        if (file) {
                                            const MAX_SIZE = 5 * 1024 * 1024;
                                            const ALLOWED = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
                                            const ALLOWED_EXT = ['.jpg', '.jpeg', '.png', '.pdf'];
                                            const ext = '.' + file.name.split('.').pop()?.toLowerCase();
                                            if (file.size > MAX_SIZE) {
                                                showNotification(`Arquivo muito grande (${(file.size / 1024 / 1024).toFixed(1)}MB). Máximo 5MB.`, 'error');
                                                e.target.value = '';
                                                return;
                                            }
                                            if (!ALLOWED_EXT.includes(ext) || !ALLOWED.includes(file.type)) {
                                                showNotification('Formato não permitido. Use JPG, PNG ou PDF.', 'error');
                                                e.target.value = '';
                                                return;
                                            }
                                            setLocalProofFile(file);
                                            setProofFile(file);
                                        }
                                        e.target.value = '';
                                    }} />
                                    {localProofFile ? (
                                        <div>
                                            <FileText className="mx-auto text-emerald-400 mb-2" size={28} />
                                            <p className="font-black text-[10px] text-emerald-300">{localProofFile?.name || 'Comprovante'}</p>
                                        </div>
                                    ) : (
                                        <div className="opacity-60">
                                            <Upload className="mx-auto mb-2 text-slate-400" size={28} />
                                            <p className="font-black text-[10px] uppercase tracking-wider text-slate-300">Anexar Comprovante</p>
                                        </div>
                                    )}
                                </div></>
                            ) : (
                                <div className="bg-emerald-900/30 p-4 rounded-xl text-center border border-emerald-800">
                                    <CheckCircle className="mx-auto text-emerald-400 mb-2" size={28} />
                                    <p className="font-black text-xs text-emerald-300">Pagamento com Saldo</p>
                                </div>
                            )}
                        </div>
                    ) : null}
                </div>

                {blockReason && (
                    <div className="px-4 pt-2 bg-slate-900">
                        <div className={`p-3 rounded-xl flex items-start gap-3 ${
                            blockReason === 'SALDO INSUFICIENTE'
                                ? 'bg-red-500/10 border border-red-600/30'
                                : 'bg-amber-500/10 border border-amber-600/30'
                        }`}>
                            <AlertCircle size={16} className={`shrink-0 mt-0.5 ${
                                blockReason === 'SALDO INSUFICIENTE' ? 'text-red-400' : 'text-amber-400'
                            }`} />
                            <p className={`text-[9px] font-bold leading-relaxed ${
                                blockReason === 'SALDO INSUFICIENTE' ? 'text-red-300' : 'text-amber-300'
                            }`}>
                                {blockReason === 'SALDO INSUFICIENTE'
                                    ? `Saldo insuficiente na carteira. Você tem R$ ${formatarMoeda(walletBalance)} e o carrinho é R$ ${formatarMoeda(cartTotal)}.`
                                    : 'Limite semanal de compras atingido. Aguarde a autorização do Administrador.'
                                }
                            </p>
                        </div>
                    </div>
                )}

                {/* FOOTER - ALWAYS VISIBLE, FIXED AT BOTTOM */}
                <div className="shrink-0 p-4 border-t border-slate-700/50 bg-slate-900 w-full space-y-3">
                    {isDepositOpen ? (
                        /* DEPOSIT FOOTER */
                        <>
                            {depositAmount > 0 && (
                                <button
                                    onClick={() => {
                                        if (depositAmount <= 0) {
                                            showNotification('DIGITE O VALOR DO CREDITO.', 'error');
                                            return;
                                        }
                                        // FORCA ETAPA 2 - Upload do Comprovante
                                        setStage('proof');
                                        setLocalProofFile(null);
                                        setProofFile(null);
                                        if (fileInputRef.current) {
                                            fileInputRef.current.value = '';
                                        }
                                    }}
                                    disabled={isLoading || depositAmount <= 0}
                                    className="w-full h-12 bg-gradient-to-r from-emerald-600 to-emerald-500 text-white rounded-xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/30 disabled:opacity-50"
                                >
                                    <Sparkles size={14} />
                                    Já fiz o PIX do Crédito
                                </button>
                            )}
                            {stage === 'proof' && (
                                <button
                                    onClick={async () => {
                                        if (!localProofFile) {
                                            showNotification('ANEXE O COMPROVANTE.', 'error');
                                            return;
                                        }
                                        setIsLoading(true);
                                        setIsSubmitting(true);
                                        try {
                                            await handleDeposit();
                                            handleClose();
                                            showNotification('Comprovante de crédito enviado para análise! O saldo será atualizado após confirmação do administrador.', 'success');
                                        } catch (e: any) {
                                            showNotification(e.message, 'error');
                                        } finally {
                                            setIsLoading(false);
                                            setIsSubmitting(false);
                                        }
                                    }}
                                    disabled={isLoading}
                                    className="w-full h-12 bg-blue-500 text-white rounded-xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg disabled:opacity-50"
                                >
                                    <Upload size={14} />
                                    Enviar Comprovante
                                </button>
                            )}
                        </>
                    ) : (
                        /* CART FOOTER — UNIFIED, ALWAYS VISIBLE */
                        <div className="space-y-2">
                            {/* SUBTOTAL + TOTAL GERAL */}
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold text-slate-400 uppercase">SUBTOTAL</span>
                                <span className="text-sm font-black text-slate-300">R$ {formatarMoeda(cartTotal)}</span>
                            </div>
                            <div className="flex items-center justify-between border-b border-slate-700/30 pb-2">
                                <span className="text-xs font-black text-white uppercase">TOTAL GERAL</span>
                                <span className={`text-lg font-black ${cartTotal > 0 ? 'text-emerald-400' : 'text-slate-500'}`}>R$ {formatarMoeda(cartTotal)}</span>
                            </div>
                            {/* BOTÃO PRINCIPAL — FINALIZAR VENDA */}
                            <button
                                onClick={() => {
                                    if (cart.length === 0) return;
                                    if (stage === 'cart') setStage('location');
                                    else if (stage === 'location') cartPaymentMethod === 'WALLET' ? handleConfirmFinish() : setStage('pay');
                                    else if (stage === 'pay') setStage('proof');
                                    else {
                                        if (cartPaymentMethod === 'PIX' && !localProofFile) {
                                            showNotification('POR FAVOR, ANEXE O COMPROVANTE PIX.', 'error');
                                            return;
                                        }
                                        handleConfirmFinish();
                                    }
                                }}
                                disabled={isLoading || cart.length === 0}
                                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm uppercase tracking-widest rounded-lg shadow-md disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] transition-all"
                            >
                                {isLoading ? (
                                    <Loader2 size={18} className="animate-spin mx-auto" />
                                ) : (
                                    <span className="flex items-center justify-center gap-2">
                                        <ShoppingBag size={16} />
                                        FINALIZAR VENDA (F9)
                                    </span>
                                )}
                            </button>
                            {/* SUB-BOTÕES LADO A LADO */}
                            <div className="flex gap-2">
                                <button
                                    onClick={() => {
                                        setCart([]);
                                        setIsCartOpen(false);
                                        setStage('cart');
                                    }}
                                    className="flex-1 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-300 font-black text-[10px] uppercase tracking-widest rounded-lg transition-all active:scale-[0.98]"
                                >
                                    LIMPAR (F4)
                                </button>
                                <button
                                    onClick={() => {
                                        setCart([]);
                                        setIsCartOpen(false);
                                        setStage('cart');
                                    }}
                                    className="flex-1 py-2.5 bg-red-800/50 hover:bg-red-700/60 text-red-300 font-black text-[10px] uppercase tracking-widest rounded-lg transition-all active:scale-[0.98]"
                                >
                                    CANCELAR (F7)
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </motion.div>

            {/* SUCCESS MODAL */}
            <AnimatePresence>
                {showSuccess && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[300] flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
                    >
                        <motion.div
                            initial={{ scale: 0.8, y: 50 }}
                            animate={{ scale: 1, y: 0 }}
                            transition={{ type: 'spring', damping: 20, stiffness: 300 }}
                            className="bg-white rounded-3xl p-8 text-center max-w-sm w-full shadow-2xl border border-slate-200"
                        >
                            <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{ delay: 0.2, type: 'spring', damping: 12 }}
                                className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-5"
                            >
                                <CheckCircle className="text-emerald-500" size={44} />
                            </motion.div>

                            <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight mb-1">
                                Pedido Finalizado com Sucesso!
                            </h2>
                            <p className="text-slate-500 text-xs font-bold mb-5">
                                Seu pedido foi registrado no sistema
                            </p>

                            <div className="bg-slate-50 rounded-2xl p-4 mb-4 border border-slate-200 space-y-3">
                                <div className="flex justify-between items-center">
                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Pedido</span>
                                    <span className="text-sm font-black text-slate-900">#{orderId}</span>
                                </div>
                                <div className="flex justify-between items-center border-t border-slate-200 pt-3">
                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Total</span>
                                    <span className="text-lg font-black text-emerald-600">R$ {formatarMoeda(cartTotal)}</span>
                                </div>
                                <div className="flex justify-between items-center border-t border-slate-200 pt-3">
                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Pagamento</span>
                                    {cartPaymentMethod === 'WALLET' ? (
                                        <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-[9px] font-black uppercase flex items-center gap-1">
                                            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
                                            Pago via Saldo
                                        </span>
                                    ) : (
                                        <span className="px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-[9px] font-black uppercase flex items-center gap-1">
                                            <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse"></span>
                                            Aguardando Confirmação PIX
                                        </span>
                                    )}
                                </div>
                            </div>

                            <div className="flex flex-col gap-2">
                                {settings?.autoPrint && lastPrintPayload && (
                                    <button
                                        onClick={() => {
                                            triggerAutoPrint(orderId, lastPrintPayload.items, lastPrintPayload.total, lastPrintPayload.method);
                                        }}
                                        className="w-full py-3 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                                    >
                                        <Printer size={16} /> Imprimir Cupom
                                    </button>
                                )}
                                <button
                                    onClick={() => {
                                        setShowSuccess(false);
                                        setLastPrintPayload(null);
                                        setIsCartOpen(false);
                                        setStage('cart');
                                        setLocalProofFile(null);
                                        setProofFile(null);
                                        if (fileInputRef.current) {
                                            fileInputRef.current.value = '';
                                        }
                                    }}
                                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-emerald-500/30 active:scale-[0.98] transition-all"
                                >
                                    Continuar Comprando
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
};
