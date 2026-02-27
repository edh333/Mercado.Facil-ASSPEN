import React, { useState, useEffect } from 'react';
import { useApp } from '../context/StoreContext';
import { OrderStatus, ThemeOption, Order } from '../types';
import { ShoppingCart, LogOut, Search, Plus, X, MapPin, Upload, CheckCircle, MessageSquare, ArrowLeft, Trash2, List, Grid, Clock, FileText, Printer, Home, ShoppingBag, Loader2, Ban, ChevronDown, ChevronUp, Package } from 'lucide-react';
import { ASSPEN_INFO, THEME_COLORS } from '../constants';
import { CupomEntrega } from '../components/CupomEntrega';
import { generatePixPayload } from '../utils';
import { collection, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

export const UserDashboard: React.FC = () => {
  const { currentUser, products, createOrder, compressImage, showNotification, logout, messages, markMessageRead, settings } = useApp();
  
  // States de Navegação e Visualização
  const [activeTab, setActiveTab] = useState<'store' | 'orders'>('store');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  
  // States do Carrinho e Pedido
  const [cart, setCart] = useState<{ productId: string; quantity: number }[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isMsgOpen, setIsMsgOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [stage, setStage] = useState<'cart'|'location'|'pay'|'proof'>('cart');
  const [location, setLocation] = useState({ ray: '', wing: '', cell: '' });
  const [proofFile, setProofFile] = useState<File | null>(null);
  
  // Estado local para controlar o envio
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // States de Visualização de Pedidos Passados
  const [viewingOrderCupom, setViewingOrderCupom] = useState<Order | null>(null);
  const [expandedOrders, setExpandedOrders] = useState<string[]>([]);
  
  // *** CRITICAL UPDATE: USER SPECIFIC ORDERS ***
  // Modified to use client-side sorting to avoid requirement for composite indexes in Firestore.
  const [myOrders, setMyOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);

  useEffect(() => {
      if (!currentUser) return;
      setLoadingOrders(true);
      
      // Query specific to this user. 
      // NOTE: Removed orderBy('createdAt', 'desc') and limit(20) from server-side query 
      // to avoid "Missing Index" error. Sorting and limiting is now done client-side.
      const q = query(
          collection(db, 'orders'),
          where('userId', '==', currentUser.id)
      );

      const unsubscribe = onSnapshot(q, (snapshot) => {
          const rawOrders = snapshot.docs.map(d => d.data() as Order);
          
          // Client-side Sort (Newest first)
          rawOrders.sort((a, b) => {
              const dateA = new Date(a.createdAt || a.date || 0).getTime();
              const dateB = new Date(b.createdAt || b.date || 0).getTime();
              return dateB - dateA;
          });

          // Client-side Limit (Take top 20)
          setMyOrders(rawOrders.slice(0, 20));
          setLoadingOrders(false);
      }, (error) => {
          console.error("Error fetching user orders:", error);
          setLoadingOrders(false);
      });

      return () => unsubscribe();
  }, [currentUser]);
  // ********************************************

  // Get Theme with Fallback
  const theme = THEME_COLORS[settings?.theme] || THEME_COLORS[ThemeOption.POLICE_MT];

  // Safe Lists (Prevent Blank Screen on Load)
  const safeProducts = Array.isArray(products) ? products : [];
  const safeMessages = Array.isArray(messages) ? messages : [];

  // FILTRO DE PRODUTOS: Remove Suspensos (available: false)
  const filteredProducts = safeProducts.filter(p => {
      const matchName = (p.name || '').toLowerCase().includes(searchTerm.toLowerCase());
      const isAvailable = p.available !== false; // Se undefined, considera true
      return matchName && isAvailable;
  });

  const myMessages = safeMessages.filter(m => m.userId === currentUser?.id || m.userId === 'ALL');
  const unreadMsg = myMessages.filter(m => !m.read && m.fromAdmin).length;

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
              return prev.map(i => i.productId === pid ? {...i, quantity: i.quantity + 1} : i);
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
      if(!proofFile) return showNotification("Por favor, anexe o comprovante PIX antes de enviar.", "error");
      
      setIsSubmitting(true);

      try {
          // 1. Upload da imagem
          const url = await compressImage(proofFile);
          
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
              status: OrderStatus.PENDING,
              date: new Date().toISOString(), 
              unitId: currentUser!.unitId || '1', 
              deliveryLocation: formattedLocation,
              inmateLocation: formattedLocation,
              paymentProofUrl: url
          });
          
          // 5. Sucesso
          setCart([]); 
          setProofFile(null);
          setStage('cart'); 
          setIsCartOpen(false); 
          setActiveTab('store'); 
          showNotification('Comprovante enviado com sucesso! Pedido em análise.', 'success');
          
      } catch (e: any) { 
          console.error(e);
          showNotification("Erro ao enviar pedido: " + (e.message || "Falha na conexão"), "error"); 
      } finally {
          setIsSubmitting(false);
      }
  };

  // GERAÇÃO DO PAYLOAD PIX DINÂMICO
  const [pixPayload, setPixPayload] = useState('');

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
              cartTotal,
              '***'
          );
          setPixPayload(payload);
      }
  }, [stage, cartTotal, settings]);

  const canViewCupom = (status: string) => {
      const s = (status || '').toLowerCase();
      return s.includes('paid') || s.includes('pago') || s.includes('delivery') || s.includes('entregue') || s.includes('separ');
  };

  return (
    <div className="bg-slate-50 min-h-screen pb-24 font-sans">
        
        {/* HEADER THEMED - AGORA COM NAVEGAÇÃO DESKTOP */}
        <header className={`${theme.primary} p-5 sticky top-0 z-20 shadow-md flex justify-between items-center text-white transition-colors duration-300`}>
            <div>
                <h1 className="font-bold text-xl">{settings?.appName || 'App'}</h1>
                <p className="text-xs opacity-80 font-medium">{currentUser?.name.split(' ')[0]}</p>
            </div>

            {/* NAVEGAÇÃO DESKTOP CENTRALIZADA (NOVA) */}
            <div className="hidden md:flex items-center gap-4 absolute left-1/2 transform -translate-x-1/2">
                <button 
                    onClick={() => setActiveTab('store')} 
                    className={`flex items-center gap-2 px-5 py-2 rounded-full transition-all text-sm ${activeTab === 'store' ? 'bg-white text-slate-900 font-bold shadow-lg scale-105' : 'text-white/80 hover:bg-white/10'}`}
                >
                    <ShoppingBag size={18}/> Loja
                </button>
                <button 
                    onClick={() => setActiveTab('orders')} 
                    className={`flex items-center gap-2 px-5 py-2 rounded-full transition-all text-sm ${activeTab === 'orders' ? 'bg-white text-slate-900 font-bold shadow-lg scale-105' : 'text-white/80 hover:bg-white/10'}`}
                >
                    <Clock size={18}/> Pedidos
                </button>
            </div>

            <div className="flex gap-3">
                <button onClick={() => setIsMsgOpen(!isMsgOpen)} className="relative w-10 h-10 bg-white/10 border border-white/20 text-white rounded-full flex items-center justify-center hover:bg-white/20 transition-colors">
                    <MessageSquare size={18}/>
                    {unreadMsg > 0 && <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center font-bold">{unreadMsg}</span>}
                </button>
                <button onClick={logout} className="w-10 h-10 bg-white/10 text-white border border-white/20 rounded-full flex items-center justify-center hover:bg-white/20"><LogOut size={18}/></button>
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
                    {/* Barra de Busca */}
                    <div className="p-5 sticky top-[80px] z-10 bg-slate-50/95 backdrop-blur-sm">
                        <div className="flex gap-2">
                            <div className="relative group flex-1">
                                <Search className="absolute left-4 top-3.5 text-gray-400" size={20}/>
                                <input className="w-full pl-12 pr-4 py-3 rounded-2xl border border-gray-200 shadow-sm focus:ring-2 focus:ring-slate-300 outline-none bg-white placeholder:text-gray-400 transition-all" placeholder="Buscar produtos..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                            </div>
                            <div className="bg-white border border-gray-200 rounded-2xl flex items-center p-1 shadow-sm">
                                <button onClick={() => setViewMode('grid')} className={`p-2.5 rounded-xl transition-all ${viewMode === 'grid' ? 'bg-slate-900 text-white shadow' : 'text-gray-400 hover:text-slate-600'}`}><Grid size={20}/></button>
                                <button onClick={() => setViewMode('list')} className={`p-2.5 rounded-xl transition-all ${viewMode === 'list' ? 'bg-slate-900 text-white shadow' : 'text-gray-400 hover:text-slate-600'}`}><List size={20}/></button>
                            </div>
                        </div>
                    </div>

                    {/* Lista de Produtos */}
                    <div className="px-5 pb-20">
                        {filteredProducts.length === 0 ? (
                            <div className="text-center py-10 opacity-50">
                                <ShoppingBag size={48} className="mx-auto mb-2"/>
                                <p>Nenhum produto encontrado.</p>
                            </div>
                        ) : viewMode === 'grid' ? (
                            <div className="grid grid-cols-2 gap-4">
                                {filteredProducts.map(p => {
                                    const isOutOfStock = p.stock <= 0;
                                    return (
                                        <div key={p.id} className={`bg-white p-3 rounded-3xl shadow-sm border border-gray-100 flex flex-col h-full relative group transition-all ${isOutOfStock ? 'opacity-80' : 'hover:shadow-lg'}`}>
                                            <div className="bg-gray-100 aspect-square rounded-2xl mb-3 overflow-hidden relative">
                                                <img 
                                                    src={p.imageUrl || 'https://placehold.co/150'} 
                                                    onError={(e) => { e.currentTarget.src = 'https://placehold.co/150'; }}
                                                    className={`w-full h-full object-cover transition-transform duration-500 ${isOutOfStock ? 'grayscale' : 'group-hover:scale-110'}`}
                                                />
                                                {isOutOfStock && <div className="absolute inset-0 bg-black/40 flex items-center justify-center"><span className="bg-red-600 text-white text-[10px] font-black px-2 py-1 rounded uppercase tracking-wider">Esgotado</span></div>}
                                            </div>
                                            <h3 className="font-bold text-xs text-slate-900 line-clamp-2 leading-tight mb-1 min-h-[2.5em]">{p.name}</h3>
                                            <div className="mt-auto flex justify-between items-center pt-2">
                                                <span className={`font-black ${theme.primary.replace('bg-','text-')} text-sm`}>R$ {p.price.toFixed(2)}</span>
                                                <button disabled={isOutOfStock} onClick={() => addToCart(p.id)} className={`${isOutOfStock ? 'bg-gray-300' : theme.primary} text-white w-8 h-8 rounded-full flex items-center justify-center shadow-md active:scale-95 transition-transform`}>
                                                    {isOutOfStock ? <Ban size={14}/> : <Plus size={16}/>}
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {filteredProducts.map(p => {
                                    const isOutOfStock = p.stock <= 0;
                                    return (
                                        <div key={p.id} className={`bg-white p-3 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-4 ${isOutOfStock ? 'opacity-75' : ''}`}>
                                            <div className="w-16 h-16 bg-gray-100 rounded-xl overflow-hidden flex-shrink-0 relative">
                                                <img 
                                                    src={p.imageUrl || 'https://placehold.co/150'} 
                                                    onError={(e) => { e.currentTarget.src = 'https://placehold.co/150'; }}
                                                    className={`w-full h-full object-cover ${isOutOfStock ? 'grayscale' : ''}`}
                                                />
                                                {isOutOfStock && <div className="absolute inset-0 flex items-center justify-center bg-black/20"><span className="text-[8px] font-black bg-red-600 text-white px-1 rounded">ESGOTADO</span></div>}
                                            </div>
                                            <div className="flex-1">
                                                <h3 className="font-bold text-sm text-slate-900">{p.name}</h3>
                                                <p className="text-[10px] text-gray-500 uppercase">{p.category}</p>
                                            </div>
                                            <div className="flex flex-col items-end gap-1">
                                                <span className={`font-black ${theme.primary.replace('bg-','text-')} text-sm`}>R$ {p.price.toFixed(2)}</span>
                                                <button disabled={isOutOfStock} onClick={() => addToCart(p.id)} className={`${isOutOfStock ? 'bg-gray-300' : theme.primary} text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-md active:scale-95 transition-transform flex items-center gap-1`}>
                                                    {isOutOfStock ? <Ban size={12}/> : <Plus size={12}/>} {isOutOfStock ? 'Indisponível' : 'Adicionar'}
                                                </button>
                                            </div>
                                        </div>
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
                    <h2 className="font-bold text-xl text-slate-800 mb-4 flex items-center gap-2">
                        <Clock className="text-slate-400"/> Histórico (Seus Pedidos)
                    </h2>
                    
                    {loadingOrders ? (
                         <div className="flex justify-center py-10"><Loader2 className="animate-spin text-slate-400" size={32}/></div>
                    ) : (
                        <div className="space-y-4">
                            {myOrders.length === 0 ? (
                                <div className="text-center py-10 opacity-50 bg-white rounded-3xl border border-dashed border-gray-300">
                                    <FileText size={48} className="mx-auto mb-2"/>
                                    <p>Nenhum pedido recente.</p>
                                </div>
                            ) : (
                                myOrders.map(order => (
                                    <div key={order.id} className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100 relative overflow-hidden">
                                        <div className="flex justify-between items-start mb-3">
                                            <div>
                                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Pedido #{order.id.slice(0,6).toUpperCase()}</span>
                                                <p className="font-bold text-slate-800 text-sm">{new Date(order.createdAt || order.date).toLocaleString()}</p>
                                            </div>
                                            <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase ${
                                                order.status.includes('paid') || order.status.includes('pago') ? 'bg-green-100 text-green-700' :
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
                                                {expandedOrders.includes(order.id) ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
                                                {expandedOrders.includes(order.id) ? 'Ocultar Itens' : 'Ver Itens Comprados'}
                                            </button>

                                            {/* Lista Expansível */}
                                            {expandedOrders.includes(order.id) && (
                                                <div className="mt-2 pt-2 border-t border-slate-200 animate-fadeIn space-y-2">
                                                    {order.items.map((item, i) => (
                                                        <div key={i} className="flex justify-between items-center text-xs">
                                                            <div className="flex items-center gap-2">
                                                                <div className="w-6 h-6 bg-slate-200 rounded flex items-center justify-center text-slate-500">
                                                                    <Package size={12}/>
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
                                                <Printer size={16}/> VISUALIZAR CUPOM / RECIBO
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

        {/* --- BARRA DE NAVEGAÇÃO INFERIOR (VISÍVEL APENAS NO CELULAR) --- */}
        <div className="md:hidden fixed bottom-0 left-0 w-full bg-white border-t border-gray-200 z-30 pb-safe pt-2 px-6 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
            <div className="flex justify-around items-center max-w-lg mx-auto h-16">
                <button 
                    onClick={() => setActiveTab('store')} 
                    className={`flex flex-col items-center gap-1 w-20 transition-all ${activeTab === 'store' ? `${theme.primary.replace('bg-', 'text-')} font-bold scale-110` : 'text-gray-400 font-medium'}`}
                >
                    <ShoppingBag size={24} strokeWidth={activeTab === 'store' ? 2.5 : 2}/>
                    <span className="text-[10px]">Loja</span>
                </button>
                
                <div className="w-px h-8 bg-gray-200"></div>

                <button 
                    onClick={() => setActiveTab('orders')} 
                    className={`flex flex-col items-center gap-1 w-20 transition-all ${activeTab === 'orders' ? `${theme.primary.replace('bg-', 'text-')} font-bold scale-110` : 'text-gray-400 font-medium'}`}
                >
                    <Clock size={24} strokeWidth={activeTab === 'orders' ? 2.5 : 2}/>
                    <span className="text-[10px]">Pedidos</span>
                </button>
            </div>
        </div>

        {/* --- MODAL DO CARRINHO --- */}
        {isCartOpen && (
            <div className="fixed inset-0 z-50 flex justify-end">
                <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !isSubmitting && setIsCartOpen(false)}></div>
                <div className="relative w-full md:max-w-md bg-white h-full shadow-2xl flex flex-col animate-slideInRight">
                    <div className={`p-6 border-b border-gray-100 flex justify-between items-center ${theme.primary} text-white`}>
                        <h2 className="font-bold text-xl">Seu Carrinho</h2>
                        <button onClick={() => !isSubmitting && setIsCartOpen(false)} className="bg-white/10 p-2 rounded-full hover:bg-white/20"><X size={20}/></button>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50">
                        
                        {/* ETAPA 1: ITENS */}
                        {stage === 'cart' && (
                            cart.length === 0 ? <p className="text-center text-gray-400 mt-10">Carrinho vazio.</p> :
                            <div className="space-y-3">
                                {cart.map(i => {
                                    const p = safeProducts.find(x => x.id === i.productId);
                                    if(!p) return null;
                                    return (
                                        <div key={i.productId} className="bg-white p-3 rounded-2xl border border-gray-200 flex items-center gap-4 shadow-sm">
                                            <img src={p.imageUrl || 'https://via.placeholder.com/50'} className="w-14 h-14 rounded-xl object-cover bg-gray-100"/>
                                            <div className="flex-1">
                                                <p className="font-bold text-sm text-slate-800 line-clamp-1">{p.name}</p>
                                                <p className={`font-bold text-xs ${theme.primary.replace('bg-', 'text-')}`}>R$ {p.price.toFixed(2)}</p>
                                            </div>
                                            <div className="flex flex-col items-end gap-2">
                                                <span className="font-bold text-xs bg-gray-100 px-2 py-1 rounded text-slate-600">{i.quantity}un</span>
                                                <button onClick={() => removeFromCart(i.productId)} className="text-red-400 hover:text-red-600 p-1 bg-red-50 rounded-lg">
                                                    <Trash2 size={14}/>
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
                                    <MapPin className="text-blue-600 mt-1 flex-shrink-0" size={20}/>
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
                                            onChange={e => setLocation({...location, ray: e.target.value})}
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-xs font-bold text-slate-500 uppercase ml-1">Ala / Galeria</label>
                                            <input 
                                                placeholder="Ex: Ala B" 
                                                className="w-full p-4 bg-white border border-slate-200 rounded-xl focus:border-slate-400 outline-none font-bold text-slate-800 transition-colors shadow-sm" 
                                                value={location.wing} 
                                                onChange={e => setLocation({...location, wing: e.target.value})}
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold text-slate-500 uppercase ml-1">Cela</label>
                                            <input 
                                                placeholder="Ex: 04" 
                                                className="w-full p-4 bg-white border border-slate-200 rounded-xl focus:border-slate-400 outline-none font-bold text-slate-800 transition-colors shadow-sm" 
                                                value={location.cell} 
                                                onChange={e => setLocation({...location, cell: e.target.value})}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ETAPA 3: PAGAMENTO */}
                        {stage === 'pay' && (
                            <div className="text-center space-y-6 animate-fadeIn">
                                <div className={`${theme.primary} text-white p-6 rounded-2xl shadow-xl transition-colors`}>
                                    <p className="text-white/60 text-xs font-bold uppercase tracking-wider mb-2">Total a Pagar</p>
                                    <p className="font-bold text-4xl">R$ {cartTotal.toFixed(2)}</p>
                                </div>
                                <div className="flex justify-center">
                                    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center justify-center">
                                        {/* USO DE API EXTERNA PARA EVITAR ERRO DE BUILD COM REACT-QR-CODE */}
                                        <div className="bg-white p-2">
                                            <img 
                                                src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(pixPayload)}`} 
                                                alt="QR Code PIX" 
                                                className="w-[180px] h-[180px]"
                                            />
                                        </div>
                                    </div>
                                </div>
                                <div>
                                    <div className="bg-white p-3 rounded-lg text-[10px] text-gray-500 break-all font-mono border border-gray-200 mb-2 shadow-sm">{pixPayload}</div>
                                    <button className={`font-bold text-sm hover:underline ${theme.primary.replace('bg-','text-')}`} onClick={() => { navigator.clipboard.writeText(pixPayload); showNotification('Copiado!', 'success'); }}>Copiar Código PIX</button>
                                </div>
                            </div>
                        )}

                        {/* ETAPA 4: COMPROVANTE */}
                        {stage === 'proof' && (
                            <div className="animate-fadeIn space-y-4">
                                <div className="text-center mb-4">
                                    <h3 className="font-bold text-slate-800">Finalizar Pedido</h3>
                                    <p className="text-xs text-slate-500">Anexe o comprovante para validarmos seu pedido.</p>
                                </div>
                                <div onClick={() => document.getElementById('f')?.click()} className={`border-2 border-dashed p-10 rounded-3xl text-center cursor-pointer transition-colors relative ${proofFile ? 'border-green-500 bg-green-50' : 'border-slate-300 bg-white hover:bg-slate-50'}`}>
                                    <input type="file" id="f" className="hidden" accept="image/*" onChange={e => e.target.files && setProofFile(e.target.files[0])} />
                                    {proofFile ? <CheckCircle className="mx-auto text-green-600 mb-3" size={48}/> : <Upload className="mx-auto text-slate-400 mb-3" size={48}/>}
                                    <span className={`font-bold text-sm block ${proofFile ? 'text-green-700' : 'text-slate-500'}`}>{proofFile ? "Comprovante Anexado!" : "Toque para enviar Comprovante"}</span>
                                </div>
                            </div>
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
                                <button onClick={() => setStage('cart')} className="px-4 py-4 rounded-xl font-bold text-slate-500 hover:bg-gray-100"><ArrowLeft/></button>
                                <button onClick={() => setStage('pay')} className={`flex-1 ${theme.primary} text-white py-4 rounded-xl font-bold shadow-lg hover:opacity-90`}>
                                    Ir para Pagamento
                                </button>
                            </div>
                        )}
                        
                        {stage === 'pay' && (
                            <div className="flex gap-3">
                                <button onClick={() => setStage('location')} className="px-4 py-4 rounded-xl font-bold text-slate-500 hover:bg-gray-100"><ArrowLeft/></button>
                                <button onClick={() => setStage('proof')} className={`flex-1 ${theme.primary} text-white py-4 rounded-xl font-bold shadow-lg hover:opacity-90`}>
                                    Já fiz o PIX
                                </button>
                            </div>
                        )}
                        
                        {stage === 'proof' && (
                            <div className="flex gap-3">
                                <button disabled={isSubmitting} onClick={() => setStage('pay')} className="px-4 py-4 rounded-xl font-bold text-slate-500 hover:bg-gray-100"><ArrowLeft/></button>
                                <button disabled={isSubmitting} onClick={handleFinish} className="flex-1 bg-green-600 text-white py-4 rounded-xl font-bold shadow-green-200 shadow-lg hover:bg-green-700 flex items-center justify-center gap-2">
                                    {isSubmitting ? <Loader2 className="animate-spin" size={20} /> : <CheckCircle size={20}/>} 
                                    {isSubmitting ? 'Processando...' : 'Enviar Pedido'}
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
                        <button onClick={() => setViewingOrderCupom(null)} className="text-white hover:text-red-400"><X size={20}/></button>
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
                            />
                        </div>
                    </div>
                    <div className="w-full p-4 bg-white border-t border-gray-200 flex gap-3 no-print shrink-0">
                        <button onClick={() => window.print()} className="flex-1 bg-slate-900 text-white py-3 rounded-lg font-bold shadow-lg hover:bg-black flex items-center justify-center gap-2 text-xs"><Printer size={16}/> IMPRIMIR / SALVAR</button>
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